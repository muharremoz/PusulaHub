import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { auth } from "@/auth"
import { filterKnownApps } from "@/lib/apps-registry"

type Params = { params: Promise<{ id: string }> }
type AppGrant = { id: string; role: "admin" | "user" }

function normalizeGrants(input: unknown): AppGrant[] {
  if (!Array.isArray(input)) return []
  const out: AppGrant[] = []
  for (const x of input) {
    if (typeof x === "string") out.push({ id: x, role: "user" })
    else if (x && typeof x === "object" && "id" in (x as object)) {
      const o = x as { id: string; role?: string }
      out.push({ id: String(o.id), role: o.role === "admin" ? "admin" : "user" })
    }
  }
  const known = new Set(filterKnownApps(out.map((g) => g.id)))
  return out.filter((g) => known.has(g.id))
}

// PATCH /api/users/[id]  { email?, fullName?, role?, isActive?, password?, reset2FA?, allowedApps? }
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (session?.user?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 })

  const { id } = await params
  const body   = await req.json()
  const admin  = getSupabaseAdmin()

  // Şifre / e-posta → auth.users (Supabase Auth)
  const authUpdate: { password?: string; email?: string } = {}
  if (body.password) authUpdate.password = body.password
  if (body.email != null) authUpdate.email = String(body.email).trim()
  if (Object.keys(authUpdate).length) {
    const { error } = await admin.auth.admin.updateUserById(id, authUpdate)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // reset2FA: birleşik modelde 2FA = Supabase MFA (Hub'da kapalı) → no-op.

  // Profil → public.users (yalnız gönderilenler)
  const patch: Record<string, unknown> = {}
  if (body.email    != null) patch.email  = String(body.email).trim()
  if (body.fullName != null) patch.name   = body.fullName
  if (body.role     != null) patch.role   = body.role
  if (body.isActive != null) patch.active = !!body.isActive
  if (Object.keys(patch).length) {
    await admin.from("users").update(patch).eq("id", id)
  }

  // allowedApps → user_apps replace
  if (Array.isArray(body.allowedApps)) {
    const grants = normalizeGrants(body.allowedApps)
    await admin.from("user_apps").delete().eq("user_id", id)
    if (grants.length) await admin.from("user_apps").insert(grants.map((g) => ({ user_id: id, app_id: g.id, role: g.role })))
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/users/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (session?.user?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 })

  const { id } = await params
  if (session.user.id === id) return NextResponse.json({ error: "Kendi hesabınızı silemezsiniz" }, { status: 400 })

  const admin = getSupabaseAdmin()
  // Grant/izin/profil temizliği (FK cascade'e güvenmeden), sonra auth kullanıcısı.
  await admin.from("user_permissions").delete().eq("user_id", id)
  await admin.from("user_apps").delete().eq("user_id", id)
  await admin.from("users").delete().eq("id", id)
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
