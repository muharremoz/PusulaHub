import { NextResponse } from "next/server"
import { sqlServerById } from "@/lib/hub-servers"
import { decrypt } from "@/lib/crypto"
import { withSqlConnection } from "@/lib/sql-external"

/**
 * GET /api/setup/sql-servers/:id/databases
 *
 * Bir SQL sunucusunu (Servers tablosundan Id ile bulur) seçip ona bağlanır
 * ve `sys.databases` üzerinden kullanıcı veritabanlarının listesini döndürür.
 * Sistem veritabanları (master, tempdb, model, msdb) hariç tutulur.
 */

interface DbRow {
  Name:           string
  StateDesc:      string
  SizeMB:         number
  CreateDate:     Date
  LastBackup:     Date | null
  LastDiffBackup: Date | null
}

export interface SqlDatabaseItem {
  name:           string
  state:          string
  sizeMB:         number
  createDate:     string
  /** Son tamamlanan FULL yedek (ISO) — hiç yoksa null. */
  lastBackup:     string | null
  /** Son tamamlanan DIFFERENTIAL yedek (ISO) — hiç yoksa null. */
  lastDiffBackup: string | null
}

export interface SqlDatabasesResponse {
  databases:   SqlDatabaseItem[]
  totalSizeGB: number
  dbCount:     number
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const server = await sqlServerById(id)
    if (!server) {
      return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })
    }
    if (!server.sql_username || !server.sql_password) {
      return NextResponse.json(
        { error: "Bu SQL sunucusu için SA kullanıcı adı/şifresi tanımlanmamış. Sunucu ayarlarından ekleyin." },
        { status: 400 },
      )
    }

    // DB'de şifreli olarak saklanır — bağlantıdan önce decrypt
    const decryptedPassword = decrypt(server.sql_password)
    if (!decryptedPassword) {
      return NextResponse.json(
        { error: "SA şifresi çözülemedi. ENCRYPTION_KEY'i kontrol edin veya şifreyi sunucu ayarlarından yeniden girin." },
        { status: 500 },
      )
    }

    const result = await withSqlConnection(
      {
        server:   server.ip,
        port:     1433,
        user:     server.sql_username,
        password: decryptedPassword,
        // Varsayilan 10 sn dar: yedekleme penceresinde msdb.backupset
        // yogun kullanildigi icin sorgu uzuyor ve liste bos donuyordu.
        requestTimeout: 30_000,
      },
      async (pool) => {
        const res = await pool.request().query<DbRow>(`
          SET NOCOUNT ON;

          -- READ UNCOMMITTED: msdb.backupset yedekleme sirasinda surekli
          -- yaziliyor; kilitli okumak iki yonde de zararli -- sorgu kilit
          -- bekler, ve calisan BACKUP/RESTORE'u biz bloke edebiliriz.
          SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

          -- Yedek tarihleri GECICI TABLOYA alinir; CTE olarak birakilmaz.
          -- Sebep olculdu: CTE'ler materyalize edilmez, satir ici gomulur ve
          -- optimizer bunu her veritabani icin yeniden calistirmayi secebiliyor
          -- (nested loops). O plana dustugunde 75 DB x ~21K sayfa = 1.6M
          -- mantiksal okuma / 60 saniye; kilit beklemesi YOK, saf is. Ayni
          -- sorgu bazen 1 saniyede bitiyordu -- yani plan kararsizligi, sabit
          -- bir yavaslik degil. Gecici tablo tek taramayi garantiler.
          CREATE TABLE #yedek (
            database_name  sysname PRIMARY KEY,
            LastBackup     datetime NULL,
            LastDiffBackup datetime NULL
          );

          INSERT INTO #yedek (database_name, LastBackup, LastDiffBackup)
          SELECT database_name,
                 MAX(CASE WHEN type = 'D' THEN backup_finish_date END),
                 MAX(CASE WHEN type = 'I' THEN backup_finish_date END)
          FROM (
            SELECT database_name, type, backup_finish_date,
                   ROW_NUMBER() OVER (PARTITION BY database_name, type
                                      ORDER BY backup_finish_date DESC) AS rn
            FROM msdb.dbo.backupset
            WHERE type IN ('D','I')
          ) x
          WHERE rn = 1
          GROUP BY database_name;

          SELECT
            d.name        AS Name,
            d.state_desc  AS StateDesc,
            CAST(ISNULL(b.SizeMB, 0) AS INT) AS SizeMB,
            d.create_date AS CreateDate,
            y.LastBackup     AS LastBackup,
            y.LastDiffBackup AS LastDiffBackup
          FROM sys.databases d
          LEFT JOIN (
            SELECT database_id, SUM(CAST(size AS BIGINT)) * 8 / 1024 AS SizeMB
            FROM sys.master_files GROUP BY database_id
          ) b ON b.database_id = d.database_id
          LEFT JOIN #yedek y ON y.database_name = d.name
          WHERE d.database_id > 4
          ORDER BY d.name;

          DROP TABLE #yedek;
        `)
        return res.recordset
      },
    )

    const iso = (v: unknown): string | null => {
      if (v === null || v === undefined) return null
      if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString()
      const d = new Date(String(v))
      return isNaN(d.getTime()) ? null : d.toISOString()
    }

    const databases: SqlDatabaseItem[] = result.map((r) => ({
      name:           r.Name,
      state:          r.StateDesc,
      sizeMB:         r.SizeMB,
      createDate:     r.CreateDate instanceof Date ? r.CreateDate.toISOString() : String(r.CreateDate),
      lastBackup:     iso(r.LastBackup),
      lastDiffBackup: iso(r.LastDiffBackup),
    }))

    const totalSizeMB = databases.reduce((sum, d) => sum + (d.sizeMB || 0), 0)
    const totalSizeGB = Math.round((totalSizeMB / 1024) * 10) / 10

    const body: SqlDatabasesResponse = {
      databases,
      totalSizeGB,
      dbCount: databases.length,
    }

    const resp = NextResponse.json(body)
    resp.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=60")
    return resp
  } catch (err) {
    console.error("[GET /api/setup/sql-servers/:id/databases]", err)
    const msg = err instanceof Error ? err.message : "SQL sunucusuna bağlanılamadı"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
