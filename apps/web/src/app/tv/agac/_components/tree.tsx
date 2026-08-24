"use client"

/**
 * Yatay dendrogram — kök solda, gövdeler ortada, yapraklar sağa açılır.
 *
 * Neden bu şekil: eleman sayısı arttıkça AŞAĞI uzuyor, sıkışmıyor. Radyal
 * düzende (silinen /tv2) 24 monitörde bile etiketler üst üste biniyordu;
 * burada yeni monitör yalnızca bir satır ekler.
 *
 * Gösterge SADECE hayatta mı: yeşil / kırmızı. Yanıt süresi, uptime yüzdesi
 * gibi ikinci bir metrik yok — 60 monitörde de okunur kalsın diye.
 *
 * Hiçbir animasyon yok. Duran bir şema; değişen tek şey renk.
 */

import { useEffect, useRef, useState } from "react"
import { type KumaMonitor, type UiStatus, formatTarget, mapStatus } from "../../_shared/types"
import type { TreeDef } from "../../_shared/monitor-groups"

/* ── Koyu tema paleti — ölçülü, parlama yok ── */
const LINE      = "rgba(255,255,255,0.10)"
const LINE_DOWN = "rgba(239,68,68,0.55)"
const ROOT      = "#38BDF8"
const TXT       = "#D4D4D8"
const TXT_DOWN  = "#FCA5A5"
const TXT_DIM   = "#71717A"
const TXT_TRUNK = "#A1A1AA"
const SEL_BG    = "rgba(56,189,248,0.10)"

const DOT: Record<UiStatus, string> = {
  online:  "#34D399",
  warning: "#FBBF24",
  offline: "#EF4444",
}

export interface TreeGroup {
  def:      TreeDef
  monitors: KumaMonitor[]
}

/** Kapsayıcıyı ölç — SVG'yi piksel koordinatında çiziyoruz. */
function useSize(): [React.RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize((prev) => {
        const w = Math.round(r.width)
        const h = Math.round(r.height)
        return prev.w === w && prev.h === h ? prev : { w, h }
      })
    }
    // İlk ölçüm senkron — ResizeObserver bildirimi bir sonraki karede gelir,
    // sekme arka plandaysa hiç gelmez ve ağaç boş kalırdı.
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

/** Kök → gövde → yaprak arası yumuşak S eğrisi */
function elbow(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2
  return `M${x1.toFixed(1)},${y1.toFixed(1)} C${mx.toFixed(1)},${y1.toFixed(1)} ${mx.toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`
}

interface Props {
  groups:       TreeGroup[]
  selectedName: string | null
  onSelect:     (name: string | null) => void
}

