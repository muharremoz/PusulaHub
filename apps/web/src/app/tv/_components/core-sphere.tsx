"use client"

/**
 * Merkezdeki canlı küre — canvas 2D, sıfır bağımlılık.
 *
 * Küre bir NOKTA BULUTU. Noktalar rastgele titremiyor; hepsi tek bir dalga
 * fonksiyonundan besleniyor:
 *
 *     r = 1 + genlik · sin(3·enlem + 2·boylam + t)
 *
 * Aynı enlem/boylam bandındaki noktalar aynı anda içeri-dışarı gidiyor, bu
 * yüzden hareket "koordineli dalgalanma" gibi okunuyor — rastgele parazit
 * gibi değil. Küre ayrıca Y ekseninde yavaşça dönüyor.
 *
 * Derinlik: ortografik izdüşüm. Öne bakan noktalar daha parlak ve büyük,
 * arkadakiler sönük ve küçük — kürelik hissi buradan geliyor.
 *
 * ── Fare tepkisi ───────────────────────────────────────────────────────
 * İmlecin yakınındaki noktalar dışarı kabarır, parlar ve büyür; etki
 * Gauss eğrisiyle söner, o yüzden kenarı belli bir daire değil yumuşak bir
 * kabarma olur. Yalnız ÖNE bakan noktalar tepki verir (arkadakiler imlecin
 * altında değil, arkasında). Küre ayrıca imlece doğru hafifçe eğilir —
 * parallaks hissi.
 *
 * İmleç dinleme `window` üzerinden: küre katmanı `pointer-events-none`
 * olduğu için kendi elementinden olay alamaz, ama koordinatı kendi
 * kutusuna göre çevirebilir. Kamera ölçeği (CSS transform) hesaba katılıyor
 * — `rect.width / w` oranıyla düzeltiliyor, yoksa odakta imleç kayardı.
 *
 * ── Kaynak tasarrufu (CLAUDE.md #2) ────────────────────────────────────
 * 30 fps'e sabitli, sekme görünmezken rAF tamamen duruyor. Nokta sayısı
 * kutu boyutuna göre ölçekleniyor — küçük ekranda boşuna nokta çizilmiyor.
 */

import { useEffect, useRef } from "react"
import type { UiStatus } from "../_shared/types"

const TARGET_FPS = 30
const FRAME_MS   = 1000 / TARGET_FPS

/**
 * Kürenin yarıçapı = kutunun kısa kenarı × bu çarpan. Dallar da bunu kullanır.
 *
 * Tek ayar noktası: hem nokta bulutu hem fare etki alanı hem de gövdelerin
 * uzaklığı (`nexus.tsx` içindeki `D`) buradan türüyor. Yani çarpanı
 * küçültmek küreyi küçültürken dalların küreye olan MESAFESİNİ korur —
 * dallar da içeri gelir, arada boşluk açılmaz.
 */
export const SPHERE_R_FACTOR = 0.30

/* ── Fare tepkisi ayarları ── */
const HOVER_R_FACTOR = 0.45   // etki yarıçapı = kürenin yarıçapı × bu
const HOVER_AMP      = 0.17   // ne kadar dışarı kabarsın (yarıçapın oranı)
const HOVER_TILT     = 0.20   // imlece doğru eğilme (radyan)

interface Tone {
  /** "r,g,b" — rgba() içinde kullanılıyor */
  rgb:   string
  /** dalga hızı çarpanı */
  speed: number
  /** dalga genliği */
  amp:   number
}

const TONE: Record<UiStatus, Tone> = {
  online:  { rgb: "56,189,248",  speed: 1.0, amp: 0.055 },
  warning: { rgb: "251,191,36",  speed: 1.7, amp: 0.075 },
  offline: { rgb: "239,68,68",   speed: 2.8, amp: 0.105 },
}

interface Point {
  /** birim küre üzerindeki taban konum */
  x: number; y: number; z: number
  /** dalga fazı — enlem/boylamdan türetilmiş, sabit */
  phase: number
}

/** Fibonacci küresi — noktaları eşit dağıtır, kutuplarda yığılma olmaz. */
function buildPoints(n: number): Point[] {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const out: Point[] = []
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    const x = Math.cos(theta) * r
    const z = Math.sin(theta) * r
    // Dalga fazı: enlem (y) ve boylam (theta) birlikte → bantlar halinde dalga
    out.push({ x, y, z, phase: Math.asin(y) * 3 + theta * 2 })
  }
  return out
}

interface Props {
  status: UiStatus
  className?: string
}

