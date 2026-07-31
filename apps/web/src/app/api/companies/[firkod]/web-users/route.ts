import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import { execOnAgent } from "@/lib/agent-poller"
import { psQuote, resolveCompanySites, siteAgent, type SiteRow } from "@/lib/company-web-services"

/**
 * GET /api/companies/[firkod]/web-users
 *
 * Firmanın her web hizmeti (IIS sitesi) için sitenin kendi
 * `<physical_path>\Config\Users.xml` dosyasını agent üzerinden okur ve
 * içindeki uygulama-içi kullanıcı adı / şifre / DB listesini döner.
 *
 * Sihirbaz bu dosyayı `buildPatchUsersXml` ile yazıyor (setup-iisops.ts);
 * burası aynı dosyanın SUNUCUDAKİ GÜNCEL halini okur — yani firma kurulumdan
 * sonra elle değiştirilmişse gerçek değer görünür.
 *
 * ŞİFRE İÇERİR: "Erişim Bilgileri" modal'ı ile aynı sınıf veri, aynı yetki.
 *
 * Kaynak tasarrufu: sunucu başına TEK agent komutu (bütün siteler tek seferde
 * okunur), site başına ayrı istek atılmaz.
 */

export interface WebServiceUsersDto {
  siteName: string
  server:   string
  /** Users.xml içindeki <User> kayıtları */
  users:    Array<{ username: string; password: string; dbs: string[] }>
  /** Users.xml içindeki global <DB> listesi */
  dbs:      string[]
  /** Sunucuda IIS'ten çözülen site klasörü (teşhis için) */
  path?:    string
  /**
   * Sitede Users.xml yok — hata DEĞİL. Resim paylaşımı, transfer servisi gibi
   * uygulama-içi kullanıcı tutmayan siteler normalde bu durumda; UI bunları
   * sessizce atlar, "bulunamadı" uyarısı basmaz.
   */
  notFound?: boolean
  /** Gerçek hata (parse bozuk, agent'a ulaşılamadı, sunucu kaydı eksik) */
  error?:   string
}


/**
 * Tek komutta N sitenin Users.xml'ini okur.
 *
 * Site klasörü SUNUCUDA IIS'e sorularak bulunur — `iis_sites.physical_path`
 * kolonuna güvenilmiyor: agent bu alanı çoğu sunucuda boş raporluyor
 * (WMI VirtualDirectory sorgusu sessizce boş dönüyor), o yüzden DB'den gelen
 * yol ile filtrelemek tüm siteleri eleyip listeyi boş bırakıyordu.
 * DB'de yol varsa yedek olarak kullanılır.
 *
 * ⚠ Agent'ın JSON parser'ı regex tabanlı — komutta çift tırnak KULLANILMAZ.
 * Çıktı, XML'i ham göndermemek için satır bazlı sade bir formata indirgenir:
 *
 *   ###SITE <siteName>
 *   ###PATH <çözülen klasör>
 *   ###ERR  NOSITE | NOPATH | NOFILE | PARSE
 *   ###USER kullanici|sifre|db1,db2
 *   ###DB   db1,db2
 */
