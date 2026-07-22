/**
 * POST /api/auth/logout — Supabase signOut.
 *
 * `.pusulanet.net` alt-domain cookie'sini temizler (session-cookies withDomain).
 * Tek Supabase oturumu olduğundan buradan çıkış tüm platform uygulamalarını kapsar.
 */
import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

export async function POST() {
  const sb = await getSupabaseServer()
  await sb.auth.signOut()
  return NextResponse.json({ success: true })
}
