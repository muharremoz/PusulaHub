import "server-only"

import { NextResponse } from "next/server"
import { execOnAgent } from "@/lib/agent-poller"
import {
  bindingPort,
  psQuote,
  resolveCompanySites,
  siteAgent,
  type SiteRow,
} from "@/lib/company-web-services"
import { getSupabaseServer } from "@/lib/supabase/server"

/**
 * Web hizmeti (IIS sitesi) kullanıcı yönetimi — Users.xml okuma/yazma, hizmet
 * yeniden başlatma ve gerçek giriş testi.
 *
 * Mantık burada duruyor çünkü İKİ kapıdan çağrılıyor:
 *   1. `/api/companies/[firkod]/web-users*` → Hub oturumu + modül yetkisi
 *   2. `/api/hub/firma-web-users*`          → x-internal-key (CRM gibi alt uygulamalar)
 * Kapılar yetkilendirmeyi yapar; buradaki fonksiyonlar yalnız işi yapar.
 *
 * Supabase istemcisi DIŞARIDAN verilir: oturumlu çağrıda session client, internal
 * çağrıda admin client gerekir (oturum yokken `hub` şemasında RLS okumayı boş
 * döndürür ve firma "kayıtsız" gibi görünür).
 */

export type OpsClient = Awaited<ReturnType<typeof getSupabaseServer>>

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
   * uygulama-içi kullanıcı tutmayan siteler normalde bu durumda.
   */
  notFound?: boolean
  /** Gerçek hata (parse bozuk, agent'a ulaşılamadı, sunucu kaydı eksik) */
  error?:   string
}

export interface WebUserTestResult {
  ok:        boolean
  supported: boolean
  message:   string
  endpoint?: string
  ms?:       number
  via?:      "lan" | "wan"
  host?:     string
  databases?: string[]
  raw?: { GetConnect?: string; GetDataBase?: string }
}

export interface WriteBody {
  siteName:     string
  username:     string
  newUsername?: string
  password?:    string
  dbs?:         string[]
}

/* ─── PowerShell komut üreticileri ─────────────────────────────────────── */

/**
 * Tek komutta N sitenin Users.xml'ini okur.
 *
 * Site klasörü SUNUCUDA IIS'e sorularak bulunur — `iis_sites.physical_path`
 * kolonuna güvenilmiyor: agent bu alanı çoğu sunucuda boş raporluyor.
 * DB'de yol varsa yedek olarak kullanılır.
 *
 * ⚠ Agent'ın JSON parser'ı regex tabanlı — komutta çift tırnak KULLANILMAZ.
 */
function buildReadUsersXml(targets: Array<{ site: string; fallbackPath: string }>): string {
  const pairs = targets
    .map((t) => `[pscustomobject]@{ Site='${psQuote(t.site)}'; Fallback='${psQuote(t.fallbackPath)}' }`)
    .join(", ")

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
      // Şifre içinde '|' olabilir → ilk ve SON ayraçtan bölünür.
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
 * Users.xml'e yeni bir <User> ekler. Yazmadan önce `.bak` kopyası alınır —
 * dosyayı müşterinin canlı uygulaması okuyor. Aynı ad varsa `DUP`.
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
        `Copy-Item -LiteralPath $f -Destination ($f + '.bak') -Force; ` +
        `$userEl = $d.CreateElement('User'); ` +
        `$eu = $d.CreateElement('Username'); $eu.InnerText = $un; [void]$userEl.AppendChild($eu); ` +
        `$ep = $d.CreateElement('Password'); $ep.InnerText = $pw; [void]$userEl.AppendChild($ep); ` +
        `$wrap = $d.CreateElement('Data'); ` +
        `foreach($db in $dbs){ $di = $d.CreateElement('Data'); $di.InnerText = $db; [void]$wrap.AppendChild($di) }; ` +
        `[void]$userEl.AppendChild($wrap); ` +
        // Sıra korunsun: <User>'lar üstte, global <DB> en sonda kalmalı.
        `$dbNode = $root.SelectSingleNode('DB'); ` +
        `if($null -ne $dbNode){ [void]$root.InsertBefore($userEl, $dbNode) } else { [void]$root.AppendChild($userEl) }; ` +
        `$d.Save($f); ` +
        `Write-Output 'OK'` +
      `}`,
    ),
  ].join("; ")
}

/** Var olan <User> düğümünü günceller: şifre, DB listesi ve (verilirse) ad. */
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

/**
 * App pool recycle + site stop/start. Uygulama Users.xml'i AÇILIŞTA okuduğu için
 * dosyayı yazmak yetmiyor; worker process yenilenmeli.
 */
