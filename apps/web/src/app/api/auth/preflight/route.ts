/**
 * POST /api/auth/preflight
 * Şifreyi doğrular; 2FA gerekiyorsa geçici token döner.
 * Login sayfası bu endpoint'i çağırarak hangi adımda olduğunu öğrenir.
 */
import { NextRequest, NextResponse } from "next/server"
import bcrypt                         from "bcryptjs"
import { query, execute }             from "@/lib/db"

interface UserRow {
  Id: string
  Username: string
  Email: string | null
  PasswordHash: string
  FullName: string | null
  Role: string
  TwoFactorEnabled: boolean
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()
  if (!username || !password)
    return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 })

  const rows = await query<UserRow[]>`
    SELECT Id, Username, Email, PasswordHash, FullName, Role, TwoFactorEnabled
    FROM AppUsers
    WHERE LOWER(Username) = ${username.trim().toLowerCase()} AND IsActive = 1
  `
  if (!rows.length)
    return NextResponse.json({ error: "Kullanıcı adı veya şifre hatalı" }, { status: 401 })

  const user  = rows[0]
  const valid = await bcrypt.compare(password, user.PasswordHash)
  if (!valid)
    return NextResponse.json({ error: "Kullanıcı adı veya şifre hatalı" }, { status: 401 })

  // 2FA aktif değilse direkt olarak işaretsiz cevap dön
  if (!user.TwoFactorEnabled)
    return NextResponse.json({ requires2FA: false })

  // 2FA aktifse geçici token oluştur (5 dk geçerli)
  const token    = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  // Eski tokenları temizle, yeni token ekle
  await execute`DELETE FROM TwoFactorTempTokens WHERE UserId = ${user.Id}`
  await execute`
    INSERT INTO TwoFactorTempTokens (Token, UserId, ExpiresAt)
    VALUES (${token}, ${user.Id}, ${expiresAt})
  `

  return NextResponse.json({ requires2FA: true, tempToken: token })
}
