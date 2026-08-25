"use client"

/**
 * /tv/core — Çekirdek için tasarım alternatifleri (JARVIS turu).
 *
 * Önceki iki tur da "sabit hızda dönüyor" diye elendi. Sorun hızda değil
 * KARAKTERDE: sürekli dönen her şey dekoratif okunuyor.
 *
 * JARVIS öyle davranmıyordu. Ekranda çoğu zaman DURUYOR; sonra bir halka
 * hızla dönüp bir açıya KİLİTLENİYOR, bekliyor, tekrar dönüyor. Parçalar
 * ayrılıyor, hizalanıyor, birleşiyor. Yani hareket süreklilik değil NİYET
 * taşıyor — bir şeyi hesaplayan bir makine gibi.
 *
 * Buradaki dördü de bunun üstüne kurulu. Ortak dilbilgisi:
 *   · Sabit hız YOK — her hareket hızlanır, yavaşlar, durur (easeInOut)
 *   · Bekle → hareket et → kilitlen → bekle (görev döngüsü)
 *   · Nokta bulutu değil ÇİZGİ İŞİ — yaylar, çentikler, köşe parantezleri
 *
 * GEÇİCİ sayfa: seçim yapıldıktan sonra silinecek.
 */

import { useEffect, useRef } from "react"

const RGB     = "56,189,248"
const PAGE    = "#0B0B0D"
const TXT_DIM = "#8B8B93"

type Variant = "lock" | "assy" | "scan" | "reactor"

const TARGET_FPS = 30
const FRAME_MS   = 1000 / TARGET_FPS
const TAU        = Math.PI * 2

/* ══════════════════════════════════════════════════════════
   Hareketin dilbilgisi
══════════════════════════════════════════════════════════ */

/** Hızlan → yavaşla. Sabit hızın panzehiri; her hareket bundan geçiyor. */
function ease(u: number): number {
  const t = Math.min(1, Math.max(0, u))
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Deterministik gürültü — birikim yok, her adım kapalı formda hesaplanıyor */
function noise(i: number, seed: number): number {
  const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Görev döngüsü: `hold` sn bekle, `move` sn içinde yeni açıya geç, kilitlen.
 * Arada sabit hız yok — göz ya duran ya kararlı hareket eden bir şey görüyor.
 */
function snap(t: number, seed: number, hold: number, move: number): number {
  const period = hold + move
  const i = Math.floor(t / period)
  const local = t % period
  const at = (k: number) => k * 0.85 + noise(k, seed) * 3.4
  return at(i) + (at(i + 1) - at(i)) * ease((local - hold) / move)
}

/** 0→1→0 tek atımlık darbe; `hold` boyunca sessiz kalır */
function beat(t: number, seed: number, hold: number, move: number): number {
  const period = hold + move
  const local = t % period
  if (local < hold) return 0
  return Math.sin(((local - hold) / move) * Math.PI)
}

interface Ctx {
  ctx: CanvasRenderingContext2D
  cx: number; cy: number; R: number; t: number
}

function arc(c: Ctx, r: number, from: number, len: number, a: number, w = 1.4) {
  c.ctx.strokeStyle = `rgba(${RGB},${a.toFixed(3)})`
  c.ctx.lineWidth = w
  c.ctx.beginPath()
  c.ctx.arc(c.cx, c.cy, c.R * r, from, from + len)
  c.ctx.stroke()
}

function ray(c: Ctx, ang: number, r0: number, r1: number, a: number, w = 1.2) {
  c.ctx.strokeStyle = `rgba(${RGB},${a.toFixed(3)})`
  c.ctx.lineWidth = w
  c.ctx.beginPath()
  c.ctx.moveTo(c.cx + Math.cos(ang) * c.R * r0, c.cy + Math.sin(ang) * c.R * r0)
  c.ctx.lineTo(c.cx + Math.cos(ang) * c.R * r1, c.cy + Math.sin(ang) * c.R * r1)
  c.ctx.stroke()
}

function coreGlow(c: Ctx, r: number, alpha: number) {
  const g = c.ctx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, c.R * r)
  g.addColorStop(0, `rgba(${RGB},${alpha.toFixed(2)})`)
  g.addColorStop(1, `rgba(${RGB},0)`)
  c.ctx.fillStyle = g
  c.ctx.beginPath(); c.ctx.arc(c.cx, c.cy, c.R * r, 0, TAU); c.ctx.fill()
}

/* ── A · Kilitlenme ───────────────────────────────────────
   Üç halka, üçü de farklı ritimde. Ekranın çoğu zaman durgun
   olması kasıtlı: hareket başladığında gözü çekiyor. */
function drawLock(c: Ctx) {
  const { t } = c
  const rings = [
    { r: 0.99, segs: [[0, 1.15], [1.9, 0.75], [3.5, 1.5]], hold: 2.4, move: 0.5,  seed: 1 },
    { r: 0.82, segs: [[0.4, 2.3], [3.3, 1.1]],             hold: 1.7, move: 0.7,  seed: 2 },
    { r: 0.63, segs: [[1.1, 0.9], [2.6, 0.9], [4.1, 0.9]], hold: 3.1, move: 0.45, seed: 3 },
  ]
  for (const g of rings) {
    const rot = snap(t, g.seed, g.hold, g.move)
    const hot = beat(t, g.seed, g.hold, g.move)      // dönerken parlıyor
    for (const [from, len] of g.segs) {
      arc(c, g.r, from + rot, len, 0.28 + hot * 0.5, 1.5)
    }
  }

  // Çentik halkası — birkaçı sırayla yanıp sönüyor
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU
    const lit = noise(i, 9) < 0.12 && Math.sin(t * 3 + i) > 0.4
    ray(c, a, 0.88, lit ? 0.95 : 0.92, lit ? 0.7 : 0.12, 1)
  }

  // Köşe parantezleri — hedefe kapanıp açılıyor
  const close = 1 - beat(t, 7, 2.8, 0.9) * 0.14
  for (let k = 0; k < 4; k++) {
    const base = Math.PI / 4 + (k * Math.PI) / 2
    arc(c, 1.14 * close, base - 0.22, 0.44, 0.55, 2)
    ray(c, base - 0.22, 1.14 * close - 0.05, 1.14 * close + 0.05, 0.55, 2)
    ray(c, base + 0.22, 1.14 * close - 0.05, 1.14 * close + 0.05, 0.55, 2)
  }

  coreGlow(c, 0.4, 0.55)
}

