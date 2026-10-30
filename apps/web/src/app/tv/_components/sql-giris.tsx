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

    /*  ?mock=1 (tasarım görünümü): uyarının görünüşüne bakılabilsin diye
     *  iki örnek uyarı. Gerçek ekranda bu blok çalışmaz.                */
    if (new URLSearchParams(window.location.search).get("mock") === "1") {
      const simdi = Date.now()
      setUyarilar([
        { id: "ornek-1", seviye: "guvenlik", kullanici: "sa", firma: null, nedenAd: "parola yanlış", kaynak: "185.220.101.4 · dış adres", yeni: 12, son: new Date(simdi).toISOString(), bitis: simdi + GUVENLIK_SURE_MS },
        { id: "ornek-2", seviye: "destek", kullanici: "1963.ela1", firma: "ELA KUYUMCULUK", nedenAd: "parola yanlış", kaynak: "Terminal 2", yeni: 3, son: new Date(simdi - 60_000).toISOString(), bitis: simdi + GUVENLIK_SURE_MS },
      ])
    }
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

/** Sağdaki kart ızgarasının genişliği — uyarılar onun solundaki alanda ortalanır */
const KART_IZGARASI_W = 860

/**
 * Hatalı giriş uyarıları — kart ızgarasının solundaki alanın ALT ortasında.
 * Arıza bandıyla aynı dil: koyu zemin, renkli ince çerçeve, ince büyük yazı;
 * güvenlik uyarısı nabız atar. (Önce ekranın tam alt ortasındaydı ve
 * kartlar sağa genişleyince PUSULA yazısının üstüne biniyordu.)
 */
export function SqlGirisUyarilari({ uyarilar }: { uyarilar: SqlGirisUyarisi[] }) {
  if (uyarilar.length === 0) return null
  return (
    <div
      className="pointer-events-none absolute bottom-8 z-30 flex -translate-x-1/2 select-none flex-col items-stretch gap-2.5"
      style={{ left: `calc((100% - ${KART_IZGARASI_W}px) / 2)`, width: "min(620px, calc(100% - 900px))" }}
    >
      {uyarilar.map((u) => {
        const guvenlik = u.seviye === "guvenlik"
        const renk = guvenlik ? RED : u.seviye === "destek" ? AMBER : TXT_DIM
        const saat = new Date(u.son).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
        return (
          <div
            key={u.id}
            className={`flex items-center gap-5 rounded-[10px] py-3 pr-5 pl-4${guvenlik ? " tv-sql-uyari" : ""}`}
            style={{
              background: "rgba(14,14,18,0.92)",
              border: `1px solid ${renk}`,
              borderLeftWidth: 3,
              boxShadow: guvenlik ? "0 0 34px rgba(239,68,68,0.16)" : undefined,
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="relative flex size-[7px] shrink-0">
                  {guvenlik && <span className="absolute inset-0 animate-ping rounded-full opacity-70" style={{ background: renk }} />}
                  <span className="relative size-[7px] rounded-full" style={{ background: renk, boxShadow: `0 0 8px ${renk}` }} />
                </span>
                <span className="text-[9px] font-bold uppercase" style={{ color: renk, letterSpacing: "0.26em" }}>
                  {guvenlik ? "SQL güvenlik" : "SQL hatalı giriş"}
                </span>
              </div>
              <div className="mt-1.5 flex min-w-0 items-baseline gap-2">
                <span className="truncate text-[24px] font-extralight leading-none tracking-[-0.01em] text-zinc-50">{u.kullanici}</span>
                {u.firma && <span className="truncate text-[12px]" style={{ color: TXT_DIM }}>{u.firma}</span>}
              </div>
              <div className="mt-1 truncate text-[11px]" style={{ color: TXT }}>
                {u.nedenAd}<span style={{ color: TXT_DIM }}> · {u.kaynak}</span>
              </div>
            </div>

            <div className="shrink-0 border-l pl-5 text-right" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
              <div className="text-[28px] font-extralight leading-none tabular-nums" style={{ color: renk }}>{u.yeni}</div>
              <div className="mt-1.5 text-[9px] uppercase tabular-nums" style={{ color: TXT_DIM, letterSpacing: "0.18em" }}>
                deneme · {saat}
              </div>
            </div>
          </div>
        )
      })}
      <style>{`
        @keyframes tv-sql-uyari { 0%,100% { box-shadow: 0 0 20px rgba(239,68,68,0.12) } 50% { box-shadow: 0 0 44px rgba(239,68,68,0.38) } }
        .tv-sql-uyari { animation: tv-sql-uyari 1.6s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .tv-sql-uyari { animation: none } }
      `}</style>
    </div>
  )
}
