import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { auth } from "@/auth"

/**
 * Personel yönetimi — birleşik platform (public.users + auth.users + user_apps).
 * Kullanıcı OLUŞTURMA tek yerde: Pusula CRM. Hub yalnız listeler (GET).
 */

export interface AppGrantDto { id: string; role: "admin" | "user" }

export interface AppUser {
  id: string; username: string; email: string | null; fullName: string | null
  role: string; isActive: boolean; twoFactorEnabled: boolean
  allowedApps: AppGrantDto[]; createdAt: string
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

// POST /api/users — DEVRE DIŞI. Birleşik platformda kullanıcı oluşturma TEK YERDE:
// Pusula CRM (settings/users). Hub yalnız listeler/görüntüler. Yeni personel + app
// erişimi CRM'den atanır → auth.users + public.users + user_apps.
export async function POST() {
  return NextResponse.json(
    { error: "Kullanıcılar Pusula CRM'den oluşturulur (Ayarlar → Kullanıcılar). Uygulama erişimi de orada atanır." },
    { status: 403 },
  )
}
