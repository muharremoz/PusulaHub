import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { decrypt } from "@/lib/crypto"
import { requirePermission } from "@/lib/require-permission"
import { withSqlConnection } from "@/lib/sql-external"

/**
 * POST /api/vault/[id]/backup
 * Body: { dbName: string, backupDir?: string }
 *
 * Vault entry'sindeki Host + Username + Password ile SQL Server'a bağlanıp
 * verilen DB'yi `{dbName}_{yyyyMMdd_HHmmss}.bak` formatında yedekler.
 *
 * Hedef dizin opsiyonel; verilmezse sunucunun InstanceDefaultBackupPath'i
 * kullanılır, o da yoksa `C:\Backup` fallback'i.
 *
 * Yetki: vault.write (yedek alma yazma niteliğinde bir aksiyon)
 *
 * Response: { ok: true, path: string }  veya  { error: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("vault", "write")
  if (gate) return gate
  const { id } = await params

  try {
    const body = await req.json() as { dbName?: string; backupDir?: string }
    if (!body.dbName) {
      return NextResponse.json({ error: "dbName zorunlu" }, { status: 400 })
    }

    interface Row { Host: string | null; Username: string; Password: string }
    const rows = await query<Row[]>`
      SELECT Host, Username, Password FROM VaultEntries WHERE Id = ${id}
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: "Giriş bulunamadı" }, { status: 404 })
    }
    const { Host, Username, Password } = rows[0]
    if (!Host) {
      return NextResponse.json({ error: "Host/IP boş" }, { status: 400 })
    }
    const password = decrypt(Password)
    if (!password) {
      return NextResponse.json({ error: "Şifre çözülemedi" }, { status: 500 })
    }

    const stamp    = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15) // yyyyMMdd_HHmmss
    const dbSafe   = body.dbName.replace(/[^a-zA-Z0-9_\-.]/g, "_")
    const fileName = `${dbSafe}_${stamp}.bak`

    const result = await withSqlConnection(
      { server: Host, user: Username, password, database: "master", requestTimeout: 300000 },
      async (pool) => {
        let backupDir = (body.backupDir ?? "").trim()
        if (!backupDir) {
          const r = await pool.request().query<{ Path: string | null }>(`
            SELECT CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS NVARCHAR(512)) AS Path
          `)
          backupDir = (r.recordset[0]?.Path ?? "").replace(/\\+$/g, "")
          if (!backupDir) backupDir = "C:\\Backup"
        }
        const fullPath = `${backupDir}\\${fileName}`

        // ] karakterini identifier escape'i
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
    console.error("[POST /api/vault/[id]/backup]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