function buildReadUsersXml(targets: Array<{ site: string; fallbackPath: string }>): string {
  const pairs = targets
    .map((t) => `[pscustomobject]@{ Site='${psQuote(t.site)}'; Fallback='${psQuote(t.fallbackPath)}' }`)
    .join(", ")

  // Tek satır: agent komutu `powershell -Command "<komut>"` olarak çalıştırıyor,
  // satır sonu JSON'da `\n` olarak kalır ve agent'ın basit unescape'i çözemez.
  // Bu yüzden bütün ifadeler `;` ile ayrılmış TEK satır olmak zorunda.
  return [
    `Import-Module WebAdministration -ErrorAction SilentlyContinue`,
    `$targets = @(${pairs})`,
    `foreach($t in $targets){` +
      `Write-Output ('###SITE ' + $t.Site); ` +
      `$p = ''; ` +
      `try{ $w = Get-Website -Name $t.Site -ErrorAction Stop; if($w){ $p = [string]$w.physicalPath } }catch{}; ` +
      `if(-not $p){ try{ $p = [string](Get-ItemProperty -Path ('IIS:\\Sites\\' + $t.Site) -Name physicalPath -ErrorAction Stop).Value }catch{} }; ` +
      `if(-not $p){ $p = $t.Fallback }; ` +
      `if(-not $p){ Write-Output '###ERR NOPATH'; continue }; ` +
      // physicalPath %SystemDrive% gibi env değişkeni içerebilir
      `$p = [Environment]::ExpandEnvironmentVariables($p); ` +
      `Write-Output ('###PATH ' + $p); ` +
      `$f = Join-Path $p 'Config\\Users.xml'; ` +
      `if(-not (Test-Path -LiteralPath $f)){ Write-Output '###ERR NOFILE'; continue }; ` +
      `try{ [xml]$d = Get-Content -LiteralPath $f -Raw -Encoding UTF8 }catch{ Write-Output '###ERR PARSE'; continue }; ` +
      `foreach($u in @($d.SelectNodes('/Users/User'))){` +
        `$unNode = $u.SelectSingleNode('Username'); ` +
        `$pwNode = $u.SelectSingleNode('Password'); ` +
        `$un = ''; if($unNode){ $un = [string]$unNode.InnerText }; ` +
        `$pw = ''; if($pwNode){ $pw = [string]$pwNode.InnerText }; ` +
        `$dbs = @(); foreach($dd in @($u.SelectNodes('Data/Data'))){ $dbs += [string]$dd.InnerText }; ` +
        `Write-Output ('###USER ' + $un + '|' + $pw + '|' + ($dbs -join ','))` +
      `}; ` +
      `$gdbs = @(); foreach($dd in @($d.SelectNodes('/Users/DB/Data'))){ $gdbs += [string]$dd.InnerText }; ` +
      `Write-Output ('###DB ' + ($gdbs -join ','))` +
    `}`,
  ].join("; ")
}

/** Agent stdout'unu site bazlı DTO'lara çevirir. */
function parseOutput(stdout: string, server: string): Map<string, WebServiceUsersDto> {
  const bySite = new Map<string, WebServiceUsersDto>()
  let cur: WebServiceUsersDto | null = null

  for (const raw of (stdout ?? "").split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    if (line.startsWith("###SITE ")) {
      cur = { siteName: line.slice(8).trim(), server, users: [], dbs: [] }
      bySite.set(cur.siteName.toLowerCase(), cur)
      continue
    }
    if (!cur) continue

    if (line.startsWith("###PATH ")) {
      cur.path = line.slice(8).trim()
      continue
    }
    if (line.startsWith("###ERR ")) {
      const code = line.slice(7).trim()
      if (code === "NOFILE" || code === "NOPATH") cur.notFound = true
      else cur.error = "Users.xml okunamadı (bozuk XML)"
      continue
    }
    if (line.startsWith("###USER ")) {
      // Şifre içinde '|' olabilir diye sadece ilk ve SON ayraçtan bölüyoruz:
      // format = kullanıcı | şifre | db1,db2  (db listesi ayraçsız)
      const rest = line.slice(8)
      const first = rest.indexOf("|")
      const last = rest.lastIndexOf("|")
      if (first < 0 || last <= first) continue
      const username = rest.slice(0, first)
      const password = rest.slice(first + 1, last)
      const dbs = rest.slice(last + 1).split(",").map((d) => d.trim()).filter(Boolean)
      if (username) cur.users.push({ username, password, dbs })
      continue
    }
    if (line.startsWith("###DB ")) {
      cur.dbs = line.slice(6).split(",").map((d) => d.trim()).filter(Boolean)
    }
  }
  return bySite
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  // "Erişim Bilgileri" modal'ı ile aynı yetki — firma detayını göremeyen
  // (rol: kullanıcı) kişiler de bu modal'dan bağlantı bilgisi alabiliyor.
  const gate = await requirePermission("companies", "read")
  if (gate) return gate

  const { firkod } = await params

  try {
    const sb = await getSupabaseServer()
    const sites = await resolveCompanySites(sb, firkod)

    // Yol şartı YOK: klasörü sunucudaki IIS'e soruyoruz. Sadece hangi sunucuya
    // gideceğimizi bilmemiz gerekiyor.
    const usable = [...sites.values()].filter((s) => !!s.server)
    if (usable.length === 0) return NextResponse.json([])

    // Sunucu bazında grupla — her sunucuya tek komut.
    const byServer = new Map<string, SiteRow[]>()
    for (const s of usable) {
      const list = byServer.get(s.server) ?? []
      list.push(s)
      byServer.set(s.server, list)
    }

    const { data: serverRows } = await sb
      .schema("hub").from("servers").select("name, ip, agent_port, api_key")
      .in("name", [...byServer.keys()])
    const srvByName = new Map(
      ((serverRows ?? []) as { name: string; ip: string; agent_port: number | null; api_key: string | null }[])
        .map((s) => [s.name, s]),
    )

    const results = await Promise.all(
      [...byServer.entries()].map(async ([serverName, list]): Promise<WebServiceUsersDto[]> => {
        const srv = srvByName.get(serverName)
        if (!srv?.ip || !srv.api_key) {
          return list.map((s) => ({
            siteName: s.name, server: serverName, users: [], dbs: [],
            error: "Sunucu agent bilgisi yok",
          }))
        }

        const cmd = buildReadUsersXml(
          list.map((s) => ({ site: s.name, fallbackPath: s.physical_path ?? "" })),
        )
        // 15sn: modal'ı çok bekletmesin — sunucu kapalıysa hızlıca "ulaşılamadı" de.
        const r = await execOnAgent(srv.ip, srv.agent_port ?? 8585, srv.api_key, cmd, 15)
        if (r.exitCode !== 0) {
          const why = r.timedOut ? "Sunucuya ulaşılamadı (zaman aşımı)" : (r.stderr?.trim() || "Agent komutu başarısız")
          return list.map((s) => ({ siteName: s.name, server: serverName, users: [], dbs: [], error: why }))
        }

        const parsed = parseOutput(r.stdout, serverName)
        return list.map(
          (s) =>
            parsed.get(s.name.toLowerCase()) ?? {
              siteName: s.name, server: serverName, users: [], dbs: [],
              error: "Yanıt okunamadı",
            },
        )
      }),
    )

    return NextResponse.json(results.flat())
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/web-users]", err)
    return NextResponse.json({ error: "Users.xml bilgisi alınamadı" }, { status: 500 })
  }
}

