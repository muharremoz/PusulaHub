import { NextRequest, NextResponse } from "next/server"
import { verifySync } from "otplib"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Alt uygulamaların (SpareFlow vb.) 2-admin onay akışı için Hub'a TOTP
 * doğrulaması proxy'leyen endpoint. Secret Hub/platform'da kalır (Supabase
 * MFA — auth.mfa_factors), alt uygulamaya sızmaz; x-internal-key ile korumalı.
 *
 * Body: { email, code, appId }
 * Success → { ok: true, userId, fullName, email }
 * Kaynak: public.hub_admin_totp RPC (service_role only).
 */
export async function POST(req: NextRequest) {
  const sentKey  = req.headers.get("x-internal-key")
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  if (!sentKey || sentKey !== expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: { email?: string; code?: string; appId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }) }

  const email = (body.email ?? "").trim().toLowerCase()
  const code  = (body.code  ?? "").trim()
  const appId = (body.appId ?? "").trim()
  if (!email || !code || !appId) return NextResponse.json({ error: "email, code ve appId zorunludur." }, { status: 400 })

  const { data, error } = await getSupabaseAdmin().rpc("hub_admin_totp", { p_email: email, p_app_id: appId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const user = ((data ?? []) as { id: string; full_name: string | null; email: string; is_admin: boolean; secret: string | null }[])[0]
  if (!user) return NextResponse.json({ error: "Yönetici bulunamadı veya aktif değil." }, { status: 401 })
  if (!user.is_admin) return NextResponse.json({ error: "Bu kullanıcı hedef uygulamada yönetici değil." }, { status: 403 })
  if (!user.secret) return NextResponse.json({ error: "Bu yöneticide 2FA kurulu değil." }, { status: 403 })

  const { valid } = verifySync({ token: code, secret: user.secret })
  if (!valid) return NextResponse.json({ error: "Kod hatalı veya süresi dolmuş." }, { status: 401 })

  return NextResponse.json({ ok: true, userId: user.id, fullName: user.full_name ?? user.email, email: user.email })
}
