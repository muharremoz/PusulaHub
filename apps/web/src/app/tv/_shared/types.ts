/**
 * /tv için paylaşılan tipler + saf yardımcı fonksiyonlar.
 *
 * Buradaki hiçbir şey React'e veya DOM'a bağlı değil — veri katmanı
 * (`use-tv-data`) ile görsel katman ayrı kalsın diye ayrı tutuldu.
 */

export type KumaStatus = "up" | "down" | "pending" | "maintenance" | "unknown"

export interface KumaMonitor {
  name:       string
  type:       string
  hostname:   string | null
  url:        string | null
  port:       string | null
  status:     KumaStatus
  responseMs: number | null
}

export interface ExchangeHealthEntry {
  status:        string
  state:         string
  lastUpdatedAt: string
  lastChangedAt: string
  lastError:     string | null
}

export interface MonitoringResponse {
  ok:              true
  fetchedAt:       string
  counts:          { total: number; online: number; warning: number; offline: number }
  monitors:        KumaMonitor[]
  exchangeHealth?: Record<string, ExchangeHealthEntry> | null
}

export interface StatusTrack { status: KumaStatus; since: number }
export interface StatusEvent { name: string; from: KumaStatus; to: KumaStatus; at: number }

export type UiStatus = "online" | "warning" | "offline"

/**
 * Eski adlandırma: monitörler "Döviz - Altınkaynak" gibi adlandırılmıştı.
 * Kuma tarafında önek kaldırıldı ("Altınkaynak", "Datshop (Harem)"), ama
 * geriye dönük tanımayı bozmamak için önek hâlâ kabul ediliyor.
 */
export const EXCHANGE_PREFIX = "Döviz - "

/** Döviz mini kartlarında kaynak adını health endpoint anahtarına eşle */
export const EXCHANGE_HEALTH_KEY: Record<string, string> = {
  "Altınkaynak": "altinkaynak",
  "Datshop":     "datshop",
  "Ozankur":     "ozankur",
  "TCMB":        "tcmb",
  "Pusula":      "pusula",
}

/** Sondaki parantezli ek: "Datshop (Harem)" -> "Datshop" */
const PAREN_SUFFIX = /\s*\([^()]*\)\s*$/

/**
 * Kuma adını döviz kaynağı etiketine indirger; döviz monitörü değilse null.
 *
 * ── Neden önek yetmiyor? ───────────────────────────────────────────────
 * Adlar Kuma tarafında "Döviz - X" biçiminden sade "X" biçimine geçti. Önek
 * kuralına bağlı kalırsak bu monitörler sessizce "Sınıflandırılmamış"a
 * düşüyor. O yüzden tanıma artık BİLİNEN KAYNAK LİSTESİNE bakıyor; önek
 * varsa da temizleniyor.
 *
 * ── Parantezli ek ──────────────────────────────────────────────────────
 * "Datshop (Harem)" gibi sondaki açıklama atılıyor: sağlayıcı aynı, yalnız
 * ad zenginleştirilmiş.
 *
 * ── Neden tam eşleşme? ─────────────────────────────────────────────────
 * "Pusula" bir kaynak adı; startsWith kullansaydık "Pusula VPN" ve
 * "PUSULA LISANS" da döviz sanılırdı. Tam eşleşme bu tuzağı kapatıyor.
 */
export function exchangeLabelOf(name: string): string | null {
  const bare = stripExchangePrefix(name).replace(PAREN_SUFFIX, "").trim()
  const lower = bare.toLocaleLowerCase("tr-TR")
  for (const label of Object.keys(EXCHANGE_HEALTH_KEY)) {
    if (lower === label.toLocaleLowerCase("tr-TR")) return label
  }
  return null
}

/** Bu monitör bir döviz kaynağı mı? */
export function isExchange(name: string): boolean {
  return name.startsWith(EXCHANGE_PREFIX) || exchangeLabelOf(name) !== null
}

/** Döviz sağlık ucundaki anahtar — kaynak tanınmazsa undefined */
export function exchangeHealthKey(name: string): string | undefined {
  const label = exchangeLabelOf(name)
  return label ? EXCHANGE_HEALTH_KEY[label] : undefined
}

/**
 * SpareBackup "offline firmalar" bilgi monitörü mü? Bu monitör offline firma
 * olduğunda DOWN olur ama bir sunucu arızası değildir → /tv'de tam ekran
 * alarm (DownSpotlight/Banner/beep) açmamalı, sadece grid'de görünmeli.
 * URL'inde "offline-firms" geçen veya adı "spare backup offline" olan monitör.
 */
export function isInfoMonitor(m: { name: string; url: string | null }): boolean {
  if (m.url && m.url.toLowerCase().includes("offline-firms")) return true
  return /spare\s*backup\s*offline/i.test(m.name)
}

export function mapStatus(s: KumaStatus): UiStatus {
  if (s === "up") return "online"
  if (s === "down") return "offline"
  return "warning"
}

export function formatTarget(m: KumaMonitor): string {
  if (m.hostname) return m.hostname
  if (m.url) return m.url.replace(/^https?:\/\//, "")
  return "—"
}

export function stripExchangePrefix(name: string): string {
  return name.startsWith(EXCHANGE_PREFIX) ? name.slice(EXCHANGE_PREFIX.length) : name
}

/** Birkaç saniye önce / dakika önce / saat önce formatı */
export function formatAgo(iso: string, now: Date): string {
  const diff = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)
  // Saniye saymayı gösterme — döviz canlı güncellendiği için "2/3/4 sn önce"
  // sürekli oynayıp dikkat dağıtıyordu. 60 sn altı sabit "az önce".
  if (diff < 60)    return "az önce"
  if (diff < 3600)  return `${Math.round(diff / 60)} dk önce`
  if (diff < 86400) return `${Math.round(diff / 3600)} sa önce`
  return `${Math.round(diff / 86400)} gün önce`
}

/** "3 dk" / "1 sa 4 dk" kısa süre formatı */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60)    return `${s} sn`
  const m = Math.floor(s / 60)
  if (m < 60)    return `${m} dk`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h} sa ${rm} dk` : `${h} sa`
}

/** Monitör grubunun en kötü durumu — biri offline'sa grup offline */
export function aggregateStatus(monitors: KumaMonitor[]): UiStatus {
  if (monitors.some((m) => m.status === "down")) return "offline"
  if (monitors.some((m) => m.status !== "up"))   return "warning"
  return "online"
}

/** Monitörü mantıksal kümesine ayır — her küme ekranda ayrı bir grup olur */
export type MonitorGroupKey = "server" | "service" | "exchange"

export function groupOf(m: KumaMonitor): MonitorGroupKey {
  if (isExchange(m.name)) return "exchange"
  return m.type === "ping" ? "server" : "service"
}

export const GROUP_LABEL: Record<MonitorGroupKey, string> = {
  server:   "Sunucular",
  service:  "Servisler & Web",
  exchange: "Döviz Kaynakları",
}
