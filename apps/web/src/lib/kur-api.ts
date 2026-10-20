import "server-only"

/**
 * kur-api (api.pusulanet.net, 10.15.2.6 pm2 "kur-api") istemcisi — /kur-api sayfası.
 *
 *   KUR_API_URL        http://10.15.2.6:8080  (LAN adresi şart: /admin uçları yalnız 10.15.2.x'ten kabul edilir)
 *   KUR_API_ADMIN_KEY  kur-api .env'indeki ADMIN_API_KEY ile aynı
 *
 * /health anahtarsızdır; /admin/* X-Admin-Key ister. Ayar yazınca kur-api kendini yeniden başlatır
 * (denetleyici ~2 sn'de alt süreci açar). Ayrıntı: docs/kur-api-sql-yazma.md §7.
 */

const BASE = (process.env.KUR_API_URL ?? "http://10.15.2.6:8080").replace(/\/+$/, "")

export type KaynakDurumu = {
  status: string
  state: string
  enabled: boolean
  lastUpdatedAt: string | null
  lastChangedAt: string | null
  lastError: string | null
}

export type KurApiSaglik = {
  status: "ok" | "degraded" | "error"
  services: {
    upstream: Record<string, KaynakDurumu>
    downstream: Record<string, { status: string }>
    sqlWriter: {
      enabled: boolean
      state: string
      database: string | null
      lastWriteAt: string | null
      rateTableLatestLocal: string | null
      lastCount: number | null
      lastError: string | null
      sources: Record<string, { rateId: number; codes: number; lastDataAt: string | null }>
    } | null
    ftpWriter: {
      enabled: boolean
      state: string
      target: string | null
      lastUploadAt: string | null
      lastCount: number | null
      lastDataAt: string | null
      lastError: string | null
    } | null
  }
}

export type AyarTipi = "bool" | "sure" | "port" | "url" | "metin" | "gizli"

export type KurApiAyar = {
  anahtar: string
  grup: string
  etiket: string
  tip: AyarTipi
  min?: number
  max?: number
  /** .env'deki değer (gizlide daima null) */
  deger: string | null
  /** Çalışan süreçteki değer — .env'den farklıysa yeniden başlatma bekliyor demektir */
  etkin: string | number | boolean | null
  /** .env'de var mı (gizlide: değer tanımlı mı) */
  ayarli: boolean
}

export type KurApiAyarlar = {
  alanlar: KurApiAyar[]
  envDegisti: string | null
  surec: { pid: number; baslangic: string; node: string; bellekMb: number }
}

export type KurApiGunlukKaydi = {
  zaman: string
  seviye: "debug" | "info" | "warn" | "error"
  olay: string
  mesaj: string
  hata: string | null
  servis: string | null
}

export class KurApiHatasi extends Error {
  constructor(message: string, public status: number, public detay?: unknown) {
    super(message)
  }
}

async function istek<T>(yol: string, init: RequestInit & { admin?: boolean; kim?: string } = {}): Promise<T> {
  const { admin, kim, ...rest } = init
  const headers = new Headers(rest.headers)
  if (admin) {
    const key = process.env.KUR_API_ADMIN_KEY
    if (!key) throw new KurApiHatasi("KUR_API_ADMIN_KEY tanımlı değil", 500)
    headers.set("X-Admin-Key", key)
    if (kim) headers.set("X-Admin-User", kim)
  }
  if (rest.body) headers.set("Content-Type", "application/json")
  let res: Response
  try {
    res = await fetch(BASE + yol, { ...rest, headers, cache: "no-store", signal: AbortSignal.timeout(8000) })
  } catch (e) {
    throw new KurApiHatasi(`kur-api'ye ulaşılamadı (${e instanceof Error ? e.message : String(e)})`, 502)
  }
  const veri = await res.json().catch(() => null) as { message?: string } | null
  if (!res.ok) throw new KurApiHatasi(veri?.message ?? `kur-api HTTP ${res.status}`, res.status, veri)
  return veri as T
}

export const kurApiSaglik = () => istek<KurApiSaglik>("/health")

export const kurApiAyarlar = () => istek<KurApiAyarlar>("/admin/config", { admin: true })

export const kurApiAyarKaydet = (degisiklikler: Record<string, string>, kim?: string) =>
  istek<{ ok: true; degisen: string[]; yedek: string | null; yenidenBasliyor: boolean }>("/admin/config", {
    method: "PUT", admin: true, kim, body: JSON.stringify({ degisiklikler }),
  })

export const kurApiYenidenBaslat = (kim?: string) =>
  istek<{ ok: true; yenidenBasliyor: true }>("/admin/restart", { method: "POST", admin: true, kim })

export const kurApiGunluk = (seviye: "info" | "warn" | "error", limit = 200) =>
  istek<{ kayitlar: KurApiGunlukKaydi[] }>(`/admin/logs?seviye=${seviye}&limit=${limit}`, { admin: true })
