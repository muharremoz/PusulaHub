"use client"

/**
 * /tv/plan — sunucu kat planı.
 *
 * ── Şu anki adım ───────────────────────────────────────────────────────
 * Plaka + bordür + ODALAR. Her oda `/tv` ağacındaki bir gövde
 * (Datacenter, Portlar, Uygulamalar, DNS, Döviz Kaynakları); odanın
 * genişliği o gövdedeki monitör sayısıyla orantılı, adı da oda yüzeyine
 * yatık yazılıyor.
 *
 * Durum renkleri, seçim ve detay kartı henüz yok — sıradaki adımlar.
 *
 * ── Gruplama nereden geliyor? ──────────────────────────────────────────
 * `_shared/monitor-groups` ile ORTAK. /tv ağacı da aynı tablodan
 * besleniyor, yani Kuma'ya monitör eklendiğinde iki ekran da aynı yere
 * koyuyor. Burada ayrı bir eşleme tutmak ikisini sessizce ayrıştırırdı.
 *
 * three.js React'in dışında, `_scene.ts` içinde imperatif duruyor (bkz.
 * oradaki not: r3f bu projede kullanılmıyor). Bu bileşen yalnız kabı
 * veriyor, veriyi aktarıyor ve sahnenin ömrünü yönetiyor.
 */

import { useEffect, useMemo, useRef } from "react"
import { PlanSahne, type PlanOda } from "./_scene"
import { groupIntoTrees } from "../_shared/monitor-groups"
import { useTvData } from "../_shared/use-tv-data"
import { Clock } from "../_components/clock"
import { BrandMark } from "../_components/brand-mark"

const PAGE    = "#0B0B0D"
const TXT_DIM = "#8B8B93"

export default function TvPlanPage() {
  const kapRef   = useRef<HTMLDivElement>(null)
  const sahneRef = useRef<PlanSahne | null>(null)

  const { data } = useTvData()

  const odalar = useMemo<PlanOda[]>(() => {
    const monitors = data?.monitors ?? []
    return groupIntoTrees(monitors).map((g) => ({
      key:  g.def.key,
      ad:   g.def.label,
      adet: g.monitors.length,
    }))
  }, [data])

  /* Sahneyi bir kez kur, sayfadan çıkarken yok et */
  useEffect(() => {
    if (!kapRef.current) return
    const s = new PlanSahne(kapRef.current)
    sahneRef.current = s
    const ro = new ResizeObserver(() => s.boyutla())
    ro.observe(kapRef.current)
    return () => { ro.disconnect(); s.yokEt(); sahneRef.current = null }
  }, [])

  /* Veri değişince odaları yenile */
  useEffect(() => { sahneRef.current?.guncelle(odalar) }, [odalar])

  return (
    <div
      className="relative h-screen w-full overflow-hidden"
      style={{ background: PAGE, colorScheme: "dark" }}
    >
      {/* Sahne kabı — three.js canvas'ı buraya giriyor */}
      <div ref={kapRef} className="absolute inset-0" />

      <BrandMark />
      <Clock />

      <div className="pointer-events-none absolute left-8 top-28 select-none">
        <div
          className="text-[10px] font-medium uppercase"
          style={{ color: TXT_DIM, letterSpacing: "0.26em" }}
        >
          Sunucu Kat Planı
        </div>
      </div>

      {/*  Boş durum: Kuma'ya ulaşılamadıysa sessiz bir plaka bırakma.   */}
      {odalar.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className="font-mono text-[12px] uppercase"
            style={{ color: TXT_DIM, letterSpacing: "0.16em" }}
          >
            monitör verisi bekleniyor…
          </span>
        </div>
      )}

      <div
        className="pointer-events-none absolute bottom-8 right-8 select-none text-[10px]"
        style={{ color: TXT_DIM }}
      >
        sürükle → döndür
      </div>
    </div>
  )
}
