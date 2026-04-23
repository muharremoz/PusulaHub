import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { verifySync } from "otplib"

/**
 * Alt uygulamaların (SpareFlow vb.) 2-admin onay akışı için Hub'a
 * TOTP doğrulaması proxy'leyen endpoint.
 *
 * - Secret Hub DB'sinde kalır, alt uygulamaya sızmaz.
 * - x-internal-key header ile service-to-service korumalı.
 * - appId parametresi: hangi uygulamada admin olması gerektiği
 *   (örn. "spareflow"). Hub admin'i istisnadır — her app için geçerlidir.
 *
 * Body: { email: string, code: string, appId: string }
 * Success → { ok: true, userId: string, fullName: string, email: string }
 * Fail    → { error: string } + 401/403/429
 */

interface UserRow {
  Id:                string
  FullName:          string | null
  Email:             string
  IsActive:          number | boolean
  TwoFactorEnabled:  number | boolean
  TwoFactorSecret:   string | null
  GlobalRole:        string | null
  AppRole:           string | null
}

export async function POST(req: NextRequest) {
  const sentKey  = req.headers.get("x-internal-key")
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  }
  if (!sentKey || sentKey !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: { email?: string; code?: string; appId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  const email = (body.email ?? "").trim().toLowerCase()
  const code  = (body.code  ?? "").trim()
  const appId = (body.appId ?? "").trim()
  if (!email || !code || !appId) {
    return NextResponse.json({ error: "email, code ve appId zorunludur." }, { status: 400 })
  }

  // Kullanıcıyı ve ilgili app rolünü çek
  const rows = await query<UserRow[]>`
    SELECT u.Id, u.FullName, u.Email, u.IsActive,
           u.TwoFactorEnabled, u.TwoFactorSecret,
           u.[Role] AS GlobalRole,
           ua.[Role] AS AppRole
    FROM AppUsers u
    LEFT JOIN UserApps ua ON ua.UserId = u.Id AND ua.AppId = ${appId}
    WHERE u.Email = ${email}
  `
  const user = rows[0]
  if (!user || !user.IsActive) {
    return NextResponse.json({ error: "Yönetici bulunamadı veya aktif değil." }, { status: 401 })
  }

  const isAdmin = user.GlobalRole === "admin" || user.AppRole === "admin"
  if (!isAdmin) {
    return NextResponse.json({ error: "Bu kullanıcı hedef uygulamada yönetici değil." }, { status: 403 })
  }

  const is2fa = user.TwoFactorEnabled === true || user.TwoFactorEnabled === 1
  if (!is2fa || !user.TwoFactorSecret) {
    return NextResponse.json({ error: "Bu yöneticide 2FA kurulu değil." }, { status: 403 })
  }

  const { valid } = verifySync({ token: code, secret: user.TwoFactorSecret })
  if (!valid) {
    return NextResponse.json({ error: "Kod hatalı veya süresi dolmuş." }, { status: 401 })
  }

  return NextResponse.json({
    ok:       true,
    userId:   user.Id,
    fullName: user.FullName ?? user.Email,
    email:    user.Email,
  })
}
