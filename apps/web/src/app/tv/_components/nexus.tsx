"use client"

/**
 * Küre + dallar görünümü.
 *
 * İki seviye var ve kalabalık sorunu bu hiyerarşiyle çözülüyor:
 *
 *   Genel:  solda canlı küre, SAĞINA açılan YALNIZCA 3 gövde. Küreden
 *           gövdelere sürekli ışık akıyor — sistem canlı demek.
 *           Küreden gövdelere sürekli ışık akıyor — sistem canlı demek.
 *   Odak:   bir gövdeye tıklanınca kamera oraya kayar ve büyütür; o gövdenin
 *           yaprakları sağa doğru tek tek açılır.
 *
 * Neden böyle: /tv2'de 24 düğüm aynı anda kürenin etrafındaydı ve etiketler
 * üst üste biniyordu. Burada ilk seviyede 3 eleman var, en kalabalık gövde
 * bile odakta tek başına açılıyor — sıkışma imkânsız.
 *
 * ── Kamera ────────────────────────────────────────────────────────────
 * Gerçek 3B yok. Tek bir dünya→ekran dönüşümü (öteleme + ölçek) hem SVG
 * katmanına hem küre katmanına AYNI şekilde uygulanıyor, böylece ikisi
 * birbirinden kaymıyor. Dönüşüm her karede ref üzerinden DOM'a yazılıyor —
 * React yeniden render edilmiyor.
 *
 * ── Kaynak tasarrufu (CLAUDE.md #2) ───────────────────────────────────
 * Akan ışıklar SMIL (`animateMotion`) ile — kare başına JS maliyeti yok.
 * Kamera döngüsü hedefe varınca kendini durduruyor, boşuna dönmüyor.
 * Sekme görünmezken duruyor.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import {
  type ExchangeHealthEntry, type KumaMonitor, type UiStatus,
  exchangeHealthKey, formatAgo, formatDuration, formatTarget, mapStatus,
} from "../_shared/types"
import { useClock } from "../_shared/use-tv-data"
import { type MetricsMap, metricsFor } from "./use-server-metrics"
import { causesFor } from "./causes"
import { type TreeGroup, type TreeKey, SUBGROUPS, subGroupOf } from "../_shared/monitor-groups"
import { SPHERE_R_FACTOR } from "./core-sphere"
import { ThinkingOrbCanvas } from "./orb"
import { Sky } from "./sky"

/* ── Palet ── */
const LINE      = "rgba(255,255,255,0.13)"
const LINE_DOWN = "rgba(239,68,68,0.5)"
const FLOW      = "#7DD3FC"
/** Sayfa zemini — düğüm diskinin içini doldurup ortadaki sayıyı okunur kılar */
const TXT       = "#D4D4D8"
const TXT_DIM   = "#71717A"
const TXT_DOWN  = "#FCA5A5"

/**
 * Gövdeler kürenin SAĞINDAN çıkar: yelpazenin merkezi sağa bakar (0°),
 * FAN_DEG kadar iki yana açılır.
 */
const FAN_CENTER_DEG = 0
const FAN_DEG = 30

/**
 * Dallar düğümün EN DIŞ çemberinin dışından başlasın. Merkezden başlayınca
 * diskin ve içindeki sayının üstünden geçiyorlardı; halkanın hemen dibinden
 * başlayınca da düğüme yapışık duruyorlardı.
 * Dış hale yarıçapı 34 → 38 birim güvenli bir pay bırakıyor.
 */
const NODE_GAP = 24   // dal cizgisi orb KENARINDAN dogar (orb yarıçapı 22); ne icinde karmasa ne disinda bosluk

/**
 * Gövdelerin küre merkezine uzaklığı — kısa kenarın bu katı.
 *
 * Daha önce `D = R + sabit` yazılıydı, yani gövde uzaklığı KÜRE BOYUTUNA
 * bağlıydı. Küreyi küçültünce dallar da içeri geliyordu ve net etki "küre
 * aynı kaldı, dallar yaklaştı" oluyordu — istenen bu değil. İkisi artık
 * ayrı ayarlar: küre boyutu `SPHERE_R_FACTOR`, gövde uzaklığı bu.
 *
 * Değer, kürenin eski (0.42) hâlindeki uzaklığı koruyacak şekilde seçildi.
 */
const TRUNK_DIST_FACTOR = 0.373

/** Detay kutusu — yapragin sagindaki bosluga oturuyor */
const DETAIL_W = 250
const DETAIL_H = 122
/** Yaprak etiketinin bitiminden kutuya kalan mesafe */
const DETAIL_GAP = 214

/**
 * Döviz verisi ne kadar bayatsa o kadar kaygı verici. Kur birkaç dakikada
 * bir tazeleniyor; monitör YEŞİL olsa bile veri saatlerdir güncellenmiyorsa
 * ekranda bunun görünmesi gerekiyor — "ayakta" ile "güncel" aynı şey değil.
 */
const STALE_WARN_MS = 5 * 60_000
const STALE_BAD_MS  = 20 * 60_000

/**
 * Yaprak etiketinin piksel genisligi.
 *
 * Kutuyu saran yol yapragin noktasindan cikip yatay ilerliyordu ve tam da
 * ADIN USTUNDEN geciyordu — akan isik harflerin arasindan akiyordu. Yolun
 * adin bittigi yerden baslamasi icin metnin ne kadar yer kapladigini
 * bilmek gerekiyor; SVG bunu vermedigi icin bir kez olusturulan gizli
 * canvas ile olculuyor (kare basina maliyet yok, yalniz secim degisince).
 */
const LEAF_FONT = "600 13px ui-sans-serif, system-ui, -apple-system, sans-serif"
let measureCtx: CanvasRenderingContext2D | null = null
function textWidth(text: string): number {
  if (typeof document === "undefined") return text.length * 7.2   // SSR: kaba tahmin
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d")
  if (!measureCtx) return text.length * 7.2
  measureCtx.font = LEAF_FONT
  return measureCtx.measureText(text).width
}

/**
 * Bir hat üzerinde koşan darbe.
 *
 * Hareket SABİT HIZDA DEĞİL: keyTimes ile önce duruyor, sonra yumuşayarak
 * koşuyor. Sürekli akan bir bant değil, tek tek gönderilen paketler
 * okunuyor.
 *
 * pathLength=100 sayesinde dash ölçüleri yolun gerçek uzunluğundan
 * bağımsız: kısa dalda da uzun dalda da darbe aynı oranda görünüyor.
 *
 * SMIL kullanılıyor, kare başına JavaScript maliyeti yok (CLAUDE.md #2).
 */
