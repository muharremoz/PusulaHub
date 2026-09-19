import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { execOnAgent, pollSingleAgent } from "@/lib/agent-poller"
import { adEzmeKaydet } from "@/lib/ad-ad-ezme"

/**
 * POST /api/hub/firma-kullanici-ad
 * Body: { firkod: string, username: string, displayName: string }
 *
 * Firmanın AD kullanıcısının ad-soyadını (DisplayName + GivenName/Surname)
 * değiştirir — alt uygulamalar (CRM Erişim sekmesi) için. AD agent'a
 * PowerShell komutu gider. Yanıt komut biter bitmez döner; liste yeni adı
 * `ad-ad-ezme` ile hemen gösterir, agent önbelleği arka planda tazelenir.
 *
 * Auth: x-internal-key (middleware `/api/hub/*` yolunu muaf tutar).
 * Kullanıcı yetkilendirmesini ÇAĞIRAN uygulama yapar.
 *
 * ⚠ Agent regex-parse yapıyor — çift tırnak YASAK. Tek tırnak + '' escape.
 */

interface Body {
  firkod?: string
  username?: string
  displayName?: string
}

function psQuote(s: string): string {
  return (s ?? "").replace(/'/g, "''")
}

export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  }
  if (req.headers.get("x-internal-key") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 })
  }
  const firkod = (body.firkod ?? "").trim()
  const username = (body.username ?? "").trim()
  const displayName = (body.displayName ?? "").trim().replace(/\s+/g, " ")
  if (!firkod || !username) {
    return NextResponse.json({ error: "firkod ve username zorunludur" }, { status: 400 })
  }
  if (!displayName || displayName.length > 64) {
    return NextResponse.json({ error: "Ad soyad 1-64 karakter olmalı" }, { status: 400 })
  }
  // username firkod.xxx formatında olmalı — başkasının kullanıcısına dokunmayı engelle
  if (!username.toLowerCase().startsWith(`${firkod.toLowerCase()}.`)) {
    return NextResponse.json({ error: "Kullanıcı bu firmaya ait değil" }, { status: 403 })
  }

  const sb = getSupabaseAdmin()
  const { data: comp } = await sb.schema("hub").from("companies")
    .select("ad_server_id").eq("company_id", firkod).maybeSingle()
  const adId = (comp as { ad_server_id: string | null } | null)?.ad_server_id
  if (!adId) return NextResponse.json({ error: "AD sunucusu tanımsız" }, { status: 404 })
  const { data: srv } = await sb.schema("hub").from("servers")
    .select("ip, agent_port, api_key").eq("id", adId).maybeSingle()
  const s = srv as { ip: string; agent_port: number | null; api_key: string | null } | null
  if (!s?.agent_port || !s?.api_key) {
    return NextResponse.json({ error: "AD sunucusunun agent bilgisi eksik" }, { status: 404 })
  }

  // displayName → GivenName + Surname (buildCreateUser ile aynı kural)
  const parts = displayName.split(" ")
  const given = parts[0]
  const surname = parts.slice(1).join(" ")
  const u = psQuote(username)
  // Boş Surname parametre olarak geçilemiyor — tek kelimede alan temizlenir.
  const soyad = surname ? `-Surname '${psQuote(surname)}'` : `-Clear Surname`
  const cmd =
    `Import-Module ActiveDirectory; ` +
    `Set-ADUser -Identity '${u}' -DisplayName '${psQuote(displayName)}' ` +
    `-GivenName '${psQuote(given)}' ${soyad} -ErrorAction Stop; ` +
    `Write-Output 'OK'`

  const res = await execOnAgent(s.ip, s.agent_port, s.api_key, cmd, 20)
  const out = (res.stdout ?? "").trim()
  if (res.exitCode !== 0 || !out.includes("OK")) {
    return NextResponse.json(
      { error: res.stderr || res.stdout || "Agent komutu başarısız" },
      { status: 500 },
    )
  }

  // Liste yeni adı HEMEN göstersin: agent önbelleği tazelenene kadar ad
  // burada tutulur (bkz. ad-ad-ezme). Force poll BEKLENMEZ — AD sunucusunda
  // 20-60 sn sürüyor, CRM'de kaydet düğmesi o kadar dönüyordu. Arka planda
  // çalışır ve agent'ın AD önbelleğini sıfırlar.
  adEzmeKaydet(firkod, username, displayName)
  void pollSingleAgent(adId, true).catch(() => { /* ezme kaydı zaten koruyor */ })

  return NextResponse.json({ ok: true, displayName })
}
