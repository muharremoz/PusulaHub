/**
 * Eski `@/auth` importları için compat shim.
 * Gerçek auth artık PusulaSwitch gateway üzerinden yürüyor;
 * `auth()` pusula_session cookie'sini doğrular (bkz. lib/pusula-session.ts).
 *
 * `handlers`, `signIn`, `signOut` eski NextAuth exportları — call-site
 * kullanımları temizlenene kadar 404/deprecated olarak duruyor.
 */
export { auth } from "@/lib/pusula-session"

const notFound = () => new Response(null, { status: 404 })

export const handlers = { GET: notFound, POST: notFound }

export async function signIn(): Promise<never> {
  throw new Error("signIn deprecated — use PusulaSwitch /login")
}

export async function signOut(): Promise<never> {
  throw new Error("signOut deprecated — POST /api/auth/logout (gateway)")
}