export function CoreSphere({ status, className }: Props) {
  const hostRef   = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  /** Döngü her karede okusun diye ref — durum değişince yeniden kurulmasın */
  const statusRef = useRef<UiStatus>(status)
  statusRef.current = status

  useEffect(() => {
    const host   = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let w = 0, h = 0, dpr = 1
    let points: Point[] = []

    const resize = () => {
      const r = host.getBoundingClientRect()
      // Kutu ölçeklenmiş olabilir (kamera) — mantıksal boyut style'dan gelmeli
      w = Math.max(1, Math.round(host.offsetWidth))
      h = Math.max(1, Math.round(host.offsetHeight))
      void r
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width  = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width  = w + "px"
      canvas.style.height = h + "px"
      // Nokta sayısı alana göre — küçük kutuda boşuna çizim yok
      const target = Math.round(Math.min(760, Math.max(220, (w * h) / 620)))
      if (points.length !== target) points = buildPoints(target)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    /* ── İmleç ── */
    const ptr = { x: 0, y: 0, inside: false, strength: 0 }
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      // Kamera ölçeğini geri al: ekran px → canvas mantıksal px
      const lx = (e.clientX - r.left) * (w / r.width)
      const ly = (e.clientY - r.top)  * (h / r.height)
      ptr.x = lx
      ptr.y = ly
      // Kürenin biraz dışına kadar tepki versin
      const cx = w / 2, cy = h / 2
      const R  = Math.min(w, h) * SPHERE_R_FACTOR
      const d  = Math.hypot(lx - cx, ly - cy)
      ptr.inside = d < R * 1.5
    }
    const onLeave = () => { ptr.inside = false }
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerleave", onLeave)

    let raf = 0
    let last = performance.now()
    let acc  = 0
    let t    = 0
    let tiltX = 0, tiltY = 0
    let running = true

    const draw = (now: number) => {
      if (!running) return
      raf = requestAnimationFrame(draw)

      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      acc += dt * 1000
      if (acc < FRAME_MS) return
      acc = 0

      const tone = TONE[statusRef.current]
      t += dt * tone.speed

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const cx = w / 2
      const cy = h / 2
      const R  = Math.min(w, h) * SPHERE_R_FACTOR

      // Hover gücü yumuşak geçsin — girip çıkarken sıçramasın
      const k = 1 - Math.pow(0.004, dt)
      ptr.strength += ((ptr.inside ? 1 : 0) - ptr.strength) * k

      // İmlece doğru hafif eğilme (parallaks)
      const wantTiltY = ptr.inside ? ((ptr.x - cx) / (R * 1.5)) * HOVER_TILT : 0
      const wantTiltX = ptr.inside ? ((ptr.y - cy) / (R * 1.5)) * HOVER_TILT : 0
      tiltY += (wantTiltY - tiltY) * k
      tiltX += (wantTiltX - tiltX) * k

      // Yumuşak iç hale — kürenin "dolu" hissetmesi için
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.15)
      glow.addColorStop(0,   `rgba(${tone.rgb},${(0.16 + 0.10 * ptr.strength).toFixed(3)})`)
      glow.addColorStop(0.6, `rgba(${tone.rgb},0.05)`)
      glow.addColorStop(1,   `rgba(${tone.rgb},0)`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.15, 0, Math.PI * 2)
      ctx.fill()

      // Y ekseninde yavaş dönüş + imleç eğimi
      const ry = t * 0.22 + tiltY
      const cosY = Math.cos(ry), sinY = Math.sin(ry)
      const cosX = Math.cos(tiltX), sinX = Math.sin(tiltX)

      const hoverR2 = (R * HOVER_R_FACTOR) * (R * HOVER_R_FACTOR)

      for (let i = 0; i < points.length; i++) {
        const p = points[i]
        // Koordineli dalga — komşu noktalar birlikte hareket eder
        const wave = Math.sin(p.phase + t * 1.6)
        const rr0 = 1 + tone.amp * wave

        // Y ekseni etrafında döndür
        const x1 = p.x * cosY + p.z * sinY
        const z1 = -p.x * sinY + p.z * cosY
        // X ekseni etrafında eğ
        const y2 = p.y * cosX - z1 * sinX
        const z2 = p.y * sinX + z1 * cosX

        // Derinlik: z2 ∈ [-1,1] — 1 öne bakan
        const depth = (z2 + 1) / 2

        // Hover etkisi — önce etkisiz konumu bul, uzaklığa göre kabart
        let infl = 0
        if (ptr.strength > 0.01) {
          const sx0 = cx + x1 * R * rr0
          const sy0 = cy - y2 * R * rr0
          const dx = sx0 - ptr.x
          const dy = sy0 - ptr.y
          // Gauss sönümü → kenarı belli olmayan yumuşak kabarma.
          // depth ile çarpılıyor: arkadaki noktalar imlecin altında değil.
          infl = Math.exp(-(dx * dx + dy * dy) / hoverR2) * depth * ptr.strength
        }

        const rr = rr0 + HOVER_AMP * infl
        const sx = cx + x1 * R * rr
        const sy = cy - y2 * R * rr

        const alpha = Math.min(1, 0.10 + 0.72 * depth * depth + 0.55 * infl)
        const size  = 0.7 + 1.5 * depth + 1.8 * infl

        ctx.fillStyle = `rgba(${tone.rgb},${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(sx, sy, size, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const start = () => {
      if (raf) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(draw)
    }
    const stop = () => {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    const onVisibility = () => (document.hidden ? stop() : start())

    start()
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerleave", onLeave)
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={hostRef} className={className}>
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
