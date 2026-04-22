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

  if (!payload) {
    // Session yok → gateway /login'e (basePath YOK).
    // Raw 307 ile Location header'ı Next basePath re-yazmasın diye.
    const next = `/apps/hub${pathname}`
    return new NextResponse(null, {
      status:  307,
      headers: { Location: `/login?next=${encodeURIComponent(next)}` },
    })
  }

  // Admin dışı kullanıcı "hub" app'e yetkili mi?
  const allowed = payload.role === "admin" || (payload.apps ?? []).includes("hub")
  if (!allowed) {
    return new NextResponse(null, {
      status:  307,
      headers: { Location: "/?error=unauthorized" },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|api/auth).*)"],
}
