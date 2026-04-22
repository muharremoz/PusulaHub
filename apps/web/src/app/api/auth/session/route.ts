/**
 * GET /api/auth/session — NextAuth useSession() uyumlu endpoint.
 *
 * next-auth/react `useSession()` hook'u bu endpoint'i çağırır; biz
 * pusula_session cookie'sinden aynı şekildeki payload'ı döneriz.
 */
import { NextResponse } from "next/server"
import { auth }         from "@/lib/pusula-session"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json(null)

  // NextAuth beklenen şekil: { user, expires }
  const expires = new Date(Date.now() + 12 * 3600 * 1000).toISOString()
  return NextResponse.json({ user: session.user, expires })
}
