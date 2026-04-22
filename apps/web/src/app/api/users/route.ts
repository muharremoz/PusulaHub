import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { query, execute } from "@/lib/db"
import { auth } from "@/auth"
import { filterKnownApps } from "@/lib/apps-registry"

export interface AppUser {
  id:               string
  username:         string
  email:            string | null
  fullName:         string | null
  role:             string
  isActive:         boolean
  twoFactorEnabled: boolean
  allowedApps:      string[]
  createdAt:        string
}

interface UserRow {
  Id: string; Username: string; Email: string | null
  FullName: string | null; Role: string; IsActive: boolean
  TwoFactorEnabled: boolean; AppsCsv: string | null; CreatedAt: string
}

// GET /api/users  (sadece admin)
export async function GET() {
  const session = await auth()
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 })

  // UserApps ile LEFT JOIN — STRING_AGG ile CSV'ye topla (SQL Server 2017+)
  const rows = await query<UserRow[]>`
    SELECT u.Id, u.Username, u.Email, u.FullName, u.Role, u.IsActive, u.TwoFactorEnabled,
           CONVERT(NVARCHAR(30), u.CreatedAt, 120) AS CreatedAt,
           (SELECT STRING_AGG(ua.AppId, ',') FROM dbo.UserApps ua WHERE ua.UserId = u.Id) AS AppsCsv
    FROM   dbo.AppUsers u
    ORDER  BY u.CreatedAt DESC
  `
  return NextResponse.json(rows.map(r => ({
    id: r.Id, username: r.Username, email: r.Email,
    fullName: r.FullName, role: r.Role, isActive: !!r.IsActive,
    twoFactorEnabled: !!r.TwoFactorEnabled,
    allowedApps: r.AppsCsv ? r.AppsCsv.split(",").filter(Boolean) : [],
    createdAt: r.CreatedAt,
  }) satisfies AppUser))
}

// POST /api/users  (sadece admin)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 })

  const body = await req.json()
  const { username, email, fullName, role = "user", password, allowedApps } = body

  if (!username?.trim() || !password)
    return NextResponse.json({ error: "Kullanıcı adı ve şifre gerekli" }, { status: 400 })

  const exists = await query<{ c: number }[]>`
    SELECT COUNT(*) AS c FROM AppUsers WHERE LOWER(Username) = ${username.trim().toLowerCase()}
  `
  if (exists[0].c > 0)
    return NextResponse.json({ error: "Bu kullanıcı adı zaten kullanılıyor" }, { status: 409 })

  const id   = crypto.randomUUID()
  const hash = await bcrypt.hash(password, 12)
  const apps = Array.isArray(allowedApps) ? filterKnownApps(allowedApps) : []

  await execute`
    INSERT INTO AppUsers (Id, Username, Email, PasswordHash, FullName, Role)
    VALUES (${id}, ${username.trim()}, ${email ?? null}, ${hash}, ${fullName ?? null}, ${role})
  `

  // UserApps kayitlari — admin degilse (admin zaten tumune yetkili varsayilir)
  for (const appId of apps) {
    await execute`
      INSERT INTO UserApps (UserId, AppId) VALUES (${id}, ${appId})
    `
  }

  return NextResponse.json({ id }, { status: 201 })
}
