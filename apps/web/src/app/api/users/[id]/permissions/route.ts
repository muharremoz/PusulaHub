import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { requirePermission } from "@/lib/require-permission"
import { MODULES, HUB_APP_ID, type ModuleDef, type PermissionLevel } from "@/lib/permissions"

/** appId için modül kataloğu: Hub sabit, diğerleri public.apps.modules. */
async function loadModules(appId: string): Promise<ModuleDef[]> {
  if (appId === HUB_APP_ID) return MODULES
  const { data } = await getSupabaseAdmin().from("apps").select("modules").eq("id", appId).maybeSingle()
  const m = (data as { modules: unknown } | null)?.modules
  if (Array.isArray(m)) return m as ModuleDef[]
  if (typeof m === "string") { try { return JSON.parse(m) as ModuleDef[] } catch { return [] } }
  return []
}

/** GET ?appId= — kullanıcının bir app'teki modül izinleri (public.user_apps + user_permissions). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("users", "read")
  if (gate) return gate
  const { id } = await params
  const appId  = req.nextUrl.searchParams.get("appId") ?? HUB_APP_ID

  try {
    const admin = getSupabaseAdmin()
    const modules = await loadModules(appId)

    const { data: ua } = await admin.from("user_apps").select("role").eq("user_id", id).eq("app_id", appId).maybeSingle()
    if (!ua) {
      const perms = modules.map((m) => ({ moduleKey: m.key, level: "none" as PermissionLevel }))
      return NextResponse.json({ appId, role: "none", isAdmin: false, hasAccess: false, permissions: perms })
    }
    const role = (ua as { role: string }).role

    if (role === "admin") {
      const perms = modules.map((m) => ({ moduleKey: m.key, level: "write" as PermissionLevel }))
      return NextResponse.json({ appId, role, isAdmin: true, hasAccess: true, permissions: perms })
    }

    const { data: rows } = await admin.from("user_permissions").select("module_key, level").eq("user_id", id).eq("app_id", appId)
    const map = new Map(((rows ?? []) as { module_key: string; level: string }[]).map((r) => [r.module_key, r.level as PermissionLevel]))
    const perms = modules.map((m) => ({ moduleKey: m.key, level: (map.get(m.key) ?? "none") as PermissionLevel }))
    return NextResponse.json({ appId, role, isAdmin: false, hasAccess: true, permissions: perms })
  } catch (err) {
    console.error("[GET user permissions]", err)
    return NextResponse.json({ error: "İzinler alınamadı" }, { status: 500 })
  }
}

/** PUT — kullanıcının bir app'teki tüm modül izinlerini toplu yaz. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("users", "write")
  if (gate) return gate
  const { id } = await params
  try {
    const body = await req.json() as { appId?: string; permissions: Array<{ moduleKey: string; level: PermissionLevel }> }
    const appId   = body.appId ?? HUB_APP_ID
    const entries = body.permissions ?? []

    const modules   = await loadModules(appId)
    const validKeys = new Set(modules.map((m) => m.key))
    const cleaned   = entries.filter((e) => validKeys.has(e.moduleKey) && ["none", "read", "write"].includes(e.level))

    const admin = getSupabaseAdmin()
    await admin.from("user_permissions").delete().eq("user_id", id).eq("app_id", appId)

    const toInsert = cleaned.filter((e) => e.level !== "none").map((e) => ({ user_id: id, app_id: appId, module_key: e.moduleKey, level: e.level }))
    if (toInsert.length) {
      const { error } = await admin.from("user_permissions").insert(toInsert)
      if (error) throw error
    }
    return NextResponse.json({ ok: true, appId, count: toInsert.length })
  } catch (err) {
    console.error("[PUT user permissions]", err)
    return NextResponse.json({ error: "İzinler kaydedilemedi" }, { status: 500 })
  }
}