/* ─── POST: hizmete uygulama kullanıcısı ekle ──────────────────────────── */

/**
 * Users.xml'e yeni bir <User> ekler.
 *
 * Kaydetmeden önce dosyanın `.bak` kopyası alınır — bu dosya müşterinin canlı
 * uygulaması tarafından okunuyor, bozulursa giriş yapılamaz hale gelir.
 * Aynı kullanıcı adı varsa DEĞİŞTİRİLMEZ, `DUP` döner.
 *
 * ⚠ Tek satır + yalnız tek tırnak (agent'ın regex JSON parser'ı).
 * Çıktı: `OK` · `DUP` · `NOPATH` · `NOFILE` · `PARSE`
 */
function buildAddUserToXml(opts: {
  site: string
  fallbackPath: string
  username: string
  password: string
  dbs: string[]
}): string {
  const dbList = opts.dbs.map((d) => `'${psQuote(d)}'`).join(", ")
  return [
    ...usersXmlPrelude(opts.site, opts.fallbackPath),
    `$un='${psQuote(opts.username)}'`,
    `$pw='${psQuote(opts.password)}'`,
    `$dbs=@(${dbList})`,
    xmlGuard(
      `$dup = $false; ` +
      `foreach($u in @($root.SelectNodes('User'))){` +
        `$nn = $u.SelectSingleNode('Username'); ` +
        `if($nn -and ([string]$nn.InnerText).Trim().ToLower() -eq $un.Trim().ToLower()){ $dup = $true }` +
      `}; ` +
      `if($dup){ Write-Output 'DUP' } else {` +
        // Yazmadan önce yedek — canlı uygulamanın okuduğu dosya
        `Copy-Item -LiteralPath $f -Destination ($f + '.bak') -Force; ` +
        `$userEl = $d.CreateElement('User'); ` +
        `$eu = $d.CreateElement('Username'); $eu.InnerText = $un; [void]$userEl.AppendChild($eu); ` +
        `$ep = $d.CreateElement('Password'); $ep.InnerText = $pw; [void]$userEl.AppendChild($ep); ` +
        `$wrap = $d.CreateElement('Data'); ` +
        `foreach($db in $dbs){ $di = $d.CreateElement('Data'); $di.InnerText = $db; [void]$wrap.AppendChild($di) }; ` +
        `[void]$userEl.AppendChild($wrap); ` +
        // Sıra korunsun: <User>'lar üstte, global <DB> en sonda kalmalı
        // (sihirbazın ürettiği yapı bu). Sona eklersek DB'den sonra düşüyor.
        `$dbNode = $root.SelectSingleNode('DB'); ` +
        `if($null -ne $dbNode){ [void]$root.InsertBefore($userEl, $dbNode) } else { [void]$root.AppendChild($userEl) }; ` +
        `$d.Save($f); ` +
        `Write-Output 'OK'` +
      `}`,
    ),
  ].join("; ")
}

