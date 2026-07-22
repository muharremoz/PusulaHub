import "server-only"
import { getSupabaseServer } from "@/lib/supabase/server"

/**
 * hub.companies.id → firma adı çözümü (Projects.company_id gibi soft-ref'ler için).
 * Companies artık hub'da (Faz 4). Tüm company_id'ler şu an NULL → çoğunlukla no-op.
 */
export async function resolveCompanyNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))]
  const map = new Map<string, string>()
  if (!uniq.length) return map
  const sb = await getSupabaseServer()
  const { data } = await sb.schema("hub").from("companies").select("id, name").in("id", uniq)
  for (const r of (data ?? []) as { id: string; name: string }[]) map.set(r.id, r.name)
  return map
}
