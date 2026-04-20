import { NextRequest, NextResponse } from "next/server"
import { query, getPool } from "@/lib/db"
import { withSqlConnection } from "@/lib/sql-external"
import { decrypt } from "@/lib/crypto"
import { pollSingleAgent } from "@/lib/agent-poller"

interface CompanyRow {
  CompanyId:   string
  SqlServerId: string | null
}

interface ServerRow {
  Id:          string
  Name:        string
  IP:          string
  SqlUsername: string | null
  SqlPassword: string | null
}

interface DbInfoRow {
  Id:            string
  Name:          string
  Server:        string
  ServerIP:      string | null
  SizeMB:        number
  Status:        string
  LastBackup:          string | null
  LastDiffBackup:      string | null
  LastBackupStart:     string | null
  LastDiffBackupStart: string | null
  Tables:        number
  RecoveryModel: string | null
  Owner:         string | null
  DataFilePath:  string | null
  LogFilePath:   string | null
}

interface GuvenlikRow {
  srkadi:   string
  DataYolu: string
  PrgTur:   string
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const refresh = req.nextUrl.searchParams.get("refresh") === "1"
    // 1) Firma'nın SQL sunucusu
    const companyRows = await query<CompanyRow[]>`
      SELECT CompanyId, SqlServerId FROM Companies WHERE CompanyId = ${firkod}
    `
    if (!companyRows.length) {
      return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 })
    }
    const company = companyRows[0]

    // ?refresh=1 → SQL sunucusunu force-poll et (heavy cache bypass)
    if (refresh && company.SqlServerId) {
      try { await pollSingleAgent(company.SqlServerId, true) } catch {}
    }

    // SqlServerId yoksa → sadece FirmaNo eşleşmesi ile topla
    let dbFilter: { names: string[]; prgMap: Map<string, string> } = { names: [], prgMap: new Map() }

    if (company.SqlServerId) {
      const srvRows = await query<ServerRow[]>`
        SELECT Id, Name, IP, SqlUsername, SqlPassword FROM Servers WHERE Id = ${company.SqlServerId}
      `
      if (srvRows.length && srvRows[0].SqlUsername && srvRows[0].SqlPassword) {
        const srv = srvRows[0]
        try {
          const password = decrypt(srv.SqlPassword!) ?? ""
          const firmaIdInt = Number.parseInt(firkod, 10)
          const gRows = await withSqlConnection<GuvenlikRow[]>(
            {
              server:   srv.IP,
              port:     1433,
              user:     srv.SqlUsername!,
              password,
              database: "sirket",
              requestTimeout: 8000,
            },
            async (pool) => {
              const result = await pool.request()
                .input("firmaId", firmaIdInt)
                .query<GuvenlikRow>(
                  "SELECT srkadi, DataYolu, PrgTur FROM guvenlik WHERE PusulaFirmaId = @firmaId"
                )
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

    // 2) SQLDatabases'den bu DB'leri çek (guvenlik eşleşmesi + FirmaNo fallback)
    let dbs: DbInfoRow[]
    if (dbFilter.names.length) {
      // IN listesini güvenli şekilde kur
      const placeholders = dbFilter.names.map((_, i) => `@n${i}`).join(",")
      // query helper template; elle SQL yapalım:
      const rawSql =
        `SELECT d.Id, d.Name, d.Server, s.IP AS ServerIP, d.SizeMB, d.Status,
                CONVERT(NVARCHAR(30), d.LastBackup, 120) AS LastBackup,
                CONVERT(NVARCHAR(30), d.LastDiffBackup, 120) AS LastDiffBackup,
                CONVERT(NVARCHAR(30), d.LastBackupStart, 120) AS LastBackupStart,
                CONVERT(NVARCHAR(30), d.LastDiffBackupStart, 120) AS LastDiffBackupStart,
                d.Tables, d.RecoveryModel, d.[Owner] AS Owner, d.DataFilePath, d.LogFilePath
         FROM SQLDatabases d
         LEFT JOIN Servers s ON s.Name = d.Server
         WHERE d.Name IN (${placeholders}) OR d.FirmaNo = @firmaNo
         ORDER BY d.Server, d.Name`
      // Elle pool kullan
      const pool = await getPool()
      const reqBuilder = pool.request().input("firmaNo", firkod)
      dbFilter.names.forEach((n, i) => reqBuilder.input(`n${i}`, n))
      const res = await reqBuilder.query(rawSql)
      dbs = res.recordset as DbInfoRow[]
    } else {
      dbs = await query<DbInfoRow[]>`
        SELECT d.Id, d.Name, d.Server, s.IP AS ServerIP, d.SizeMB, d.Status,
               CONVERT(NVARCHAR(30), d.LastBackup, 120) AS LastBackup,
               CONVERT(NVARCHAR(30), d.LastDiffBackup, 120) AS LastDiffBackup,
               CONVERT(NVARCHAR(30), d.LastBackupStart, 120) AS LastBackupStart,
               CONVERT(NVARCHAR(30), d.LastDiffBackupStart, 120) AS LastDiffBackupStart,
               d.Tables, d.RecoveryModel, d.[Owner] AS Owner, d.DataFilePath, d.LogFilePath
        FROM SQLDatabases d
        LEFT JOIN Servers s ON s.Name = d.Server
        WHERE d.FirmaNo = ${firkod}
        ORDER BY d.Server, d.Name
      `
    }

    const enriched = dbs.map((d) => ({
      ...d,
      ProgramCode: dbFilter.prgMap.get(d.Name.toLowerCase()) ?? null,
    }))

    return NextResponse.json(enriched)
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/sql]", err)
    return NextResponse.json({ error: "SQL verisi alınamadı" }, { status: 500 })
  }
}
