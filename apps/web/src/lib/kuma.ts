/**
 * Uptime Kuma adapter.
 *
 * `/metrics` endpoint'i Prometheus formatında veri döndürür. Biz sadece
 * `monitor_status` ve `monitor_response_time` serilerini parse edip
 * monitor başına { name, type, url/hostname, status, responseMs } yapısına
 * çeviriyoruz. 30 sn in-memory cache — /monitoring refresh ve birden çok
 * sunucu kartı aynı tick'te aynı veriyi görsün.
 *
 * Env:
 *   UPTIME_KUMA_URL            http://10.15.2.6:3001
 *   UPTIME_KUMA_METRICS_TOKEN  Kuma → Settings → API Keys → "hub-metrics"
 *
 * Auth: Basic, username boş — `Basic base64(":" + token)`.
 */

export type KumaStatus = "up" | "down" | "pending" | "maintenance" | "unknown"

export interface KumaMonitor {
  name:       string
  type:       string                // ping | http | ...
  hostname:   string | null
  url:        string | null
  port:       string | null
  status:     KumaStatus
  /** `-1` veya null = veri yok (DOWN ise response_time -1 dönebilir). */
  responseMs: number | null
}

const STATUS_MAP: Record<string, KumaStatus> = {
  "0": "down",
  "1": "up",
  "2": "pending",
  "3": "maintenance",
}

/* ── 30 sn cache ───────────────────────────────────────── */
let cache: { at: number; data: KumaMonitor[] } | null = null
const TTL_MS = 30 * 1000

/**
 * Prometheus text format satırını `key{labels} value` şeklinde parse eder.
 * Örnek:
 *   monitor_status{monitor_name="AD",monitor_type="ping",...} 1
 */
function parseLine(line: string): { metric: string; labels: Record<string, string>; value: number } | null {
  // `metric{labels} value` veya `metric value`
  const m = line.match(/^([a-z_]+)(\{([^}]*)\})?\s+([-\d.eE+]+)$/)
  if (!m) return null
  const [, metric, , rawLabels, rawValue] = m
  const labels: Record<string, string> = {}
  if (rawLabels) {
    // foo="bar",baz="qux"
    for (const part of rawLabels.split(/,(?=[a-z_]+=)/)) {
      const eq = part.indexOf("=")
      if (eq === -1) continue
      const k = part.slice(0, eq).trim()
      const v = part.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1")
      labels[k] = v
    }
  }
  return { metric, labels, value: Number(rawValue) }
}

function normalizeLabel(v: string | undefined): string | null {
  if (!v || v === "null" || v === "") return null
  return v
}

export async function fetchKumaMonitors(force = false): Promise<KumaMonitor[]> {
  const now = Date.now()
  if (!force && cache && now - cache.at < TTL_MS) return cache.data

  const base  = process.env.UPTIME_KUMA_URL
  const token = process.env.UPTIME_KUMA_METRICS_TOKEN
  if (!base || !token) {
    throw new Error("UPTIME_KUMA_URL veya UPTIME_KUMA_METRICS_TOKEN env'de tanımlı değil.")
  }

  const auth = Buffer.from(`:${token}`).toString("base64")
  const res = await fetch(`${base.replace(/\/$/, "")}/metrics`, {
    headers: { authorization: `Basic ${auth}` },
    cache:   "no-store",
    // Kuma'nın gc döngüsüne takılmasın diye kısa timeout yok — fetch default.
  })
  if (!res.ok) {
    throw new Error(`Kuma /metrics HTTP ${res.status}`)
  }
  const text = await res.text()

  const byName = new Map<string, KumaMonitor>()

  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const parsed = parseLine(line)
    if (!parsed) continue
    const { metric, labels, value } = parsed
    if (metric !== "monitor_status" && metric !== "monitor_response_time") continue

    const name = labels.monitor_name
    if (!name) continue

    const existing = byName.get(name) ?? {
      name,
      type:       labels.monitor_type ?? "unknown",
      hostname:   normalizeLabel(labels.monitor_hostname),
      url:        normalizeLabel(labels.monitor_url),
      port:       normalizeLabel(labels.monitor_port),
      status:     "unknown" as KumaStatus,
      responseMs: null,
    }

    if (metric === "monitor_status") {
      existing.status = STATUS_MAP[String(value)] ?? "unknown"
    } else if (metric === "monitor_response_time") {
      // Kuma değeri ms cinsinden. Sub-ms ping'ler (LAN) 0.3-0.9 dönüyor;
      // `Math.round` 0'a yuvarlıyor → kullanıcı "0 ms" görüyor. 1 ondalık tutalım.
      existing.responseMs = value < 0 ? null : Math.round(value * 10) / 10
    }

    byName.set(name, existing)
  }

  const data = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, "tr"))
  cache = { at: now, data }
  return data
}

/** Agresif refresh — "Yenile" butonu için. */
export function invalidateKumaCache(): void {
  cache = null
}
