import { NextRequest, NextResponse } from "next/server"
import { google }                   from "googleapis"
import { createOAuth2Client, saveTokens } from "@/lib/google-oauth"

// GET /api/mail/auth/callback?code=...
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code")
  if (!code) {
    return NextResponse.redirect(new URL("/mail?error=no_code", req.url))
  }

  try {
    const client = createOAuth2Client()
    const { tokens } = await client.getToken(code)
    client.setCredentials(tokens)

    // Kullanıcı e-posta adresini al
    const oauth2    = google.oauth2({ version: "v2", auth: client })
    const userInfo  = await oauth2.userinfo.get()
    const email     = userInfo.data.email ?? null

    await saveTokens(
      "Admin",
      tokens.access_token!,
      tokens.refresh_token!,
      new Date(tokens.expiry_date!),
      email
    )

    return NextResponse.redirect(new URL("/mail?connected=1", req.url))
  } catch (e) {
    console.error("OAuth callback error:", e)
    return NextResponse.redirect(new URL("/mail?error=auth_failed", req.url))
  }
}
