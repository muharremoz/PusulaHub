import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"
import { requirePermission } from "@/lib/require-permission"
import { MODULES, type PermissionLevel } from "@/lib/permissions"

interface UserRow { Id: string; Role: string }
interface PermRow { ModuleKey: string; Level: string }

/** Belirli kullanıcının modül izinlerini getirir */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("users", "read")
  if (gate) return gate

  const { id } = await params
  try {
    const users = await query<UserRow[]>`
      SELECT Id, Role FROM AppUsers WHERE Id = ${id}
    `
    if (!users.length) return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 })

    const role = users[0].Role
    // Admin → hepsi write (kayıtsız)
    if (role === "admin") {
      const perms = MODULES.map((m) => ({ moduleKey: m.key, level: "write" as PermissionLevel }))
      return NextResponse.json({ role, isAdmin: true, permissions: perms })
    }

    const rows = await query<PermRow[]>`
      SELECT ModuleKey, [Level] FROM UserPermissions WHERE UserId = ${id}
    `
    const map = new Map(rows.map((r) => [r.ModuleKey, r.Level as PermissionLevel]))
    const perms = MODULES.map((m) => ({
      moduleKey: m.key,
      level:     (map.get(m.key) ?? "none") as PermissionLevel,
    }))
    return NextResponse.json({ role, isAdmin: false, permissions: perms })
  } catch (err) {
    console.error("[GET user permissions]", err)
    return NextResponse.json({ error: "İzinler alınamadı" }, { status: 500 })
  }
}

/** Kullanıcının tüm izinlerini toplu günceller */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("users", "write")
  if (gate) return gate

  const { id } = await params
  try {
    const body = await req.json() as { permissions: Array<{ moduleKey: string; level: PermissionLevel }> }
    const entries = body.permissions ?? []

    // Geçerli key'leri kontrol et
    const validKeys = new Set(MODULES.map((m) => m.key))
    const cleaned = entries.filter((e) => validKeys.has(e.moduleKey) && ["none", "read", "write"].includes(e.level))

    // Mevcut tüm izinleri sil, sadece "read"/"write" olanları yeniden ekle
    await execute`DELETE FROM UserPermissions WHERE UserId = ${id}`

    for (const e of cleaned) {
      if (e.level === "none") continue
      await execute`
        INSERT INTO UserPermissions (UserId, ModuleKey, [Level])
        VALUES (${id}, ${e.moduleKey}, ${e.level})
      `
    }

    return NextResponse.json({ ok: true, count: cleaned.filter((e) => e.level !== "none").length })
  } catch (err) {
    console.error("[PUT user permissions]", err)
    return NextResponse.json({ error: "İzinler kaydedilemedi" }, { status: 500 })
  }
}
