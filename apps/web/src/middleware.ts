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

  // Redirect URL'leri basePath farkında olmalı — clone() basePath'i korur
  // Giriş yapmamış → /login'e yönlendir
  if (!isLoggedIn && !isAuthPage) {
    const loginUrl = nextUrl.clone()
    loginUrl.pathname = "/login"
    loginUrl.search = ""
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Giriş yapmış → /login'e gitmeye çalışırsa dashboard'a yönlendir
  if (isLoggedIn && isAuthPage) {
    const dashUrl = nextUrl.clone()
    dashUrl.pathname = "/dashboard"
    dashUrl.search = ""
    return NextResponse.redirect(dashUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
