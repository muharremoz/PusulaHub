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
          -- READ UNCOMMITTED: msdb.backupset yedekleme sirasinda surekli
          -- yaziliyor; kilitli okumak iki yonde de zararli -- sorgu kilit
          -- bekler, ve calisan BACKUP/RESTORE'u biz bloke edebiliriz.
          -- (Poller'da ayni satirin yorumu: restore %100'de takiliyordu.)
          -- Olculen sure: bos sunucuda ~1 sn; yedekleme penceresinde ayni
          -- sorgu 60 sn'yi asabiliyor, bu yuzden UI'da 30 sn zaman asimi var.
          SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

          -- Yedek tarihleri msdb.backupset'ten TEK GECISTE gruplanarak alinir.
          -- Veritabani basina korelasyonlu alt sorgu YAZILMAZ: backupset
          -- uzerindeki indeks yalniz (database_name) oldugu icin o desen her
          -- DB icin tabloyu bastan tarar (olculdu: 79 DB'de 94M okuma, 65 sn).
          WITH boyut AS (
            SELECT database_id, SUM(CAST(size AS BIGINT)) * 8 / 1024 AS SizeMB
            FROM sys.master_files GROUP BY database_id
          ),
          bk AS (
            SELECT database_name, type, backup_finish_date,
                   ROW_NUMBER() OVER (PARTITION BY database_name, type
                                      ORDER BY backup_finish_date DESC) AS rn
            FROM msdb.dbo.backupset WHERE type IN ('D','I')
          ),
          yedek AS (
            SELECT database_name,
                   MAX(CASE WHEN type='D' THEN backup_finish_date END) AS LastBackup,
                   MAX(CASE WHEN type='I' THEN backup_finish_date END) AS LastDiffBackup
            FROM bk WHERE rn = 1 GROUP BY database_name
          )
          SELECT
            d.name        AS Name,
            d.state_desc  AS StateDesc,
            CAST(ISNULL(b.SizeMB, 0) AS INT) AS SizeMB,
            d.create_date AS CreateDate,
            y.LastBackup     AS LastBackup,
            y.LastDiffBackup AS LastDiffBackup
          FROM sys.databases d
          LEFT JOIN boyut b ON b.database_id   = d.database_id
          LEFT JOIN yedek y ON y.database_name = d.name
          WHERE d.database_id > 4
          ORDER BY d.name
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