function Pulse({ d, color, dur, begin, dash = 7, width = 1.6, mask }: {
  d: string; color: string; dur: number; begin: number
  dash?: number; width?: number
  /** Darbenin gizleneceği bölge (ör. yaprak etiketi) */
  mask?: string
}) {
  const tm = {
    dur: dur.toFixed(2) + "s",
    begin: begin.toFixed(2) + "s",
    repeatCount: "indefinite" as const,
  }
  return (
    <path
      d={d}
      mask={mask}
      pathLength={100}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={dash + " " + (100 - dash)}
      opacity={0}
    >
      <animate
        attributeName="stroke-dashoffset"
        values="100;100;0"
        keyTimes="0;0.35;1"
        calcMode="spline"
        keySplines="0 0 1 1;0.32 0 0.16 1"
        {...tm}
      />
      <animate
        attributeName="opacity"
        values="0;0;1;1;0"
        keyTimes="0;0.35;0.45;0.9;1"
        {...tm}
      />
    </path>
  )
}

const DOT: Record<UiStatus, string> = {
  online:  "#34D399",
  warning: "#FBBF24",
  offline: "#EF4444",
}


/**
 * Küreden gövdeye giden dalın yolu.
 *
 * Hafif yaylanan tek bir kübik Bézier. Yatay eksenden uzaklaştıkça yay
 * artıyor, ortadaki dal düz kalıyor — beşi birden çizildiğinde yelpaze
 * mekanik değil organik okunuyor.
 *
 * Eskiden burada köke doğru kalınlaşan dolu bir şerit ve onu küreye
 * bağlayan kök tanecikleri de üretiliyordu. Küre küçültülüp ince hat
 * tasarımına geçilince ikisi de gereksizleşti.
 */
function branchGeometry(
  sx: number, sy: number, tx: number, ty: number, deg: number,
): { center: string } {
  const dx = tx - sx
  const dy = ty - sy
  const len = Math.hypot(dx, dy) || 1
  // Eğriye dik birim vektör
  const px = -dy / len
  const py = dx / len
  // Yatay eksenden uzaklaştıkça hafif yaylansın; ortadaki dal düz kalır
  const bow = Math.sin((deg * Math.PI) / 180) * len * 0.10

  const c1x = sx + dx * 0.34 + px * bow
  const c1y = sy + dy * 0.34 + py * bow
  const c2x = sx + dx * 0.70 + px * bow * 0.45
  const c2y = sy + dy * 0.70 + py * bow * 0.45

  const center =
    "M" + sx.toFixed(1) + "," + sy.toFixed(1) +
    " C" + c1x.toFixed(1) + "," + c1y.toFixed(1) +
    " "  + c2x.toFixed(1) + "," + c2y.toFixed(1) +
    " "  + tx.toFixed(1)  + "," + ty.toFixed(1)
  return { center }
}
/**
 * Odak dışındaki bir gövdeyi, seçilen gövdeden uzağa iten dönüşüm.
 * Yön seçilenden bu gövdeye bakar; mesafe sabit, böylece hepsi eşit
 * miktarda dağılır.
 */
function pushAway(
  t: { x: number; y: number },
  focused: { x: number; y: number },
): string {
  const dx = t.x - focused.x
  const dy = t.y - focused.y
  const len = Math.hypot(dx, dy) || 1
  // Kamera odakta 1.22 kat büyüttüğü için dünya birimi ekranda ~1.2 katına
  // çıkıyor; 230 fazla geliyor, gövdeler ekran kenarına taşıyordu.
  const PUSH = 95
  return (
    "translate(" +
    ((dx / len) * PUSH).toFixed(1) + "px, " +
    ((dy / len) * PUSH).toFixed(1) + "px)"
  )
}

/** Doluluk esigine gore renk — %85 ustu kritik, %70 ustu dikkat */
function loadColor(v: number): string {
  if (v >= 85) return "#EF4444"
  if (v >= 70) return "#FBBF24"
  return "#7DD3FC"
}

