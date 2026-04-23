import { NextRequest, NextResponse } from "next/server"
import { fetchKumaMonitors, invalidateKumaCache } from "@/lib/kuma"
import { fetchKumaHistory, invalidateKumaHistoryCache, type MonitorHistory } from "@/lib/kuma-history"

/**
 * GET /api/monitoring
 *   ?refresh=1 → current state cache'ini bypass et
 *   ?history=1 → 30 günlük heartbeat geçmişini de ekle (Kuma SQLite'tan SSH ile)
 *
 * Current state /metrics (30 sn cache) — hızlı.
 * History SSH + sqlite3 ile (5 dk cache) — sadece /monitoring sayfası ister.
 */
export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get("refresh") === "1"
  const wantHistory = req.nextUrl.searchParams.get("history") === "1"
  if (refresh) {
    invalidateKumaCache()
    if (wantHistory) invalidateKumaHistoryCache()
  }

  try {
    const monitors = await fetchKumaMonitors()
    const online  = monitors.filter((m) => m.status === "up").length
    const warning = monitors.filter((m) => m.status === "pending" || m.status === "maintenance").length
    const offline = monitors.filter((m) => m.status === "down").length

    let history: Record<string, MonitorHistory> | null = null
    if (wantHistory) {
      try {
        history = await fetchKumaHistory()
      } catch (e) {
        // Geçmiş çekilemezse sayfa yine current state'le render edilsin.
        console.error("[monitoring] history fetch failed:", e)
        history = null
      }
    }

    return NextResponse.json({
      ok:       true,
      fetchedAt: new Date().toISOString(),
      counts:   { total: monitors.length, online, warning, offline },
      monitors,
      history,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Kuma'ya ulaşılamadı."
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}
