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
 *
 * ── User-Agent ŞART ───────────────────────────────────────────────────
 * rdap.org, tarayıcı kimliği olmayan isteğe 403 + HTML sayfa döndürüyor.
 * Node'un fetch'i varsayılan olarak UA göndermediği için canlıda bütün
 * domain'ler "—" kalmıştı; lokalde curl ile çalışıyordu (curl UA yollar).
 * 2026-09-18'de Coolify container'ından doğrulandı: aynı istek UA'sız 403,
 * UA'lı 200. Başlığı kaldırma.
 *
 * ── Yedek yol ─────────────────────────────────────────────────────────
 * rdap.org yalnız bir yönlendirici; asıl veri kayıt otoritesinin RDAP
 * sunucusunda (.net/.com → Verisign). rdap.org cevap vermezse IANA
 * bootstrap listesinden (data.iana.org/rdap/dns.json) TLD'nin RDAP
 * adresi bulunup doğrudan oraya gidiliyor.
 *
 * ── Başarısız sonuç 12 saat tutulmaz ──────────────────────────────────
 * Geçici bir hata (zaman aşımı, 429) 12 saat boyunca "—" olarak
 * kalmasın: expiry'si alınamayan domain için önceki başarılı değer
 * korunur, hiç değer yoksa liste 15 dk sonra yeniden denenir.
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
const TTL_MS       = 12 * 60 * 60 * 1000
/** Hiç sonuç alınamadıysa yeniden deneme aralığı */
const RETRY_MS     = 15 * 60 * 1000

const RDAP_HEADERS = {
  Accept:       "application/rdap+json",
  "User-Agent": "PusulaHub/1.0 (+https://hub.pusulanet.net)",
}

/** IANA bootstrap: TLD → RDAP taban adresleri. 24 saat tutulur. */
let bootstrap: { at: number; map: Map<string, string[]> } | null = null
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000

async function rdapBaseFor(domain: string): Promise<string[]> {
  const now = Date.now()
  if (!bootstrap || now - bootstrap.at > BOOTSTRAP_TTL_MS) {
    try {
      const res = await fetch("https://data.iana.org/rdap/dns.json", {
        headers: RDAP_HEADERS, signal: AbortSignal.timeout(8000), cache: "no-store",
      })
      if (res.ok) {
        const json = await res.json() as { services?: [string[], string[]][] }
        const map = new Map<string, string[]>()
        for (const [tlds, urls] of json.services ?? []) {
          for (const t of tlds) map.set(t.toLowerCase(), urls)
        }
        bootstrap = { at: now, map }
      }
    } catch (e) {
      console.warn("[domain-expiry] IANA bootstrap alınamadı:", e instanceof Error ? e.message : e)
    }
  }
  if (!bootstrap) return []
  // En uzun eşleşen sonek: "com.tr" varsa onu, yoksa "tr"
  const parts = domain.split(".")
  for (let i = 1; i < parts.length; i++) {
    const hit = bootstrap.map.get(parts.slice(i).join("."))
    if (hit) return hit
  }
  return []
}

/** Tek bir RDAP adresinden expiry çek — ok değilse hata mesajı döner */
async function fetchExpiry(url: string): Promise<{ expiresAt: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: RDAP_HEADERS, signal: AbortSignal.timeout(8000), cache: "no-store",
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const json = await res.json() as { events?: { eventAction?: string; eventDate?: string }[] }
    const ev = (json.events ?? []).find((e) => e.eventAction === "expiration")
    if (!ev?.eventDate) return { error: "expiry yok" }
    return { expiresAt: ev.eventDate }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "rdap hata" }
  }
}

async function rdapExpiry(domain: string): Promise<DomainExpiry> {
  const errors: string[] = []

  // 1) rdap.org yönlendiricisi
  const a = await fetchExpiry(`https://rdap.org/domain/${domain}`)
  if ("expiresAt" in a) return toExpiry(domain, a.expiresAt)
  errors.push(`rdap.org: ${a.error}`)

  // 2) Kayıt otoritesinin kendi RDAP sunucusu (IANA bootstrap)
  for (const base of await rdapBaseFor(domain)) {
    const b = await fetchExpiry(`${base.replace(/\/$/, "")}/domain/${domain}`)
    if ("expiresAt" in b) return toExpiry(domain, b.expiresAt)
    errors.push(`${base}: ${b.error}`)
  }

  const error = errors.join(" | ")
  console.warn(`[domain-expiry] ${domain}: ${error}`)
  return { domain, expiresAt: null, daysLeft: null, error }
}

function toExpiry(domain: string, expiresAt: string): DomainExpiry {
  const daysLeft = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
  return { domain, expiresAt, daysLeft }
}

/**
 * Kuma monitörlerinden çıkarılan tüm domain'lerin expiry bilgisini döner
 * (kalan güne göre artan sıralı — yakında bitenler önce). Cache'li.
 */
export async function getDomainExpiries(force = false): Promise<DomainExpiry[]> {
  const now = Date.now()
  if (!force && cache && now - cache.at < TTL_MS) {
    // Hepsi boşsa (ilk deneme başarısız) 12 saat beklemeden yeniden dene
    const hicYok = cache.data.length > 0 && cache.data.every((d) => d.expiresAt === null)
    if (!hicYok || now - cache.at < RETRY_MS) return cache.data
  }

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

  const eski = new Map((cache?.data ?? []).map((d) => [d.domain, d]))
  const results = (await Promise.all([...domains].map((d) => rdapExpiry(d)))).map((r) => {
    // Bu turda alınamadıysa önceki başarılı değeri koru (kalan gün yeniden hesaplanır)
    const onceki = eski.get(r.domain)
    if (r.expiresAt === null && onceki?.expiresAt) return toExpiry(r.domain, onceki.expiresAt)
    return r
  })
  // Geçerli expiry'si olanlar önce, kalan güne göre artan
  results.sort((a, b) => (a.daysLeft ?? Number.MAX_SAFE_INTEGER) - (b.daysLeft ?? Number.MAX_SAFE_INTEGER))

  cache = { at: now, data: results }
  return results
}