/* ─── PUT/DELETE: kullanıcıyı düzenle / sil ────────────────────────────── */

/**
 * Var olan <User> düğümünü günceller: şifre, DB listesi ve (verilirse) ad.
 * Kullanıcı yoksa `NOUSER`, yeni ad başkasında varsa `DUP` döner.
 */
function buildUpdateUserInXml(opts: {
  site: string
  fallbackPath: string
  username: string
  newUsername: string
  password: string
  dbs: string[]
}): string {
  const dbList = opts.dbs.map((d) => `'${psQuote(d)}'`).join(", ")
  return [
    ...usersXmlPrelude(opts.site, opts.fallbackPath),
    `$un='${psQuote(opts.username)}'`,
    `$nu='${psQuote(opts.newUsername)}'`,
    `$pw='${psQuote(opts.password)}'`,
    `$dbs=@(${dbList})`,
    xmlGuard(
      `$target = $null; $dup = $false; ` +
      `foreach($u in @($root.SelectNodes('User'))){` +
        `$nn = $u.SelectSingleNode('Username'); ` +
        `if($nn){` +
          `$cur = ([string]$nn.InnerText).Trim().ToLower(); ` +
          `if($cur -eq $un.Trim().ToLower()){ $target = $u } ` +
          `elseif($cur -eq $nu.Trim().ToLower()){ $dup = $true }` +
        `}` +
      `}; ` +
      `if($null -eq $target){ Write-Output 'NOUSER' } elseif($dup){ Write-Output 'DUP' } else {` +
        `Copy-Item -LiteralPath $f -Destination ($f + '.bak') -Force; ` +
        `$nn = $target.SelectSingleNode('Username'); if($nn){ $nn.InnerText = $nu }; ` +
        `$pn = $target.SelectSingleNode('Password'); ` +
        `if($null -eq $pn){ $pn = $target.AppendChild($d.CreateElement('Password')) }; ` +
        `$pn.InnerText = $pw; ` +
        // DB listesi tamamen yeniden yazılır (eski <Data> kaldırılır)
        `foreach($old in @($target.SelectNodes('Data'))){ [void]$target.RemoveChild($old) }; ` +
        `$wrap = $d.CreateElement('Data'); ` +
        `foreach($db in $dbs){ $di = $d.CreateElement('Data'); $di.InnerText = $db; [void]$wrap.AppendChild($di) }; ` +
        `[void]$target.AppendChild($wrap); ` +
        `$d.Save($f); ` +
        `Write-Output 'OK'` +
      `}`,
    ),
  ].join("; ")
}

/** <User> düğümünü siler. Kullanıcı yoksa `NOUSER`. */
function buildDeleteUserFromXml(opts: { site: string; fallbackPath: string; username: string }): string {
  return [
    ...usersXmlPrelude(opts.site, opts.fallbackPath),
    `$un='${psQuote(opts.username)}'`,
    xmlGuard(
      `$target = $null; ` +
      `foreach($u in @($root.SelectNodes('User'))){` +
        `$nn = $u.SelectSingleNode('Username'); ` +
        `if($nn -and ([string]$nn.InnerText).Trim().ToLower() -eq $un.Trim().ToLower()){ $target = $u }` +
      `}; ` +
      `if($null -eq $target){ Write-Output 'NOUSER' } else {` +
        `Copy-Item -LiteralPath $f -Destination ($f + '.bak') -Force; ` +
        `[void]$root.RemoveChild($target); ` +
        `$d.Save($f); ` +
        `Write-Output 'OK'` +
      `}`,
    ),
  ].join("; ")
}

