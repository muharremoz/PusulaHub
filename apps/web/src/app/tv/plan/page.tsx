"use client"

/**
 * /tv/plan — sunucu kat planı.
 *
 * Her sunucu zemin üstünde bir blok. Renk durumu, YÜKSEKLİK işlemci yükünü,
 * ALAN ise sunucunun büyüklüğünü (oturum sayısı / bellek) anlatıyor. Bir
 * bloğa tıklayınca yanında detay kartı açılıyor.
 *
 * ── Neden ayrı sayfa? ──────────────────────────────────────────────────
 * /tv "ne bozuk?" sorusuna bakıyor: monitörler, alarmlar, dallar. Bu sayfa
 * "yük nerede?" sorusuna bakıyor — hangi makine dolu, hangisi boş. Aynı
 * ekrana sığmayacak iki farklı okuma.
 *
 * ── three.js React'in dışında ──────────────────────────────────────────
 * Sahne `_scene.ts` içinde imperatif duruyor (bkz. oradaki not: r3f bu
 * projede kullanılmıyor). Bu bileşen yalnız kabı veriyor, veriyi aktarıyor
 * ve seçim geri çağrısını dinliyor. Her karede React render'ı olmuyor.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { PlanSahne, yerlesimKur, type PlanDurum } from "./_scene"
import { useServerList, type ServerRow } from "../_components/use-server-metrics"
import { Clock } from "../_components/clock"
import { BrandMark } from "../_components/brand-mark"

const PAGE    = "#0B0B0D"
const TXT     = "#D4D4D8"
const TXT_DIM = "#8B8B93"

const DURUM_RENK: Record<PlanDurum, string> = {
  online:   "#34D399",
  warning:  "#FBBF24",
  offline:  "#F87171",
  bilinmez: "#52525B",
}

const DURUM_ETIKET: Record<PlanDurum, string> = {
  online:   "Çalışıyor",
  warning:  "Uyarı",
  offline:  "Erişilemiyor",
  bilinmez: "Bilinmiyor",
}

/**
 * Sunucunun planda kapladığı alanı belirleyen "büyüklük".
 *
 * Oturum sayısı varsa o esas: terminal sunucuları asıl yükü taşıyor ve
 * planda büyük görünmeleri doğru. Oturum bildirmeyen makinelerde bellek
 * kullanımına düşülüyor — hiç değilse boş bir kutu ile dolu bir kutuyu
 * ayırıyor.
 */
function buyukluk(s: ServerRow): number {
  if (typeof s.activeSessions === "number") return Math.min(100, s.activeSessions * 12)
  return s.ram
}

function durumOf(s: ServerRow): PlanDurum {
  if (s.status === "online" || s.status === "warning" || s.status === "offline") return s.status
  return "bilinmez"
}

