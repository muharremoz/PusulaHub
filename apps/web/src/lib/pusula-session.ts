/**
 * Node runtime `auth()` — Birleşik platform (Supabase Auth).
 *
 * Kimlik TAMAMEN Supabase: `auth.users` (email+şifre, alt-domain SSO cookie).
 * `user.id` = auth.users uuid (eski mssql AppUsers.Id köprüsü KALDIRILDI — Faz 4 bitti).
 * Profil (ad/rol): `public.users`. Yetki: `public.user_apps` (apps+hub rolü) +
 * `public.user_permissions` (modül izinleri, permissions.ts).
 */
import { cache } from "react"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getUserPermissions, HUB_APP_ID, type PermissionMap } from "@/lib/permissions"

export type Level = "read" | "write"

/** Kullanıcının eriştiği bir uygulama + o app'teki rolü. */
export interface AppGrant {
  id:   string
  role: "admin" | "user"
  perms?: Record<string, Level>
}

export interface HubSession {
  user: {
    id:          string
    /** = id (auth.users uuid). Geriye dönük uyum için ayrı alan olarak korunuyor. */
    authUserId:  string
    username:    string
    email:       string | undefined
    fullName:    string
    name:        string
    /** Hub-özel rol (user_apps.role @ hub). public.users.role fallback. */
    role:        string
    permissions: PermissionMap
    apps:        AppGrant[]
  }
}

// Aynı request içinde tekrar hesaplanmasın
const getPerms = cache((id: string, appId: string, role: string) =>
  getUserPermissions(id, appId, role),
)

/** NextAuth `auth()` drop-in — Supabase auth.users + public identity. */
export async function auth(): Promise<HubSession | null> {
  const sb = await getSupabaseServer()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user?.email) return null

  const [{ data: profile }, { data: grants }] = await Promise.all([
    sb.from("users").select("name, role").eq("id", user.id).maybeSingle(),
    // user_id ile FİLTRELE — RLS'e güvenme: platform admin'lerde `is_platform_admin()`
    // politikası TÜM kullanıcıların grant'lerini döndürür, filtresiz `.find(hub)` yanlış
    // kullanıcının rolünü yakalar (admin kendini "user" görüp /unauthorized'a düşer).
    sb.from("user_apps").select("app_id, role").eq("user_id", user.id),
  ])

  const apps: AppGrant[] = ((grants ?? []) as { app_id: string; role: string }[]).map((g) => ({
    id:   g.app_id,
    role: g.role === "admin" ? "admin" : "user",
  }))

  const prof = profile as { name: string | null; role: string | null } | null
  const hubGrant = apps.find((a) => a.id === HUB_APP_ID)
  const hubRole  = hubGrant?.role ?? prof?.role ?? "user"
  const permissions = await getPerms(user.id, HUB_APP_ID, hubRole)

  const emailLocal = user.email.split("@")[0]
  const fullName = prof?.name || emailLocal

  return {
    user: {
      id:          user.id,
      authUserId:  user.id,
      username:    emailLocal,
      email:       user.email,
      fullName,
      name:        fullName,
      role:        hubRole,
      permissions,
      apps,
    },
  }
}