export function Tree({ groups, selectedName, onSelect }: Props) {
  const [ref, { w, h }] = useSize()

  const leafCount = groups.reduce((s, g) => s + g.monitors.length, 0)
  const gapCount  = Math.max(0, groups.length - 1)

  /* ── Dikey ölçek: mevcut yüksekliğe yay, ama okunur sınırlar içinde ── */
  const PAD_Y     = 18
  const GROUP_GAP = 26
  const usable    = Math.max(0, h - PAD_Y * 2 - GROUP_GAP * gapCount)
  const rowH      = leafCount > 0 ? Math.min(38, Math.max(19, usable / leafCount)) : 24
  const contentH  = leafCount * rowH + GROUP_GAP * gapCount + PAD_Y * 2
  const svgH      = Math.max(h, contentH)

  /* ── Yatay ölçek ── */
  const rootX  = 54
  const trunkX = Math.max(190, w * 0.14)
  const leafX  = Math.max(320, w * 0.26)
  /**
   * Kimlik sütunu — sağa yaslı. Ağaç tek başına yatayda ekranın yarısını boş
   * bırakıyordu; hangi makine/adres olduğu buraya gelince hem boşluk doluyor
   * hem de göz ikinci bir sütunu tarayabiliyor. Bu bir METRİK değil, kimlik:
   * "sadece hayatta mı" kuralı bozulmuyor.
   */
  const hostX  = w - 16

  /* Yaprak konumlarını önden hesapla — hem çizgi hem etiket aynı y'yi kullanır */
  let cursor = PAD_Y
  const laid = groups.map((g) => {
    const rows = g.monitors.map((m, i) => ({
      m,
      y: cursor + i * rowH + rowH / 2,
      ui: mapStatus(m.status),
    }))
    const yMid = cursor + (g.monitors.length * rowH) / 2
    cursor += g.monitors.length * rowH + GROUP_GAP
    return { g, rows, yMid, down: rows.filter((r) => r.ui === "offline").length }
  })

  const rootY = svgH / 2
  const fontLeaf  = rowH >= 26 ? 14 : rowH >= 22 ? 13 : 12
  const fontTrunk = rowH >= 26 ? 12 : 11

  return (
    <div ref={ref} className="h-full w-full overflow-auto">
      {w > 0 && (
        <svg width={w} height={svgH} className="block">
          {/* Kök → gövde */}
          {laid.map((L) => (
            <path
              key={`root-${L.g.def.key}`}
              d={elbow(rootX + 10, rootY, trunkX - 9, L.yMid)}
              fill="none"
              stroke={L.down > 0 ? LINE_DOWN : LINE}
              strokeWidth={1.5}
            />
          ))}

          {/* Kök */}
          <circle cx={rootX} cy={rootY} r={7} fill={ROOT} />
          <text
            x={rootX}
            y={rootY + 22}
            textAnchor="middle"
            fontSize={10}
            fill={TXT_DIM}
            style={{ letterSpacing: "0.18em" }}
          >
            PUSULA
          </text>

          {laid.map((L) => (
            <g key={L.g.def.key}>
              {/* Gövde → yapraklar */}
              {L.rows.map((r) => (
                <path
                  key={`b-${r.m.name}`}
                  d={elbow(trunkX + 8, L.yMid, leafX - 10, r.y)}
                  fill="none"
                  stroke={r.ui === "offline" ? LINE_DOWN : LINE}
                  strokeWidth={1.2}
                />
              ))}

              {/* Gövde düğümü + etiketi */}
              <circle cx={trunkX} cy={L.yMid} r={5.5} fill={L.down > 0 ? DOT.offline : DOT.online} />
              <text
                x={trunkX - 13}
                y={L.yMid - 4}
                textAnchor="end"
                fontSize={fontTrunk}
                fontWeight={700}
                fill={L.down > 0 ? TXT_DOWN : TXT_TRUNK}
                style={{ letterSpacing: "0.1em" }}
              >
                {L.g.def.label.toUpperCase()}
              </text>
              <text
                x={trunkX - 13}
                y={L.yMid + 10}
                textAnchor="end"
                fontSize={10}
                fill={TXT_DIM}
                className="font-mono"
              >
                {L.down > 0 ? `${L.down}/${L.rows.length} arıza` : `${L.rows.length} monitör`}
              </text>

              {/* Yapraklar */}
              {L.rows.map((r) => {
                const selected = selectedName === r.m.name
                const down     = r.ui === "offline"
                return (
                  <g
                    key={r.m.name}
                    onClick={() => onSelect(selected ? null : r.m.name)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Tıklama alanı — ince daireyi kovalamak zorunda kalma */}
                    <rect
                      x={leafX - 16}
                      y={r.y - rowH / 2}
                      width={Math.max(120, w - leafX)}
                      height={rowH}
                      rx={4}
                      fill={selected ? SEL_BG : "transparent"}
                    />
                    <circle cx={leafX - 4} cy={r.y} r={4.5} fill={DOT[r.ui]} />
                    <text
                      x={leafX + 12}
                      y={r.y}
                      dominantBaseline="middle"
                      fontSize={fontLeaf}
                      fontWeight={down || selected ? 600 : 400}
                      fill={down ? TXT_DOWN : selected ? "#F4F4F5" : TXT}
                    >
                      {r.m.name}
                    </text>
                    <text
                      x={hostX}
                      y={r.y}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={fontLeaf - 2}
                      fill={down ? "rgba(252,165,165,0.65)" : TXT_DIM}
                      className="font-mono"
                    >
                      {formatTarget(r.m)}
                    </text>
                  </g>
                )
              })}
            </g>
          ))}
        </svg>
      )}
    </div>
  )
}
