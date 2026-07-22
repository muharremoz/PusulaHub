import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { auth } from "@/auth"
import { filterKnownApps } from "@/lib/apps-registry"

/**
 * Personel yönetimi — birleşik platform (public.users + auth.users + user_apps).
 * Login artık EMAIL (Supabase Auth); username kozmetik (email local-part).
 */

export interface AppGrantDto { id: string; role: "admin" | "user" }

export interface AppUser {
  id: string; username: string; email: string | null; fullName: string | null
  role: string; isActive: boolean; twoFactorEnabled: boolean
  allowedApps: AppGrantDto[]; createdAt: string
}

function normalizeGrants(input: unknown): AppGrantDto[] {
  if (!Array.isArray(input)) return []
  const out: AppGrantDto[] = []
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

// GET /api/users (admin)
export async function GET() {
  const session = await auth()
  if (session?.user?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 })

  const admin = getSupabaseAdmin()
  const [{ data: users }, { data: grants }] = await Promise.all([
    admin.from("users").select("id, name, email, role, active, created_at").order("created_at", { ascending: false }),
    admin.from("user_apps").select("user_id, app_id, role"),
  ])
  const byUser = new Map<string, AppGrantDto[]>()
  for (const g of (grants ?? []) as { user_id: string; app_id: string; role: string }[]) {
    const arr = byUser.get(g.user_id) ?? []
    arr.push({ id: g.app_id, role: g.role === "admin" ? "admin" : "user" })
    byUser.set(g.user_id, arr)
  }
  return NextResponse.json(((users ?? []) as { id: string; name: string | null; email: string | null; role: string; active: boolean; created_at: string }[]).map((u) => ({
    id: u.id, username: u.email?.split("@")[0] ?? u.name ?? "",
    email: u.email, fullName: u.name, role: u.role, isActive: !!u.active,
    twoFactorEnabled: false, allowedApps: byUser.get(u.id) ?? [], createdAt: u.created_at,
  }) satisfies AppUser))
}

// POST /api/users (admin) — auth.users + public.users + user_apps
export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 })

  const body = await req.json()
  const { username, email, fullName, role = "user", password, allowedApps } = body
  const mail = (email ?? "").trim()
  if (!mail || !password) return NextResponse.json({ error: "E-posta ve şifre gerekli" }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { data: created, error: authErr } = await admin.auth.admin.createUser({ email: mail, password, email_confirm: true })
  if (authErr || !created?.user) {
    const msg = authErr?.message ?? "Kullanıcı oluşturulamadı"
    const status = /already|registered|exists/i.test(msg) ? 409 : 500
    return NextResponse.json({ error: status === 409 ? "Bu e-posta zaten kayıtlı" : msg }, { status })
  }
  const uid = created.user.id

  const { error: profErr } = await admin.from("users").insert({
    id: uid, name: fullName || username || mail.split("@")[0], email: mail, role,
  })
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 })

  // Grants: admin → tüm aktif app'lere admin; değilse verilen grant'ler
  if (role === "admin") {
    const { data: apps } = await admin.from("apps").select("id").eq("is_active", true)
    const rows = ((apps ?? []) as { id: string }[]).map((a) => ({ user_id: uid, app_id: a.id, role: "admin" }))
    if (rows.length) await admin.from("user_apps").insert(rows)
  } else {
    const grants = normalizeGrants(allowedApps)
    if (grants.length) await admin.from("user_apps").insert(grants.map((g) => ({ user_id: uid, app_id: g.id, role: g.role })))
  }

  return NextResponse.json({ id: uid }, { status: 201 })
}
