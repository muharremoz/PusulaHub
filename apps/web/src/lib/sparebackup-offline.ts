/**
 * SpareBackup "offline firmalar" adapter.
 *
 * SpareBackup agent'larından heartbeat alan servis (Ubuntu 10.15.2.6:3000),
 * eşik süresinden (varsayılan 60 dk) uzun süredir sinyal göndermeyen
 * firmaları döndürür. Hub bu veriyi proxy'ler — token gizli kalsın + client
 * doğrudan LAN'a (10.15.2.6) erişemesin diye.
 *
 * 60 sn in-memory cache (dashboard KPI + dialog aynı tick'te aynı veriyi
 * görsün, gereksiz upstream çağrısı olmasın).
 *
 * Env:
 *   SPAREBACKUP_OFFLINE_URL    http://10.15.2.6:3000/offline-firms
 *   SPAREBACKUP_OFFLINE_TOKEN  X-API-Key header değeri
 */

export interface OfflineFirm {
  firkod:        number
  firma:         string
  lastHeartbeat: string   // ISO
  minutesAgo:    number
  lastIp:        string
  version:       string
}

export interface SpareBackupOffline {
  ok:           boolean
  generatedAt:  string
  thresholdMins: number
  totalActive:  number
  onlineCount:  number
  offlineCount: number
  offline:      OfflineFirm[]
}

let cache: { at: number; data: SpareBackupOffline } | null = null
const TTL_MS = 60_000

/**
 * Offline firma özetini çeker (cache'li). Upstream'e ulaşılamazsa veya env
 * eksikse `null` döner — çağıran taraf (API route) bunu "ulaşılamadı" olarak
 * işler.
 */
export async function getSpareBackupOffline(force = false): Promise<SpareBackupOffline | null> {
  const now = Date.now()
  if (!force && cache && now - cache.at < TTL_MS) {
    return cache.data
  }

  const url   = process.env.SPAREBACKUP_OFFLINE_URL   ?? ""
  const token = process.env.SPAREBACKUP_OFFLINE_TOKEN ?? ""
  if (!url || !token) return null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(url, {
      headers: { "X-API-Key": token },
      signal:  controller.signal,
      cache:   "no-store",
    })
    clearTimeout(timer)

    if (!res.ok) return cache?.data ?? null

    const json = await res.json() as Partial<SpareBackupOffline>
    if (!json || json.ok !== true || !Array.isArray(json.offline)) {
      return cache?.data ?? null
    }

    const data: SpareBackupOffline = {
      ok:            true,
      generatedAt:   json.generatedAt   ?? new Date().toISOString(),
      thresholdMins: json.thresholdMins ?? 60,
      totalActive:   json.totalActive   ?? 0,
      onlineCount:   json.onlineCount   ?? 0,
      offlineCount:  json.offlineCount  ?? json.offline.length,
      offline:       json.offline as OfflineFirm[],
    }
    cache = { at: now, data }
    return data
  } catch {
    // Upstream timeout/erişim hatası → varsa eski cache, yoksa null
    return cache?.data ?? null
  }
}
