/**
 * API sunucusu (api.pusulanet.net — Ubuntu, ens192) bant genişliği adapter'ı.
 *
 * Harici heartbeat servisi `/app-heartbeat/bandwidth?token=...` endpoint'i
 * anlık (live) hız + günlük + aylık toplam trafiği JSON döner. Token URL'de
 * taşındığı için TV/kiosk tarayıcısına SIZMASIN diye Hub backend proxy'ler:
 * istek server-side atılır, token sadece env'de durur.
 *
 * Env:
 *   BANDWIDTH_API_URL  http://api.pusulanet.net/app-heartbeat/bandwidth?token=...
 *
 * 2 sn in-memory cache — TV canlı görünümü saniyede birden fazla istek atmasın.
 */

export interface BandwidthData {
  ok:          true
  interface:   string
  live:        { rxBps: number; txBps: number; rxMbps: number; txMbps: number }
  daily:       { date: string; rxBytes: number; txBytes: number; rxGB: number; txGB: number; totalGB: number }
  monthly:     { month: string; rxBytes: number; txBytes: number; rxGB: number; txGB: number; totalGB: number; totalTB: number }
  generatedAt: string
}

const TTL_MS = 2000
let cache: { at: number; data: BandwidthData } | null = null

export async function getBandwidth(): Promise<BandwidthData | null> {
  const url = process.env.BANDWIDTH_API_URL
  if (!url) return null

  // Taze cache → tekrar istek atma
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return cache?.data ?? null

    const json = (await res.json()) as BandwidthData
    if (!json?.ok || !json.live) return cache?.data ?? null

    cache = { at: Date.now(), data: json }
    return json
  } catch {
    // Servise ulaşılamadı → son bilinen değeri (varsa) göster, yoksa null
    return cache?.data ?? null
  }
}