/* ── B · Ayrışma ──────────────────────────────────────────
   Halka altı parçaya bölünüp dışa açılıyor, her parça kendi
   açısına dönüyor, sonra tekrar birleşiyor. */
function drawAssy(c: Ctx) {
  const { t } = c
  const open = beat(t, 4, 2.2, 1.6)                  // 0 = kapalı, 1 = tam açık
  const N = 6
  for (let i = 0; i < N; i++) {
    const base = (i / N) * TAU
    const push = 1 + open * (0.18 + noise(i, 5) * 0.12)
    const spin = open * (noise(i, 6) - 0.5) * 0.6
    arc(c, 0.95 * push, base + spin + 0.08, TAU / N - 0.16, 0.3 + open * 0.45, 2.4)
    // Ayrılırken parçayı yerine bağlayan ince iz
    if (open > 0.05) ray(c, base + TAU / (2 * N), 0.95, 0.95 * push, open * 0.25, 1)
  }

  // İç halka ters yönde ayrışıyor — iki katman aynı anda hareket etmiyor
  const open2 = beat(t, 11, 3.4, 1.2)
  for (let i = 0; i < 4; i++) {
    const base = (i / 4) * TAU + 0.4
    arc(c, 0.64 * (1 - open2 * 0.16), base, TAU / 4 - 0.3, 0.22 + open2 * 0.4, 1.8)
  }

  coreGlow(c, 0.34, 0.45 + Math.max(open, open2) * 0.4)
}

/* ── C · Tarama ───────────────────────────────────────────
   Bir nişangâh çevrede hedeften hedefe atlıyor, kilitleniyor,
   okuma yapıyor, bir sonrakine geçiyor. Ekrandaki en niyetli
   hareket bu — bir şey arıyor gibi duruyor. */
