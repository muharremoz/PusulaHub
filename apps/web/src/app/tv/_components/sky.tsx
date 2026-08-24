"use client"

/**
 * Arka plan gökyüzü — üç derinlik katmanı halinde yıldız alanı + bulutsu +
 * fareye tepki veren parçacık alanı.
 *
 * ── Derinlik nasıl kuruluyor? ──────────────────────────────────────────
 * Üç ayrı katman var: uzak, orta, yakın. Kamera hareket ettiğinde (bir
 * gövdeye odaklanınca) her katman FARKLI oranda kayıyor — uzak katman
 * neredeyse hiç, yakın katman belirgin şekilde. Paralaks derinlik hissini
 * veren şey bu; tek katmanlı bir yıldız duvarı düz görünür.
 *
 * ── Hareket ────────────────────────────────────────────────────────────
 *   1. Süzülme — her katman yavaşça kayar, farklı yöne ve farklı hızda.
 *   2. Yanıp sönme — her katmanın yıldızları ÜÇ ÖBEĞE bölünüp ayrı
 *      tuvallere çiziliyor; öbeklerin saydamlığı farklı periyotlarla
 *      salınıyor. Tek tuval kullanılsaydı bütün yıldızlar birlikte
 *      kararırdı (nabız gibi); üç öbek faz farkıyla salınınca dağınık bir
 *      kıpırtı okunuyor.
 *   3. Parçacıklar — MagicUI `Particles`. Yıldızların önünde süzülen,
 *      fareden kaçan ince bir toz katmanı.
 *
 * ── Maliyet ────────────────────────────────────────────────────────────
 * Yıldızlar canvas'a BİR KEZ çiziliyor; süzülme ve yanıp sönme tamamen CSS,
 * kare başına JavaScript yok. Tek istisna `Particles`: kendi rAF döngüsünü
 * çalıştırıyor. 7/24 açık kalacak ekranda tek sürekli döngü bu, o yüzden
 * parçacık sayısı bilerek düşük tutuldu.
 */

import { useEffect, useRef } from "react"
import { Particles } from "@/components/ui/particles"

/** Her katmanın yıldızları kaç öbeğe bölünüp ayrı ayrı yanıp sönecek */
const GROUPS = 3

interface LayerSpec {
  count:   number
  minR:    number
  maxR:    number
  minA:    number
  maxA:    number
  /** Süzülme süresi (sn) — uzak katman daha yavaş */
  drift:   number
  /** Yanıp sönerken inilen en düşük saydamlık (1 = hiç sönmez) */
  twinkle: number
  /** Bulutsu çizilsin mi (yalnız en uzak katmanda) */
  nebula?: boolean
}

const LAYERS: LayerSpec[] = [
  { count: 300, minR: 0.4, maxR: 0.9, minA: 0.16, maxA: 0.40, drift: 150, twinkle: 0.72, nebula: true },
  { count: 120, minR: 0.7, maxR: 1.4, minA: 0.28, maxA: 0.60, drift: 108, twinkle: 0.52 },
  { count: 45,  minR: 1.1, maxR: 2.1, minA: 0.45, maxA: 0.90, drift: 78,  twinkle: 0.40 },
]

/**
 * Yıldız renkleri.
 *
 * ── Neden arızada bütün gökyüzü kızarıyor? ────────────────────────────
 * Arıza bandı ve kırmızı yaprak, ekranın belirli bir yerine bakan kişiye
 * yetiyor. Ama bu bir izleme duvarı: kimse doğrudan bakmıyor olabilir.
 * Bütün zeminin renk değiştirmesi göz ucuyla bile fark edilir — okumaya
 * gerek kalmadan "bir şeyler ters" bilgisini veriyor.
 *
 * ── Neden CSS filtresi değil? ─────────────────────────────────────────
 * `filter: hue-rotate(...)` tek satır olurdu ama tuvaller sürekli süzülme
 * animasyonunda; filtre her karede yeniden boyama zorlar ve 7/24 çalışan
 * zayıf bir TV kutusunu yorar. Renk doğrudan çizime giriyor: alarm
 * değişince yıldızlar BİR KEZ yeniden çiziliyor, sonrası bedava.
 */
