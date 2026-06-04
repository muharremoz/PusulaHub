/**
 * Domain (alan adı) kayıt yenileme takibi.
 *
 * Uptime Kuma'da izlenen monitörlerin URL/hostname'lerinden registrable
 * domain'leri (eTLD+1 — örn. iis.databag.net → databag.net) otomatik çıkarır,
 * her biri için RDAP (whois'in modern JSON hali) ile kayıt bitiş tarihini
 * sorgular. Hiçbir tarih manuel girilmez.
 *
 * RDAP: GET https://rdap.org/domain/<domain> → IANA bootstrap doğru registry
 * RDAP sunucusuna yönlendirir, JSON döner. events[] içinde
 * { eventAction: "expiration", eventDate } expiry tarihidir.
 *
 * 12 saat in-memory cache — RDAP rate-limit'lidir, domain expiry günde bir
 * değişir, sık sorgulamaya gerek yok.
 */

import { fetchKumaMonitors } from "./kuma"

export interface DomainExpiry {
  domain:    string
  /** ISO expiry tarihi — RDAP'tan alınamadıysa null */
  expiresAt: string | null
  /** Bugünden expiry'ye kalan tam gün — null ise bilinmiyor */
  daysLeft:  number | null
  /** Sorgu hatası (UI'da gösterilmez ama debug için) */
  error?:    string
}

/** İki seviyeli TLD'ler (eTLD+1 için son 3 segment gerektirenler). */
const TWO_LEVEL_TLDS = new Set([
  "com.tr", "net.tr", "org.tr", "gov.tr", "edu.tr", "co.uk", "org.uk",
  "com.de", "co.nz", "com.au",
])

/** Hostname → registrable domain (eTLD+1). IP veya geçersizse null. */
function registrableDomain(host: string): string | null {
  const h = host.trim().toLowerCase().replace(/\.$/, "")
  if (!h || /^[\d.]+$/.test(h)) return null          // IPv4
  if (h.includes(":")) return null                    // IPv6/port garabeti
  const parts = h.split(".")
  if (parts.length < 2) return null
  const last2 = parts.slice(-2).join(".")
  const last3 = parts.slice(-3).join(".")
  // com.tr gibi 2 seviyeli TLD ise son 3 segment al
  if (parts.length >= 3 && TWO_LEVEL_TLDS.has(last2)) return last3
  return last2
}

/** Monitör URL/hostname alanından host çıkar. */
function hostFrom(url: string | null, hostname: string | null): string | null {
  if (hostname && hostname.trim()) return hostname.trim()
  if (!url) return null
  try {
    // url "https://x/" veya "x:53" gibi olabilir
    const withProto = url.includes("://") ? url : `http://${url}`
    return new URL(withProto).hostname || null
  } catch {
    // "host:port" düz formatı
    const m = url.match(/^([a-z0-9.-]+)(:\d+)?$/i)
    return m ? m[1] : null
  }
}

let cache: { at: number; data: DomainExpiry[] } | null = null
const TTL_MS = 12 * 60 * 60 * 1000

async function rdapExpiry(domain: string): Promise<DomainExpiry> {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { Accept: "application/rdap+json" },
      signal:  AbortSignal.timeout(8000),
      cache:   "no-store",
    })
    if (!res.ok) return { domain, expiresAt: null, daysLeft: null, error: `HTTP ${res.status}` }
    const json = await res.json() as { events?: { eventAction?: string; eventDate?: string }[] }
    const ev = (json.events ?? []).find((e) => e.eventAction === "expiration")
    if (!ev?.eventDate) return { domain, expiresAt: null, daysLeft: null, error: "expiry yok" }
    const daysLeft = Math.floor((new Date(ev.eventDate).getTime() - Date.now()) / 86_400_000)
    return { domain, expiresAt: ev.eventDate, daysLeft }
  } catch (e) {
    return { domain, expiresAt: null, daysLeft: null, error: e instanceof Error ? e.message : "rdap hata" }
  }
}

/**
 * Kuma monitörlerinden çıkarılan tüm domain'lerin expiry bilgisini döner
 * (kalan güne göre artan sıralı — yakında bitenler önce). Cache'li.
 */
export async function getDomainExpiries(force = false): Promise<DomainExpiry[]> {
  const now = Date.now()
  if (!force && cache && now - cache.at < TTL_MS) return cache.data

  let monitors: { url: string | null; hostname: string | null }[] = []
  try {
    monitors = await fetchKumaMonitors()
  } catch {
    return cache?.data ?? []
  }

  const domains = new Set<string>()
  for (const m of monitors) {
    const host = hostFrom(m.url, m.hostname)
    if (!host) continue
    const base = registrableDomain(host)
    if (base) domains.add(base)
  }

  if (domains.size === 0) return cache?.data ?? []

  const results = await Promise.all([...domains].map((d) => rdapExpiry(d)))
  // Geçerli expiry'si olanlar önce, kalan güne göre artan
  results.sort((a, b) => (a.daysLeft ?? Number.MAX_SAFE_INTEGER) - (b.daysLeft ?? Number.MAX_SAFE_INTEGER))

  cache = { at: now, data: results }
  return results
}
