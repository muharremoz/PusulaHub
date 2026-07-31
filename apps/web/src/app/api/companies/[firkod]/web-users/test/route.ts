import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import { bindingPort, resolveCompanySites, siteAgent } from "@/lib/company-web-services"

/**
 * POST /api/companies/[firkod]/web-users/test
 * Body: { siteName, username, password, database?, via? }
 *
 * `via`:
 *   "lan"  (varsayılan) → sunucunun LAN IP'si. Servisin kendisini ölçer.
 *   "wan"                → sunucunun DNS adı (örn. iis.databag.net). Müşterinin
 *                          dışarıdan gördüğü yolu ölçer: DNS kaydı, port
 *                          yönlendirme ve firewall dahil. LAN çalışıp WAN
 *                          çalışmıyorsa sorun serviste değil, ağ tarafındadır.
 *
 * Users.xml'deki bir kullanıcının hizmete GERÇEKTEN giriş yapıp yapamadığını
 * dışarıdan dener: servisin login ucuna istek atar ve yanıtı yorumlar.
 *
 * Servisler ASP.NET Web API 2 ve iki farklı yönlendirme kullanıyor:
 *   Pusula MOBIL → POST /api/Login/GetConnect   (attribute routing)
 *   Pusula RFID  → POST /Login/GetConnect       (api öneki yok)
 * Bu yüzden adaylar sırayla denenir, 404 olmayan ilk JSON yanıt kabul edilir.
 *
 * Yanıt gövdesi her iki serviste de aynı şekilde:
 *   { Controller, Action, IsError: bool, ErrorMessage: string }
 * HTTP kodu başarısız girişte de 200 — başarı ölçütü `IsError === false`.
 */

/** Servislerin iki farklı yönlendirmesi — sırayla denenir. */
const API_PREFIXES = ["/api", ""]

export interface WebUserTestResult {
  /** Kimlik bilgileri geçerli mi */
  ok:        boolean
  /** Servis bir login ucu sunuyor mu (yoksa test yapılamaz) */
  supported: boolean
  /** Servisin döndürdüğü mesaj ya da hata açıklaması */
  message:   string
  /** Kullanılan uç (teşhis için) */
  endpoint?: string
  /** Yanıt süresi (ms) */
  ms?:       number
  /** Denenen hedef — "lan" (IP) veya "wan" (DNS) */
  via?:      "lan" | "wan"
  /** İstek atılan adres (host:port) */
  host?:     string
  /** Servisin bu kullanıcı için döndürdüğü veritabanı listesi (GetDataBase) */
  databases?: string[]
  /** Ham yanıtlar — kullanıcıya olduğu gibi gösterilir */
  raw?: { GetConnect?: string; GetDataBase?: string }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  // Şifreyle giriş denemesi yapıyor — okuma yetkisi yeterli değil.
  const gate = await requirePermission("company-detail", "write")
  if (gate) return gate

  const { firkod } = await params

  try {
    const body = (await req.json()) as {
      siteName?: string; username?: string; password?: string; database?: string
      via?: "lan" | "wan"
    }
    const siteName = body?.siteName?.trim() ?? ""
    const username = body?.username?.trim() ?? ""
    const password = body?.password ?? ""
    const database = body?.database?.trim() ?? ""
    const via: "lan" | "wan" = body?.via === "wan" ? "wan" : "lan"

    if (!siteName || !username || !password) {
      return NextResponse.json({ error: "siteName, username ve password zorunludur" }, { status: 400 })
    }

    const sb = await getSupabaseServer()
    const sites = await resolveCompanySites(sb, firkod)
    const site = sites.get(siteName.toLowerCase())
    if (!site) return NextResponse.json({ error: "Hizmet bu firmaya ait değil" }, { status: 403 })

    const port = bindingPort(site.binding)
    if (!port) return NextResponse.json({ error: "Hizmetin portu bilinmiyor" }, { status: 400 })

    const srv = await siteAgent(sb, site.server)
    if (!srv?.ip) return NextResponse.json({ error: "Hizmetin sunucusu bulunamadı" }, { status: 400 })

    // LAN: sunucunun IP'si (servisin kendisi). WAN: DNS adı (müşteri yolu).
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

        // Yol yanlışsa Web API JSON 404 döner — sıradaki öneki dene
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

        // Giriş geçtiyse kullanıcının gerçekten NE gördüğünü de al: GetDataBase
        // erişebildiği veritabanlarını döner — "bağlandı ama veri yok" durumunu
        // ayırt etmenin tek yolu bu.
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
  } catch (err) {
    console.error("[POST /api/companies/[firkod]/web-users/test]", err)
    return NextResponse.json({ error: "Erişim testi yapılamadı" }, { status: 500 })
  }
}