/** Kutuyu ölç */
function useSize(): [React.RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize((p) => {
        const w = Math.round(r.width), h = Math.round(r.height)
        return p.w === w && p.h === h ? p : { w, h }
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

interface Props {
  groups:       TreeGroup[]
  focusKey:     TreeKey | null
  onFocus:      (key: TreeKey | null) => void
  selectedName: string | null
  onSelect:     (name: string | null) => void
  /** Secili monitorun bu duruma girdigi an — detay kutusundaki sure icin */
  selectedSince?: number
  /** Sunucu metrikleri (CPU/RAM/disk) — yalnız karsiligi olan monitorde cikar */
  metrics?: MetricsMap
  /** Döviz kaynaklarının son güncelleme zamanı — `/api/monitoring` veriyor */
  exchangeHealth?: Record<string, ExchangeHealthEntry> | null
}

export function Nexus({
  groups, focusKey, onFocus, selectedName, onSelect, selectedSince, metrics,
  exchangeHealth,
}: Props) {
  const now = useClock()
  const [ref, { w, h }] = useSize()

  const layerRef = useRef<HTMLDivElement | null>(null)
  const gRef     = useRef<SVGGElement | null>(null)

  /**
   * Gokyuzu katmanlari. Kamera hareket ettiginde her biri FARKLI oranda
   * kayiyor: uzak katman neredeyse hic, yakin katman belirgin. Derinlik
   * hissini veren sey bu.
   */
  const sky0 = useRef<HTMLDivElement | null>(null)
  const sky1 = useRef<HTMLDivElement | null>(null)
  const sky2 = useRef<HTMLDivElement | null>(null)
  const skyRefs = useMemo(() => [sky0, sky1, sky2], [])

  /* ── Dünya yerleşimi — küre SOLDA, gövdeler SAĞA yelpaze ──
   *
   * Küre ortadayken, solundaki bir gövdenin yaprakları sağa açılınca
   * kürenin nokta bulutunun üstüne biniyordu. Küre sola alınıp bütün
   * dallar sağa çıkarılınca bu çakışma yapısal olarak imkânsız oluyor. */
  const geo = useMemo(() => {
    const cx = w * 0.22
    const cy = h / 2
    const S  = Math.min(w, h) * 0.52          // küre kutusunun kenarı
    const R  = S * SPHERE_R_FACTOR            // kürenin görsel yarıçapı
    const D  = Math.min(w, h) * TRUNK_DIST_FACTOR   // gövde uzaklığı (küreden bağımsız)

    const n = Math.max(1, groups.length)
    const trunks = groups.map((g, i) => {
      // 0° = sağ. Yelpaze merkezin -FAN..+FAN çevresinde; tek gövde varsa
      // tam sağa bakar.
      const deg =
        FAN_CENTER_DEG + (n === 1 ? 0 : -FAN_DEG + (i * (FAN_DEG * 2)) / (n - 1))
      const a   = (deg * Math.PI) / 180
      /*
       * Dal kürenin kenarından değil İÇİNDEN başlıyor (yarıçapın %45inden).
       * Kenardan başlayınca sert bir birleşme yeri oluşuyor ve dal yapıştırma
       * gibi duruyordu; içeriden başlayıp yavaşça belirince çekirdekten
       * çıkıyormuş gibi okunuyor.
       */
      const bs = branchGeometry(
        cx + Math.cos(a) * (R * 0.45), cy + Math.sin(a) * (R * 0.45),
        // Dal gövde MERKEZİNE değil orb KENARINA gelsin (24px önce dursun),
        // yoksa orb'un içine dalıp noktalarla karışıyordu.
        cx + Math.cos(a) * (D - 24),   cy + Math.sin(a) * (D - 24),   deg,
      )
      return {
        g,
        deg,
        x: cx + Math.cos(a) * D,
        y: cy + Math.sin(a) * D,
        // dalın doğduğu nokta — kürenin içinde
        sx: cx + Math.cos(a) * (R * 0.45),
        sy: cy + Math.sin(a) * (R * 0.45),
        down: g.monitors.filter((m) => m.status === "down").length,
        center: bs.center,
      }
    })
    return { cx, cy, S, R, D, trunks }
  }, [w, h, groups])

  /* Bağıntı kontrolü bütün monitörlere bakıyor: aynı makinenin ping
     monitörü başka bir gövdede olabilir. */
  const allMonitors = useMemo(() => groups.flatMap((g) => g.monitors), [groups])

  /* ── Odaktaki gövdenin yaprakları ── */
  const focused = geo.trunks.find((t) => t.g.def.key === focusKey) ?? null
  /**
   * Odaktaki gövdenin satırları.
   *
   * Bazı gövdelerde monitörler ALT GRUPLARA ayrılıyor (Datacenter fiziksel
   * makinelere, Uygulamalar işlevine göre); orada yapraklar başlıklar altında
   * açılıyor. Alt grubu tanımlı olmayan gövdede düz liste çiziliyor.
   *
   * Başlıklar da dikeyde yer kapladığı için toplam yükseklik hesabına
   * katılıyor; aksi halde liste odak merkezinden kayardı.
   */
  const rows = useMemo(() => {
    if (!focused) return []
    const list = focused.g.monitors

    // Bu gövdenin alt grupları — tanımlı değilse düz liste
    const defs = SUBGROUPS.filter((d) => d.tree === focused.g.def.key)
    const grouped = defs.length > 0

    const buckets = grouped
      ? defs
          .map((d) => ({
            head: { key: d.key, label: d.label },
            items: list.filter((m) => subGroupOf(m) === d.key),
          }))
          .filter((b) => b.items.length > 0)
      : [{ head: null as { key: string; label: string } | null, items: list }]

    const headCount = grouped ? buckets.length : 0
    const leafCount = list.length
    const HEAD_H = 26
    const gap = Math.min(
      34,
      Math.max(19, (h * 0.66 - headCount * HEAD_H) / Math.max(1, leafCount)),
    )

    const totalH = leafCount * gap + headCount * HEAD_H
    const x = focused.x + 200
    let y = focused.y - totalH / 2

    type Row =
      | { kind: "head"; key: string; label: string; x: number; y: number }
      | { kind: "leaf"; key: string; m: KumaMonitor; ui: UiStatus; x: number; y: number }

    const out: Row[] = []
    for (const b of buckets) {
      if (b.head) {
        y += HEAD_H / 2
        out.push({ kind: "head", key: "h-" + b.head.key, label: b.head.label, x, y })
        y += HEAD_H / 2
      }
      for (const m of b.items) {
        y += gap / 2
        out.push({ kind: "leaf", key: m.name, m, ui: mapStatus(m.status), x, y })
        y += gap / 2
      }
    }
    return out
  }, [focused, h])

  /** Yalnız yapraklar — detay kutusu ve çizimler bunu kullanıyor */
  const leaves = useMemo(
    () => rows.filter((r): r is Extract<typeof r, { kind: "leaf" }> => r.kind === "leaf"),
    [rows],
  )

  /** Yalnız fiziksel makine başlıkları */
  const heads = useMemo(
    () => rows.filter((r): r is Extract<typeof r, { kind: "head" }> => r.kind === "head"),
    [rows],
  )

  /**
   * Secili yapragin detay satirlari. Adres uzun olabildigi icin kisaltiliyor:
   * SVG metni kendiliginden kirpilmaz, tasarsa kutunun disina cikardi.
   */
  const detail = useMemo(() => {
    if (!focused || !selectedName) return null
    const leaf = leaves.find((l) => l.m.name === selectedName)
    if (!leaf) return null

    const m = leaf.m
    const down = leaf.ui === "offline"
    const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t)
    const addr = formatTarget(m) + (m.port ? ":" + m.port : "")
    const statusText =
      leaf.ui === "offline" ? "Çevrimdışı" : leaf.ui === "warning" ? "Uyarı" : "Çevrimiçi"

    const since = selectedSince && now ? formatDuration(now.getTime() - selectedSince) : null

    /*
     * KAHRAMAN DEGER duruma gore degisiyor. Ayakta bir monitorde merak
     * edilen sey ne kadar hizli oldugu; dusmus bir monitorde ne kadar
     * suredir dusuk oldugu. Ikisini de esit boyda gostermek yerine, o an
     * hangisi onemliyse o buyuk yaziliyor.
     */
    const hero     = down ? (since ?? "—") : m.responseMs === null ? "—" : String(m.responseMs)
    const heroUnit = down ? "çevrimdışı" : "ms"
    const meta     = down ? "yanıt yok" : since ? since + " bu durumda" : ""
    /*
     * Yapraktan cikip kutuyu SARAN tek yol. Kutunun kenarligi ayri bir
     * stroke degil, bu yolun kendisi — akan isik da ayni yolu izliyor,
     * yani cizgi kutuya varinca etrafinda donmeye devam ediyor.
     * Giris noktasi kutunun sol kenarinin tam ortasi; kutu yapragin
     * hizasinda oldugu icin yol yatay girip yukari kivriliyor.
     */
    /*
     * Sunucu metrikleri yalnız karşılığı olan monitörde var (Datacenter
     * gövdesi). Kart yüksekliği ona göre büyüyor — metrik yoksa boş bir
     * şerit bırakmıyoruz.
     */
    /*
     * Arizali monitorde METRIK GOSTERILMIYOR. Makine yanit vermiyorsa
     * CPU/RAM/disk ya sifir ya bayat — "%0 CPU" yaziyor olmasi yanlis
     * bir sakinlik veriyordu. Onun yerine o an gercekten ise yarayan
     * sey konuyor: neden dusmus olabilir.
     */
    const mt = down ? null : metrics ? metricsFor(m, metrics) : null
    const causes = down ? causesFor(m, allMonitors, focused.g.monitors) : []

    /*
     * Döviz kaynaklarında ayrı bir soru var: kur ne zaman tazelendi?
     * Monitör yeşilken bile veri bayat olabilir (uç ayakta ama besleme
     * durmuş), o yüzden yaş kendi satırında ve bayatladıkça renk
     * değiştirerek gösteriliyor.
     */
    const hk = exchangeHealth ? exchangeHealthKey(m.name) : undefined
    const hs = hk && exchangeHealth ? exchangeHealth[hk] ?? null : null
    let fx: { ago: string; at: string; color: string; err: string | null } | null = null
    if (hs && now) {
      const age = now.getTime() - new Date(hs.lastUpdatedAt).getTime()
      fx = {
        ago: formatAgo(hs.lastUpdatedAt, now),
        at:  new Date(hs.lastUpdatedAt).toLocaleTimeString("tr-TR", {
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        }),
        color: age >= STALE_BAD_MS ? DOT.offline : age >= STALE_WARN_MS ? DOT.warning : FLOW,
        err: hs.lastError,
      }
    }

    const causesH = causes.length ? 24 + causes.length * 15 : 0
    /*  Metrik seridi, sunucu aktif kullanici bildiriyorsa bir satir
     *  uzuyor. Sabit 44 birakip satiri icine sikistirmak cubuklarla
     *  cakisiyordu.                                                   */
    const mtH = mt ? 44 + (mt.aktifKullanici != null ? 40 : 0) : 0
    const cardH = DETAIL_H + mtH + (fx ? 44 : 0) + causesH

    /*
     * Serit konumlari kart yuksekliginden geriye dogru hesaplaniyor. Bugun
     * bir monitorde ikisi birden cikmiyor (metrik yalniz Datacenter, tazelik
     * yalniz doviz), ama ikisi de "h - 44" kullansaydi yarin cakisirlardi.
     */
    const bandFx = fx ? cardH - 44 : 0
    const bandMt = mt ? cardH - mtH - (fx ? 44 : 0) : 0
    const bandCa = causes.length ? cardH - causesH : 0

    const bx = leaf.x + DETAIL_GAP
    const by = leaf.y - cardH / 2
    const r  = 10
    const n  = (v: number) => v.toFixed(1)

    /* Govde dugumunden yaprak egrisinin basladigi nokta — yapraklarin
       cizdigi egrinin birebir aynisi, boylece yol tam ust uste biniyor. */
    const dLen = Math.hypot(leaf.x - focused.x, leaf.y - focused.y) || 1
    const ox   = focused.x + ((leaf.x - focused.x) / dLen) * NODE_GAP
    const oy   = focused.y + ((leaf.y - focused.y) / dLen) * NODE_GAP
    const mx   = (focused.x + leaf.x) / 2
    /*
     * Yol adin BITTIGI yerden basliyor. Cok uzun bir adda kutuya yer
     * kalmazsa kutunun hemen soluna kenetleniyor — yol asla geriye
     * dogru cizilmiyor.
     */
    const labelW = textWidth(m.name)
    const startX = Math.min(leaf.x + 14 + labelW + 14, bx - 8)

    const wrapParts = [
      "M" + n(startX) + "," + n(leaf.y),
      "L" + n(bx) + "," + n(leaf.y),
      "L" + n(bx) + "," + n(by + r),
      "Q" + n(bx) + "," + n(by) + " " + n(bx + r) + "," + n(by),
      "L" + n(bx + DETAIL_W - r) + "," + n(by),
      "Q" + n(bx + DETAIL_W) + "," + n(by) + " " + n(bx + DETAIL_W) + "," + n(by + r),
      "L" + n(bx + DETAIL_W) + "," + n(by + cardH - r),
      "Q" + n(bx + DETAIL_W) + "," + n(by + cardH) + " " + n(bx + DETAIL_W - r) + "," + n(by + cardH),
      "L" + n(bx + r) + "," + n(by + cardH),
      "Q" + n(bx) + "," + n(by + cardH) + " " + n(bx) + "," + n(by + cardH - r),
      "L" + n(bx) + "," + n(leaf.y),
    ]
    const wrap = wrapParts.join(" ")

    /*
     * TAM AKIS YOLU: cekirdek → govde dali → yaprak egrisi → kutuyu saran
     * yol. Hepsi TEK bir path; uzerinde tek darbe kosuyor.
     *
     * Once parcali denendi (govdeye bir darbe, yaprağa bir darbe, kutuya
     * bir darbe) — "uc ayri sey akiyor" gibi okunuyordu. Tek yol tek darbe
     * = veri cekirdekten cikip secilen monitorun detayina kadar kesintisiz
     * gidiyor.
     *
     * ── Yaprak adinin ustunden gecme sorunu ──────────────────────────
     * Yol yatay ilerlerken tam da adin harflerinin arasindan geciyor.
     * Yolu adin bittigi yerden baslatmak tek parcaligi bozardi: SVG dash
     * deseni her alt-yolda BASTAN baslar, yani iki ayri darbe gorunurdu.
     * Cozum maske: yol butun halinde duruyor, darbe yalniz adin uzerinde
     * gorunmez oluyor — ad boyunca "arkasindan geciyor" gibi okunuyor.
     */
    const flowPath =
      focused.center +
      " L" + n(ox) + "," + n(oy) +
      " C" + n(mx) + "," + n(focused.y) +
      " "  + n(mx) + "," + n(leaf.y) +
      " "  + n(leaf.x) + "," + n(leaf.y) +
      " L" + n(bx) + "," + n(leaf.y) +
      " "  + wrapParts.slice(2).join(" ")

    const labelMask = {
      x: leaf.x + 9,
      y: leaf.y - 10,
      w: labelW + 12,
      h: 20,
    }

    return {
      leaf, down, x: bx, wrap, h: cardH, mt, flowPath, labelMask,
      statusText, statusColor: DOT[leaf.ui],
      type: m.type.toUpperCase(),
      addr: clip(addr, 30),
      hero, heroUnit, meta, fx, bandFx, bandMt, causes, bandCa,
    }
  }, [focused, leaves, selectedName, selectedSince, now, metrics, exchangeHealth, allMonitors])

  /* ── Kamera ──
   * Mevcut dönüşüm ref'te tutuluyor: odak değişince hedef değişir ama
   * bulunduğu yerden devam eder, sıçrama olmaz. */
  const camRef = useRef({ x: 0, y: 0, s: 1 })

  /** Fareyle üstünde durulan gövde — düğüm hale ve halkayla tepki verir */
  const [hoverKey, setHoverKey] = useState<TreeKey | null>(null)

  useEffect(() => {
    const layer = layerRef.current
    const g = gRef.current
    if (!layer || !g || w === 0) return

    // Hedef dönüşüm: odak yoksa kimlik, varsa gövdeyi sola getir + büyüt
    let targetS = 1, targetX = 0, targetY = 0
    if (focused) {
      targetS = 1.22
      targetX = w * 0.20 - focused.x * targetS
      targetY = h * 0.5 - focused.y * targetS
    }

    // Mevcut değerleri DOM'dan değil ref'ten sürdür — sıçrama olmasın
    const cur = camRef.current
    let raf = 0
    let last = performance.now()
    let running = true

    const apply = () => {
      const tf = `translate(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px) scale(${cur.s.toFixed(4)})`
      layer.style.transform = tf
      g.setAttribute("transform", `translate(${cur.x.toFixed(1)} ${cur.y.toFixed(1)}) scale(${cur.s.toFixed(4)})`)
      // Gokyuzu: ayni oteleme, katman derinligine gore kisilmis
      const PARALLAX = [0.05, 0.12, 0.24]
      for (let i = 0; i < skyRefs.length; i++) {
        const el = skyRefs[i].current
        if (!el) continue
        const f = PARALLAX[i]
        el.style.transform =
          "translate3d(" + (cur.x * f).toFixed(1) + "px, " + (cur.y * f).toFixed(1) + "px, 0)"
      }
    }

    const step = (now: number) => {
      if (!running) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      // Kritik sönümlü yaklaşım — yumuşak, salınımsız
      const k = 1 - Math.pow(0.0015, dt)
      cur.x += (targetX - cur.x) * k
      cur.y += (targetY - cur.y) * k
      cur.s += (targetS - cur.s) * k
      apply()

      const done =
        Math.abs(targetX - cur.x) < 0.3 &&
        Math.abs(targetY - cur.y) < 0.3 &&
        Math.abs(targetS - cur.s) < 0.002
      if (done) {
        cur.x = targetX; cur.y = targetY; cur.s = targetS
        apply()
        raf = 0
        return   // hedefe varıldı — döngü kendini durdurur
      }
      raf = requestAnimationFrame(step)
    }

    apply()
    raf = requestAnimationFrame(step)
    return () => { running = false; if (raf) cancelAnimationFrame(raf) }
  }, [focused, w, h, skyRefs])

  const anyDown = groups.some((g) => g.monitors.some((m) => m.status === "down"))
  const coreUi: UiStatus = anyDown ? "offline" : "online"

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      {/* En arkada gokyuzu */}
      <Sky layerRefs={skyRefs} alarm={anyDown} />

      <style>{`
        @keyframes tv-leaf-in {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        /* fill-mode BACKWARDS: animasyon bitince eleman kendi stiline döner.
           "both" olsaydı opacity son karede kilitlenir, seçim sonrası
           soluklaştırma uygulanamazdı. */
        .tv-leaf { animation: tv-leaf-in 300ms ease-out backwards; }
      `}</style>

      {/* Küre katmanı — SVG ile AYNI dönüşümü alır */}
      <div
        ref={layerRef}
        className="pointer-events-none absolute inset-0"
        style={{ transformOrigin: "0 0" }}
      >
        {w > 0 && (
          <div
            className="absolute"
            style={{
              left: geo.cx - geo.S / 2,
              top:  geo.cy - geo.S / 2,
              width: geo.S,
              height: geo.S,
            }}
          >
            {/* Çekirdek ışıması — orbun arkasında, tint renginde, nefes alan hale.
                Dallar bu ışıktan çıkıyormuş gibi görünsün diye orbdan büyük. */}
            <div
              className="animate-pulse absolute rounded-full"
              style={{
                inset: "-35%",
                background: `radial-gradient(circle, rgba(${
                  coreUi === "offline" ? "239,68,68" : "56,189,248"
                },0.24) 0%, rgba(${
                  coreUi === "offline" ? "239,68,68" : "56,189,248"
                },0.06) 42%, transparent 68%)`,
                filter: "blur(18px)",
                animationDuration: coreUi === "offline" ? "1.4s" : "3.2s",
              }}
            />
            <ThinkingOrbCanvas
              state="composing"
              size={geo.S}
              className="relative h-full w-full"
              tint={coreUi === "offline" ? "239,68,68" : "56,189,248"}
              speedMul={coreUi === "offline" ? 1.2 : 0.4}
            />
          </div>
        )}
      </div>

      {/* Boşluğa tıkla → genel görünüme dön */}
      {focusKey && (
        <button
          type="button"
          onClick={() => { onFocus(null); onSelect(null) }}
          className="absolute inset-0 z-0 cursor-default"
          aria-label="Genel görünüme dön"
        />
      )}

      {w > 0 && (
        <svg className="absolute inset-0 z-10" width={w} height={h}>
          <g ref={gRef}>
            {/* Küre → gövde dalları */}
            <defs>
              {/*
                Hat kürenin İÇİNDE başlıyor ama orada GÖRÜNMÜYOR: gradyan
                kökte tam saydam, kürenin kenarına doğru beliriyor. Düz
                renkli bir çizgi kullanılsaydı hat nokta bulutunun ortasında
                keskin bir biçimde başlar, çekirdeğe yapıştırılmış gibi
                dururdu — çıkış noktası görünmemeli, çıkışın kendisi
                görünmeli.
              */}
              {geo.trunks.map((t) => (
                <linearGradient
                  key={"v-" + t.g.def.key}
                  id={"vein-" + t.g.def.key}
                  x1={t.sx} y1={t.sy} x2={t.x} y2={t.y}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%"   stopColor={t.down ? DOT.offline : FLOW} stopOpacity={0} />
                  <stop offset="34%"  stopColor={t.down ? DOT.offline : FLOW} stopOpacity={0} />
                  <stop offset="62%"  stopColor={t.down ? DOT.offline : FLOW} stopOpacity={t.down ? 0.26 : 0.13} />
                  <stop offset="100%" stopColor={t.down ? DOT.offline : FLOW} stopOpacity={t.down ? 0.45 : 0.24} />
                </linearGradient>
              ))}
              {/* Darbe de aynı doğuş eğrisini izliyor: paket çekirdeğin
                  içinde görünmez, kürenin kenarında beliriyor. */}
              {geo.trunks.map((t) => (
                <linearGradient
                  key={"f-" + t.g.def.key}
                  id={"flow-" + t.g.def.key}
                  x1={t.sx} y1={t.sy} x2={t.x} y2={t.y}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%"   stopColor={t.down ? DOT.offline : FLOW} stopOpacity={0} />
                  <stop offset="38%"  stopColor={t.down ? DOT.offline : FLOW} stopOpacity={0} />
                  <stop offset="72%"  stopColor={t.down ? DOT.offline : FLOW} stopOpacity={0.85} />
                  <stop offset="100%" stopColor={t.down ? DOT.offline : FLOW} stopOpacity={1} />
                </linearGradient>
              ))}
            </defs>

            {geo.trunks.map((t) => {
              const dim  = focusKey !== null && focusKey !== t.g.def.key
              const mine = focusKey === t.g.def.key
              return (
                <g
                  key={t.g.def.key}
                  opacity={dim ? 0 : 1}
                  style={{ transition: "opacity 380ms ease-out" }}
                >
                  {/* Statik hat — kökte saydam, küreden çıkarken beliriyor */}
                  <path
                    d={t.center}
                    fill="none"
                    stroke={"url(#vein-" + t.g.def.key + ")"}
                    strokeWidth={1.1}
                    strokeLinecap="round"
                  />

                  {/*
                    Bir yaprak seçiliyken gövde dalının KENDİ darbeleri
                    susuyor; onun yerine küreden yaprağa giden tek parça
                    darbe çalışıyor. Aksi halde aynı hat üzerinde iki ayrı
                    akış üst üste biner, "tek hat" hissi kaybolurdu.
                  */}
                  {!(mine && selectedName) &&
                    [0, 1].map((k) => (
                      <Pulse
                        key={k}
                        d={t.center}
                        color={"url(#flow-" + t.g.def.key + ")"}
                        dur={t.down ? 5.2 : 3.2}
                        begin={k * (t.down ? 2.6 : 1.6)}
                      />
                    ))}
                </g>
              )
            })}


            {/* Gövdeler */}
            {geo.trunks.map((t) => {
              const dim    = focusKey !== null && focusKey !== t.g.def.key
              const active = focusKey === t.g.def.key
              const hot    = active || hoverKey === t.g.def.key
              const col    = t.down ? DOT.offline : DOT.online
              /**
               * Etiket, dalların ÇIKMADIĞI tarafta durur. Odakta iki yan da
               * dolu (solda küreden gelen dal, sağda yapraklar) — o yüzden
               * odakta düğümün ÜSTÜNE geçiyor.
               */
              const right = Math.cos((t.deg * Math.PI) / 180) >= -0.2
              return (
                <g
                  key={t.g.def.key}
                  opacity={dim ? 0.13 : 1}
                  /*
                   * Odak dışındaki gövdeler SEÇİLENDEN UZAKLAŞIYOR: yön,
                   * odaktaki gövdeden bu gövdeye bakan vektör. Yani seçilen
                   * merkez oluyor, diğerleri ondan itiliyor.
                   *
                   * Çekirdeğe doğru çekmeyi denedik, iyi durmadı; bulutun
                   * içine gömülüyorlardı. Bu yön hem daha okunaklı hem de
                   * "seçilen öne çıktı" hissini veriyor.
                   */
                  style={{
                    transition: "transform 560ms cubic-bezier(.2,.7,.2,1), opacity 380ms ease-out",
                    transform: dim && focused ? pushAway(t, focused) : "translate(0px, 0px)",
                    cursor: "pointer",
                  }}
                  onMouseEnter={() => setHoverKey(t.g.def.key)}
                  onMouseLeave={() => setHoverKey((k) => (k === t.g.def.key ? null : k))}
                  onClick={(e) => {
                    e.stopPropagation()
                    onFocus(active ? null : t.g.def.key)
                    onSelect(null)
                  }}
                >
                  {/* Tıklama alanı — orb'u kovalamak zorunda kalma */}
                  <circle cx={t.x} cy={t.y} r={34} fill="transparent" />
                  {/* Arka disk kaldırıldı: dallar orb'un ORTASINA kadar
                      görünüyor, düğümün içinden çıkıyormuş gibi. Orb transparan
                      canvas, altında doğrudan uzay + dal çizgileri. */}
                  {/* Düğüm çekirdeği — sayı yerine breathing orb (halka morph).
                      canvas SVG içine foreignObject ile girer; pointer-events
                      kapali ki tıklama <g>'ye gitsin. Arıza -> kırmızı ton. */}
                  <foreignObject
                    x={t.x - 22} y={t.y - 22} width={44} height={44}
                    style={{ pointerEvents: "none" }}
                  >
                    <ThinkingOrbCanvas
                      state="breathing"
                      size={44}
                      tint={col === DOT.offline ? "239,68,68" : "56,189,248"}
                      speedMul={t.down ? 2 : 1}
                    />
                  </foreignObject>

                  <text
                    x={active ? t.x : t.x + (right ? 26 : -26)}
                    y={active ? t.y - 44 : t.y}
                    textAnchor={active ? "middle" : right ? "start" : "end"}
                    dominantBaseline={active ? "auto" : "middle"}
                    fontSize={13}
                    fontWeight={700}
                    fill={t.down ? TXT_DOWN : hot ? "#F4F4F5" : TXT}
                    style={{ letterSpacing: "0.12em", transition: "fill 220ms" }}
                  >
                    {t.g.def.label.toUpperCase()}
                  </text>
                </g>
              )
            })}
            {/* Alt grup başlıkları — yalnız alt grubu tanımlı gövdelerde çıkar */}
            {focused &&
              heads.map((hd) => (
                <g key={hd.key} className="tv-leaf" style={{ pointerEvents: "none" }}>
                  <text
                    x={hd.x - 12}
                    y={hd.y}
                    dominantBaseline="middle"
                    fontSize={9}
                    fontWeight={700}
                    fill={TXT_DIM}
                    style={{ letterSpacing: "0.24em" }}
                  >
                    {hd.label.toUpperCase()}
                  </text>
                </g>
              ))}

            {/* Odaktaki gövdenin yaprakları — tek tek açılır */}
            {focused &&
              leaves.map((lf, i) => {
                const sel  = selectedName === lf.m.name
                const down = lf.ui === "offline"
                const mx   = (focused.x + lf.x) / 2
                const len  = Math.hypot(lf.x - focused.x, lf.y - focused.y) || 1
                const ox   = focused.x + ((lf.x - focused.x) / len) * NODE_GAP
                const oy   = focused.y + ((lf.y - focused.y) / len) * NODE_GAP
                const lp   = `M${ox.toFixed(1)},${oy.toFixed(1)} C${mx.toFixed(1)},${focused.y.toFixed(1)} ${mx.toFixed(1)},${lf.y.toFixed(1)} ${lf.x.toFixed(1)},${lf.y.toFixed(1)}`
                return (
                  <g
                    key={lf.m.name}
                    className="tv-leaf"
                    style={{
                      animationDelay: `${i * 55}ms`,
                      cursor: "pointer",
                      // Biri seçiliyken diğerleri geri çekilsin — göz seçilene gitsin
                      opacity: selectedName && !sel ? 0.34 : 1,
                      transition: "opacity 260ms ease-out",
                    }}
                    onClick={(e) => { e.stopPropagation(); onSelect(sel ? null : lf.m.name) }}
                  >
                    <path
                      d={lp}
                      fill="none"
                      stroke={down ? LINE_DOWN : LINE}
                      strokeWidth={1.2}
                    />
                    {/*
                      Yaprak dallarinda da akis var: govde canliysa
                      yapraklarinin da canli olmasi gerekiyor, aksi halde
                      odaklanınca hareket ölüyordu.

                      Secili yaprak haric — onun akisi kureden gelen tek
                      parca darbede. Gecikmeler i ile kaydiriliyor ki bes
                      yaprak ayni anda atmasin, sirayla aksin.
                    */}
                    {!sel && (
                      <Pulse
                        d={lp}
                        color={down ? DOT.offline : FLOW}
                        dur={down ? 4.6 : 3.0}
                        begin={(i % 4) * 0.75}
                        dash={11}
                        width={1.4}
                      />
                    )}
                    {/* Yalnizca tiklama alani. Secili yapragin arkaplan
                        vurgusu kaldirildi: hangisinin secili oldugu zaten
                        yaziden (kalin + parlak) ve kutuya giden isiktan
                        belli oluyor. */}
                    <rect
                      x={lf.x - 12} y={lf.y - 13} width={240} height={26} rx={4}
                      fill="transparent"
                    />
                    <circle cx={lf.x} cy={lf.y} r={4.5} fill={DOT[lf.ui]} />
                    <text
                      x={lf.x + 14}
                      y={lf.y}
                      dominantBaseline="middle"
                      fontSize={13}
                      fontWeight={down || sel ? 600 : 400}
                      fill={down ? TXT_DOWN : sel ? "#F4F4F5" : TXT}
                    >
                      {lf.m.name}
                    </text>
                  </g>
                )
              })}

            {/*
              Secili yaprakin DETAY KUTUSU — yan panelde degil, yapragin tam
              yaninda. SVG grubunun icinde oldugu icin kamera donusumunu
              kendiliginden aliyor: kamera kaydiginda kutu da yapragi takip
              ediyor, ayrica konum hesabi yapmaya gerek kalmiyor.

              Butun yapraklardan SONRA ciziliyor ki alttaki komsu yapraklarin
              tiklama alanlari kutunun ustune binmesin.
            */}
            {focused && detail && (
              <g style={{ pointerEvents: "none" }}>
                <rect
                  x={detail.x}
                  y={detail.leaf.y - detail.h / 2}
                  width={DETAIL_W}
                  height={detail.h}
                  rx={10}
                  fill="rgba(10,12,18,0.82)"
                />
                {/* Yapraktan gelip kutuyu saran yol — kutunun kenarligi bu */}
                <path
                  id="detail-wrap"
                  d={detail.wrap}
                  fill="none"
                  stroke={detail.down ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.16)"}
                  strokeWidth={1.2}
                  strokeLinejoin="round"
                />
                {/*
                  Cekirdekten kutuya kadar TEK darbe. Kutunun etrafini
                  donen ayri noktalar kaldirildi: ayni anda iki akis
                  gorunuyordu ve hangisinin nereden geldigi okunmuyordu.
                */}
                <defs>
                  <mask
                    id="leaf-label-mask"
                    maskUnits="userSpaceOnUse"
                    x={-5000} y={-5000} width={20000} height={20000}
                  >
                    <rect x={-5000} y={-5000} width={20000} height={20000} fill="white" />
                    {/* Siyah = gizli. Yaprak adinin durdugu dikdortgen. */}
                    <rect
                      x={detail.labelMask.x} y={detail.labelMask.y}
                      width={detail.labelMask.w} height={detail.labelMask.h}
                      fill="black"
                    />
                  </mask>
                </defs>
                <Pulse
                  d={detail.flowPath}
                  color={detail.down ? DOT.offline : FLOW}
                  dur={detail.down ? 6.4 : 4.6}
                  begin={0}
                  dash={4}
                  width={1.8}
                  mask="url(#leaf-label-mask)"
                />

                {(() => {
                  const bx = detail.x
                  const by = detail.leaf.y - detail.h / 2
                  return (
                    <>
                      {/* Üst satır: solda durum, sağda tür */}
                      <circle cx={bx + 18} cy={by + 20} r={3.5} fill={detail.statusColor} />
                      <text
                        x={bx + 28} y={by + 20} dominantBaseline="middle"
                        fontSize={9} fontWeight={700} fill={detail.statusColor}
                        style={{ letterSpacing: "0.22em" }}
                      >
                        {detail.statusText.toUpperCase()}
                      </text>
                      <text
                        x={bx + DETAIL_W - 14} y={by + 20} textAnchor="end" dominantBaseline="middle"
                        fontSize={9} fill={TXT_DIM} className="font-mono"
                        style={{ letterSpacing: "0.12em" }}
                      >
                        {detail.type}
                      </text>

                      <line
                        x1={bx + 14} y1={by + 34} x2={bx + DETAIL_W - 14} y2={by + 34}
                        stroke="rgba(255,255,255,0.08)" strokeWidth={1}
                      />

                      {/* Kahraman değer */}
                      <text
                        x={bx + 16} y={by + 62} dominantBaseline="middle"
                        fontSize={26} fontWeight={700} className="font-mono"
                        fill={detail.down ? DOT.offline : FLOW}
                      >
                        {detail.hero}
                      </text>
                      <text
                        x={bx + 16 + detail.hero.length * 16 + 8} y={by + 66} dominantBaseline="middle"
                        fontSize={9} fill={TXT_DIM}
                        style={{ letterSpacing: "0.14em" }}
                      >
                        {detail.heroUnit.toUpperCase()}
                      </text>

                      {/* Meta */}
                      <text
                        x={bx + 16} y={by + 90} dominantBaseline="middle"
                        fontSize={10} fill={TXT} className="font-mono"
                      >
                        {detail.addr}
                      </text>
                      <text
                        x={bx + 16} y={by + 107} dominantBaseline="middle"
                        fontSize={9} fill={TXT_DIM}
                        style={{ letterSpacing: "0.10em" }}
                      >
                        {detail.meta}
                      </text>

                      {/* Olası sebepler — yalnız arızada.
                          Bağıntıdan çıkanlar üstte: onlar tahmin değil,
                          diğer monitörlerin söylediği şey. */}
                      {detail.causes.length > 0 && (
                        <>
                          <line
                            x1={bx + 14} y1={by + detail.bandCa}
                            x2={bx + DETAIL_W - 14} y2={by + detail.bandCa}
                            stroke="rgba(239,68,68,0.16)" strokeWidth={1}
                          />
                          <text
                            x={bx + 16} y={by + detail.bandCa + 15} dominantBaseline="middle"
                            fontSize={8} fill={TXT_DIM} style={{ letterSpacing: "0.16em" }}
                          >
                            OLASI SEBEPLER
                          </text>
                          {detail.causes.map((c, ci) => (
                            <g key={ci}>
                              <circle
                                cx={bx + 19} cy={by + detail.bandCa + 32 + ci * 15}
                                r={1.6} fill={DOT.offline} opacity={0.75}
                              />
                              <text
                                x={bx + 27} y={by + detail.bandCa + 32 + ci * 15}
                                dominantBaseline="middle" fontSize={9}
                                fill={ci === 0 ? "#FCA5A5" : TXT_DIM}
                              >
                                {c}
                              </text>
                            </g>
                          ))}
                        </>
                      )}

                      {/* Döviz tazeliği — yalnız döviz kaynaklarında.
                          Monitör yeşilken bile besleme durmuş olabilir, o
                          yüzden yaş kendi satırında ve bayatladıkça renk
                          değiştiriyor. */}
                      {detail.fx && (
                        <>
                          <line
                            x1={bx + 14} y1={by + detail.bandFx}
                            x2={bx + DETAIL_W - 14} y2={by + detail.bandFx}
                            stroke="rgba(255,255,255,0.08)" strokeWidth={1}
                          />
                          <text
                            x={bx + 16} y={by + detail.bandFx + 18} dominantBaseline="middle"
                            fontSize={8} fill={TXT_DIM} style={{ letterSpacing: "0.16em" }}
                          >
                            SON GÜNCELLEME
                          </text>
                          <text
                            x={bx + DETAIL_W - 16} y={by + detail.bandFx + 18} textAnchor="end"
                            dominantBaseline="middle" fontSize={11}
                            fontWeight={700} className="font-mono" fill={detail.fx.color}
                          >
                            {detail.fx.ago}
                          </text>
                          {/* Saat de yaziliyor: "3 dk önce" degisimi gosterir,
                              saat hangi ana ait oldugunu sabitler */}
                          <text
                            x={bx + 16} y={by + detail.bandFx + 32} dominantBaseline="middle"
                            fontSize={9} fill={TXT_DIM} className="font-mono"
                            style={{ letterSpacing: "0.08em" }}
                          >
                            {detail.fx.at}
                          </text>
                          {detail.fx.err && (
                            <text
                              x={bx + DETAIL_W - 16} y={by + detail.bandFx + 32} textAnchor="end"
                              dominantBaseline="middle" fontSize={9}
                              className="font-mono" fill={DOT.offline}
                            >
                              {detail.fx.err.length > 22
                                ? detail.fx.err.slice(0, 21) + "…"
                                : detail.fx.err}
                            </text>
                          )}
                        </>
                      )}

                      {/* Sunucu metrikleri — yalnız karşılığı olan monitörde */}
                      {detail.mt && (
                        <>
                          <line
                            x1={bx + 14} y1={by + detail.bandMt}
                            x2={bx + DETAIL_W - 14} y2={by + detail.bandMt}
                            stroke="rgba(255,255,255,0.08)" strokeWidth={1}
                          />
                          {([
                            ["CPU",  detail.mt.cpu],
                            ["RAM",  detail.mt.ram],
                            ["DİSK", detail.mt.disk],
                          ] as [string, number][]).map(([lbl, v], i) => {
                            const colW = (DETAIL_W - 32) / 3
                            const cx0  = bx + 16 + i * colW
                            const barW = colW - 12
                            const col  = loadColor(v)
                            return (
                              <g key={lbl}>
                                <text
                                  x={cx0} y={by + detail.bandMt + 18} dominantBaseline="middle"
                                  fontSize={8} fill={TXT_DIM} style={{ letterSpacing: "0.16em" }}
                                >
                                  {lbl}
                                </text>
                                <text
                                  x={cx0 + barW} y={by + detail.bandMt + 18} textAnchor="end"
                                  dominantBaseline="middle" fontSize={10}
                                  className="font-mono" fill={col}
                                >
                                  {v}%
                                </text>
                                {/* Doluluk çubuğu — rakam tek başına "çok mu az mı"
                                    sorusuna cevap vermiyor, çubuk veriyor */}
                                <rect
                                  x={cx0} y={by + detail.bandMt + 28} width={barW} height={3} rx={1.5}
                                  fill="rgba(255,255,255,0.09)"
                                />
                                <rect
                                  x={cx0} y={by + detail.bandMt + 28}
                                  width={Math.max(1, (barW * Math.min(100, v)) / 100)}
                                  height={3} rx={1.5} fill={col}
                                />
                              </g>
                            )
                          })}

                          {/*  Aktif kullanici — yalniz oturum bildiren
                              sunucuda (pratikte terminal makineleri).

                              Yuzde degil ADET. Cubuk cizilmiyor: cubuk
                              "100 uzerinden" izlenimi verirdi. Bunun
                              yerine kartin en ustundeki kahraman deger
                              ile ayni dil kullaniliyor — buyuk mono
                              rakam + kucuk birim. Boylece satir bir
                              olcum degil, bir SAYIM gibi okunuyor.     */}
                          {detail.mt.aktifKullanici != null && (
                            <>
                              <line
                                x1={bx + 16} y1={by + detail.bandMt + 40}
                                x2={bx + DETAIL_W - 16} y2={by + detail.bandMt + 40}
                                stroke="rgba(255,255,255,0.06)" strokeWidth={1}
                              />
                              <text
                                x={bx + 16} y={by + detail.bandMt + 60} dominantBaseline="middle"
                                fontSize={8} fill={TXT_DIM} style={{ letterSpacing: "0.16em" }}
                              >
                                AKTİF KULLANICI
                              </text>
                              <text
                                x={bx + DETAIL_W - 16} y={by + detail.bandMt + 62} textAnchor="end"
                                dominantBaseline="middle" fontSize={8}
                                fill={TXT_DIM} style={{ letterSpacing: "0.14em" }}
                              >
                                KİŞİ
                              </text>
                              <text
                                x={bx + DETAIL_W - 44} y={by + detail.bandMt + 60} textAnchor="end"
                                dominantBaseline="middle" fontSize={22} fontWeight={700}
                                className="font-mono" fill={FLOW}
                              >
                                {detail.mt.aktifKullanici}
                              </text>
                            </>
                          )}
                        </>
                      )}
                    </>
                  )
                })()}
              </g>
            )}

          </g>
        </svg>
      )}
    </div>
  )
}
