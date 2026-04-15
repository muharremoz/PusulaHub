import { NextRequest, NextResponse } from "next/server"
import { withSqlConnection } from "@/lib/sql-external"
import { resolveFirmaSqlTarget } from "@/lib/sql-company-target"

/**
 * POST /api/companies/[firkod]/sql/query
 * Body: { server: string, dbName: string, sql: string }
 *
 * Verilen DB üzerinde yalnızca SELECT sorgusu çalıştırır. 60s timeout.
 * Diğer tüm komutlar (INSERT/UPDATE/DELETE/DDL/EXEC vb.) reddedilir.
 */
const FORBIDDEN_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|EXEC|EXECUTE|GRANT|REVOKE|DENY|BACKUP|RESTORE|SHUTDOWN|USE|BULK|OPENROWSET|OPENQUERY|xp_\w+|sp_\w+)\b/i,
]

function isSelectOnly(raw: string): boolean {
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim()
  if (!stripped) return false
  const body = stripped.replace(/;+\s*$/g, "")
  if (/;/.test(body)) return false
  return /^\s*(SELECT|WITH)\b/i.test(body)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const body = await req.json() as { server?: string; dbName?: string; sql?: string }
    if (!body.dbName || !body.sql?.trim()) {
      return NextResponse.json({ error: "dbName ve sql zorunlu" }, { status: 400 })
    }

    if (!isSelectOnly(body.sql)) {
      return NextResponse.json({ error: "Yalnızca SELECT sorgularına izin verilir." }, { status: 403 })
    }
    for (const p of FORBIDDEN_PATTERNS) {
      if (p.test(body.sql)) {
        return NextResponse.json({ error: "Bu komut izin verilmiyor (salt-okunur mod)." }, { status: 403 })
      }
    }

    const target = await resolveFirmaSqlTarget(firkod, body.server)
    if (!target) return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })

    const t0 = Date.now()
    const result = await withSqlConnection(
      { server: target.ip, user: target.username, password: target.password, database: body.dbName, requestTimeout: 60000 },
      async (pool) => {
        return await pool.request().query(body.sql!)
      },
    )
    const ms = Date.now() - t0

    return NextResponse.json({
      ok:           true,
      durationMs:   ms,
      rowsAffected: result.rowsAffected,
      recordset:    result.recordset ?? [],
      recordsets:   result.recordsets?.length ?? 0,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[POST /sql/query]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
