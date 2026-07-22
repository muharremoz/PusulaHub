import { getSupabaseServer } from "@/lib/supabase/server"
import { decrypt } from "@/lib/crypto"

export interface SqlCompanyTarget {
  serverId:   string
  serverName: string
  ip:         string
  username:   string
  password:   string
}

interface SrvRow { id: string; name: string; ip: string; sql_username: string | null; sql_password: string | null }

/**
 * Firma'nın SQL sunucusu credentials'ını resolve eder (hub).
 * Öncelik: serverName eşleşmesi → yoksa companies.sql_server_id → servers.
 */
export async function resolveFirmaSqlTarget(firkod: string, serverName?: string): Promise<SqlCompanyTarget | null> {
  const sb = await getSupabaseServer()
  const cols = "id, name, ip, sql_username, sql_password"

  let row: SrvRow | null = null
  if (serverName) {
    const { data } = await sb.schema("hub").from("servers").select(cols).eq("name", serverName).limit(1).maybeSingle()
    row = (data as SrvRow | null) ?? null
  }
  if (!row) {
    const { data: c } = await sb.schema("hub").from("companies").select("sql_server_id").eq("company_id", firkod).maybeSingle()
    const sqlServerId = (c as { sql_server_id: string | null } | null)?.sql_server_id
    if (sqlServerId) {
      const { data } = await sb.schema("hub").from("servers").select(cols).eq("id", sqlServerId).maybeSingle()
      row = (data as SrvRow | null) ?? null
    }
  }

  if (!row || !row.sql_username || !row.sql_password) return null
  return {
    serverId: row.id, serverName: row.name, ip: row.ip,
    username: row.sql_username, password: decrypt(row.sql_password) ?? "",
  }
}
