/**
 * Node runtime için pusula_session wrapper'ı.
 * DB-bağlantılı `auth()` bu dosyadadır; Edge sadece pusula-session-edge kullansın.
 */
import { cookies } from "next/headers"
import { cache }   from "react"
import {
  verifyEdge, COOKIE_NAME, roleForApp,
  type PusulaPayload, type AppGrant,
} from "@/lib/pusula-session-edge"
import { getUserPermissions, HUB_APP_ID, type PermissionMap } from "@/lib/permissions"

export { COOKIE_NAME, verifyEdge }
export type { PusulaPayload, AppGrant }

export interface HubSession {
  user: {
    id:          string
    username:    string
    email:       string | undefined
    fullName:    string
    name:        string
    /** Hub-özel rol (UserApps.Role @ hub). Global role fallback. */
    role:        string
    /** Hub modül izinleri */
    permissions: PermissionMap
    /** Kullanıcının erişebileceği app'ler + her biri için rol */
    apps:        AppGrant[]
  }
}

// Aynı request içinde DB'ye tekrar gidilmesin
const getPerms = cache((id: string, appId: string, role: string) =>
  getUserPermissions(id, appId, role),
)

/** NextAuth `auth()` drop-in replacement */
export async function auth(): Promise<HubSession | null> {
  const store = await cookies()
  const tok   = store.get(COOKIE_NAME)?.value
  const p     = await verifyEdge(tok)
  if (!p) return null

  // Hub'a erişimi yoksa session null döndürme — ama role='none' olarak işaretle.
  // Middleware zaten /apps/hub kapısını tutuyor; burada sadece rol+izin hesabı.
  const hubRole = roleForApp(p, HUB_APP_ID) ?? p.role
  const permissions = await getPerms(p.sub, HUB_APP_ID, hubRole)

  return {
    user: {
      id:          p.sub,
      username:    p.username,
      email:       p.email ?? undefined,
      fullName:    p.fullName,
      name:        p.fullName,
      role:        hubRole,
      permissions,
      apps:        p.apps,
    },
  }
}
