import { query } from "@/lib/db"
import { decrypt } from "@/lib/crypto"

export interface SqlCompanyTarget {
  serverId:   string
  serverName: string
  ip:         string
  username:   string
  password:   string
}

/**
 * Firma'nın SQL sunucusu credentials'ını resolve eder.
 * Öncelik: Companies.SqlServerId → yoksa SQLDatabases.Server üzerinden eşleşme.
 */
export async function resolveFirmaSqlTarget(
  firkod: string,
  serverName?: string,
): Promise<SqlCompanyTarget | null> {
  interface Row {
    Id: string; Name: string; IP: string; SqlUsername: string | null; SqlPassword: string | null
  }

  let rows: Row[] = []

  if (serverName) {
    rows = await query<Row[]>`
      SELECT Id, Name, IP, SqlUsername, SqlPassword FROM Servers WHERE Name = ${serverName}
    `
  }

  if (!rows.length) {
    const c = await query<{ SqlServerId: string | null }[]>`
      SELECT SqlServerId FROM Companies WHERE CompanyId = ${firkod}
    `
    if (c[0]?.SqlServerId) {
      rows = await query<Row[]>`
        SELECT Id, Name, IP, SqlUsername, SqlPassword FROM Servers WHERE Id = ${c[0].SqlServerId}
      `
    }
  }

  if (!rows.length || !rows[0].SqlUsername || !rows[0].SqlPassword) return null

  const r = rows[0]
  return {
    serverId:   r.Id,
    serverName: r.Name,
    ip:         r.IP,
    username:   r.SqlUsername!,
    password:   decrypt(r.SqlPassword!) ?? "",
  }
}
