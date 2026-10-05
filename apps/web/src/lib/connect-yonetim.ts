/**
 * Pusula Connect izleme merkezi (Hub /connect) — Connect servisinin admin uçları.
 * Servis: services/pusula-connect (X-Service-Key). Yalnız sunucu tarafında kullanılır.
 */

import { connectServisAnahtari } from "@/lib/connect-hub-ic"

const BASE = process.env.CONNECT_SERVICE_URL ?? "https://aktarim.pusulanet.net/connect"
const KEY = connectServisAnahtari()

export interface ConnectAyarlar {
  tamEkran?: boolean; yazici?: boolean; pano?: boolean; ses?: boolean; windowsIleBaslat?: boolean
  akilliKart?: boolean; portlar?: boolean; konum?: boolean; kamera?: boolean; aygitlar?: boolean; suruculer?: boolean
}

export interface ConnectCihazDurum {
  os: string | null
  forti: string | null
  /** sifre: FortiClient'ta VPN şifresi kayıtlı mı (0.3.9+; eski istemcide yok) */
  vpnProfil: { dogru: boolean; kullaniciAdi: boolean; sifre?: "kayitli" | "isaretsiz" | "yok" } | null
  sifreKayitli: boolean | null
  ayarlar: ConnectAyarlar | null
  /** Sunucu adı bu bilgisayarda DNS ile çözülemedi, IP ile bağlanıyor (0.4.2+) */
  dnsYok?: boolean | null
  /** Pusula X sayım modu (0.6.0+): kurulu değilse null */
  sayim?: ConnectSayimDurum | null
}

export interface ConnectSayimDurum {
  kurulu: boolean
  kuruluyor: boolean
  /** Kurulum hata ile bittiyse mesajı */
  hata: string | null
  /** Kurulu PusulaX.exe sürümü */
  surum: string | null
  kurulum: string | null
  kisayol: boolean
  /** SQL bilgisi Pusula'da değişti, 2FA nedeniyle kullanıcının kodla yenilemesi bekleniyor */
  guncellemeBekliyor: boolean
  test: { zaman: string | null; ok: boolean; veritabani: number | null; hata: string | null } | null
}

export interface ConnectCihazSatir {
  id: string
  kodId: string
  makine: string | null
  surum: string | null
  ilkGiris: string
  sonGorulme: string | null
  iptal: boolean
  totpAktif: boolean
  totpHata: number
  totpKilit: string | null
  sonNabiz: string | null
  oturumAcik: boolean
  oturumBaslangic: string | null
  terminalErisim: boolean | null
  terminalMs: number | null
  ip: string | null
  firmaId: string
  firmaAdi: string
  kullanici: string
  kodDurum: string
  olusturan: string | null
  rdp: string | null
  tunel: string | null
  durum: ConnectCihazDurum | null
}

export interface ConnectOlay {
  id: number
  zaman: string
  cihazId: string | null
  firmaId: string | null
  kullanici: string | null
  makine: string | null
  tur: string
  ayrinti: string | null
  kaynak: "servis" | "istemci" | "yonetici"
  ip: string | null
}

export interface ConnectKod {
  id: string; firmaId: string; firmaAdi: string; kullanici: string
  durum: "bekliyor" | "kullanildi" | "iptal"; olusturan: string | null; olusturma: string; bitis: string
  cihazlar: { id: string }[]
}

export type ConnectCihazIslemi = "2fa-sifirla" | "kilit-kaldir" | "iptal" | "etkinlestir"

async function istek<T>(yol: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${yol}`, { ...init, headers: { "X-Service-Key": KEY, "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" })
  const metin = await r.text()
  let j: unknown = null
  try { j = JSON.parse(metin) } catch { /* JSON değil */ }
  if (!r.ok) throw new Error((j as { hata?: string } | null)?.hata ?? `Connect servisi: HTTP ${r.status}`)
  return j as T
}

export const connectTumCihazlar = (firma?: string) =>
  istek<ConnectCihazSatir[]>(`/admin/cihazlar${firma ? `?firma=${encodeURIComponent(firma)}` : ""}`)

export function connectOlaylar(q: { firma?: string; cihaz?: string; limit?: number; once?: number }) {
  const p = new URLSearchParams()
  if (q.firma) p.set("firma", q.firma)
  if (q.cihaz) p.set("cihaz", q.cihaz)
  if (q.limit) p.set("limit", String(q.limit))
  if (q.once) p.set("once", String(q.once))
  return istek<ConnectOlay[]>(`/admin/olaylar?${p}`)
}

export const connectKodlar = (firma?: string) =>
  istek<ConnectKod[]>(`/admin/kodlar${firma ? `?firma=${encodeURIComponent(firma)}` : ""}`)

export const connectCihazIslemi = (id: string, islem: ConnectCihazIslemi, yapan: string | null) =>
  istek<{ tamam: boolean }>(`/admin/cihazlar/${encodeURIComponent(id)}/${islem}`, { method: "POST", body: JSON.stringify({ yapan }) })

export const connectKodIptal = (id: string, yapan: string | null) =>
  istek<{ tamam: boolean }>(`/admin/kodlar/${encodeURIComponent(id)}/iptal`, { method: "POST", body: JSON.stringify({ yapan }) })

/** Yayındaki istemci sürümü (eski sürüm uyarısı için). Servis yoksa null. */
export async function connectSurum(): Promise<{ son: string | null; min: string | null }> {
  try {
    const j = await istek<{ son?: string | null; min?: string | null }>("/api/surum")
    return { son: j.son ?? null, min: j.min ?? null }
  } catch {
    return { son: null, min: null }
  }
}

// ------------------------------------------------------------ duyurular

export type ConnectDuyuruOnem = "bilgi" | "uyari" | "kritik"

export interface ConnectDuyuru {
  id: string
  baslik: string
  metin: string
  onem: ConnectDuyuruOnem
  /** null = tüm müşteriler */
  firmaId: string | null
  firmaAdi: string | null
  /** null = firmanın tüm kullanıcıları */
  kullanici: string | null
  olusturan: string | null
  olusturma: string
  /** null = süresiz */
  bitis: string | null
  iptal: boolean
  iptalEden: string | null
  iptalZaman: string | null
  /** Hedefteki etkin cihaz sayısı */
  hedefCihaz: number
  okuyan: number
}

export interface ConnectDuyuruOkuyan {
  cihazId: string; makine: string | null; firmaId: string; firmaAdi: string; kullanici: string
  /** null = okumadı */
  okundu: string | null
}

export interface ConnectDuyuruYeni {
  baslik: string; metin: string; onem: ConnectDuyuruOnem
  firmaId?: string | null; firmaAdi?: string | null; kullanici?: string | null
  /** 0/boş = süresiz */
  gunSayisi?: number | null
  olusturan: string | null
}

export const connectDuyurular = () => istek<ConnectDuyuru[]>("/admin/duyurular")

export const connectDuyuruEkle = (d: ConnectDuyuruYeni) =>
  istek<{ id: string }>("/admin/duyurular", { method: "POST", body: JSON.stringify(d) })

export const connectDuyuruOkuyanlar = (id: string) =>
  istek<ConnectDuyuruOkuyan[]>(`/admin/duyurular/${encodeURIComponent(id)}/okuyanlar`)

export const connectDuyuruKaldir = (id: string, yapan: string | null) =>
  istek<{ tamam: boolean }>(`/admin/duyurular/${encodeURIComponent(id)}/iptal`, { method: "POST", body: JSON.stringify({ yapan }) })
