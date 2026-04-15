import { NextRequest, NextResponse } from "next/server"
import { createOAuth2Client, SCOPES } from "@/lib/google-oauth"

// GET /api/mail/auth  →  Google OAuth sayfasına yönlendir
export async function GET(req: NextRequest) {
  // host header'dan al (custom server ile nextUrl.host güvenilmez)
  const host        = req.headers.get("host") ?? "localhost:4242"
  const proto       = host.startsWith("localhost") ? "http" : "http"
  const redirectUri = `${proto}://${host}/api/mail/auth/callback`

  const client = createOAuth2Client(redirectUri)
  const url    = client.generateAuthUrl({
    access_type: "offline",
    scope:       SCOPES,
    prompt:      "consent",
    state:       Buffer.from(redirectUri).toString("base64"),
  })
  return NextResponse.redirect(url)
}
