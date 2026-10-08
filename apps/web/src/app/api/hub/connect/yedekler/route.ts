/**
 * GET /api/hub/connect/yedekler?firma=
 *
 * Firmanın veritabanları ve son yedek zamanları — Connect uygulaması müşteriye "yedeğiniz alınıyor"
 * güvenini göstersin diye (kullanıcı kararı 05.10.2026, salt gösterim). Kaynak hub.sql_databases;
 * poller SQL sunucusundan msdb yedek geçmişini düzenli çeker. Spare Cloud teslimi KONTROL EDİLMEZ
 * (agent + SFTP, ağır) — o yedek testi (lib/yedek-testi.ts) işidir.
 * Auth: X-Service-Key = CONNECT_SERVICE_KEY. Şifre/yol gibi hassas alan dönmez.
 *
 * YEDEK DIŞI datalar listeden çıkar (08.10.2026): eski yıl dataları guvenlik.YedekAl=0 ile bilerek yedeğe
 * girmiyor (3082'de CANAKKALE24/CANTA24/ISTANBUL24); hiç yedeği olmadığı için Connect kartı kırmızı
 * görünüyor, müşteri "yedeklemede sorun var" diyordu. Kaynak SpareBackup'ın da okuduğu guvenlik.YedekAl
 * (bkz. lib/backup-master.ts). SQL'e ulaşılamazsa liste eskisi gibi süzülmeden döner.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { servisAnahtariDogru } from "@/lib/connect-hub-ic"
import { decrypt } from "@/lib/crypto"
import { withSqlConnection } from "@/lib/sql-external"

interface Satir {
  name: string
  status: string | null
  size_mb: number | null
  recovery_model: string | null
  last_backup: string | null
  last_diff_backup: string | null
}

/**
 * Poller yedek zamanını SQL sunucusunun YEREL saatiyle (Türkiye) yazar ama değer UTC gibi saklanır;
 * CRM'deki hubYerelSaattenAn ile aynı düzeltme: 3 saat geri → gerçek an.
 */
const hubYerelSaattenAn = (t: string | null): string | null => {
  if (!t) return null
  const ms = Date.parse(t)
  return Number.isFinite(ms) ? new Date(ms - 3 * 3600_000).toISOString() : null
}

/** Firmanın YedekAl=0 (bilerek yedek dışı) dataları. Hata/erişim yoksa null → süzme yapılmaz. */
async function yedekDisiDatalar(firma: string): Promise<Set<string> | null> {
  try {
    const hub = getSupabaseAdmin().schema("hub")
    const { data: c } = await hub.from("companies").select("sql_server_id").eq("company_id", firma).maybeSingle()
    const sid = (c as { sql_server_id: string | null } | null)?.sql_server_id
    if (!sid) return null
    const { data: s } = await hub.from("servers").select("ip, sql_username, sql_password").eq("id", sid).maybeSingle()
    const srv = s as { ip: string; sql_username: string | null; sql_password: string | null } | null
    if (!srv?.sql_username || !srv.sql_password) return null
    return await withSqlConnection(
      { server: srv.ip, user: srv.sql_username, password: decrypt(srv.sql_password) ?? "", database: "master", requestTimeout: 15_000 },
      async (pool) => {
        const r = await pool.request().input("onek", `${firma}[_]%`).query<{ ad: string }>(
          "SELECT DISTINCT LTRIM(RTRIM(DataYolu)) AS ad FROM sirket.dbo.guvenlik WHERE DataYolu LIKE @onek AND ISNULL(YedekAl, 0) = 0")
        return new Set(r.recordset.map((x) => x.ad.toLowerCase()))
      },
    )
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  if (!servisAnahtariDogru(req.headers.get("x-service-key"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const firma = (req.nextUrl.searchParams.get("firma") ?? "").trim()
  if (!firma) return NextResponse.json({ error: "firma zorunlu" }, { status: 400 })
  try {
    const { data, error } = await getSupabaseAdmin().schema("hub").from("sql_databases")
      .select("name, status, size_mb, recovery_model, last_backup, last_diff_backup")
      .eq("firma_no", firma).order("name")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const disi = await yedekDisiDatalar(firma)
    const liste = ((data ?? []) as Satir[]).filter((d) => !disi?.has(d.name.toLowerCase())).map((d) => ({
      ad: d.name,
      durum: d.status,
      boyutMb: d.size_mb,
      // Fark yedeği alınıyorsa (SIMPLE'da da alınabilir) ya da FULL modeldeyse satırda gösterilir
      farkVar: !!d.last_diff_backup || (d.recovery_model ?? "").toUpperCase() === "FULL",
      sonTam: hubYerelSaattenAn(d.last_backup),
      sonFark: hubYerelSaattenAn(d.last_diff_backup),
    }))
    return NextResponse.json({ simdi: new Date().toISOString(), liste }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
