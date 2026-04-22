import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { query, execute } from "@/lib/db"
import { auth } from "@/auth"
import { filterKnownApps } from "@/lib/apps-registry"

export interface AppGrantDto {
  id:   string
  role: "admin" | "user" | "viewer"
}

export interface AppUser {
  id:               string
  username:         string
  email:            string | null
  fullName:         string | null
  role:             string            // global role (geriye dönük)
  isActive:         boolean
  twoFactorEnabled: boolean
  allowedApps:      AppGrantDto[]     // [{id, role}]
  createdAt:        string
}

interface UserRow {
  Id: string; Username: string; Email: string | null
  FullName: string | null; Role: string; IsActive: boolean
  TwoFactorEnabled: boolean; AppsJson: string | null; CreatedAt: string
}

function parseAppsJson(json: string | null): AppGrantDto[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json) as Array<{ AppId: string; Role: string }>
    return arr.map((r) => ({
      id:   r.AppId,
      role: (["admin", "user", "viewer"].includes(r.Role) ? r.Role : "user") as AppGrantDto["role"],
    }))
  } catch { return [] }
}

function normalizeGrants(input: unknown): AppGrantDto[] {
  if (!Array.isArray(input)) return []
  const out: AppGrantDto[] = []
  for (const x of input) {
    if (typeof x === "string") {
      out.push({ id: x, role: "user" })
    } else if (x && typeof x === "object" && "id" in (x as object)) {
      const o = x as { id: string; role?: string }
      const role = (["admin", "user", "viewer"].includes(o.role ?? "") ? o.role : "user") as AppGrantDto["role"]
      out.push({ id: String(o.id), role })
    }
  }
  // Geçersiz app id'lerini ele
  const known = new Set(filterKnownApps(out.map((g) => g.id)))
  return out.filter((g) => known.has(g.id))
}

// GET /api/users  (sadece admin)
export async function GET() {
  const session = await auth()
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 })

  // UserApps'ten JSON array olarak çek — her app için (id, role) ikilisi.
  const rows = await query<UserRow[]>`
    SELECT u.Id, u.Username, u.Email, u.FullName, u.Role, u.IsActive, u.TwoFactorEnabled,
           CONVERT(NVARCHAR(30), u.CreatedAt, 120) AS CreatedAt,
           (
             SELECT ua.AppId, ua.[Role]
             FROM dbo.UserApps ua
             WHERE ua.UserId = u.Id
             FOR JSON PATH
           ) AS AppsJson
    FROM   dbo.AppUsers u
    ORDER  BY u.CreatedAt DESC
  `
  return NextResponse.json(rows.map(r => ({
    id: r.Id, username: r.Username, email: r.Email,
    fullName: r.FullName, role: r.Role, isActive: !!r.IsActive,
    twoFactorEnabled: !!r.TwoFactorEnabled,
    allowedApps: parseAppsJson(r.AppsJson),
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

  const id     = crypto.randomUUID()
  const hash   = await bcrypt.hash(password, 12)
  const grants = normalizeGrants(allowedApps)

  await execute`
    INSERT INTO AppUsers (Id, Username, Email, PasswordHash, FullName, Role)
    VALUES (${id}, ${username.trim()}, ${email ?? null}, ${hash}, ${fullName ?? null}, ${role})
  `

  // Admin rolünde yeni kullanıcı → tüm aktif app'lere admin UserApps satırı
  // (aksi halde Switch landing'de erişimi yok gibi görünür).
  if (role === "admin") {
    await execute`
      INSERT INTO UserApps (UserId, AppId, [Role])
      SELECT ${id}, a.Id, 'admin' FROM dbo.Apps a WHERE a.IsActive = 1
    `
  } else {
    for (const g of grants) {
      await execute`
        INSERT INTO UserApps (UserId, AppId, [Role]) VALUES (${id}, ${g.id}, ${g.role})
      `
    }
  }

  return NextResponse.json({ id }, { status: 201 })
}
