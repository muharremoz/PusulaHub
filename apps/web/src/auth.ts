/**
 * Eski `@/auth` importları için compat shim.
 * Gerçek auth artık Supabase Auth (birleşik platform); `auth()` Supabase session'ı
 * doğrulayıp AppUsers köprüsüyle Hub kimliğini çözer (bkz. lib/pusula-session.ts).
 *
 * `handlers`, `signIn`, `signOut` eski NextAuth exportları — call-site kullanımları
 * temizlenene kadar deprecated olarak duruyor (aktif çağıran yok).
 */
export { auth } from "@/lib/pusula-session"

const notFound = () => new Response(null, { status: 404 })

export const handlers = { GET: notFound, POST: notFound }

export async function signIn(): Promise<never> {
  throw new Error("signIn deprecated — Switch /login (Supabase Auth)")
}

export async function signOut(): Promise<never> {
  throw new Error("signOut deprecated — POST /api/auth/logout")
}
