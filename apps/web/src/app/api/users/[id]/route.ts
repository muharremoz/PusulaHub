import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { execute } from "@/lib/db"
import { auth }    from "@/auth"
import { filterKnownApps } from "@/lib/apps-registry"

type Params = { params: Promise<{ id: string }> }

type AppGrant = { id: string; role: "admin" | "user" | "viewer" }

function normalizeGrants(input: unknown): AppGrant[] {
  if (!Array.isArray(input)) return []
  const out: AppGrant[] = []
  for (const x of input) {
    if (typeof x === "string") {
      out.push({ id: x, role: "user" })
    } else if (x && typeof x === "object" && "id" in (x as object)) {
      const o = x as { id: string; role?: string }
      const role = (["admin", "user", "viewer"].includes(o.role ?? "") ? o.role : "user") as AppGrant["role"]
      out.push({ id: String(o.id), role })
    }
  }
  const known = new Set(filterKnownApps(out.map((g) => g.id)))
  return out.filter((g) => known.has(g.id))
}

// PATCH /api/users/[id]  { email?, fullName?, role?, isActive?, password?, reset2FA?, allowedApps? }
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 })

  const { id } = await params
  const body   = await req.json()

  if (body.password) {
    const hash = await bcrypt.hash(body.password, 12)
    await execute`UPDATE AppUsers SET PasswordHash = ${hash}, UpdatedAt = GETDATE() WHERE Id = ${id}`
  }

  if (body.reset2FA) {
    await execute`
      UPDATE AppUsers SET TwoFactorSecret = NULL, TwoFactorEnabled = 0, UpdatedAt = GETDATE()
      WHERE Id = ${id}
    `
  }

  await execute`
    UPDATE AppUsers SET
      Email     = COALESCE(${body.email    ?? null}, Email),
      FullName  = COALESCE(${body.fullName ?? null}, FullName),
      Role      = COALESCE(${body.role     ?? null}, Role),
      IsActive  = COALESCE(${body.isActive != null ? (body.isActive ? 1 : 0) : null}, IsActive),
      UpdatedAt = GETDATE()
    WHERE Id = ${id}
  `

  // AllowedApps — gönderildiyse UserApps tablosunu tamamen yeniden yaz (diff yerine replace)
  // Yeni format: [{ id, role }]; eski string[] formatı da kabul edilir.
  if (Array.isArray(body.allowedApps)) {
    const grants = normalizeGrants(body.allowedApps)
    await execute`DELETE FROM UserApps WHERE UserId = ${id}`
    for (const g of grants) {
      await execute`INSERT INTO UserApps (UserId, AppId, [Role]) VALUES (${id}, ${g.id}, ${g.role})`
    }
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/users/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 })

  const { id } = await params
  if (session.user.id === id)
    return NextResponse.json({ error: "Kendi hesabınızı silemezsiniz" }, { status: 400 })

  // UserApps FK'da ON DELETE CASCADE var — ayrıca silmeye gerek yok
  await execute`DELETE FROM AppUsers WHERE Id = ${id}`
  return NextResponse.json({ ok: true })
}
