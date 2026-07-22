import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { stripPersistence } from "@/lib/supabase/session-cookies"

/**
 * Hub middleware — Birleşik platform (Supabase Auth).
 *
 * Kimlik: Supabase session cookie (`.pusulanet.net` alt-domain SSO). Oturum yoksa
 * Switch (login+launcher) `/login`'e döner. Hub erişimi JWT `app_access` claim'inden
 * okunur (custom_access_token_hook doldurur) — DB sorgusu yok. Modül izinleri app
 * içinde `auth()` ile taze okunur.
 *
 * basePath kaldırıldı → Hub kendi alt-domain'inin (hub.pusulanet.net) kökünde sunulur.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Switch (login+launcher) origin. Prod: https://app.pusulanet.net. Boşsa same-origin fallback.
const SWITCH_URL = process.env.NEXT_PUBLIC_SWITCH_URL || ""

/** JWT payload'ından `app_access` claim'ini çöz (getUser zaten doğruladı → yalnız decode). */
function decodeAppAccess(token: string | undefined): Record<string, string> | null {
  if (!token) return null
  const part = token.split(".")[1]
  if (!part) return null
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"))
    const claims = JSON.parse(json) as { app_access?: Record<string, string> }
    return claims.app_access ?? null
  } catch {
    return null
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Static asset & auth endpoint'leri geç
  if (pathname.startsWith("/_next") || pathname.includes(".")) return NextResponse.next()
  if (pathname.startsWith("/api/auth/")) return NextResponse.next()

  // Agent-facing endpoint'ler: Notifier/agent kendi token'ıyla (agent-store)
  // doğrular — Supabase user session'ı YOK, gate'lenmemeli.
  if (pathname.startsWith("/api/agent/")) return NextResponse.next()

  // Internal service-to-service endpoint — x-internal-key ile kendini koruyor.
  if (pathname.startsWith("/api/apps/register")) return NextResponse.next()
  // Alt uygulamaların Hub'a proxy'lediği istekler (kendi x-internal-key kontrolleri var).
  if (pathname.startsWith("/api/hub/")) return NextResponse.next()
  // Token-bazlı public müşteri yükleme akışı.
  if (pathname.startsWith("/t/") || pathname.startsWith("/api/aktarim/by-token/")) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request: req })
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
        response = NextResponse.next({ request: req })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, stripPersistence(value, options)),
        )
      },
    },
  })

  // Oturumu tazele (token refresh) + kullanıcıyı doğrula
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Browser'ın gördüğü origin (proxy x-forwarded-* header'ları) — 307 hedefi için.
  const fwdProto = req.headers.get("x-forwarded-proto")
  const fwdHost  = req.headers.get("x-forwarded-host")
  const origin   = fwdHost ? `${fwdProto ?? "https"}://${fwdHost}` : req.nextUrl.origin
  const switchBase = SWITCH_URL || origin

  if (!user) {
    const returnTo = `${origin}${pathname}${req.nextUrl.search}`
    return NextResponse.redirect(`${switchBase}/login?next=${encodeURIComponent(returnTo)}`)
  }

  // Hub erişimi: app_access claim (kaba kontrol). Claim yoksa (eski token / hook devre dışı)
  // fail-open — getUser zaten platform kullanıcısını doğruladı, auth() kimliği çözer.
  const appAccess = decodeAppAccess(
    (await supabase.auth.getSession()).data.session?.access_token,
  )
  if (appAccess && !("hub" in appAccess)) {
    // Claim BAYAT olabilir: grant token üretildikten sonra eklendiyse ve token
    // henüz expire olmadıysa `getUser` refresh etmez → claim'de hub görünmez.
    // Zorla refresh et (custom_access_token_hook yeniden çalışır); yenide de hub
    // yoksa kullanıcı gerçekten yetkisiz → Switch'e dön. Aksi halde erişime izin ver
    // (yeni cookie'ler `response`'a yazıldı).
    const { data: refreshed } = await supabase.auth.refreshSession()
    const refreshedAccess = decodeAppAccess(refreshed.session?.access_token)
    if (refreshedAccess && !("hub" in refreshedAccess)) {
      return NextResponse.redirect(`${switchBase}/?error=unauthorized`)
    }
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
