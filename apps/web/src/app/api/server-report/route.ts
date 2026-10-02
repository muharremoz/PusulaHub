import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"

/**
 * GET /api/server-report?gun=14
 *
 * Sunucu Raporu sayfasının verisi:
 *   - seri:   hub.server_metrics, aralığa göre birleştirilmiş kovalar
 *             (1 gün → 5 dk, 7 gün → 30 dk, daha uzun → 60 dk)
 *   - gunluk: hub.user_daily_usage'dan sunucu × gün özetleri (aktif kullanıcı,
 *             oturum saati, kullanıcı süreçlerinin CPU/RAM payı). Ölçüm kaydı
 *             yeni başladığı için geçmiş kullanıcı yoğunluğunun tek kaynağı bu.
 */

export interface SeriSatiri {
  server_id: string; server_name: string; ts: string
  cpu_avg: number | null; cpu_max: number | null
  ram_used_mb: number | null; ram_max_mb: number | null; ram_total_mb: number | null
  disk_used_gb: number | null; disk_total_gb: number | null
  sessions_active: number | null; sessions_total: number | null
}
export interface GunlukSatir {
  server: string; date: string
  kullanici: number; saat: number
  /** Kullanıcı süreçlerinin sunucu CPU'sundaki payı, 10 saatlik iş günü ortalaması (%) */
  cpu: number
  /** Kullanıcı süreçlerinin özel belleği, iş günü ortalaması (GB) */
  ramGb: number
}
export interface SunucuRaporu {
  gun: number
  kovaDk: number
  sunucular: { id: string; name: string }[]
  seri: SeriSatiri[]
  gunluk: GunlukSatir[]
  kayitBaslangic: string | null
}

const IS_GUNU_DK = 600
const YONETICI = /^(administrator|alusup|admin)/i

export async function GET(req: NextRequest) {
  const gate = await requirePermission("servers", "read")
  if (gate) return gate
  try {
    const gun = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("gun")) || 14))
    const kovaDk = gun <= 1 ? 5 : gun <= 7 ? 30 : 60
    const since = new Date(Date.now() - gun * 86_400_000)
    const sb = await getSupabaseServer()
    const hub = sb.schema("hub")

    const [srvR, seriR, ilkR] = await Promise.all([
      hub.from("servers").select("id, name").order("name"),
      hub.rpc("server_metrics_ozet", { p_since: since.toISOString(), p_bucket_minutes: kovaDk }),
      hub.from("server_metrics").select("ts").order("ts", { ascending: true }).limit(1),
    ])
    if (srvR.error) throw srvR.error
    if (seriR.error) throw seriR.error

    // user_daily_usage — sayfalı (gün başına ~250 satır)
    const tarih = since.toISOString().slice(0, 10)
    const satirlar: { date: string; username: string; server: string; avg_cpu: number | null; avg_ram_mb: number | null; session_minutes: number | null }[] = []
    for (let o = 0; ; o += 1000) {
      const { data, error } = await hub.from("user_daily_usage")
        .select("date, username, server, avg_cpu, avg_ram_mb, session_minutes")
        .gte("date", tarih).order("date").range(o, o + 999)
      if (error) throw error
      satirlar.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    const top = new Map<string, { kul: Set<string>; dk: number; cpuDk: number; ramDk: number }>()
    for (const r of satirlar) {
      const dk = r.session_minutes ?? 0
      const ad = r.username.split("\\").pop() ?? r.username
      if (dk < 5 || YONETICI.test(ad)) continue
      const k = `${r.server}|${r.date}`
      const g = top.get(k) ?? { kul: new Set<string>(), dk: 0, cpuDk: 0, ramDk: 0 }
      g.kul.add(ad.toLowerCase()); g.dk += dk
      g.cpuDk += (r.avg_cpu ?? 0) * dk; g.ramDk += (r.avg_ram_mb ?? 0) * dk
      top.set(k, g)
    }
    const gunluk: GunlukSatir[] = [...top.entries()].map(([k, g]) => {
      const [server, date] = k.split("|")
      return {
        server, date, kullanici: g.kul.size, saat: Math.round(g.dk / 6) / 10,
        cpu: Math.round((g.cpuDk / IS_GUNU_DK) * 10) / 10,
        ramGb: Math.round((g.ramDk / IS_GUNU_DK / 1024) * 10) / 10,
      }
    }).sort((a, b) => a.date.localeCompare(b.date))

    const yanit: SunucuRaporu = {
      gun, kovaDk,
      sunucular: (srvR.data ?? []) as { id: string; name: string }[],
      seri: (seriR.data ?? []) as SeriSatiri[],
      gunluk,
      kayitBaslangic: (ilkR.data?.[0] as { ts: string } | undefined)?.ts ?? null,
    }
    return NextResponse.json(yanit)
  } catch (err) {
    console.error("[GET /api/server-report]", err)
    return NextResponse.json({ error: "Rapor verisi alınamadı" }, { status: 500 })
  }
}
