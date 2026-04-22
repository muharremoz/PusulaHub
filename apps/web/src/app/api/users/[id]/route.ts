import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { execute } from "@/lib/db"
import { auth }    from "@/auth"
import { serializeAllowedApps } from "@/lib/apps-registry"

type Params = { params: Promise<{ id: string }> }

// PATCH /api/users/[id]  { email?, fullName?, role?, isActive?, password?, reset2FA? }
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

  // AllowedApps CSV — gönderildiyse (array) tamamen değiştir; boş array → NULL
  const appsCsv =
    Array.isArray(body.allowedApps) ? serializeAllowedApps(body.allowedApps) : undefined

  await execute`
    UPDATE AppUsers SET
      Email       = COALESCE(${body.email    ?? null}, Email),
      FullName    = COALESCE(${body.fullName ?? null}, FullName),
      Role        = COALESCE(${body.role     ?? null}, Role),
      IsActive    = COALESCE(${body.isActive != null ? (body.isActive ? 1 : 0) : null}, IsActive),
      AllowedApps = CASE WHEN ${appsCsv === undefined ? 1 : 0} = 1 THEN AllowedApps ELSE ${appsCsv ?? null} END,
      UpdatedAt   = GETDATE()
    WHERE Id = ${id}
  `
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

  await execute`DELETE FROM AppUsers WHERE Id = ${id}`
  return NextResponse.json({ ok: true })
}
