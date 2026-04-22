/**
 * Node runtime için pusula_session wrapper'ı.
 * DB-bağlantılı `auth()` bu dosyadadır; Edge sadece pusula-session-edge kullansın.
 */
import { cookies } from "next/headers"
import { cache }   from "react"
import { verifyEdge, COOKIE_NAME, type PusulaPayload } from "@/lib/pusula-session-edge"
import { getUserPermissions, type PermissionMap }      from "@/lib/permissions"

export { COOKIE_NAME, verifyEdge }
export type { PusulaPayload }

export interface HubSession {
  user: {
    id:          string
    username:    string
    email:       string | undefined
    fullName:    string
    name:        string
    role:        string
    permissions: PermissionMap
    apps:        string[]
  }
}

// Aynı request içinde DB'ye tekrar gidilmesin
const getPerms = cache((id: string, role: string) => getUserPermissions(id, role))

/** NextAuth `auth()` drop-in replacement */
export async function auth(): Promise<HubSession | null> {
  const store = await cookies()
  const tok   = store.get(COOKIE_NAME)?.value
  const p     = await verifyEdge(tok)
  if (!p) return null

  const permissions = await getPerms(p.sub, p.role)
  return {
    user: {
      id:          p.sub,
      username:    p.username,
      email:       p.email ?? undefined,
      fullName:    p.fullName,
      name:        p.fullName,
      role:        p.role,
      permissions,
      apps:        p.apps ?? [],
    },
  }
}
