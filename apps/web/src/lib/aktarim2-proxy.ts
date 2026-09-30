/**
 * Hub → Aktarım 2 servisi (services/pusula-aktarim2) proxy helper'ı.
 *
 * Eski web aktarımının proxy'sinden (aktarim-proxy.ts) BAĞIMSIZ — plan:
 * docs/aktarim2/PLAN.md. Durum servisin SQLite'ında; Hub yalnız admin arayüzü.
 *
 * Env:
 *   AKTARIM2_SERVICE_URL  — varsayılan https://aktarim.pusulanet.net/v2 (nginx → 127.0.0.1:5100;
 *                           Hub eski servise de böyle ulaşıyor, 10.15.2.6'da 5000/5100 dışa kapalı)
 *   TRANSFER_SERVICE_KEY  — eski servisle aynı ortak anahtar
 */

const BASE = process.env.AKTARIM2_SERVICE_URL ?? "https://aktarim.pusulanet.net/v2"
const KEY = process.env.TRANSFER_SERVICE_KEY ?? ""

export type Aktarim2Durum =
  | "bekliyor" | "bagli" | "yukleniyor" | "aktariliyor" | "tamamlandi" | "hata" | "iptal" | "suresi_doldu"

export interface Aktarim2Oturum {
  id: string
  firmaId: string
  firmaAdi: string
  durum: Aktarim2Durum
  notlar: string | null
  olusturan: string | null
  olusturma: string
  bitis: string
  sonGiris: string | null
  makine: string | null
  istemciSurum: string | null
  kesifZamani: string | null
  hata: string | null
}

/** İstemcinin gönderdiği keşif raporu (apps/aktarim-istemci Kesif.cs ile aynı biçim). */
export interface Aktarim2Kesif {
  zaman: string
  makine: string
  sql: { sunucu: string; kaynak: string; makineAdi: string; yerel: boolean; surum: string; surumu: string; sikistirmaVar: boolean; yedekKlasoru: string | null }
  veritabanlari: {
    ad: string; durum: string; kurtarmaModeli: string; veriMb: number; logMb: number; sonYedek: string | null
    tur: "firma" | "transfer" | "diger" | "sirket"; guvenlikteVar: boolean; sirketAdlari: string[]; prgTur: string | null; kod: string | null
  }[]
  guvenlik: Record<string, unknown>[]
  resimKlasorleri: { yol: string; var: boolean; dosyaSayisi: number; boyutMb: number; eksik: boolean; kullananlar: string[] }[]
  programKlasorleri: { yol: string; exeler: string[]; parametreler: { ad: string; dataKodu: string | null }[] }[]
  uyarilar: string[]
}

export interface Aktarim2Detay extends Aktarim2Oturum {
  programlar: { name: string }[]
  kesif: Aktarim2Kesif | null
}

/** Servise giden hedef sunucu bilgileri — istemciye asla dönmez. */
export interface Aktarim2Hedef {
  ad: string
  ip: string
  /** Windows yöneticisi (SMB kopyası için) */
  kullanici: string | null
  sifre: string | null
  /** SQL login (RESTORE için) — yalnız SQL sunucusunda */
  sqlKullanici?: string | null
  sqlSifre?: string | null
}

export interface Aktarim2Olustur {
  firmaId: string
  firmaAdi: string
  hedefler: { sql: Aktarim2Hedef | null; depo: Aktarim2Hedef | null; rdp: Aktarim2Hedef | null }
  programlar: { name: string; exeName: string | null; paramFileName: string | null; programCode: string | null }[]
  gunSayisi: number
  notlar: string | null
  olusturan: string | null
}

async function cagir<T>(yol: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${yol}`, {
    ...init,
    headers: { "X-Service-Key": KEY, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    cache: "no-store",
  })
  const metin = await r.text()
  let j: unknown = null
  try { j = metin ? JSON.parse(metin) : null } catch { /* JSON değil */ }
  if (!r.ok) throw new Error((j as { hata?: string } | null)?.hata ?? `Aktarım 2 servisi: HTTP ${r.status}`)
  return j as T
}

export const oturumlar = () => cagir<Aktarim2Oturum[]>("/admin/oturumlar")
export const oturum = (id: string) => cagir<Aktarim2Detay>(`/admin/oturumlar/${encodeURIComponent(id)}`)
export const olustur = (g: Aktarim2Olustur) =>
  cagir<{ id: string; kod: string }>("/admin/oturumlar", { method: "POST", body: JSON.stringify(g) })
export const iptal = (id: string) =>
  cagir<{ tamam: true }>(`/admin/oturumlar/${encodeURIComponent(id)}/iptal`, { method: "POST" })
export const sil = (id: string) =>
  cagir<{ tamam: true }>(`/admin/oturumlar/${encodeURIComponent(id)}`, { method: "DELETE" })
