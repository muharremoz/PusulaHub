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

interface SqlSrv {
  id: string; name: string; ip: string
  sql_username: string | null; sql_password: string | null
  agent_port: number | null; api_key: string | null
}
/** SQL-rollü sunucuyu id ile getir (SQL + agent creds). Rol yoksa null. */
export async function sqlServerById(id: string): Promise<SqlSrv | null> {
  const sb = await getSupabaseServer()
  const { data: role } = await sb.schema("hub").from("server_roles").select("role").eq("server_id", id).eq("role", "SQL").maybeSingle()
  if (!role) return null
  const { data } = await sb.schema("hub").from("servers")
    .select("id, name, ip, sql_username, sql_password, agent_port, api_key").eq("id", id).maybeSingle()
  return (data as unknown as SqlSrv) ?? null
}

/** Sunucunun agent bağlantı bilgileri (rol kontrolü yok). */
export async function serverAgentById(id: string): Promise<{ ip: string; agent_port: number | null; api_key: string | null } | null> {
  const sb = await getSupabaseServer()
  const { data } = await sb.schema("hub").from("servers").select("ip, agent_port, api_key").eq("id", id).maybeSingle()
  return (data as unknown as { ip: string; agent_port: number | null; api_key: string | null }) ?? null
}

/** Belirli role sahip sunucular (eski `JOIN ServerRoles WHERE Role=X` deseni). */
export async function serversWithRole(role: string, cols: string): Promise<Record<string, unknown>[]> {
  const sb = await getSupabaseServer()
  const { data: roleRows } = await sb.schema("hub").from("server_roles").select("server_id").eq("role", role)
  const ids = [...new Set(((roleRows ?? []) as { server_id: string }[]).map((r) => r.server_id))]
  if (!ids.length) return []
  const { data } = await sb.schema("hub").from("servers").select(cols).in("id", ids).order("name")
  return (data ?? []) as unknown as Record<string, unknown>[]
}
