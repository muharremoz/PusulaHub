import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { decrypt } from "@/lib/crypto"
import { withSqlConnection } from "@/lib/sql-external"
import { requirePermission } from "@/lib/require-permission"

/**
 * POST /api/sql/execute
 *
 * Seçili SQL sunucusuna bağlanır ve gelen sorguyu çalıştırır.
 * Sonuçlar string[][] (max 1000 satır) olarak döner.
 *
 * Body: { serverId: string; database: string; sql: string }
 */

interface ServerRow {
  Id:          string
  Name:        string
  IP:          string
  SqlUsername: string | null
  SqlPassword: string | null
}

export interface ExecuteResponse {
  columns:     string[]
  rows:        string[][]
  rowCount:    number
  executionMs: number
  truncated:   boolean   // true → 1000 satır limiti aşıldı
}

const ROW_LIMIT = 1000

export async function POST(req: NextRequest) {
  const gate = await requirePermission("sql", "write")
  if (gate) return gate
  try {
    const body = (await req.json()) as {
      serverId?: string
      database?: string
      sql?:      string
    }

    const serverId  = (body.serverId ?? "").trim()
    const database  = (body.database ?? "").trim()
    const sqlText   = (body.sql      ?? "").trim()

    if (!serverId) return NextResponse.json({ error: "serverId zorunlu" }, { status: 400 })
    if (!database) return NextResponse.json({ error: "database zorunlu" }, { status: 400 })
    if (!sqlText)  return NextResponse.json({ error: "sql zorunlu" },      { status: 400 })

    // Sunucuyu DB'den çek (SQL rolü kontrolü dahil)
    const srvRows = await query<ServerRow[]>`
      SELECT s.Id, s.Name, s.IP, s.SqlUsername, s.SqlPassword
      FROM Servers s
      INNER JOIN ServerRoles r ON r.ServerId = s.Id
      WHERE s.Id = ${serverId} AND r.Role = 'SQL'
    `
    if (!srvRows.length) {
      return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })
    }

    const server = srvRows[0]
    if (!server.SqlUsername || !server.SqlPassword) {
      return NextResponse.json(
        { error: "Bu sunucu için SA kimlik bilgisi tanımlı değil. Sunucu ayarlarından ekleyin." },
        { status: 400 },
      )
    }

    const decrypted = decrypt(server.SqlPassword)
    if (!decrypted) {
      return NextResponse.json(
        { error: "SA şifresi çözülemedi. ENCRYPTION_KEY'i kontrol edin." },
        { status: 500 },
      )
    }

    const startMs = Date.now()

    const recordset = await withSqlConnection(
      {
        server:          server.IP,
        port:            1433,
        user:            server.SqlUsername,
        password:        decrypted,
        database,
        requestTimeout:  30_000,  // 30 sn sorgu zaman aşımı
      },
      async (pool) => {
        const res = await pool.request().query(sqlText)
        return (res.recordset ?? []) as Record<string, unknown>[]
      },
    )

    const executionMs = Date.now() - startMs

    if (!recordset || recordset.length === 0) {
      return NextResponse.json({
        columns:     [],
        rows:        [],
        rowCount:    0,
        executionMs,
        truncated:   false,
      } satisfies ExecuteResponse)
    }

    const columns   = Object.keys(recordset[0])
    const truncated = recordset.length > ROW_LIMIT
    const limited   = truncated ? recordset.slice(0, ROW_LIMIT) : recordset

    const outRows = limited.map((row) =>
      columns.map((col) => {
        const val = row[col]
        if (val === null || val === undefined) return ""
        if (val instanceof Date) return val.toISOString()
        return String(val)
      }),
    )

    return NextResponse.json({
      columns,
      rows:     outRows,
      rowCount: recordset.length,
      executionMs,
      truncated,
    } satisfies ExecuteResponse)

  } catch (err) {
    console.error("[POST /api/sql/execute]", err)
    const msg = err instanceof Error ? err.message : "Sorgu çalıştırılamadı"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