function buildRestartSite(siteName: string): string {
  const n = psQuote(siteName)
  return [
    `Import-Module WebAdministration -ErrorAction SilentlyContinue`,
    `$site='${n}'`,
    `$exists = $false`,
    `try{ if(Get-Website -Name $site -ErrorAction Stop){ $exists = $true } }catch{}`,
    `if(-not $exists){ Write-Output 'NOSITE' } else {` +
      `$pool = ''; ` +
      `try{ $pool = [string](Get-ItemProperty -Path ('IIS:\\Sites\\' + $site) -Name applicationPool -ErrorAction Stop).Value }catch{}; ` +
      `if($pool){` +
        `try{ Restart-WebAppPool -Name $pool -ErrorAction Stop }catch{` +
          `try{ Stop-WebAppPool -Name $pool -ErrorAction SilentlyContinue }catch{}; ` +
          `Start-Sleep -Milliseconds 500; ` +
          `try{ Start-WebAppPool -Name $pool -ErrorAction SilentlyContinue }catch{}` +
        `}` +
      `}; ` +
      `try{ Stop-Website -Name $site -ErrorAction SilentlyContinue }catch{}; ` +
      `Start-Sleep -Milliseconds 700; ` +
      `try{ Start-Website -Name $site -ErrorAction SilentlyContinue }catch{}; ` +
      `Start-Sleep -Milliseconds 500; ` +
      `$st = ''; try{ $st = [string](Get-WebsiteState -Name $site -ErrorAction Stop).Value }catch{}; ` +
      `$Error.Clear(); ` +
      `$global:LASTEXITCODE = 0; ` +
      `Write-Output ('STATE:' + $st)` +
    `}`,
  ].join("; ")
}

/* ─── İşlemler ─────────────────────────────────────────────────────────── */

/** Firmanın her web hizmeti için Users.xml içeriğini agent üzerinden okur. */
export async function listWebUsers(sb: OpsClient, firkod: string): Promise<WebServiceUsersDto[]> {
  const sites = await resolveCompanySites(sb, firkod)

  // Yol şartı YOK: klasörü sunucudaki IIS'e soruyoruz. Sadece hangi sunucuya
  // gideceğimizi bilmemiz gerekiyor.
  const usable = [...sites.values()].filter((s) => !!s.server)
  if (usable.length === 0) return []

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
      // 15sn: ekranı çok bekletmesin — sunucu kapalıysa hızlıca "ulaşılamadı" de.
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

  return results.flat()
}

/**
 * Yazma işlemlerinin ortak akışı: firma-site sahipliği → agent → çıktı kodunun
 * HTTP karşılığı.
 */
