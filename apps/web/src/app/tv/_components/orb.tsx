"use client"

/**
 * ThinkingOrb — `thinking-orbs` paketinin engine'i ile İSTENEN boyutta,
 * KESKİN çizilen orb. Paketin React component'i yalnız 64/20px destekliyor;
 * TV panosundaki çekirdek büyük olduğu için burada engine'i doğrudan
 * kullanıyoruz: `MODE_DRAWS` painter'ı `size` parametresini alıp o
 * çözünürlükte çiziyor (CSS scale DEĞİL → bulanıklık yok), DPR ile retina.
 *
 * opts OLÇEKLENMEZ: ham 64-preset değerleri noktaları keskin tutuyor;
 * yarıçapı büyütmek glow'u yumuşatıp bulanık gösteriyordu.
 */

import { useEffect, useRef } from "react"
import { MODE_DRAWS, resolvePreset } from "thinking-orbs/engine"
import type { OrbState } from "thinking-orbs"

export function ThinkingOrbCanvas({
  state,
  size = 300,
  className,
  tint,
  speedMul = 1,
}: {
  state: OrbState
  size?: number
  className?: string
  /** "r,g,b" — verilirse çizili pikseller bu renge boyanır (durum vurgusu). */
  tint?: string
  /** preset hızına ek çarpan (alarmda hızlandırmak için). */
  speedMul?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = size + "px"
    canvas.style.height = size + "px"

    const { mode, speed, opts } = resolvePreset(state, 64)
    const spd = speed * speedMul
    const draw = MODE_DRAWS[mode]

    let raf = 0
    let running = true
    const t0 = performance.now()

    const loop = () => {
      if (!running) return
      const t = ((performance.now() - t0) / 1000) * spd
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      draw(ctx, size, t, true, opts)
      if (tint) {
        // Beyaz noktaları duruma göre renklendir; alpha (glow) korunur.
        ctx.globalCompositeOperation = "source-atop"
        ctx.fillStyle = `rgb(${tint})`
        ctx.fillRect(0, 0, size, size)
        ctx.globalCompositeOperation = "source-over"
      }
      raf = requestAnimationFrame(loop)
    }

    // Sekme görünmezken dur (CLAUDE.md #2 — kaynak tasarrufu)
    const onVis = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf) }
      else if (!running)   { running = true; loop() }
    }
    document.addEventListener("visibilitychange", onVis)
    loop()

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [state, size, tint, speedMul])

  return <canvas ref={ref} className={className} />
}