export default function TvPlanPage() {
  const kapRef   = useRef<HTMLDivElement>(null)
  const sahneRef = useRef<PlanSahne | null>(null)
  const [secim, setSecim] = useState<{ id: string; ekranX: number; ekranY: number } | null>(null)

  const sunucular = useServerList()

  const bloklar = useMemo(
    () =>
      yerlesimKur(
        sunucular.map((s) => ({
          id: s.id, ad: s.name, durum: durumOf(s), yuk: s.cpu, buyukluk: buyukluk(s),
        })),
      ),
    [sunucular],
  )

  /* Sahneyi bir kez kur, sayfadan çıkarken yok et */
  useEffect(() => {
    if (!kapRef.current) return
    const s = new PlanSahne(kapRef.current)
    s.onSecim = setSecim
    sahneRef.current = s
    const ro = new ResizeObserver(() => s.boyutla())
    ro.observe(kapRef.current)
    return () => { ro.disconnect(); s.yokEt(); sahneRef.current = null }
  }, [])

  /* Veri değişince blokları güncelle */
  useEffect(() => { sahneRef.current?.guncelle(bloklar) }, [bloklar])

  const seciliSunucu = secim ? sunucular.find((s) => s.id === secim.id) ?? null : null

  const sayim = useMemo(() => {
    const c: Record<PlanDurum, number> = { online: 0, warning: 0, offline: 0, bilinmez: 0 }
    for (const s of sunucular) c[durumOf(s)]++
    return c
  }, [sunucular])

  return (
    <div className="relative h-screen w-full overflow-hidden" style={{ background: PAGE, colorScheme: "dark" }}>
      {/* Sahne kabı — three.js canvas'ı ve etiket katmanı buraya giriyor */}
      <div ref={kapRef} className="absolute inset-0" />

      <BrandMark />
      <Clock />

      {/* Başlık */}
      <div className="pointer-events-none absolute left-8 top-28 select-none">
        <div className="text-[10px] font-medium uppercase" style={{ color: TXT_DIM, letterSpacing: "0.26em" }}>
          Sunucu Kat Planı
        </div>
        <div className="mt-1 text-[12px]" style={{ color: TXT_DIM }}>
          Yükseklik işlemci yükü · alan sunucu büyüklüğü
        </div>
      </div>

      {/* Boş durum — sunucu listesi gelmediyse sessiz bir kutu bırakma */}
      {sunucular.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[12px] uppercase" style={{ color: TXT_DIM, letterSpacing: "0.16em" }}>
            sunucu listesi bekleniyor…
          </span>
        </div>
      )}

      {/* Detay kartı — seçili bloğun yanında */}
      {secim && seciliSunucu && (
        <div
          className="absolute z-10 w-[248px] rounded-[10px] p-3.5"
          style={{
            left: Math.min(Math.max(12, secim.ekranX + 18), window.innerWidth - 260),
            top:  Math.min(Math.max(12, secim.ekranY - 40), window.innerHeight - 240),
            background: "rgba(20,20,23,0.94)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold" style={{ color: "#FFFFFF" }}>
                {seciliSunucu.name}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: DURUM_RENK[durumOf(seciliSunucu)] }}
                />
                <span className="text-[11px]" style={{ color: DURUM_RENK[durumOf(seciliSunucu)] }}>
                  {DURUM_ETIKET[durumOf(seciliSunucu)]}
                </span>
              </div>
            </div>
            <button
              onClick={() => sahneRef.current?.secimiTemizle()}
              className="shrink-0 rounded-[4px] px-1.5 text-[13px] leading-5 transition-colors hover:bg-white/10"
              style={{ color: TXT_DIM }}
            >
              ×
            </button>
          </div>

          <div className="my-2.5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }} />

          <Satir ad="İşlemci" deger={`%${seciliSunucu.cpu}`} oran={seciliSunucu.cpu} />
          <Satir ad="Bellek"  deger={`%${seciliSunucu.ram}`} oran={seciliSunucu.ram} />
          <Satir ad="Disk"    deger={`%${seciliSunucu.disk}`} oran={seciliSunucu.disk} />

          <div className="my-2.5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }} />

          {/*  Oturum: undefined ile 0 farklı şeyler — ajan bildirmiyorsa
               "—", gerçekten kimse yoksa "0".                           */}
          <DuzSatir
            ad="Açık oturum"
            deger={typeof seciliSunucu.activeSessions === "number" ? String(seciliSunucu.activeSessions) : "—"}
          />
          <DuzSatir ad="Çalışma süresi" deger={seciliSunucu.uptime || "—"} />
          <DuzSatir ad="IP" deger={seciliSunucu.ip || "—"} mono />
        </div>
      )}

      {/* Açıklama şeridi */}
      <div className="pointer-events-none absolute bottom-8 left-8 flex select-none items-center gap-5">
        {(["online", "warning", "offline", "bilinmez"] as PlanDurum[]).map((d) => (
          <div key={d} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: DURUM_RENK[d] }} />
            <span className="text-[11px]" style={{ color: TXT_DIM }}>
              {DURUM_ETIKET[d]}
            </span>
            <span className="font-mono text-[11px] font-semibold tabular-nums" style={{ color: TXT }}>
              {sayim[d]}
            </span>
          </div>
        ))}
      </div>

      {/* Kullanım ipucu — TV'de kimse okumasa da PC'den bakan bilsin */}
      <div className="pointer-events-none absolute bottom-8 right-8 select-none text-[10px]" style={{ color: TXT_DIM }}>
        sürükle → döndür · tıkla → detay
      </div>
    </div>
  )
}

/* ── Kart satırları ─────────────────────────────────────────────── */

function Satir({ ad, deger, oran }: { ad: string; deger: string; oran: number }) {
  const renk = oran >= 90 ? "#F87171" : oran >= 80 ? "#FBBF24" : TXT
  return (
    <div className="py-[3px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px]" style={{ color: TXT }}>{ad}</span>
        <span className="font-mono text-[11px] font-semibold tabular-nums" style={{ color: renk }}>
          {deger}
        </span>
      </div>
      <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.10)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, oran))}%`, background: renk }} />
      </div>
    </div>
  )
}

function DuzSatir({ ad, deger, mono }: { ad: string; deger: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="text-[11px]" style={{ color: TXT }}>{ad}</span>
      <span
        className={`shrink-0 text-[11px] font-semibold tabular-nums${mono ? " font-mono" : ""}`}
        style={{ color: TXT_DIM }}
      >
        {deger}
      </span>
    </div>
  )
}