function drawScan(c: Ctx) {
  const { t } = c
  const HOLD = 1.5, MOVE = 0.4
  const period = HOLD + MOVE
  const i = Math.floor(t / period)
  const local = t % period
  const target = (k: number) => noise(k, 21) * TAU
  const a0 = target(i), a1 = target(i + 1)
  // En kısa yoldan git — çember üzerinde gereksiz tur atmasın
  const d = ((a1 - a0 + Math.PI) % TAU) - Math.PI
  const ang = a0 + d * ease((local - HOLD) / MOVE)
  const locked = local < HOLD
  const settle = Math.min(1, local / 0.35)           // kilitten sonra oturma

  // Sabit çerçeve — hareketin çıpası
  arc(c, 1.0, 0, TAU, 0.1, 1)
  arc(c, 0.72, 0, TAU, 0.07, 1)
  for (let k = 0; k < 36; k++) {
    ray(c, (k / 36) * TAU, 0.96, 1.0, k % 9 === 0 ? 0.32 : 0.1, 1)
  }

  // Nişangâh
  const grip = locked ? 0.16 - settle * 0.05 : 0.26
  const al = locked ? 0.9 : 0.45
  arc(c, 1.06, ang - grip, grip * 2, al, 2.2)
  ray(c, ang - grip, 1.0, 1.12, al, 2.2)
  ray(c, ang + grip, 1.0, 1.12, al, 2.2)
  ray(c, ang, 0.72, 0.98, locked ? 0.35 : 0.12, 1)

  const px = c.cx + Math.cos(ang) * c.R * 0.86
  const py = c.cy + Math.sin(ang) * c.R * 0.86
  c.ctx.fillStyle = `rgba(${RGB},${locked ? 0.95 : 0.3})`
  c.ctx.beginPath(); c.ctx.arc(px, py, locked ? 3 : 1.6, 0, TAU); c.ctx.fill()

  // Kilitlendiği anda dışa açılan onay halkası
  if (locked && local < 0.5) {
    const u = local / 0.5
    c.ctx.strokeStyle = `rgba(${RGB},${(0.5 * (1 - u)).toFixed(3)})`
    c.ctx.lineWidth = 1.5
    c.ctx.beginPath(); c.ctx.arc(px, py, 4 + u * 16, 0, TAU); c.ctx.stroke()
  }

  coreGlow(c, 0.42, 0.4)
}

/* ── D · Reaktör ──────────────────────────────────────────
   Katmanlı: dış halka kilitlenerek dönüyor, orta katman sabit
   duruyor, çekirdek nabız atıyor ve arada titriyor. */
function drawReactor(c: Ctx) {
  const { ctx, cx, cy, R, t } = c

  const rot = snap(t, 31, 2.0, 0.6)
  const hot = beat(t, 31, 2.0, 0.6)
  for (let i = 0; i < 8; i++) {
    arc(c, 1.02, rot + (i / 8) * TAU, TAU / 8 - 0.22, 0.2 + hot * 0.45, 3)
  }

  // Orta katman sabit — dış halkanın hareketi ona göre okunuyor
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU
    const lit = 0.16 + 0.3 * Math.max(0, Math.sin(t * 1.4 - i * 0.5))
    ctx.fillStyle = `rgba(${RGB},${lit.toFixed(3)})`
    ctx.beginPath()
    const w = 0.19
    ctx.moveTo(cx + Math.cos(a - w) * R * 0.58, cy + Math.sin(a - w) * R * 0.58)
    ctx.lineTo(cx + Math.cos(a + w) * R * 0.58, cy + Math.sin(a + w) * R * 0.58)
    ctx.lineTo(cx + Math.cos(a + w * 0.6) * R * 0.86, cy + Math.sin(a + w * 0.6) * R * 0.86)
    ctx.lineTo(cx + Math.cos(a - w * 0.6) * R * 0.86, cy + Math.sin(a - w * 0.6) * R * 0.86)
    ctx.closePath(); ctx.fill()
  }

  const pulse = 0.5 + 0.22 * Math.sin(t * 2.4)
  const flick = noise(Math.floor(t * 14), 44) < 0.09 ? 0.3 : 0
  const rad = R * (0.42 + hot * 0.05)
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
  g.addColorStop(0, `rgba(${RGB},${Math.min(1, pulse + flick).toFixed(2)})`)
  g.addColorStop(0.55, `rgba(${RGB},0.18)`)
  g.addColorStop(1, `rgba(${RGB},0)`)
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, TAU); ctx.fill()
  arc(c, 0.44, 0, TAU, 0.35, 1)
}

