import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"
import { requirePermission } from "@/lib/require-permission"
import { MODULES, HUB_APP_ID, type ModuleDef, type PermissionLevel } from "@/lib/permissions"

interface UserAppRow { Role: string }
interface PermRow    { ModuleKey: string; Level: string }

/**
 * Verilen appId için modül kataloğunu döner. Hub kodda sabit, diğer app'ler
 * dbo.Apps.ModulesJson kolonundan okunur. App seed etmemişse boş dizi döner.
 *
 * ÖNEMLİ: GET ve PUT burada ortak — eskiden her iki route da HUB MODULES'unu
 * kullanıyor, SpareFlow gibi alt uygulamalarda kaydedilen izinler "geçerli
 * moduleKey değil" diye filtrelenip sessizce yok ediliyordu.
 */
async function loadModules(appId: string): Promise<ModuleDef[]> {
  if (appId === HUB_APP_ID) return MODULES
  const rows = await query<{ ModulesJson: string | null }[]>`
    SELECT ModulesJson FROM dbo.Apps WHERE Id = ${appId}
  `
  if (!rows.length || !rows[0].ModulesJson) return []
  try {
    return JSON.parse(rows[0].ModulesJson) as ModuleDef[]
  } catch {
    return []
  }
}

/**
 * Belirli kullanıcının BELİRLİ BİR APP'teki modül izinlerini getirir.
 * Query: ?appId=hub|spareflow (default: hub)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("users", "read")
  if (gate) return gate

  const { id } = await params
  const appId  = req.nextUrl.searchParams.get("appId") ?? HUB_APP_ID

  try {
    const modules = await loadModules(appId)

    // Kullanıcının bu app'teki rolü (UserApps). Yoksa app'e erişimi yok demektir.
    const userApps = await query<UserAppRow[]>`
      SELECT [Role] FROM UserApps WHERE UserId = ${id} AND AppId = ${appId}
    `
    if (!userApps.length) {
      // Erişim yok — boş izin listesi + isAdmin=false
      const perms = modules.map((m) => ({ moduleKey: m.key, level: "none" as PermissionLevel }))
      return NextResponse.json({ appId, role: "none", isAdmin: false, hasAccess: false, permissions: perms })
    }

    const role = userApps[0].Role

    // Admin → hepsi write (satır gerekmez)
    if (role === "admin") {
      const perms = modules.map((m) => ({ moduleKey: m.key, level: "write" as PermissionLevel }))
      return NextResponse.json({ appId, role, isAdmin: true, hasAccess: true, permissions: perms })
    }

    const rows = await query<PermRow[]>`
      SELECT ModuleKey, [Level] FROM UserPermissions
      WHERE UserId = ${id} AND AppId = ${appId}
    `
    const map = new Map(rows.map((r) => [r.ModuleKey, r.Level as PermissionLevel]))
    const perms = modules.map((m) => ({
      moduleKey: m.key,
      level:     (map.get(m.key) ?? "none") as PermissionLevel,
    }))
    return NextResponse.json({ appId, role, isAdmin: false, hasAccess: true, permissions: perms })
  } catch (err) {
    console.error("[GET user permissions]", err)
    return NextResponse.json({ error: "İzinler alınamadı" }, { status: 500 })
  }
}

/**
 * Kullanıcının BELİRLİ APP'teki tüm izinlerini toplu günceller.
 * Body: { appId?: string, permissions: [{ moduleKey, level }] }
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("users", "write")
  if (gate) return gate

  const { id } = await params
  try {
    const body = await req.json() as {
      appId?:       string
      permissions:  Array<{ moduleKey: string; level: PermissionLevel }>
    }
    const appId   = body.appId ?? HUB_APP_ID
    const entries = body.permissions ?? []

    // Geçerli key'leri hedef app'in kendi module catalog'una göre kontrol et.
    // Aksi hâlde SpareFlow gibi alt uygulamaların key'leri (installations, vb.)
    // Hub MODULES set'inde olmadığı için hepsi filtrelenip sessizce yok oluyordu.
    const modules   = await loadModules(appId)
    const validKeys = new Set(modules.map((m) => m.key))
    const cleaned   = entries.filter((e) =>
      validKeys.has(e.moduleKey) && ["none", "read", "write"].includes(e.level),
    )

    // Sadece bu app'in satırlarını sil ve yeniden yaz
    await execute`DELETE FROM UserPermissions WHERE UserId = ${id} AND AppId = ${appId}`

    for (const e of cleaned) {
      if (e.level === "none") continue
      await execute`
        INSERT INTO UserPermissions (UserId, AppId, ModuleKey, [Level])
        VALUES (${id}, ${appId}, ${e.moduleKey}, ${e.level})
      `
    }

    return NextResponse.json({ ok: true, appId, count: cleaned.filter((e) => e.level !== "none").length })
  } catch (err) {
    console.error("[PUT user permissions]", err)
    return NextResponse.json({ error: "İzinler kaydedilemedi" }, { status: 500 })
  }
}
