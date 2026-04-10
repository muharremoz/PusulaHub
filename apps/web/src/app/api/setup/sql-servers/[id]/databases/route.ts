import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { decrypt } from "@/lib/crypto"
import { withSqlConnection } from "@/lib/sql-external"

/**
 * GET /api/setup/sql-servers/:id/databases
 *
 * Bir SQL sunucusunu (Servers tablosundan Id ile bulur) seçip ona bağlanır
 * ve `sys.databases` üzerinden kullanıcı veritabanlarının listesini döndürür.
 * Sistem veritabanları (master, tempdb, model, msdb) hariç tutulur.
 */

interface ServerRow {
  Id:          string
  Name:        string
  IP:          string
  SqlUsername: string | null
  SqlPassword: string | null
}

interface DbRow {
  Name:       string
  StateDesc:  string
  SizeMB:     number
  CreateDate: Date
}

export interface SqlDatabaseItem {
  name:       string
  state:      string
  sizeMB:     number
  createDate: string
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

    const rows = await query<ServerRow[]>`
      SELECT s.Id, s.Name, s.IP, s.SqlUsername, s.SqlPassword
      FROM Servers s
      INNER JOIN ServerRoles r ON r.ServerId = s.Id
      WHERE s.Id = ${id} AND r.Role = 'SQL'
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })
    }

    const server = rows[0]

    if (!server.SqlUsername || !server.SqlPassword) {
      return NextResponse.json(
        { error: "Bu SQL sunucusu için SA kullanıcı adı/şifresi tanımlanmamış. Sunucu ayarlarından ekleyin." },
        { status: 400 },
      )
    }

    // DB'de şifreli olarak saklanır — bağlantıdan önce decrypt
    const decryptedPassword = decrypt(server.SqlPassword)
    if (!decryptedPassword) {
      return NextResponse.json(
        { error: "SA şifresi çözülemedi. ENCRYPTION_KEY'i kontrol edin veya şifreyi sunucu ayarlarından yeniden girin." },
        { status: 500 },
      )
    }

    const result = await withSqlConnection(
      {
        server:   server.IP,
        port:     1433,
        user:     server.SqlUsername,
        password: decryptedPassword,
      },
      async (pool) => {
        const res = await pool.request().query<DbRow>(`
          SELECT
            d.name       AS Name,
            d.state_desc AS StateDesc,
            CAST(ISNULL(SUM(CAST(mf.size AS BIGINT)) * 8 / 1024, 0) AS INT) AS SizeMB,
            d.create_date AS CreateDate
          FROM sys.databases d
          LEFT JOIN sys.master_files mf ON mf.database_id = d.database_id
          WHERE d.database_id > 4
          GROUP BY d.name, d.state_desc, d.create_date
          ORDER BY d.name
        `)
        return res.recordset
      },
    )

    const databases: SqlDatabaseItem[] = result.map((r) => ({
      name:       r.Name,
      state:      r.StateDesc,
      sizeMB:     r.SizeMB,
      createDate: r.CreateDate instanceof Date ? r.CreateDate.toISOString() : String(r.CreateDate),
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
