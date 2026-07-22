import "server-only"
import { getSupabaseServer } from "@/lib/supabase/server"

/**
 * Bir sunucuyu id VEYA (case-insensitive) name ile bul — hub.servers.
 * Eski `WHERE Id=@id OR LOWER(Name)=@lower` deseninin karşılığı.
 * cols: supabase-js select string'i.
 */
export async function findServerBy(idOrName: string, cols: string): Promise<Record<string, unknown> | null> {
  const sb = await getSupabaseServer()
  const { data: byId } = await sb.schema("hub").from("servers").select(cols).eq("id", idOrName).maybeSingle()
  if (byId) return byId as unknown as Record<string, unknown>
  const { data: byName } = await sb.schema("hub").from("servers").select(cols).ilike("name", idOrName).limit(1).maybeSingle()
  return (byName as unknown as Record<string, unknown>) ?? null
}
