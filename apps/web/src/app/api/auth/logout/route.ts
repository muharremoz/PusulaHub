/**
 * POST /api/auth/logout
 * pusula_session cookie'sini siler. Path=/ olduğu için 3 uygulama da
 * aynı cookie'yi paylaşır; buradan silmek yeterli.
 */
import { NextResponse } from "next/server"
import { COOKIE_NAME }  from "@/lib/pusula-session"

export async function POST() {
  const res = NextResponse.json({ success: true })
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure:   process.env.NODE_ENV === "production",
    path:     "/",
    maxAge:   0,
  })
  return res
}
