import { NextRequest, NextResponse } from "next/server"
import { generateSecret, generateURI, verifySync } from "otplib"
import QRCode                        from "qrcode"
import { auth }                      from "@/auth"
import { query, execute }            from "@/lib/db"

interface UserRow { TwoFactorEnabled: boolean; TwoFactorSecret: string | null; Username: string }

// GET /api/profile/2fa  →  mevcut durum + kurulum için QR
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 })

  const rows = await query<UserRow[]>`
    SELECT TwoFactorEnabled, TwoFactorSecret, Username
    FROM AppUsers WHERE Id = ${session.user.id}
  `
  if (!rows.length) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 })
  const user = rows[0]

  if (user.TwoFactorEnabled) {
    return NextResponse.json({ enabled: true, qrCode: null, secret: null })
  }

  // Kurulum için yeni secret üret (etkinleştirilmeden DB'e kaydetme)
  const secret  = generateSecret()
  const otpauth = generateURI({ issuer: "PusulaHub", label: user.Username, secret })
  const qrCode  = await QRCode.toDataURL(otpauth)

  return NextResponse.json({ enabled: false, qrCode, secret })
}

// POST /api/profile/2fa  →  2FA'yı etkinleştir (kodu doğrula)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 })

  const { secret, code } = await req.json()
  if (!secret || !code)
    return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 })

  const { valid } = verifySync({ token: code.trim(), secret })
  if (!valid)
    return NextResponse.json({ error: "Geçersiz kod. QR'ı yeniden tara." }, { status: 400 })

  await execute`
    UPDATE AppUsers SET TwoFactorSecret = ${secret}, TwoFactorEnabled = 1, UpdatedAt = GETDATE()
    WHERE Id = ${session.user.id}
  `
  return NextResponse.json({ ok: true })
}

// DELETE /api/profile/2fa  →  2FA'yı devre dışı bırak
export async function DELETE() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 })

  await execute`
    UPDATE AppUsers SET TwoFactorSecret = NULL, TwoFactorEnabled = 0, UpdatedAt = GETDATE()
    WHERE Id = ${session.user.id}
  `
  return NextResponse.json({ ok: true })
}