const STAR_CALM  = ["226,232,240", "253,230,180", "191,219,254"]
const STAR_ALARM = ["248,113,113", "252,165,165", "254,202,202"]

/** Öbek başına yanıp sönme periyodu (sn) — aralarında ortak kat yok ki
 *  desen tekrarlıyormuş gibi durmasın */
const TWINKLE_PERIOD = [6.5, 9.7, 13.1]

/** Katman tuvali görünümden bu oranda büyük — süzülünce kenar açılmasın */
const OVERSCAN = 1.2

/**
 * Deterministik sözde-rastgele. Math.random kullanmıyoruz ki yeniden
 * boyutlandırmada yıldızlar tamamen yer değiştirip göz almasın.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Bir katmanın TEK ÖBEĞİNİ çizer. Öbekler aynı tohumdan üretilip sırayla
 * dağıtılıyor: yıldızlar öbeklere serpiştirilmiş oluyor, ekranın bir
 * bölgesi topluca yanıp sönmüyor.
 */
function paintGroup(
  canvas: HTMLCanvasElement,
  spec: LayerSpec,
  layerIndex: number,
  groupIndex: number,
  w: number,
  h: number,
  alarm: boolean,
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const cw = Math.round(w * OVERSCAN)
  const ch = Math.round(h * OVERSCAN)
  canvas.width  = Math.round(cw * dpr)
  canvas.height = Math.round(ch * dpr)
  canvas.style.width  = cw + "px"
  canvas.style.height = ch + "px"

  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cw, ch)

  const rand = rng(9973 * (layerIndex + 1) + 17)

  // Bulutsu yalnız ilk öbeğe — üç kez üst üste çizilmesin
  if (spec.nebula && groupIndex === 0) {
    const blobs = alarm
      ? [
          { x: 0.24, y: 0.38, r: 0.42, c: "239,68,68" },
          { x: 0.68, y: 0.22, r: 0.34, c: "220,38,38" },
          { x: 0.55, y: 0.78, r: 0.38, c: "248,113,113" },
        ]
      : [
          { x: 0.24, y: 0.38, r: 0.42, c: "56,189,248" },
          { x: 0.68, y: 0.22, r: 0.34, c: "129,140,248" },
          { x: 0.55, y: 0.78, r: 0.38, c: "45,212,191" },
        ]
    for (const b of blobs) {
      const g = ctx.createRadialGradient(
        b.x * cw, b.y * ch, 0,
        b.x * cw, b.y * ch, b.r * Math.max(cw, ch),
      )
      g.addColorStop(0,   "rgba(" + b.c + ",0.055)")
      g.addColorStop(0.5, "rgba(" + b.c + ",0.022)")
      g.addColorStop(1,   "rgba(" + b.c + ",0)")
      ctx.fillStyle = g
      ctx.fillRect(0, 0, cw, ch)
    }
  }

  for (let i = 0; i < spec.count; i++) {
    const x = rand() * cw
    const y = rand() * ch
    const r = spec.minR + rand() * (spec.maxR - spec.minR)
    const a = spec.minA + rand() * (spec.maxA - spec.minA)
    const t = rand()

    // Yıldızları öbeklere serpiştir — bu öbeğe ait değilse atla ama
    // rastgele üreticiyi tüketmeye devam et ki konumlar sabit kalsın
    if (i % GROUPS !== groupIndex) continue

    /*
     * Çoğu ana renkte, azı iki yan tonda — tek renk yapay duruyor.
     * Dağılım alarmda da AYNI kalıyor, yalnız palet değişiyor: gökyüzü
     * kızarırken dokusunu koruyor, başka bir gökyüzüne dönmüyor.
     */
    const pal = alarm ? STAR_ALARM : STAR_CALM
    const rgb = t > 0.88 ? pal[2] : t > 0.78 ? pal[1] : pal[0]

    // Yakın katmanın büyük yıldızlarına yumuşak hale
    if (r > 1.5) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4)
      g.addColorStop(0, "rgba(" + rgb + "," + (a * 0.5).toFixed(3) + ")")
      g.addColorStop(1, "rgba(" + rgb + ",0)")
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r * 4, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = "rgba(" + rgb + "," + a.toFixed(3) + ")"
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

