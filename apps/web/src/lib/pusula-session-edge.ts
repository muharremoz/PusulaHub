/**
 * Edge-safe pusula_session doğrulayıcı.
 *
 * Sadece jose kullanır — mssql/bcrypt gibi node-only paketler buradan
 * çıkmaz, middleware.ts bu dosyayı import eder.
 */
import { jwtVerify } from "jose"

export const COOKIE_NAME = "pusula_session"

export interface PusulaPayload {
  sub:      string
  username: string
  email:    string | null
  fullName: string
  role:     string
  apps:     string[]
  exp?:     number
  iat?:     number
}

function getSecret(): Uint8Array {
  const s = process.env.PUSULA_SESSION_SECRET
  if (!s) throw new Error("PUSULA_SESSION_SECRET tanımlı değil")
  return new TextEncoder().encode(s)
}

export async function verifyEdge(token: string | undefined): Promise<PusulaPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as PusulaPayload
  } catch {
    return null
  }
}