/** Site klasörünü IIS'ten çözen ortak başlangıç (add/update/delete aynı). */
function usersXmlPrelude(site: string, fallbackPath: string): string[] {
  return [
    `Import-Module WebAdministration -ErrorAction SilentlyContinue`,
    `$site='${psQuote(site)}'`,
    `$fb='${psQuote(fallbackPath)}'`,
    `$p=''`,
    `try{ $w = Get-Website -Name $site -ErrorAction Stop; if($w){ $p = [string]$w.physicalPath } }catch{}`,
    `if(-not $p){ try{ $p = [string](Get-ItemProperty -Path ('IIS:\\Sites\\' + $site) -Name physicalPath -ErrorAction Stop).Value }catch{} }`,
    `if(-not $p){ $p = $fb }`,
  ]
}

/** Dosya/parse kontrollerini saran ortak gövde; `$root`, `$d`, `$f` sağlar. */
function xmlGuard(body: string): string {
  return (
    `if(-not $p){ Write-Output 'NOPATH' } else {` +
      `$p = [Environment]::ExpandEnvironmentVariables($p); ` +
      `$f = Join-Path $p 'Config\\Users.xml'; ` +
      `if(-not (Test-Path -LiteralPath $f)){ Write-Output 'NOFILE' } else {` +
        `$ok = $true; ` +
        `try{ [xml]$d = Get-Content -LiteralPath $f -Raw -Encoding UTF8 }catch{ $ok = $false }; ` +
        `if(-not $ok){ Write-Output 'PARSE' } else {` +
          `$root = $d.SelectSingleNode('/Users'); ` +
          `if($null -eq $root){ $root = $d.AppendChild($d.CreateElement('Users')) }; ` +
          body +
        `}` +
      `}` +
    `}`
  )
}

/**
 * Yazma uçlarının ortak akışı: doğrulama → firma-site eşlemesi → agent →
 * çıktı kodunun HTTP karşılığı. `build` komutu üretir.
 */
async function mutateUsersXml(
  firkod: string,
  siteName: string,
  build: (site: { name: string; physical_path: string | null }) => string,
  labels: { dup: string; noUser: string },
): Promise<NextResponse> {
  const sb = await getSupabaseServer()
  const sites = await resolveCompanySites(sb, firkod)
  const site = sites.get(siteName.toLowerCase())
  // Çapraz firma yazmayı engelle: site bu firmanın listesinde olmalı.
  if (!site) return NextResponse.json({ error: "Hizmet bu firmaya ait değil" }, { status: 403 })
  if (!site.server) return NextResponse.json({ error: "Hizmetin sunucusu bilinmiyor" }, { status: 400 })

  const srv = await siteAgent(sb, site.server)
  if (!srv?.ip || !srv.api_key) {
    return NextResponse.json({ error: "Sunucu agent bilgisi yok" }, { status: 400 })
  }

  const r = await execOnAgent(srv.ip, srv.agent_port ?? 8585, srv.api_key, build(site), 20)
  if (r.exitCode !== 0) {
    const why = r.timedOut ? "Sunucuya ulaşılamadı (zaman aşımı)" : (r.stderr?.trim() || "Agent komutu başarısız")
    return NextResponse.json({ error: why }, { status: 502 })
  }

  const out = (r.stdout ?? "").trim().split(/\r?\n/).pop()?.trim() ?? ""
  switch (out) {
    case "OK":      return NextResponse.json({ ok: true })
    case "DUP":     return NextResponse.json({ error: labels.dup }, { status: 409 })
    case "NOUSER":  return NextResponse.json({ error: labels.noUser }, { status: 404 })
    case "NOFILE":  return NextResponse.json({ error: "Hizmette Users.xml yok" }, { status: 400 })
    case "NOPATH":  return NextResponse.json({ error: "Site klasörü bulunamadı" }, { status: 400 })
    case "PARSE":   return NextResponse.json({ error: "Users.xml okunamadı (bozuk XML)" }, { status: 500 })
    default:        return NextResponse.json({ error: out || "Beklenmeyen yanıt" }, { status: 500 })
  }
}

