import { NextRequest, NextResponse } from "next/server"
import { fetchKumaMonitors, invalidateKumaCache } from "@/lib/kuma"
import { fetchKumaHistory, invalidateKumaHistoryCache, type MonitorHistory } from "@/lib/kuma-history"

/**
 * Döviz kaynaklarının son güncelleme zamanını Fastify health endpoint'inden
 * çeker. /tv'de mini kartlara "N sn önce" bilgisi basmak için kullanılır.
 * Kısa TTL (10 sn) ile in-memory cache — health zaten çok hafif.
 */
interface HealthUpstream {
  status:        string
  state:         string
  enabled:       boolean
  lastUpdatedAt: string
  lastChangedAt: string
  lastError:     string | null
}
interface HealthResponse { services: { upstream: Record<string, HealthUpstream> } }

let healthCache: { at: number; data: Record<string, HealthUpstream> } | null = null
async function fetchExchangeHealth(): Promise<Record<string, HealthUpstream>> {
  if (healthCache && Date.now() - healthCache.at < 10_000) return healthCache.data
  const res  = await fetch("http://api.pusulanet.net:8080/health", { cache: "no-store", signal: AbortSignal.timeout(2500) })
  const json = await res.json() as HealthResponse
  const data = json.services?.upstream ?? {}
  healthCache = { at: Date.now(), data }
  return data
}

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

    // Döviz kaynakları için son güncelleme zamanı (best-effort, patlarsa sessiz)
    let exchangeHealth: Record<string, HealthUpstream> | null = null
    try {
      exchangeHealth = await fetchExchangeHealth()
    } catch (e) {
      console.error("[monitoring] exchange health fetch failed:", e)
    }

    return NextResponse.json({
      ok:       true,
      fetchedAt: new Date().toISOString(),
      counts:   { total: monitors.length, online, warning, offline },
      monitors,
      history,
      exchangeHealth,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Kuma'ya ulaşılamadı."
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}
