/**
 * GET /api/hub/connect/sayim-veritabanlari?firma=
 *
 * Eski program sayımı (Pusula.exe) tek bir veritabanıyla açılır (Server.xml DATA). Connect, kullanıcıya
 * firmanın veritabanlarını bu listeden seçtirir. Kaynak: sirket.dbo.guvenlik (Pusula giriş ekranının da
 * kaynağı) — Giriş Sırası ekranıyla aynı okuma (lib/giris-sirasi.ts girisSatirlari).
 * Şifre DÖNMEZ. Auth: X-Service-Key = CONNECT_SERVICE_KEY.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { servisAnahtariDogru } from "@/lib/connect-hub-ic"
import { withSqlConnection } from "@/lib/sql-external"
import { girisSatirlari } from "@/lib/giris-sirasi"
import { decrypt } from "@/lib/crypto"

/** guvenlik.PrgTur → program adı (Hub wizard_services programCode ile aynı). 909 hem Perakende hem Pusula X. */
const PROGRAM: Record<string, string> = { "909": "Perakende / Pusula X", "011": "Toptan", "016": "Üretim", "111": "Stok Cari", "048": "Sipariş" }

export async function GET(req: NextRequest) {
  if (!servisAnahtariDogru(req.headers.get("x-service-key"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const firma = (req.nextUrl.searchParams.get("firma") ?? "").trim()
  const firmaId = Number(firma)
  if (!firma || !Number.isInteger(firmaId)) return NextResponse.json({ error: "firma zorunlu" }, { status: 400 })
  try {
    const sb = getSupabaseAdmin()
    const { data: c } = await sb.schema("hub").from("companies").select("sql_server_id").eq("company_id", firma).maybeSingle()
    const sqlServerId = (c as { sql_server_id: string | null } | null)?.sql_server_id
    if (!sqlServerId) return NextResponse.json({ error: "Firmaya SQL sunucusu atanmamış" }, { status: 409 })
    const { data: srv } = await sb.schema("hub").from("servers").select("ip, sql_username, sql_password").eq("id", sqlServerId).maybeSingle()
    const s = srv as { ip: string; sql_username: string | null; sql_password: string | null } | null
    if (!s?.sql_username || !s.sql_password) return NextResponse.json({ error: "SQL sunucusunun giriş bilgisi Hub'da yok" }, { status: 409 })

    const satirlar = await withSqlConnection(
      { server: s.ip, port: 1433, user: s.sql_username, password: decrypt(s.sql_password) ?? "", database: "sirket", requestTimeout: 15000 },
      (pool) => girisSatirlari(pool, firmaId),
    )
    const liste = satirlar
      .filter((x) => x.dataYolu)
      .map((x) => ({ veritabani: x.dataYolu, ad: x.srkadi || x.dataYolu, prgTur: x.prgTur || null, program: PROGRAM[x.prgTur] ?? (x.prgTur || null) }))
    return NextResponse.json({ liste }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
