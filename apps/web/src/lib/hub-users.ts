import "server-only"
import { getSupabaseServer } from "@/lib/supabase/server"

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
