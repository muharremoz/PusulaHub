import { NextRequest, NextResponse } from "next/server"
import { withSqlConnection } from "@/lib/sql-external"
import { resolveFirmaSqlTarget } from "@/lib/sql-company-target"
import { restoreBackupOnServer } from "@/lib/sql-restore"

/**
 * POST /api/companies/[firkod]/sql/restore
 * Body: { server: string, dbName: string, backupPath: string }
 *
 * Verilen .bak dosyasını dbName hedefine REPLACE ile geri yükler.
 * Mevcut DB üzerine yazar.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const body = await req.json() as { server?: string; dbName?: string; backupPath?: string }
    if (!body.dbName || !body.backupPath) {
      return NextResponse.json({ error: "dbName ve backupPath zorunlu" }, { status: 400 })
    }

    const target = await resolveFirmaSqlTarget(firkod, body.server)
    if (!target) return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })

    await withSqlConnection(
      { server: target.ip, user: target.username, password: target.password, database: "master", requestTimeout: 600000 },
      async (pool) => {
        await restoreBackupOnServer(pool, body.backupPath!, body.dbName!)
      },
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[POST /sql/restore]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