async function mutateUsersXml(
  sb: OpsClient,
  firkod: string,
  siteName: string,
  build: (site: { name: string; physical_path: string | null }) => string,
  labels: { dup: string; noUser: string },
): Promise<NextResponse> {
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

export async function addWebUser(sb: OpsClient, firkod: string, body: WriteBody): Promise<NextResponse> {
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

  return mutateUsersXml(
    sb,
    firkod,
    siteName,
    (site) => buildAddUserToXml({
      site: site.name, fallbackPath: site.physical_path ?? "", username, password, dbs,
    }),
    { dup: `"${username}" bu hizmette zaten kayıtlı`, noUser: "Kullanıcı bulunamadı" },
  )
}

export async function updateWebUser(sb: OpsClient, firkod: string, body: WriteBody): Promise<NextResponse> {
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

  return mutateUsersXml(
    sb,
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
}

export async function deleteWebUser(sb: OpsClient, firkod: string, body: WriteBody): Promise<NextResponse> {
  const siteName = body?.siteName?.trim() ?? ""
  const username = body?.username?.trim() ?? ""
  if (!siteName || !username) {
    return NextResponse.json({ error: "siteName ve username zorunludur" }, { status: 400 })
  }

  return mutateUsersXml(
    sb,
    firkod,
    siteName,
    (site) => buildDeleteUserFromXml({
      site: site.name, fallbackPath: site.physical_path ?? "", username,
    }),
    { dup: "", noUser: `"${username}" bu hizmette bulunamadı` },
  )
}

/** Hizmeti yeniden başlatır (app pool recycle + site stop/start). */
export async function restartWebService(
  sb: OpsClient,
  firkod: string,
  siteNameRaw: string,
): Promise<NextResponse> {
  const siteName = siteNameRaw?.trim() ?? ""
  if (!siteName) return NextResponse.json({ error: "siteName zorunludur" }, { status: 400 })

  const sites = await resolveCompanySites(sb, firkod)
  const site = sites.get(siteName.toLowerCase())
  if (!site) return NextResponse.json({ error: "Hizmet bu firmaya ait değil" }, { status: 403 })
  if (!site.server) return NextResponse.json({ error: "Hizmetin sunucusu bilinmiyor" }, { status: 400 })

  const srv = await siteAgent(sb, site.server)
  if (!srv?.ip || !srv.api_key) {
    return NextResponse.json({ error: "Sunucu agent bilgisi yok" }, { status: 400 })
  }

  const r = await execOnAgent(srv.ip, srv.agent_port ?? 8585, srv.api_key, buildRestartSite(site.name), 40)
  if (r.exitCode !== 0) {
    const why = r.timedOut ? "Sunucuya ulaşılamadı (zaman aşımı)" : (r.stderr?.trim() || "Agent komutu başarısız")
    return NextResponse.json({ error: why }, { status: 502 })
  }

  const out = (r.stdout ?? "").trim().split(/\r?\n/).pop()?.trim() ?? ""
  if (out === "NOSITE") {
    return NextResponse.json({ error: `IIS'te "${site.name}" sitesi bulunamadı` }, { status: 404 })
  }
  const state = out.startsWith("STATE:") ? out.slice(6).trim() : ""
  if (state !== "Started") {
    return NextResponse.json(
      { error: `Site yeniden başlatılamadı${state ? ` (durum: ${state})` : ""}` },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true, state })
}

/** Servislerin iki farklı yönlendirmesi — sırayla denenir. */
const API_PREFIXES = ["/api", ""]

/**
 * Users.xml'deki kullanıcının hizmete GERÇEKTEN giriş yapıp yapamadığını dener.
 * `via`: "lan" → sunucu IP'si (servisin kendisi), "wan" → DNS (müşteri yolu).
 */
export async function testWebUser(
  sb: OpsClient,
  firkod: string,
  body: { siteName?: string; username?: string; password?: string; database?: string; via?: "lan" | "wan" },
): Promise<NextResponse> {
  const siteName = body?.siteName?.trim() ?? ""
  const username = body?.username?.trim() ?? ""
  const password = body?.password ?? ""
  const database = body?.database?.trim() ?? ""
  const via: "lan" | "wan" = body?.via === "wan" ? "wan" : "lan"

  if (!siteName || !username || !password) {
    return NextResponse.json({ error: "siteName, username ve password zorunludur" }, { status: 400 })
  }

  const sites = await resolveCompanySites(sb, firkod)
  const site = sites.get(siteName.toLowerCase())
  if (!site) return NextResponse.json({ error: "Hizmet bu firmaya ait değil" }, { status: 403 })

  const port = bindingPort(site.binding)
  if (!port) return NextResponse.json({ error: "Hizmetin portu bilinmiyor" }, { status: 400 })

  const srv = await siteAgent(sb, site.server)
  if (!srv?.ip) return NextResponse.json({ error: "Hizmetin sunucusu bulunamadı" }, { status: 400 })

  const host = via === "wan" ? (srv.dns?.trim() ?? "") : srv.ip
  if (!host) {
    const result: WebUserTestResult = {
      ok: false, supported: false, via,
      message: "Sunucunun DNS adı tanımlı değil — dışarıdan test yapılamıyor",
    }
    return NextResponse.json(result)
  }

  const payload = JSON.stringify({ Username: username, Password: password, DataBase: database })
  let lastMessage = "Servise ulaşılamadı"

  const post = async (path: string) => {
    const r = await fetch(`http://${host}:${port}${path}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    payload,
      signal:  AbortSignal.timeout(12000),
      cache:   "no-store",
    })
    return { status: r.status, text: await r.text() }
  }

  for (const prefix of API_PREFIXES) {
    const loginPath = `${prefix}/Login/GetConnect`
    const t0 = Date.now()
    try {
      const { status, text } = await post(loginPath)
      const ms = Date.now() - t0

      // Yol yanlışsa Web API JSON 404 döner — sıradaki öneki dene.
      if (status === 404) { lastMessage = "Login ucu bulunamadı"; continue }

      let json: { IsError?: boolean; ErrorMessage?: string } | null = null
      try { json = JSON.parse(text) } catch { /* JSON değil */ }

      if (!json || typeof json.IsError !== "boolean") {
        lastMessage = `Beklenmeyen yanıt (HTTP ${status})`
        continue
      }

      const ok = json.IsError === false
      const result: WebUserTestResult = {
        ok,
        supported: true,
        message:   ok ? "Giriş başarılı" : (json.ErrorMessage || "Giriş reddedildi"),
        endpoint:  loginPath,
        host:      `${host}:${port}`,
        via,
        ms,
        raw:       { GetConnect: text },
      }

      // Giriş geçtiyse kullanıcının NE gördüğünü de al.
      if (ok) {
        try {
          const db = await post(`${prefix}/Login/GetDataBase`)
          result.raw!.GetDataBase = db.text
          const parsed = JSON.parse(db.text) as { Content?: unknown }
          if (Array.isArray(parsed?.Content)) {
            result.databases = parsed.Content.map((x) => String(x))
          }
        } catch { /* opsiyonel adım — giriş sonucunu bozmaz */ }
      }

      return NextResponse.json(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      lastMessage = msg.includes("timeout") || msg.includes("abort")
        ? "Servis yanıt vermedi (zaman aşımı)"
        : "Servise bağlanılamadı"
    }
  }

  const result: WebUserTestResult = {
    ok: false, supported: false, message: lastMessage, via, host: `${host}:${port}`,
  }
  return NextResponse.json(result)
}
