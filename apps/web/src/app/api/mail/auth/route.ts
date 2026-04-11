import { NextResponse } from "next/server"
import { createOAuth2Client, SCOPES } from "@/lib/google-oauth"

// GET /api/mail/auth  →  Google OAuth sayfasına yönlendir
export async function GET() {
  const client = createOAuth2Client()
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope:       SCOPES,
    prompt:      "consent",   // refresh_token her zaman gelsin
  })
  return NextResponse.redirect(url)
}
