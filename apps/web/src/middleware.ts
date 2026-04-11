import NextAuth      from "next-auth"
import { authConfig } from "@/auth.config"
import { NextResponse } from "next/server"

/**
 * Middleware: Edge runtime'da çalışır.
 * Ağır paketler (bcryptjs, otplib) import edilmez — sadece authConfig kullanılır.
 */
const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { nextUrl }  = req
  const isLoggedIn   = !!req.auth
  const isAuthPage   = nextUrl.pathname.startsWith("/login")
  const isApiAuth    = nextUrl.pathname.startsWith("/api/auth")

  // NextAuth API her zaman erişilebilir
  if (isApiAuth) return NextResponse.next()

  // Giriş yapmamış → /login'e yönlendir
  if (!isLoggedIn && !isAuthPage) {
    const loginUrl = new URL("/login", nextUrl.origin)
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Giriş yapmış → /login'e gitmeye çalışırsa dashboard'a yönlendir
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl.origin))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
