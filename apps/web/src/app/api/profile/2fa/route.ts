import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getSupabaseServer } from "@/lib/supabase/server"

/**
 * Profil 2FA — birleşik platformda Supabase MFA (TOTP). Eski AppUsers.TwoFactorSecret
 * (mssql + otplib) KALDIRILDI. QR/secret Supabase enroll'dan gelir.
 * Not: POST artık { factorId, code } bekler (GET yanıtındaki factorId).
 */

// GET → durum + (kapalıysa) yeni enroll QR
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 })

  const sb = await getSupabaseServer()
  const { data: factors } = await sb.auth.mfa.listFactors()
  const verified = factors?.totp?.find((f) => f.status === "verified")
  if (verified) return NextResponse.json({ enabled: true, qrCode: null, secret: null, factorId: null })

  // Bekleyen (unverified) faktörleri temizle, yenisini enroll et
  for (const f of factors?.totp ?? []) {
    if (f.status !== "verified") { try { await sb.auth.mfa.unenroll({ factorId: f.id }) } catch {} }
  }
  const { data: enroll, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "PusulaHub" })
  if (error || !enroll) return NextResponse.json({ error: error?.message ?? "MFA başlatılamadı" }, { status: 500 })
  return NextResponse.json({ enabled: false, qrCode: enroll.totp.qr_code, secret: enroll.totp.secret, factorId: enroll.id })
}

// POST { factorId, code } → doğrula + etkinleştir
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 })

  const { factorId, code } = await req.json()
  if (!factorId || !code) return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 })

  const sb = await getSupabaseServer()
  const { data: ch, error: chErr } = await sb.auth.mfa.challenge({ factorId })
  if (chErr || !ch) return NextResponse.json({ error: chErr?.message ?? "Challenge başarısız" }, { status: 400 })
  const { error } = await sb.auth.mfa.verify({ factorId, challengeId: ch.id, code: String(code).trim() })
  if (error) return NextResponse.json({ error: "Geçersiz kod. QR'ı yeniden tara." }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// DELETE → tüm TOTP faktörlerini kaldır
export async function DELETE() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 })

  const sb = await getSupabaseServer()
  const { data: factors } = await sb.auth.mfa.listFactors()
  for (const f of factors?.totp ?? []) { try { await sb.auth.mfa.unenroll({ factorId: f.id }) } catch {} }
  return NextResponse.json({ ok: true })
}