/** XML metin düğümüne yazılıyor; kontrol karakteri / açı parantezi kabul etme. */
function badXmlText(s: string): boolean {
  return /[\r\n\t<>]/.test(s)
}

interface WriteBody {
  siteName:     string
  username:     string
  newUsername?: string
  password?:    string
  dbs?:         string[]
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  // Okumadan farklı: sunucudaki dosyayı DEĞİŞTİRİYOR — firma detayı yazma yetkisi.
  const gate = await requirePermission("company-detail", "write")
  if (gate) return gate

  const { firkod } = await params

  try {
    const body = (await req.json()) as WriteBody
    const siteName = body?.siteName?.trim() ?? ""
    const username = body?.username?.trim() ?? ""
    const password = body?.password ?? ""
    const dbs = (body?.dbs ?? []).map((d) => d.trim()).filter(Boolean)

    if (!siteName || !username || !password) {
      return NextResponse.json({ error: "siteName, username ve password zorunludur" }, { status: 400 })
    }
    if (badXmlText(username) || badXmlText(password)) {
      return NextResponse.json({ error: "Kullanıcı adı veya şifre geçersiz karakter içeriyor" }, { status: 400 })
    }

    return await mutateUsersXml(
      firkod,
      siteName,
      (site) => buildAddUserToXml({
        site: site.name, fallbackPath: site.physical_path ?? "", username, password, dbs,
      }),
      { dup: `"${username}" bu hizmette zaten kayıtlı`, noUser: "Kullanıcı bulunamadı" },
    )
  } catch (err) {
    console.error("[POST /api/companies/[firkod]/web-users]", err)
    return NextResponse.json({ error: "Kullanıcı eklenemedi" }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("company-detail", "write")
  if (gate) return gate

  const { firkod } = await params

  try {
    const body = (await req.json()) as WriteBody
    const siteName = body?.siteName?.trim() ?? ""
    const username = body?.username?.trim() ?? ""
    const newUsername = (body?.newUsername ?? body?.username)?.trim() ?? ""
    const password = body?.password ?? ""
    const dbs = (body?.dbs ?? []).map((d) => d.trim()).filter(Boolean)

    if (!siteName || !username || !newUsername || !password) {
      return NextResponse.json({ error: "siteName, username ve password zorunludur" }, { status: 400 })
    }
    if (badXmlText(newUsername) || badXmlText(password)) {
      return NextResponse.json({ error: "Kullanıcı adı veya şifre geçersiz karakter içeriyor" }, { status: 400 })
    }

    return await mutateUsersXml(
      firkod,
      siteName,
      (site) => buildUpdateUserInXml({
        site: site.name, fallbackPath: site.physical_path ?? "", username, newUsername, password, dbs,
      }),
      {
        dup: `"${newUsername}" bu hizmette zaten kayıtlı`,
        noUser: `"${username}" bu hizmette bulunamadı`,
      },
    )
  } catch (err) {
    console.error("[PUT /api/companies/[firkod]/web-users]", err)
    return NextResponse.json({ error: "Kullanıcı güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("company-detail", "write")
  if (gate) return gate

  const { firkod } = await params

  try {
    const body = (await req.json()) as WriteBody
    const siteName = body?.siteName?.trim() ?? ""
    const username = body?.username?.trim() ?? ""
    if (!siteName || !username) {
      return NextResponse.json({ error: "siteName ve username zorunludur" }, { status: 400 })
    }

    return await mutateUsersXml(
      firkod,
      siteName,
      (site) => buildDeleteUserFromXml({
        site: site.name, fallbackPath: site.physical_path ?? "", username,
      }),
      { dup: "", noUser: `"${username}" bu hizmette bulunamadı` },
    )
  } catch (err) {
    console.error("[DELETE /api/companies/[firkod]/web-users]", err)
    return NextResponse.json({ error: "Kullanıcı silinemedi" }, { status: 500 })
  }
}
