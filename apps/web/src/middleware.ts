import { NextResponse, type NextRequest } from "next/server"
import { verifyEdge, COOKIE_NAME }         from "@/lib/pusula-session-edge"

/**
 * Hub middleware: pusula_session cookie'sini doğrular.
 * Session yoksa gateway /login'e (basePath dışı) yönlendirir.
 *
 * NOT: basePath = /apps/hub. Browser gateway:4000 üzerinden erişir,
 * /login path'i gateway'e gider (Hub'ın kendi /login sayfası kaldırıldı).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Static asset & public API
  if (pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next()
  }

const token   = req.cookies.get(COOKIE_NAME)?.value
  const payload = await verifyEdge(token)

  // NOT: Next 15 edge adapter (adapter.js:318) Location header'ını NextURL
  // ile parse ediyor → relative URL "Invalid URL" atıyor.
  // Origin'i browser'ın gördüğü host'tan (gateway: :4000) alıyoruz ki 307
  // doğru yere gitsin; gateway proxy x-forwarded-* header'larını setliyor.
  const fwdProto = req.headers.get("x-forwarded-proto")
  const fwdHost  = req.headers.get("x-forwarded-host")
  const origin   = fwdHost ? `${fwdProto ?? "http"}://${fwdHost}` : req.nextUrl.origin

  if (!payload) {
    // Session yok → gateway /login'e (basePath YOK).
    const next = `/apps/hub${pathname}`
    return new NextResponse(null, {
      status:  307,
      headers: { Location: `${origin}/login?next=${encodeURIComponent(next)}` },
    })
  }

  // Admin dışı kullanıcı "hub" app'e yetkili mi?
  const allowed = payload.role === "admin" || (payload.apps ?? []).includes("hub")
  if (!allowed) {
    return new NextResponse(null, {
      status:  307,
      headers: { Location: `${origin}/?error=unauthorized` },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|api/auth).*)"],
}
