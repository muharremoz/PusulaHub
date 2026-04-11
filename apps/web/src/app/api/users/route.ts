import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { query, execute } from "@/lib/db"
import { auth } from "@/auth"

export interface AppUser {
  id:               string
  username:         string
  email:            string | null
  fullName:         string | null
  role:             string
  isActive:         boolean
  twoFactorEnabled: boolean
  createdAt:        string
}

interface UserRow {
  Id: string; Username: string; Email: string | null
  FullName: string | null; Role: string; IsActive: boolean
  TwoFactorEnabled: boolean; CreatedAt: string
}

// GET /api/users  (sadece admin)
export async function GET() {
  const session = await auth()
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 })

  const rows = await query<UserRow[]>`
    SELECT Id, Username, Email, FullName, Role, IsActive, TwoFactorEnabled,
           CONVERT(NVARCHAR(30), CreatedAt, 120) AS CreatedAt
    FROM AppUsers ORDER BY CreatedAt DESC
  `
  return NextResponse.json(rows.map(r => ({
    id: r.Id, username: r.Username, email: r.Email,
    fullName: r.FullName, role: r.Role, isActive: !!r.IsActive,
    twoFactorEnabled: !!r.TwoFactorEnabled,
    createdAt: r.CreatedAt,
  }) satisfies AppUser))
}

// POST /api/users  (sadece admin)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 })

  const body = await req.json()
  const { username, email, fullName, role = "user", password } = body

  if (!username?.trim() || !password)
    return NextResponse.json({ error: "Kullanıcı adı ve şifre gerekli" }, { status: 400 })

  // Çakışma kontrolü
  const exists = await query<{ c: number }[]>`
    SELECT COUNT(*) AS c FROM AppUsers WHERE LOWER(Username) = ${username.trim().toLowerCase()}
  `
  if (exists[0].c > 0)
    return NextResponse.json({ error: "Bu kullanıcı adı zaten kullanılıyor" }, { status: 409 })

  const id   = crypto.randomUUID()
  const hash = await bcrypt.hash(password, 12)

  await execute`
    INSERT INTO AppUsers (Id, Username, Email, PasswordHash, FullName, Role)
    VALUES (${id}, ${username.trim()}, ${email ?? null}, ${hash}, ${fullName ?? null}, ${role})
  `
  return NextResponse.json({ id }, { status: 201 })
}