interface Props {
  /**
   * Dış sarmalların ref dizisi — paralaks transform'unu kamera döngüsü
   * buraya yazıyor. Sıra: uzak → yakın.
   */
  layerRefs: React.RefObject<HTMLDivElement | null>[]
  /** Arıza var mı — gökyüzü kızarır */
  alarm?: boolean
}

export function Sky({ layerRefs, alarm = false }: Props) {
  const hostRef    = useRef<HTMLDivElement | null>(null)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const repaint = () => {
      const w = host.offsetWidth
      const h = host.offsetHeight
      if (w === 0 || h === 0) return
      LAYERS.forEach((spec, i) => {
        for (let gi = 0; gi < GROUPS; gi++) {
          const c = canvasRefs.current[i * GROUPS + gi]
          if (c) paintGroup(c, spec, i, gi, w, h, alarm)
        }
      })
    }
    repaint()

    // Yalnız boyut ya da alarm değişince yeniden çiz — başka hiçbir zaman
    const ro = new ResizeObserver(repaint)
    ro.observe(host)
    return () => ro.disconnect()
  }, [alarm])

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes sky-drift-0 {
          from { transform: translate3d(0px, 0px, 0); }
          to   { transform: translate3d(-46px, 26px, 0); }
        }
        @keyframes sky-drift-1 {
          from { transform: translate3d(0px, 0px, 0); }
          to   { transform: translate3d(64px, -36px, 0); }
        }
        @keyframes sky-drift-2 {
          from { transform: translate3d(0px, 0px, 0); }
          to   { transform: translate3d(-92px, -52px, 0); }
        }

        /* Yanıp sönme — her öbek kendi periyoduyla, faz farkı gecikmeden */
        @keyframes sky-twinkle {
          0%, 100% { opacity: 1; }
          50%      { opacity: var(--dim); }
        }
      `}</style>

      {LAYERS.map((spec, i) => (
        // Dış sarmal: paralaks (kamera döngüsü yazıyor)
        <div
          key={i}
          ref={layerRefs[i]}
          className="absolute inset-0"
          style={{ willChange: "transform" }}
        >
          {/* İç sarmal: yavaş süzülme (tamamen CSS) */}
          <div
            className="absolute"
            style={{
              left: `${((1 - OVERSCAN) / 2) * 100}%`,
              top:  `${((1 - OVERSCAN) / 2) * 100}%`,
              animation: `sky-drift-${i} ${spec.drift}s ease-in-out infinite alternate`,
              willChange: "transform",
            }}
          >
            {Array.from({ length: GROUPS }).map((_, gi) => (
              <canvas
                key={gi}
                ref={(el) => { canvasRefs.current[i * GROUPS + gi] = el }}
                className="absolute left-0 top-0 block"
                style={{
                  // @ts-expect-error — CSS özel değişkeni
                  "--dim": spec.twinkle,
                  animation: `sky-twinkle ${TWINKLE_PERIOD[gi]}s ease-in-out infinite`,
                  animationDelay: `${gi * 1.7 + i * 0.9}s`,
                }}
              />
            ))}
          </div>
        </div>
      ))}

      {/*
        Parçacık alanı — yıldızların önünde süzülen ince toz. Fare imleci
        yaklaşınca parçacıklar kaçıyor (staticity düşükse daha çok kaçar).
        Sayı bilerek düşük: sürekli rAF döngüsü çalıştıran tek bileşen bu.
      */}
      <Particles
        className="absolute inset-0"
        quantity={90}
        staticity={45}
        ease={60}
        size={0.5}
        color={alarm ? "#FCA5A5" : "#BFDBFE"}
        vx={0.02}
        vy={-0.012}
      />
    </div>
  )
}
