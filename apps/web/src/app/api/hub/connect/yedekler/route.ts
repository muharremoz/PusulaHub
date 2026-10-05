/**
 * GET /api/hub/connect/yedekler?firma=
 *
 * Firmanın veritabanları ve son yedek zamanları — Connect uygulaması müşteriye "yedeğiniz alınıyor"
 * güvenini göstersin diye (kullanıcı kararı 05.10.2026, salt gösterim). Kaynak hub.sql_databases;
 * poller SQL sunucusundan msdb yedek geçmişini düzenli çeker. Spare Cloud teslimi KONTROL EDİLMEZ
 * (agent + SFTP, ağır) — o yedek testi (lib/yedek-testi.ts) işidir.
 * Auth: X-Service-Key = CONNECT_SERVICE_KEY. Şifre/yol gibi hassas alan dönmez.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { servisAnahtariDogru } from "@/lib/connect-hub-ic"

interface Satir {
  name: string
  status: string | null
  size_mb: number | null
  recovery_model: string | null
  last_backup: string | null
  last_diff_backup: string | null
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
    const liste = ((data ?? []) as Satir[]).map((d) => ({
      ad: d.name,
      durum: d.status,
      boyutMb: d.size_mb,
      // SIMPLE kurtarma modelinde fark yedeği olmaz; istemci satırı buna göre çizer
      farkVar: (d.recovery_model ?? "").toUpperCase() !== "SIMPLE",
      sonTam: d.last_backup,
      sonFark: d.last_diff_backup,
    }))
    return NextResponse.json({ simdi: new Date().toISOString(), liste }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
