import { NextRequest, NextResponse } from "next/server"
import sql from "mssql"
import { getSupabaseServer } from "@/lib/supabase/server"
import { sqlServerById } from "@/lib/hub-servers"
import { withSqlConnection } from "@/lib/sql-external"
import { decrypt } from "@/lib/crypto"
import { requirePermission } from "@/lib/require-permission"
import { esitleBackupMaster, bmOzet } from "@/lib/backup-master"

/**
 * PATCH /api/companies/[firkod]/sql/yedek-al
 * Body: { dbName: string, yedekAl: boolean }
 *
 * Firmanın SQL sunucusunda `sirket.dbo.guvenlik.YedekAl`'ı günceller.
 * SpareBackup bu kolonu doğrudan okur; Backup Master'ın listesi ise elle
 * tutulduğu için ardından eşitlenir (kritik değil — hata güncellemeyi geri almaz).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ firkod: string }> }) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { firkod } = await params

  const body = await req.json().catch(() => null) as { dbName?: unknown; yedekAl?: unknown } | null
  const dbName = typeof body?.dbName === "string" ? body.dbName.trim() : ""
  if (!dbName || typeof body?.yedekAl !== "boolean") {
    return NextResponse.json({ error: "dbName ve yedekAl zorunlu" }, { status: 400 })
  }
  const yedekAl = body.yedekAl
  const firmaId = Number.parseInt(firkod, 10)
  if (!Number.isFinite(firmaId)) return NextResponse.json({ error: "Geçersiz firma kodu" }, { status: 400 })

  const sb = await getSupabaseServer()
  const { data: company } = await sb.schema("hub").from("companies").select("sql_server_id").eq("company_id", firkod).maybeSingle()
  const sqlServerId = (company as { sql_server_id: string | null } | null)?.sql_server_id
  if (!sqlServerId) return NextResponse.json({ error: "Firmanın SQL sunucusu tanımlı değil" }, { status: 404 })

  const srv = await sqlServerById(sqlServerId)
  if (!srv) return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })
  const sifre = decrypt(srv.sql_password)
  if (!srv.sql_username || !sifre) return NextResponse.json({ error: `${srv.name}: SQL kullanıcı bilgisi eksik` }, { status: 400 })

  let etkilenen = 0
  try {
    etkilenen = await withSqlConnection(
      { server: srv.ip, user: srv.sql_username, password: sifre, database: "sirket", requestTimeout: 15_000 },
      async (pool) => {
        const r = await pool.request()
          .input("firmaId", sql.Int, firmaId)
          .input("ad", sql.NVarChar, dbName)
          .input("yedekAl", sql.Bit, yedekAl ? 1 : 0)
          .query(`
            UPDATE guvenlik SET YedekAl = @yedekAl
            WHERE PusulaFirmaId = @firmaId
              AND LTRIM(RTRIM(COALESCE(NULLIF(LTRIM(RTRIM(DataYolu)), ''), srkadi))) = @ad`)
        return r.rowsAffected[0] ?? 0
      },
    )
  } catch (err) {
    console.error("[PATCH yedek-al] guvenlik güncellenemedi:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "guvenlik tablosu güncellenemedi" }, { status: 500 })
  }
  if (etkilenen === 0) return NextResponse.json({ error: "Bu veritabanının guvenlik kaydı yok" }, { status: 404 })

  // Backup Master — ikinci arşiv listesi
  let bm: { ok: boolean; ozet: string }
  if (!srv.agent_port || !srv.api_key) {
    bm = { ok: false, ozet: `${srv.name}: agent bilgisi eksik, Backup Master eşitlenmedi` }
  } else {
    try {
      const sonuc = await esitleBackupMaster({
        ip: srv.ip, username: srv.sql_username, password: sifre,
        agentPort: srv.agent_port, apiKey: decrypt(srv.api_key)!,
      })
      bm = { ok: !sonuc.atlandi, ozet: bmOzet(sonuc) }
    } catch (err) {
      bm = { ok: false, ozet: `Backup Master eşitlenemedi: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  return NextResponse.json({ ok: true, yedekAl, etkilenen, backupMaster: bm })
}
