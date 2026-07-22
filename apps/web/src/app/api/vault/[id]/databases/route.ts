import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { decrypt } from "@/lib/crypto"
import { requirePermission } from "@/lib/require-permission"
import { withSqlConnection } from "@/lib/sql-external"

/**
 * GET /api/vault/[id]/databases
 *
 * Vault entry'sindeki Host + Username + Password ile SQL Server'a bağlanıp
 * kullanıcının görebildiği (system DB'ler hariç) veritabanlarını listeler.
 *
 * Bu endpoint sadece kategori = "database" olan girişler için anlamlıdır
 * ama API tarafında kategori kontrolü zorunlu değil — bağlantı tutmazsa
 * `error` döner, çağıran taraf bunu sessizce gösterir.
 *
 * Response: { databases: string[] }  veya  { error: string }
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("vault", "read")
  if (gate) return gate
  const { id } = await params

  try {
    const sb = await getSupabaseServer()
    const { data: entry } = await sb.schema("hub").from("vault_entries")
      .select("host, username, password").eq("id", id).maybeSingle()
    if (!entry) {
      return NextResponse.json({ error: "Giriş bulunamadı" }, { status: 404 })
    }
    const { host: Host, username: Username, password: Password } = entry as { host: string | null; username: string; password: string }
    if (!Host) {
      return NextResponse.json({ error: "Host/IP boş — DB listesi için doldurulmalı" }, { status: 400 })
    }
    const password = decrypt(Password)
    if (!password) {
      return NextResponse.json({ error: "Şifre çözülemedi (ENCRYPTION_KEY uyuşmazlığı?)" }, { status: 500 })
    }

    // Host alanı "10.0.0.5,1433" veya "10.0.0.5:1433" şeklinde port içerebilir;
    // mssql kütüphanesi virgüllü formatı default kabul ediyor — ayrıştırmaya gerek yok.
    const databases = await withSqlConnection(
      { server: Host, user: Username, password, database: "master", requestTimeout: 15000 },
      async (pool) => {
        const r = await pool.request().query<{ name: string }>(`
          SELECT name
          FROM sys.databases
          WHERE database_id > 4              -- master/tempdb/model/msdb hariç
            AND state_desc = 'ONLINE'
            AND HAS_DBACCESS(name) = 1       -- kullanıcının erişebildiği DB'ler
          ORDER BY name
        `)
        return r.recordset.map((x) => x.name)
      },
    )

    return NextResponse.json({ databases })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[GET /api/vault/[id]/databases]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
