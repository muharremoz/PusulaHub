import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { sqlServerById } from "@/lib/hub-servers"
import { decrypt } from "@/lib/crypto"
import { withSqlConnection } from "@/lib/sql-external"
import { resolveFirmaSqlTarget } from "@/lib/sql-company-target"
import type { KodCakismasi } from "@/lib/guvenlik-kod"

/**
 * POST /api/setup/guvenlik-kod
 * Body: { firkod: string, kodlar: number[], sqlServerId?: string }
 *
 * Verilen kodlardan başka bir firmanın `sirket.dbo.guvenlik` kaydında
 * kullanılanları döndürür (KOD eşit, PusulaFirmaId farklı). Sihirbaz SQL
 * adımı ve Yeni Veritabanı Ekle'deki Kod alanının uyarısı için; yazma yok.
 * `sqlServerId` verilmezse firmanın atanmış SQL sunucusu kullanılır.
 */
export async function POST(req: NextRequest) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate

  let body: { firkod?: string; kodlar?: unknown[]; sqlServerId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 }) }
  const firkod = String(body.firkod ?? "").trim()
  const kodlar = [...new Set((body.kodlar ?? []).map(Number).filter((k) => Number.isInteger(k) && k > 0))].slice(0, 50)
  if (!/^\d+$/.test(firkod) || kodlar.length === 0) return NextResponse.json({ cakisma: [] })

  let hedef: { ip: string; username: string; password: string } | null = null
  if (body.sqlServerId) {
    const row = await sqlServerById(body.sqlServerId)
    const pw = row?.sql_password ? decrypt(row.sql_password) : null
    if (row && row.sql_username && pw) hedef = { ip: row.ip, username: row.sql_username, password: pw }
  } else {
    hedef = await resolveFirmaSqlTarget(firkod)
  }
  if (!hedef) return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })

  try {
    const cakisma = await withSqlConnection(
      { server: hedef.ip, user: hedef.username, password: hedef.password, database: "sirket", requestTimeout: 15000 },
      async (pool) => {
        const r = pool.request().input("firma", Number(firkod))
        kodlar.forEach((k, i) => r.input(`k${i}`, k))
        const rs = await r.query<KodCakismasi>(`
          SELECT KOD AS kod, PusulaFirmaId AS firmaId, srkadi, DataYolu AS dataYolu
          FROM guvenlik
          WHERE KOD IN (${kodlar.map((_, i) => `@k${i}`).join(", ")})
            AND ISNULL(PusulaFirmaId, -1) <> @firma`)
        return rs.recordset
      },
    )
    return NextResponse.json({ cakisma })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
