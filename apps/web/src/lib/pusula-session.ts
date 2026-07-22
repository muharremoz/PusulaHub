/**
 * Node runtime `auth()` — Birleşik platform (Supabase Auth) köprüsü.
 *
 * Kimlik: Supabase `auth.users` (email+şifre, alt-domain SSO cookie `.pusulanet.net`).
 * Ama Hub'ın ~16 dosyası `session.user.id === AppUsers.Id` (mssql GUID) sözleşmesine
 * bağlı → email köprüsü: Supabase email → `AppUsers.Id`. Bu köprü Faz 4'te
 * (Hub DB → Postgres) tamamen kalkacak.
 *
 * Yetki:
 *  - apps[] + hub rolü: `public.user_apps` (RLS — kullanıcı kendi grant'lerini görür)
 *  - modül izinleri: mssql `getUserPermissions` (AppUsers.Id ile) — Faz 4'e kadar korunur
 */
import { cache } from "react"
import { getSupabaseServer } from "@/lib/supabase/server"
import { query } from "@/lib/db"
import { getUserPermissions, HUB_APP_ID, type PermissionMap } from "@/lib/permissions"

export type Level = "read" | "write"

/** Kullanıcının eriştiği bir uygulama + o app'teki rolü. */
export interface AppGrant {
  id:   string
  role: "admin" | "user"
  /** Module-level perms — bu modelde app içinde taze okunur, burada doldurulmaz. */
  perms?: Record<string, Level>
}

export interface HubSession {
  user: {
    id:          string
    /** Supabase auth.users uuid — yeni domain kayıtlarında `created_by` için.
     *  (`id` mssql AppUsers.Id sözleşmesini korur; bu ayrı alan Faz 4 yazımları için.) */
    authUserId:  string
    username:    string
    email:       string | undefined
    fullName:    string
    name:        string
    /** Hub-özel rol (user_apps.role @ hub). AppUsers.Role fallback. */
    role:        string
    /** Hub modül izinleri */
    permissions: PermissionMap
    /** Kullanıcının erişebileceği app'ler + her biri için rol */
    apps:        AppGrant[]
  }
}

interface AppUserRow {
  Id:       string
  Username: string
  FullName: string | null
  Role:     string | null
}

/**
 * Email → AppUsers kimliği (Faz 4'te kalkacak köprü).
 *
 * NOT: Supabase `auth.users` email'i ile Hub `AppUsers.Email` birebir eşleşmeli.
 * Göç sırasında düzeltilen yazım hataları (ör. `ediz@pusuanet.net` → `ediz@pusulanet.net`)
 * Hub DB'de de güncellenmiş olmalı; aksi halde o kullanıcı için köprü boş döner.
 */
const bridgeAppUser = cache(async (email: string): Promise<AppUserRow | null> => {
  const rows = await query<AppUserRow[]>`
    SELECT Id, Username, FullName, Role
    FROM AppUsers
    WHERE Email = ${email} AND IsActive = 1
  `
  return rows[0] ?? null
})

// Aynı request içinde DB'ye tekrar gidilmesin
const getPerms = cache((id: string, appId: string, role: string) =>
  getUserPermissions(id, appId, role),
)

/** NextAuth `auth()` drop-in replacement — Supabase session + AppUsers köprüsü. */
export async function auth(): Promise<HubSession | null> {
  const sb = await getSupabaseServer()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user?.email) return null

  // Kimlik köprüsü: Supabase email → AppUsers.Id (16 dosyanın bağlı olduğu sözleşme).
  const appUser = await bridgeAppUser(user.email)
  if (!appUser) return null // Supabase kullanıcısı var ama Hub AppUsers'da karşılığı yok

  // Yetki: user_apps (RLS → yalnız kendi grant'leri)
  const { data: grants } = await sb.from("user_apps").select("app_id, role")
  const apps: AppGrant[] = ((grants ?? []) as { app_id: string; role: string }[]).map((g) => ({
    id:   g.app_id,
    role: g.role === "admin" ? "admin" : "user",
  }))

  const hubGrant = apps.find((a) => a.id === HUB_APP_ID)
  const hubRole  = hubGrant?.role ?? appUser.Role ?? "user"
  const permissions = await getPerms(appUser.Id, HUB_APP_ID, hubRole)

  const fullName = appUser.FullName || appUser.Username

  return {
    user: {
      id:          appUser.Id,
      authUserId:  user.id,
      username:    appUser.Username,
      email:       user.email,
      fullName,
      name:        fullName,
      role:        hubRole,
      permissions,
      apps,
    },
  }
}
