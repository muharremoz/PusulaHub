import { NextRequest, NextResponse } from "next/server"
import { withSqlConnection } from "@/lib/sql-external"
import { resolveFirmaSqlTarget } from "@/lib/sql-company-target"

/**
 * POST /api/companies/[firkod]/sql/backup
 * Body: { server: string, dbName: string, backupDir?: string }
 *
 * Verilen DB'yi SQL sunucusunun default backup dizinine (veya backupDir verilmişse
 * ona) `{dbName}_{yyyyMMdd_HHmmss}.bak` olarak BACKUP DATABASE komutu ile yedekler.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const body = await req.json() as { server?: string; dbName?: string; backupDir?: string }
    if (!body.dbName) return NextResponse.json({ error: "dbName zorunlu" }, { status: 400 })

    const target = await resolveFirmaSqlTarget(firkod, body.server)
    if (!target) return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })

    const stamp  = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15) // yyyyMMdd_HHmmss
    const dbSafe = body.dbName.replace(/[^a-zA-Z0-9_\-.]/g, "_")
    const fileName = `${dbSafe}_${stamp}.bak`

    const result = await withSqlConnection(
      { server: target.ip, user: target.username, password: target.password, database: "master", requestTimeout: 300000 },
      async (pool) => {
        // Default backup dir
        let backupDir = (body.backupDir ?? "").trim()
        if (!backupDir) {
          const r = await pool.request().query<{ Path: string | null }>(`
            SELECT CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS NVARCHAR(512)) AS Path
          `)
          backupDir = (r.recordset[0]?.Path ?? "").replace(/\\+$/g, "")
          if (!backupDir) backupDir = "C:\\Backup"
        }
        const fullPath = `${backupDir}\\${fileName}`

        // Identifier'ı inline escape et
        const ident = body.dbName!.replace(/]/g, "]]")
        await pool.request()
          .input("disk", fullPath)
          .query(`BACKUP DATABASE [${ident}] TO DISK = @disk WITH INIT, COMPRESSION, STATS = 10`)

        return { fullPath }
      },
    )

    return NextResponse.json({ ok: true, path: result.fullPath })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[POST /sql/backup]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