const DRAW: Record<Variant, (c: Ctx) => void> = {
  lock: drawLock, assy: drawAssy, scan: drawScan, reactor: drawReactor,
}

/* ══════════════════════════════════════════════════════════ */

function Core({ variant, size = 300 }: { variant: Variant; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = size + "px"
    canvas.style.height = size + "px"

    let raf = 0, last = performance.now(), acc = 0, t = 0, running = true

    const loop = (now: number) => {
      if (!running) return
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      acc += dt * 1000
      if (acc < FRAME_MS) return
      acc = 0
      t += dt

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      ctx.lineCap = "round"

      const cx = size / 2, cy = size / 2, R = size * 0.36
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.3)
      glow.addColorStop(0, `rgba(${RGB},0.09)`)
      glow.addColorStop(1, `rgba(${RGB},0)`)
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.3, 0, TAU); ctx.fill()

      DRAW[variant]({ ctx, cx, cy, R, t })
    }

    const start = () => { if (!raf) { running = true; last = performance.now(); raf = requestAnimationFrame(loop) } }
    const stop  = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0 }
    const vis = () => (document.hidden ? stop() : start())
    start()
    document.addEventListener("visibilitychange", vis)
    return () => { stop(); document.removeEventListener("visibilitychange", vis) }
  }, [variant, size])

  return <canvas ref={ref} className="block" />
}

const VARIANTS: { no: string; key: Variant; title: string; note: string }[] = [
  { no: "A", key: "lock",    title: "Kilitlenme", note: "Halkalar durur, sonra hızla dönüp bir açıya kilitlenir. Parantezler hedefe kapanır." },
  { no: "B", key: "assy",    title: "Ayrışma",    note: "Halka parçalara ayrılıp dışa açılır, kendi açısına döner, tekrar birleşir." },
  { no: "C", key: "scan",    title: "Tarama",     note: "Nişangâh çevrede hedeften hedefe atlar, kilitlenir, okuma yapar, geçer." },
  { no: "D", key: "reactor", title: "Reaktör",    note: "Dış halka kilitlenerek döner, orta katman sabit durur, çekirdek nabız atar." },
]

export default function CoreTaslakPage() {
  return (
    <div className="min-h-screen p-10" style={{ background: PAGE, colorScheme: "dark" }}>
      <h1 className="text-[18px] font-bold text-zinc-100">Çekirdek — JARVIS Turu</h1>
      <p className="mt-1 max-w-[760px] text-[12px] leading-relaxed" style={{ color: TXT_DIM }}>
        Sorun hızda değil karakterdeydi: sürekli dönen her şey dekoratif okunuyor. JARVIS
        çoğu zaman <b className="text-zinc-300">duruyordu</b>; sonra bir halka hızla dönüp bir
        açıya kilitleniyor, bekliyor, tekrar dönüyordu. Dördü de bunun üstüne kurulu — sabit
        hız yok, her hareket hızlanıp yavaşlıyor ve bir yerde duruyor.{" "}
        <span className="text-zinc-300">Birkaç saniye izle</span>, hareketler aralıklı geliyor.
      </p>

      <div className="mt-8 flex flex-wrap gap-10">
        {VARIANTS.map((v) => (
          <div key={v.key}>
            <div className="mb-2 flex items-baseline gap-3">
              <span className="flex size-6 items-center justify-center rounded-[5px] bg-primary text-[11px] font-bold text-primary-foreground">
                {v.no}
              </span>
              <span className="text-[13px] font-bold text-zinc-100">{v.title}</span>
            </div>
            <div className="mb-3 h-[44px] max-w-[300px] text-[11px] leading-snug" style={{ color: TXT_DIM }}>
              {v.note}
            </div>
            <Core variant={v.key} />
          </div>
        ))}
      </div>
    </div>
  )
}
