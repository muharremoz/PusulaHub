import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { withSqlConnection } from "@/lib/sql-external"
import { decrypt } from "@/lib/crypto"
import { pollSingleAgent } from "@/lib/agent-poller"
import { requirePermission } from "@/lib/require-permission"

interface GuvenlikRow { srkadi: string; DataYolu: string; PrgTur: string }

interface DbRow {
  id: string; name: string; server: string; size_mb: number; status: string; firma_no: string | null
  last_backup: string | null; last_diff_backup: string | null; last_backup_start: string | null; last_diff_backup_start: string | null
  tables: number; recovery_model: string | null; owner: string | null; data_file_path: string | null; log_file_path: string | null
}

const fmtTs = (t: string | null) => (t ? t.slice(0, 19).replace("T", " ") : null)

export async function GET(req: NextRequest, { params }: { params: Promise<{ firkod: string }> }) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { firkod } = await params
  try {
    const refresh = req.nextUrl.searchParams.get("refresh") === "1"
    const sb = await getSupabaseServer()

    const { data: company } = await sb.schema("hub").from("companies").select("sql_server_id").eq("company_id", firkod).maybeSingle()
    if (!company) return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 })
    const sqlServerId = (company as { sql_server_id: string | null }).sql_server_id

    if (refresh && sqlServerId) { try { await pollSingleAgent(sqlServerId, true) } catch {} }

    const dbFilter: { names: string[]; prgMap: Map<string, string> } = { names: [], prgMap: new Map() }

    // Firma'nın SQL sunucusundan guvenlik tablosu (harici SQL — DEĞİŞMEZ)
    if (sqlServerId) {
      const { data: srv } = await sb.schema("hub").from("servers").select("ip, sql_username, sql_password").eq("id", sqlServerId).maybeSingle()
      const s = srv as { ip: string; sql_username: string | null; sql_password: string | null } | null
      if (s?.sql_username && s?.sql_password) {
        try {
          const password = decrypt(s.sql_password) ?? ""
          const firmaIdInt = Number.parseInt(firkod, 10)
          const gRows = await withSqlConnection<GuvenlikRow[]>(
            { server: s.ip, port: 1433, user: s.sql_username, password, database: "sirket", requestTimeout: 8000 },
            async (pool) => {
              const result = await pool.request().input("firmaId", firmaIdInt)
                .query<GuvenlikRow>("SELECT srkadi, DataYolu, PrgTur FROM guvenlik WHERE PusulaFirmaId = @firmaId")
              return result.recordset as GuvenlikRow[]
            },
          )
          for (const g of gRows) {
            const dbName = (g.DataYolu || g.srkadi || "").trim()
            if (!dbName) continue
            dbFilter.names.push(dbName)
            dbFilter.prgMap.set(dbName.toLowerCase(), g.PrgTur?.trim() ?? "")
          }
        } catch (err) {
          console.log("[sql route] guvenlik sorgusu başarısız:", err instanceof Error ? err.message : err)
        }
      }
    }

    // hub.sql_databases: guvenlik adları OR firma_no eşleşmesi (69 satır → JS filtre)
    const [{ data: allDbs }, { data: servers }] = await Promise.all([
      sb.schema("hub").from("sql_databases")
        .select("id, name, server, size_mb, status, firma_no, last_backup, last_diff_backup, last_backup_start, last_diff_backup_start, tables, recovery_model, owner, data_file_path, log_file_path"),
      sb.schema("hub").from("servers").select("name, ip"),
    ])
    const ipByName = new Map(((servers ?? []) as { name: string; ip: string }[]).map((s) => [s.name, s.ip]))
    const nameSet = new Set(dbFilter.names.map((n) => n.toLowerCase()))
    const dbs = ((allDbs ?? []) as DbRow[])
      .filter((d) => (nameSet.size && nameSet.has(d.name.toLowerCase())) || d.firma_no === firkod)
      .sort((a, b) => (a.server + a.name).localeCompare(b.server + b.name))

    const enriched = dbs.map((d) => ({
      Id: d.id, Name: d.name, Server: d.server, ServerIP: ipByName.get(d.server) ?? null,
      SizeMB: d.size_mb, Status: d.status,
      LastBackup: fmtTs(d.last_backup), LastDiffBackup: fmtTs(d.last_diff_backup),
      LastBackupStart: fmtTs(d.last_backup_start), LastDiffBackupStart: fmtTs(d.last_diff_backup_start),
      Tables: d.tables, RecoveryModel: d.recovery_model, Owner: d.owner,
      DataFilePath: d.data_file_path, LogFilePath: d.log_file_path,
      ProgramCode: dbFilter.prgMap.get(d.name.toLowerCase()) ?? null,
    }))

    return NextResponse.json(enriched)
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/sql]", err)
    return NextResponse.json({ error: "SQL verisi alınamadı" }, { status: 500 })
  }
}
