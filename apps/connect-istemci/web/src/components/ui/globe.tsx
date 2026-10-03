import { useEffect, useRef } from "react"
import createGlobe, { type COBEOptions } from "cobe"
import { useMotionValue, useSpring } from "motion/react"

import { cn } from "@/lib/utils"

/*
 * Magic UI Globe — cobe 2'ye uyarlandı (Pusula Connect).
 * cobe 0.6'daki 64 işaretçi sınırı 2'de yok (işaretçiler instanced çiziliyor); karşılığında
 * onRender kalktı: her kare için update() çağrılır, döngü burada (requestAnimationFrame).
 */

const MOVEMENT_DAMPING = 1400

const GLOBE_CONFIG: COBEOptions = {
  width: 800,
  height: 800,
  devicePixelRatio: 2,
  phi: 0,
  theta: 0.3,
  dark: 0,
  diffuse: 0.4,
  mapSamples: 16000,
  mapBrightness: 1.2,
  baseColor: [1, 1, 1],
  markerColor: [251 / 255, 100 / 255, 21 / 255],
  glowColor: [1, 1, 1],
  markers: [
    { location: [14.5995, 120.9842], size: 0.03 },
    { location: [19.076, 72.8777], size: 0.1 },
    { location: [23.8103, 90.4125], size: 0.05 },
    { location: [30.0444, 31.2357], size: 0.07 },
    { location: [39.9042, 116.4074], size: 0.08 },
    { location: [-23.5505, -46.6333], size: 0.1 },
    { location: [19.4326, -99.1332], size: 0.1 },
    { location: [40.7128, -74.006], size: 0.1 },
    { location: [34.6937, 135.5022], size: 0.05 },
    { location: [41.0082, 28.9784], size: 0.06 },
  ],
}

export function Globe({
  className,
  config = GLOBE_CONFIG,
  salinim,
  nabiz,
}: {
  className?: string
  config?: COBEOptions
  /** Verilirse sürekli dönmez: config.phi çevresinde ± bu kadar (radyan) salınır — bir yer merkezde kalır. */
  salinim?: number
  /** Verilirse işaretçiler nabız gibi büyüyüp küçülür: boyut × (1 … 1 + nabiz), her biri farklı ritimde. */
  nabiz?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phiRef = useRef(config.phi)
  const pointerInteracting = useRef<number | null>(null)
  const pointerInteractionMovement = useRef(0)

  const r = useMotionValue(0)
  const rs = useSpring(r, {
    mass: 1,
    damping: 30,
    stiffness: 100,
  })

  const updatePointerInteraction = (value: number | null) => {
    pointerInteracting.current = value
    if (canvasRef.current) {
      canvasRef.current.style.cursor = value !== null ? "grabbing" : "grab"
    }
  }

  const updateMovement = (clientX: number) => {
    if (pointerInteracting.current !== null) {
      const delta = clientX - pointerInteracting.current
      pointerInteractionMovement.current = delta
      r.set(r.get() + delta / MOVEMENT_DAMPING)
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    let genislik = canvas.offsetWidth
    const onResize = () => { genislik = canvas.offsetWidth }
    window.addEventListener("resize", onResize)

    // width/height CSS pikseli; çizim tamponu = × devicePixelRatio (cobe 2)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const globe = createGlobe(canvas, { ...config, devicePixelRatio: dpr, width: genislik, height: genislik })

    const baslangic = performance.now()
    let kare = 0
    const ciz = () => {
      const t = performance.now() - baslangic
      if (salinim != null) phiRef.current = config.phi + Math.sin(t / 6000) * salinim
      else if (!pointerInteracting.current) phiRef.current += 0.005
      const durum: Partial<COBEOptions> = { phi: phiRef.current + rs.get(), width: genislik, height: genislik }
      if (nabiz && config.markers?.length) {
        durum.markers = config.markers.map((m, i) => ({
          ...m,
          size: m.size * (1 + nabiz * (0.5 + 0.5 * Math.sin(t / 420 + i * 1.7))),
        }))
      }
      globe.update(durum)
      kare = requestAnimationFrame(ciz)
    }
    kare = requestAnimationFrame(ciz)

    setTimeout(() => (canvas.style.opacity = "1"), 0)
    return () => {
      cancelAnimationFrame(kare)
      globe.destroy()
      window.removeEventListener("resize", onResize)
    }
  }, [rs, config, salinim, nabiz])

  return (
    <div
      className={cn(
        "absolute inset-0 mx-auto aspect-square w-full max-w-150",
        className
      )}
    >
      <canvas
        className={cn(
          "size-full opacity-0 transition-opacity duration-500 contain-[layout_paint_size]"
        )}
        ref={canvasRef}
        onPointerDown={(e) => {
          pointerInteracting.current = e.clientX
          updatePointerInteraction(e.clientX)
        }}
        onPointerUp={() => updatePointerInteraction(null)}
        onPointerOut={() => updatePointerInteraction(null)}
        onMouseMove={(e) => updateMovement(e.clientX)}
        onTouchMove={(e) =>
          e.touches[0] && updateMovement(e.touches[0].clientX)
        }
      />
    </div>
  )
}
