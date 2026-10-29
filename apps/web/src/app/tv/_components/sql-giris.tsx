"use client"

/**
 * SQL hatalı giriş — veri kancası + yeni denemede açılan uyarı (29.10.2026).
 *
 * Veri Hub'ın dakikalık toplayıcısından (`/api/tv/sql-giris`, mobil Güvenlik
 * sekmesiyle aynı). Kart `infra-cards.tsx`'te (SqlGirisCard).
 *
 * ── Uyarı ne zaman çıkar? ─────────────────────────────────────────────
 * Bir satırın (kaynak + kullanıcı + neden) `son` zamanı ilerlediyse yeni
 * deneme var demek. İlk yüklemede uyarı yok — ekran açıldığında geçmiş
 * yağmasın. "Veritabanı açılamadı" uyarı üretmez: yanlış ayarlı müşteri
 * programı dakikada bir deniyor, uyarı ekrandan hiç kalkmazdı; kartta görünür.
 *
 * Güvenlik seviyesi (sa parolası, tarama, yoğun deneme, dış adres) kırmızı ve
 * 10 dk ekranda kalır; diğerleri kehribar/gri, 90 sn. En çok 3 uyarı üst üste.
 * Push susturması TV'yi etkilemez — susturma telefona gelen bildirim içindir.
 */

import { useEffect, useRef, useState } from "react"
import type { SqlGirisOzeti } from "@/lib/sql-giris-ozet"

const POLL_MS = 30_000
const GUVENLIK_SURE_MS = 10 * 60_000
const DIGER_SURE_MS = 90_000
const EN_COK = 3

const TXT     = "#D4D4D8"
const TXT_DIM = "#8B8B93"
const AMBER   = "#FBBF24"
const RED     = "#F87171"

export type SqlGirisVeri = SqlGirisOzeti
type Satir = SqlGirisOzeti["satirlar"][number]

export interface SqlGirisUyarisi {
  id: string
  seviye: Satir["seviye"]
  kullanici: string
  firma: string | null
  nedenAd: string
  kaynak: string
  /** Bu turda gelen yeni deneme sayısı */
  yeni: number
  son: string
  bitis: number
}

const anahtar = (x: Satir) => `${x.ip}|${x.kullanici}|${x.neden}|${x.veritabani ?? ""}`

/** Özet + yeni denemelerden üretilen uyarılar. Hata/erişim yoksa veri null. */
export function useSqlGiris(): { veri: SqlGirisVeri | null; uyarilar: SqlGirisUyarisi[] } {
  const [veri, setVeri] = useState<SqlGirisVeri | null>(null)
  const [uyarilar, setUyarilar] = useState<SqlGirisUyarisi[]>([])
  const onceki = useRef<Map<string, { son: number; adet: number }> | null>(null)

  useEffect(() => {
    let iptal = false
    const yukle = async () => {
      try {
        const r = await fetch("/api/tv/sql-giris", { cache: "no-store" })
        const j = (await r.json()) as SqlGirisVeri | { ok: false }
        if (iptal || !("satirlar" in j)) return
        setVeri(j)

        const simdi = Date.now()
        const yeniHarita = new Map(j.satirlar.map((x) => [anahtar(x), { son: Date.parse(x.son), adet: x.adet }]))
        const eski = onceki.current
        onceki.current = yeniHarita
        if (!eski) return

        const gelen: SqlGirisUyarisi[] = []
        for (const x of j.satirlar) {
          if (x.neden === "veritabani_acilamadi") continue
          const k = anahtar(x)
          const o = eski.get(k)
          const son = Date.parse(x.son)
          if (o && son <= o.son) continue
          gelen.push({
            id: `${k}|${son}`,
            seviye: x.seviye,
            kullanici: x.kullanici,
            firma: x.firma,
            nedenAd: x.nedenAd,
            kaynak: x.kaynak,
            // 24 saatlik pencereden düşen kova sayıyı azaltabilir — en az 1
            yeni: Math.max(1, x.adet - (o?.adet ?? 0)),
            son: x.son,
            bitis: simdi + (x.seviye === "guvenlik" ? GUVENLIK_SURE_MS : DIGER_SURE_MS),
          })
        }
        setUyarilar((l) => [...gelen, ...l.filter((u) => u.bitis > simdi && !gelen.some((g) => g.id === u.id))].slice(0, EN_COK))
      } catch {
        /* ağ hatası — bir sonraki turda */
      }
    }
    void yukle()
    const t = setInterval(() => void yukle(), POLL_MS)
    // Süresi dolan uyarıları veri beklemeden kaldır
    const s = setInterval(() => setUyarilar((l) => (l.some((u) => u.bitis <= Date.now()) ? l.filter((u) => u.bitis > Date.now()) : l)), 5_000)
    return () => {
      iptal = true
      clearInterval(t)
      clearInterval(s)
    }
  }, [])

  return { veri, uyarilar }
}

/**
 * Ekranın alt ortasında hatalı giriş uyarıları. Arıza bandıyla (üst orta)
 * aynı dil: koyu zemin, ince renkli çerçeve; güvenlik uyarısı nabız atar.
 */
export function SqlGirisUyarilari({ uyarilar }: { uyarilar: SqlGirisUyarisi[] }) {
  if (uyarilar.length === 0) return null
  return (
    <div className="pointer-events-none absolute bottom-8 left-1/2 z-30 flex -translate-x-1/2 select-none flex-col items-center gap-2">
      {uyarilar.map((u) => {
        const renk = u.seviye === "guvenlik" ? RED : u.seviye === "destek" ? AMBER : TXT_DIM
        const saat = new Date(u.son).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
        return (
          <div
            key={u.id}
            className={`flex items-center gap-4 rounded-[5px] px-5 py-3${u.seviye === "guvenlik" ? " tv-alarm" : ""}`}
            style={{
              background: "rgba(14,14,18,0.92)",
              border: `1px solid ${renk}`,
              boxShadow: u.seviye === "guvenlik" ? "0 0 34px rgba(239,68,68,0.16)" : undefined,
            }}
          >
            <span className="text-[10px] font-bold uppercase" style={{ color: renk, letterSpacing: "0.28em" }}>
              {u.seviye === "guvenlik" ? "SQL güvenlik" : "SQL hatalı giriş"}
            </span>
            <span className="h-4 w-px" style={{ background: "rgba(255,255,255,0.14)" }} />
            <span className="text-[14px] font-semibold" style={{ color: TXT }}>
              {u.kullanici}
              {u.firma && <span className="font-normal" style={{ color: TXT_DIM }}> · {u.firma}</span>}
            </span>
            <span className="text-[12px]" style={{ color: TXT_DIM }}>
              {u.nedenAd} · {u.kaynak}
            </span>
            <span className="text-[12px] font-semibold tabular-nums" style={{ color: renk }}>
              {u.yeni > 1 ? `${u.yeni} deneme · ` : ""}{saat}
            </span>
          </div>
        )
      })}
    </div>
  )
}
