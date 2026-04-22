/**
 * Edge-safe pusula_session doğrulayıcı.
 *
 * Sadece jose kullanır — mssql/bcrypt gibi node-only paketler buradan
 * çıkmaz, middleware.ts bu dosyayı import eder.
 */
import { jwtVerify } from "jose"

export const COOKIE_NAME = "pusula_session"

export type Level = "read" | "write"

export interface AppGrant {
  id:   string
  role: "admin" | "user"
  /** Module-level perms — admin'de undefined, non-admin'de anahtar yoksa "none". */
  perms?: Record<string, Level>
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
function normalizePerms(raw: unknown): Record<string, Level> | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const out: Record<string, Level> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === "read" || v === "write") out[k] = v
  }
  return out
}

function normalizeApps(raw: unknown, fallbackRole: string): AppGrant[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => {
    if (typeof x === "string") {
      return { id: x, role: (fallbackRole as AppGrant["role"]) }
    }
    if (x && typeof x === "object" && "id" in x) {
      const o = x as { id: string; role?: string; perms?: unknown }
      const r = (o.role ?? fallbackRole) as AppGrant["role"]
      return { id: String(o.id), role: r, perms: normalizePerms(o.perms) }
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
