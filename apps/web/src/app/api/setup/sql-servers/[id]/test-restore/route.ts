import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { decrypt } from "@/lib/crypto"
import { withSqlConnection } from "@/lib/sql-external"
import { restoreBackupOnServer } from "@/lib/sql-restore"

/**
 * POST /api/setup/sql-servers/:id/test-restore
 *
 * Sihirbazdan bağımsız olarak, seçili SQL sunucusunda .bak dosyalarını
 * restore etmeyi dener. Sihirbazın SQL adımındaki "Restore'u Test Et"
 * butonu bunu çağırır. Amaç: restore hatasının gerçek sebebini (path yok,
 * yetki, zaten var, vb.) erken teşhis etmektir.
 *
 * Body:
 * {
 *   tasks: Array<{ bakPath: string, targetDbName: string }>,
 *   dropAfter?: boolean   // true ise test sonrası oluşan DB'yi DROP eder
 * }
 *
 * Response:
 * {
 *   results: Array<{ bakPath, targetDbName, ok, error?, durationMs }>
 * }
 */

interface ServerRow {
  Id:          string
  Name:        string
  IP:          string
  SqlUsername: string | null
  SqlPassword: string | null
}

interface TaskIn {
  bakPath:      string
  targetDbName: string
}

interface TaskResult {
  bakPath:      string
  targetDbName: string
  ok:           boolean
  error?:       string
  durationMs:   number
  dropped?:     boolean
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({})) as {
      tasks?: TaskIn[]
      dropAfter?: boolean
    }

    const tasks = Array.isArray(body.tasks) ? body.tasks : []
    const dropAfter = body.dropAfter === true
    const cleaned: TaskIn[] = tasks
      .map((t) => ({
        bakPath:      typeof t?.bakPath === "string" ? t.bakPath.trim() : "",
        targetDbName: typeof t?.targetDbName === "string" ? t.targetDbName.trim() : "",
      }))
      .filter((t) => t.bakPath.length > 0 && t.targetDbName.length > 0)

    if (cleaned.length === 0) {
      return NextResponse.json({ error: "Test edilecek görev yok" }, { status: 400 })
    }

    const rows = await query<ServerRow[]>`
      SELECT s.Id, s.Name, s.IP, s.SqlUsername, s.SqlPassword
      FROM Servers s
      INNER JOIN ServerRoles r ON r.ServerId = s.Id
      WHERE s.Id = ${id} AND r.Role = 'SQL'
    `
    if (!rows.length) {
      return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })
    }
    const srv = rows[0]
    if (!srv.SqlUsername || !srv.SqlPassword) {
      return NextResponse.json(
        { error: `${srv.Name} için SA kullanıcı adı/şifresi tanımlı değil` },
        { status: 400 },
      )
    }
    const password = decrypt(srv.SqlPassword)
    if (!password) {
      return NextResponse.json(
        { error: "SA şifresi çözülemedi (ENCRYPTION_KEY sorunu)" },
        { status: 500 },
      )
    }

    const results: TaskResult[] = []

    await withSqlConnection(
      {
        server:   srv.IP,
        port:     1433,
        user:     srv.SqlUsername,
        password,
        database: "master",
      },
      async (pool) => {
        for (const t of cleaned) {
          const started = Date.now()
          try {
            await restoreBackupOnServer(pool, t.bakPath, t.targetDbName)
            const res: TaskResult = {
              bakPath:      t.bakPath,
              targetDbName: t.targetDbName,
              ok:           true,
              durationMs:   Date.now() - started,
            }
            // Test sonrası opsiyonel DROP
            if (dropAfter) {
              try {
                const escaped = t.targetDbName.replace(/]/g, "]]")
                await pool.request().query(`
                  IF DB_ID(N'${t.targetDbName.replace(/'/g, "''")}') IS NOT NULL
                  BEGIN
                    ALTER DATABASE [${escaped}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                    DROP DATABASE [${escaped}];
                  END
                `)
                res.dropped = true
              } catch { /* DROP hatası test sonucunu etkilemesin */ }
            }
            results.push(res)
          } catch (err) {
            results.push({
              bakPath:      t.bakPath,
              targetDbName: t.targetDbName,
              ok:           false,
              error:        err instanceof Error ? err.message : String(err),
              durationMs:   Date.now() - started,
            })
          }
        }
      },
    )

    return NextResponse.json({ results })
  } catch (err) {
    console.error("[POST /api/setup/sql-servers/:id/test-restore]", err)
    const msg = err instanceof Error ? err.message : "Restore testi başarısız"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
