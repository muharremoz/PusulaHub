import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Hedef uygulamada "admin" rolüne sahip + TOTP (Supabase MFA) kurulu
 * yöneticilerin listesi. Alt uygulamaların 2-admin onay UI'ı için.
 *
 * Query: ?appId=spareflow   ·   Auth: x-internal-key
 * Yanıt: [{ id, fullName, email }]
 * Kaynak: public.hub_two_factor_admins RPC (auth.mfa_factors üzerinden).
 */
export async function GET(req: NextRequest) {
  const sentKey  = req.headers.get("x-internal-key")
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  if (!sentKey || sentKey !== expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const appId = (req.nextUrl.searchParams.get("appId") ?? "").trim()
  if (!appId) return NextResponse.json({ error: "appId zorunludur." }, { status: 400 })

  const { data, error } = await getSupabaseAdmin().rpc("hub_two_factor_admins", { p_app_id: appId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(((data ?? []) as { id: string; full_name: string | null; email: string }[]).map((r) => ({
    id: r.id, fullName: r.full_name ?? r.email, email: r.email,
  })))
}
