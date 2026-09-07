"use client"

/**
 * /tv/plan — sunucu kat planı.
 *
 * ── Şu anki adım ───────────────────────────────────────────────────────
 * BOŞ KAT: zemin ve dört duvar. Odalar (sunucu blokları), etiketler ve
 * detay kartı henüz yok — mekân doğru görünsün diye baştan kuruluyor.
 *
 * three.js React'in dışında, `_scene.ts` içinde imperatif duruyor (bkz.
 * oradaki not: r3f bu projede kullanılmıyor). Bu bileşen yalnız kabı
 * veriyor ve sahnenin ömrünü yönetiyor; her karede React render'ı olmuyor.
 */

import { useEffect, useRef } from "react"
import { PlanSahne } from "./_scene"
import { Clock } from "../_components/clock"
import { BrandMark } from "../_components/brand-mark"

const PAGE    = "#0B0B0D"
const TXT_DIM = "#8B8B93"

export default function TvPlanPage() {
  const kapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!kapRef.current) return
    const s = new PlanSahne(kapRef.current)
    const ro = new ResizeObserver(() => s.boyutla())
    ro.observe(kapRef.current)
    return () => { ro.disconnect(); s.yokEt() }
  }, [])

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

      <div
        className="pointer-events-none absolute bottom-8 right-8 select-none text-[10px]"
        style={{ color: TXT_DIM }}
      >
        sürükle → döndür
      </div>
    </div>
  )
}
