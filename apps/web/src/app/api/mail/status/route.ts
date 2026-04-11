import { NextResponse }         from "next/server"
import { getStoredTokens }       from "@/lib/google-oauth"

// GET /api/mail/status  →  { connected: bool, email: string|null }
export async function GET() {
  const tokens = await getStoredTokens("Admin")
  if (!tokens) return NextResponse.json({ connected: false, email: null })
  return NextResponse.json({ connected: true, email: tokens.Email })
}
