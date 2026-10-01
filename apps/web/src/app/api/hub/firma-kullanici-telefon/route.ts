import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { execOnAgent } from "@/lib/agent-poller"

/**
 * /api/hub/firma-kullanici-telefon — firmanın AD kullanıcılarının TELEFON alanı
 * (AD `telephoneNumber`, ADUC Genel sekmesindeki "Telefon numarası").
 *
 *   GET  ?firkod=3018                         → { telefonlar: { "3018.ali": "0532…" } }
 *   POST { firkod, username, telefon }        → { ok: true, telefon }
 *
 * Agent raporu telefonu taşımıyor (DirectorySearcher'da yok); agent'ı her AD
 * sunucusunda güncellemek yerine istendiğinde PowerShell ile okunur/yazılır
 * (01.10.2026, CRM Erişim sekmesi "Telefon" sütunu). Boş telefon alanı temizler.
 *
 * Auth: x-internal-key (middleware `/api/hub/*` yolunu muaf tutar).
 * Kullanıcı yetkilendirmesini ÇAĞIRAN uygulama yapar.
 *
 * ⚠ Agent regex-parse yapıyor — çift tırnak YASAK. Tek tırnak + '' escape.
 */

function psQuote(s: string): string {
  return (s ?? "").replace(/'/g, "''")
}

/** Telefon: rakam, boşluk, + ( ) - ; en çok 32 karakter. Boş = temizle. */
const TELEFON_RE = /^[0-9+()\- ]{0,32}$/

function yetkili(req: NextRequest): NextResponse | null {
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  }
  if (req.headers.get("x-internal-key") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  return null
}

/** Firmanın AD sunucusunun agent bağlantısı. */
async function adAgent(firkod: string) {
  const sb = getSupabaseAdmin()
  const { data: comp } = await sb.schema("hub").from("companies")
    .select("ad_server_id").eq("company_id", firkod).maybeSingle()
  const adId = (comp as { ad_server_id: string | null } | null)?.ad_server_id
  if (!adId) return { hata: "AD sunucusu tanımsız" } as const
  const { data: srv } = await sb.schema("hub").from("servers")
    .select("ip, agent_port, api_key").eq("id", adId).maybeSingle()
  const s = srv as { ip: string; agent_port: number | null; api_key: string | null } | null
  if (!s?.agent_port || !s?.api_key) return { hata: "AD sunucusunun agent bilgisi eksik" } as const
  return { ip: s.ip, port: s.agent_port, key: s.api_key } as const
}

export async function GET(req: NextRequest) {
  const red = yetkili(req)
  if (red) return red

  const firkod = (req.nextUrl.searchParams.get("firkod") ?? "").trim()
  // firkod komuta giriyor — yalnız harf/rakam.
  if (!/^[A-Za-z0-9]{1,16}$/.test(firkod)) {
    return NextResponse.json({ error: "Geçersiz firkod" }, { status: 400 })
  }

  const a = await adAgent(firkod)
  if ("hata" in a) return NextResponse.json({ error: a.hata }, { status: 404 })

  // Satır başına "kullanici|telefon". Telefonu boş olanlar da gelir (boş = yok).
  const cmd =
    `Import-Module ActiveDirectory -ErrorAction Stop; ` +
    `try { ` +
      `Get-ADUser -Filter 'SamAccountName -like ''${firkod}.*''' -Properties telephoneNumber -ErrorAction Stop | ` +
      `ForEach-Object { Write-Output ('TEL|' + $_.SamAccountName + '|' + $_.telephoneNumber) } ` +
    `} catch { Write-Output ('HATA: ' + $_.Exception.Message) }`

  const res = await execOnAgent(a.ip, a.port, a.key, cmd, 20)
  const satirlar = (res.stdout ?? "").split(/\r?\n/).map((r) => r.trim())
  const hata = satirlar.find((r) => r.startsWith("HATA:"))
  if (res.exitCode !== 0 || hata) {
    return NextResponse.json(
      { error: hata || res.stderr || "Agent komutu başarısız" },
      { status: 500 },
    )
  }

  const telefonlar: Record<string, string> = {}
  for (const r of satirlar) {
    if (!r.startsWith("TEL|")) continue
    const [, kullanici, telefon = ""] = r.split("|")
    if (kullanici) telefonlar[kullanici.toLowerCase()] = telefon.trim()
  }
  return NextResponse.json({ telefonlar })
}

export async function POST(req: NextRequest) {
  const red = yetkili(req)
  if (red) return red

  let body: { firkod?: string; username?: string; telefon?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 })
  }
  const firkod = (body.firkod ?? "").trim()
  const username = (body.username ?? "").trim()
  const telefon = (body.telefon ?? "").trim().replace(/\s+/g, " ")
  if (!firkod || !username) {
    return NextResponse.json({ error: "firkod ve username zorunludur" }, { status: 400 })
  }
  if (!TELEFON_RE.test(telefon)) {
    return NextResponse.json(
      { error: "Telefon yalnız rakam, boşluk, + ( ) - içerebilir (en çok 32 karakter)." },
      { status: 400 },
    )
  }
  // username firkod.xxx formatında olmalı — başkasının kullanıcısına dokunmayı engelle
  if (!username.toLowerCase().startsWith(`${firkod.toLowerCase()}.`)) {
    return NextResponse.json({ error: "Kullanıcı bu firmaya ait değil" }, { status: 403 })
  }

  const a = await adAgent(firkod)
  if ("hata" in a) return NextResponse.json({ error: a.hata }, { status: 404 })

  const u = psQuote(username)
  const t = psQuote(telefon)
  // Boş → alan temizlenir ('-Clear' LDAP adı ister: telephoneNumber).
  const yaz = telefon
    ? `Set-ADUser -Identity '${u}' -OfficePhone '${t}' -ErrorAction Stop; `
    : `Set-ADUser -Identity '${u}' -Clear telephoneNumber -ErrorAction Stop; `

  const cmd =
    `Import-Module ActiveDirectory -ErrorAction Stop; ` +
    `try { ` +
      yaz +
      // Yazdıktan sonra GERİ OKU: "ok" dediğimiz şey sunucuda gerçekten olmuş olsun.
      `$y = [string](Get-ADUser -Identity '${u}' -Properties telephoneNumber -ErrorAction Stop).telephoneNumber; ` +
      `if ($y -eq '${t}') { Write-Output 'OK' } else { Write-Output ('HATA: telefon yazilamadi (sunucuda: ' + $y + ')') } ` +
    `} catch { Write-Output ('HATA: ' + $_.Exception.Message) }`

  const res = await execOnAgent(a.ip, a.port, a.key, cmd, 25)
  const out = (res.stdout ?? "").trim()
  const basarili = out.split(/\r?\n/).some((r) => r.trim() === "OK")
  if (res.exitCode !== 0 || !basarili) {
    const hata = out.split(/\r?\n/).find((r) => r.startsWith("HATA:"))
    return NextResponse.json(
      { error: hata || res.stderr || res.stdout || "Agent komutu başarısız" },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true, telefon })
}
