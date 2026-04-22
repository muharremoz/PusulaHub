/**
 * Edge-safe pusula_session doğrulayıcı.
 *
 * Sadece jose kullanır — mssql/bcrypt gibi node-only paketler buradan
 * çıkmaz, middleware.ts bu dosyayı import eder.
 */
import { jwtVerify } from "jose"

export const COOKIE_NAME = "pusula_session"

export interface AppGrant {
  id:   string
  role: "admin" | "user" | "viewer"
}

export interface PusulaPayload {
  sub:      string
  username: string
  email:    string | null
  fullName: string
  /** Global rol — geriye dönük uyum. App-özel rol için `apps[].role` kullan. */
  role:     string
  apps:     AppGrant[]
  exp?:     number
  iat?:     number
}

function getSecret(): Uint8Array {
  const s = process.env.PUSULA_SESSION_SECRET
  if (!s) throw new Error("PUSULA_SESSION_SECRET tanımlı değil")
  return new TextEncoder().encode(s)
}

/** Eski string[] formatından yeni AppGrant[]'e esnek parse. */
function normalizeApps(raw: unknown, fallbackRole: string): AppGrant[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => {
    if (typeof x === "string") {
      return { id: x, role: (fallbackRole as AppGrant["role"]) }
    }
    if (x && typeof x === "object" && "id" in x) {
      const o = x as { id: string; role?: string }
      const r = (o.role ?? fallbackRole) as AppGrant["role"]
      return { id: String(o.id), role: r }
    }
    return null
  }).filter((a): a is AppGrant => a !== null)
}

export async function verifyEdge(token: string | undefined): Promise<PusulaPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const p = payload as Record<string, unknown>
    return {
      sub:      String(p.sub),
      username: String(p.username),
      email:    (p.email as string | null) ?? null,
      fullName: String(p.fullName),
      role:     String(p.role),
      apps:     normalizeApps(p.apps, String(p.role)),
      exp:      p.exp as number | undefined,
      iat:      p.iat as number | undefined,
    }
  } catch {
    return null
  }
}

/** Belirli bir app için kullanıcının rolünü döner, yoksa null. */
export function roleForApp(payload: PusulaPayload, appId: string): AppGrant["role"] | null {
  return payload.apps.find((a) => a.id === appId)?.role ?? null
}
