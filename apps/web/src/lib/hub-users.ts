import "server-only"
import { getSupabaseServer } from "@/lib/supabase/server"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * assigned_to / author gibi auth.users FK alanları için değer temizleyici.
 * Geçiş döneminde client isim string'i gönderebilir → uuid değilse null
 * (geçersiz uuid insert hatasını önler; atama Faz 4'te uuid picker'a bağlanana kadar).
 */
export function asUuidOrNull(v: unknown): string | null {
  return typeof v === "string" && UUID_RE.test(v) ? v : null
}

/**
 * created_by uuid'lerini `public.users` adlarına çöz.
 * Hub domain tablolarının çoğu eskiden `CreatedBy` isim string'i tutuyordu;
 * birleşik modelde uuid → ad çevrimi burada (UI isim beklemeye devam ediyor).
 */
export async function resolveCreators(
  sb: Awaited<ReturnType<typeof getSupabaseServer>>,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))]
  const map = new Map<string, string>()
  if (!uniq.length) return map
  const { data } = await sb.from("users").select("id, name").in("id", uniq)
  for (const u of (data ?? []) as { id: string; name: string | null }[]) {
    map.set(u.id, u.name ?? "—")
  }
  return map
}
