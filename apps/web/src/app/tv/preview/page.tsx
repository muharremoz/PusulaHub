"use client"

import { cn } from "@/lib/utils"
import { Wifi, Activity } from "lucide-react"

/* ══════════════════════════════════════════════════════════
   Monitor tile tasarım galerisi — /tv sayfasında kullanılacak
   tile'ın 5 farklı versiyonu. Hepsi aynı veri, aynı palet
   (zinc-900 dış, zinc-800 iç, yeşil/sarı/kırmızı accent).

   Seç, söyle, /tv'deki MonitorTile onunla değiştirilsin.
══════════════════════════════════════════════════════════ */

interface Monitor {
  name:       string
  target:     string
  status:     "online" | "warning" | "offline"
  responseMs: number | null
}

const MOCK: Monitor = { name: "Pusula Kur", target: "10.15.2.6:8080/health", status: "online", responseMs: 4 }

const OUTER_BG = "bg-[#171717]"
const INNER_BG = "bg-[#27272A]"
const INNER_SHADOW = { boxShadow: "0 2px 6px rgba(0,0,0,0.4)" } as const

const STATUS = {
  online: {
    label: "Çevrimiçi",
    dotBg:  "bg-emerald-400",
    glow:   "shadow-[0_0_14px_rgba(52,211,153,0.8)]",
    text:   "text-emerald-300",
    soft:   "bg-emerald-500/10",
    border: "border-emerald-500/30",
    bar:    "bg-emerald-400",
  },
  warning: {
    label: "Uyarı",
    dotBg:  "bg-amber-400",
    glow:   "shadow-[0_0_14px_rgba(251,191,36,0.8)]",
    text:   "text-amber-300",
    soft:   "bg-amber-500/10",
    border: "border-amber-500/40",
    bar:    "bg-amber-400",
  },
  offline: {
    label: "Çevrimdışı",
    dotBg:  "bg-red-500",
    glow:   "shadow-[0_0_18px_rgba(239,68,68,1)]",
    text:   "text-red-300",
    soft:   "bg-red-500/10",
    border: "border-red-500/40",
    bar:    "bg-red-500",
  },
}

function LiveDot({ status, size = "size-3", className }: { status: keyof typeof STATUS; size?: string; className?: string }) {
  const s = STATUS[status]
  return (
    <span className={cn("relative inline-flex shrink-0", size, className)}>
      <span className={cn("absolute inset-0 rounded-full opacity-75 animate-ping", s.dotBg)} />
      <span className={cn("relative inline-block rounded-full w-full h-full", s.dotBg, s.glow)} />
    </span>
  )
}

function respColor(ms: number | null) {
  if (ms === null) return "text-red-400"
  if (ms < 30) return "text-emerald-300"
  if (ms < 80) return "text-amber-300"
  return "text-red-300"
}

/* ══════════════════════════════════════════════════════════
   V1 — Baseline (şu anki tasarım)
══════════════════════════════════════════════════════════ */
function V1_Baseline({ m }: { m: Monitor }) {
  const s = STATUS[m.status]
  return (
    <div className={cn("rounded-[8px] p-2 pb-0", OUTER_BG)}>
      <div className={cn("rounded-[4px] flex flex-col", INNER_BG)} style={INNER_SHADOW}>
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <LiveDot status={m.status} className="mt-1.5" />
            <div className="min-w-0">
              <h3 className="text-[19px] font-bold leading-tight truncate text-zinc-100">{m.name}</h3>
              <p className="text-[12px] font-mono mt-0.5 truncate text-zinc-500">{m.target}</p>
            </div>
          </div>
          <span className={cn("text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-[5px] border shrink-0", s.text, s.soft, s.border)}>
            {s.label}
          </span>
        </div>
        <div className="mx-2 mb-2 rounded-[4px] bg-black/30 border border-white/5 px-3 py-2 flex items-baseline justify-between">
          <p className="text-[10px] font-medium tracking-widest uppercase text-zinc-500">Yanıt</p>
          <div className="flex items-baseline gap-1.5">
            <Wifi className={cn("size-4 self-center", respColor(m.responseMs))} />
            <span className={cn("text-[30px] font-bold tabular-nums leading-none", respColor(m.responseMs))}>
              {m.responseMs === null ? "—" : m.responseMs < 1 ? "<1" : Math.round(m.responseMs)}
            </span>
            <span className="text-[13px] text-zinc-500">ms</span>
          </div>
        </div>
      </div>
      <div className="h-2" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   V2 — Hero Ping (ortada devasa ms, her şey onun etrafında)
══════════════════════════════════════════════════════════ */
function V2_HeroPing({ m }: { m: Monitor }) {
  const s = STATUS[m.status]
  return (
    <div className={cn("rounded-[8px] p-2 pb-0", OUTER_BG)}>
      <div className={cn("rounded-[4px] relative overflow-hidden", INNER_BG)} style={INNER_SHADOW}>
        <div className="px-4 pt-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <LiveDot status={m.status} size="size-2.5" />
            <h3 className="text-[15px] font-semibold truncate text-zinc-200">{m.name}</h3>
          </div>
          <span className={cn("text-[9px] font-bold uppercase tracking-widest", s.text)}>
            {s.label}
          </span>
        </div>
        <div className="flex items-end justify-center gap-2 pt-3 pb-2">
          <span className={cn("text-[64px] font-black tabular-nums leading-none tracking-tight", respColor(m.responseMs))}>
            {m.responseMs === null ? "—" : m.responseMs < 1 ? "<1" : Math.round(m.responseMs)}
          </span>
          <span className="text-[18px] text-zinc-500 mb-2">ms</span>
        </div>
        <p className="text-[11px] font-mono text-center text-zinc-500 pb-3 truncate px-3">{m.target}</p>
      </div>
      <div className="h-2" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   V3 — Accent Bar (sol dikey renkli şerit, flat içerik)
══════════════════════════════════════════════════════════ */
function V3_AccentBar({ m }: { m: Monitor }) {
  const s = STATUS[m.status]
  return (
    <div className={cn("rounded-[8px] p-2 pb-0", OUTER_BG)}>
      <div className={cn("rounded-[4px] flex overflow-hidden", INNER_BG)} style={INNER_SHADOW}>
        <div className={cn("w-1.5 shrink-0", s.bar, s.glow)} />
        <div className="flex-1 px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[17px] font-bold truncate text-zinc-100">{m.name}</h3>
              <span className={cn("text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm", s.text, s.soft)}>
                {s.label}
              </span>
            </div>
            <p className="text-[11px] font-mono mt-0.5 truncate text-zinc-500">{m.target}</p>
          </div>
          <div className="flex items-baseline gap-1 shrink-0">
            <span className={cn("text-[32px] font-bold tabular-nums leading-none", respColor(m.responseMs))}>
              {m.responseMs === null ? "—" : m.responseMs < 1 ? "<1" : Math.round(m.responseMs)}
            </span>
            <span className="text-[12px] text-zinc-500">ms</span>
          </div>
        </div>
      </div>
      <div className="h-2" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   V4 — Minimal (tek satır yatay, kompakt)
══════════════════════════════════════════════════════════ */
function V4_Minimal({ m }: { m: Monitor }) {
  return (
    <div className={cn("rounded-[8px] p-2 pb-0", OUTER_BG)}>
      <div className={cn("rounded-[4px] px-4 py-4", INNER_BG)} style={INNER_SHADOW}>
        <div className="flex items-center gap-3">
          <LiveDot status={m.status} size="size-3.5" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[18px] font-bold truncate text-zinc-100 leading-none">{m.name}</h3>
            <p className="text-[11px] font-mono mt-1 truncate text-zinc-500">{m.target}</p>
          </div>
          <div className="flex items-baseline gap-1 shrink-0">
            <span className={cn("text-[28px] font-bold tabular-nums leading-none", respColor(m.responseMs))}>
              {m.responseMs === null ? "—" : m.responseMs < 1 ? "<1" : Math.round(m.responseMs)}
            </span>
            <span className="text-[12px] text-zinc-500">ms</span>
          </div>
        </div>
      </div>
      <div className="h-2" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   V5 — Terminal/Mono (tamamı monospace, bracket stil)
══════════════════════════════════════════════════════════ */
function V5_Terminal({ m }: { m: Monitor }) {
  const s = STATUS[m.status]
  return (
    <div className={cn("rounded-[8px] p-2 pb-0", OUTER_BG)}>
      <div className={cn("rounded-[4px] font-mono", INNER_BG)} style={INNER_SHADOW}>
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn("text-[14px]", s.text)}>&#9679;</span>
            <span className="text-[15px] font-bold text-zinc-100 truncate">{m.name}</span>
          </div>
          <span className={cn("text-[10px] uppercase", s.text)}>
            [ {s.label.toLowerCase()} ]
          </span>
        </div>
        <div className="px-4 py-3 flex items-center justify-between text-[12px]">
          <div>
            <span className="text-zinc-500">$ ping </span>
            <span className="text-zinc-300">{m.target}</span>
          </div>
          <span className={cn("text-[20px] font-bold tabular-nums", respColor(m.responseMs))}>
            {m.responseMs === null ? "—" : m.responseMs < 1 ? "<1" : Math.round(m.responseMs)}<span className="text-zinc-500 text-[12px]">ms</span>
          </span>
        </div>
      </div>
      <div className="h-2" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Sayfa — her varyant 3 durumda (online/warning/offline) yan yana
══════════════════════════════════════════════════════════ */
const VARIANTS: Array<{ id: string; label: string; desc: string; Comp: (props: { m: Monitor }) => React.ReactElement }> = [
  { id: "v1", label: "V1 — Baseline",   desc: "Nested pill, üstte başlık+rozet, altta yanıt kutusu (şu anki tile)", Comp: V1_Baseline },
  { id: "v2", label: "V2 — Hero Ping",  desc: "Ortada devasa ms sayı, her şey onun etrafında",                       Comp: V2_HeroPing },
  { id: "v3", label: "V3 — Accent Bar", desc: "Sol dikey renkli şerit, flat içerik, yatay düzen",                    Comp: V3_AccentBar },
  { id: "v4", label: "V4 — Minimal",    desc: "Tek satır, dot + ad + ms. Sade kompakt.",                             Comp: V4_Minimal },
  { id: "v5", label: "V5 — Terminal",   desc: "Tamamen monospace, `$ ping host` + bracket durum",                    Comp: V5_Terminal },
]

const STATES: Monitor[] = [
  { name: "Pusula Kur",   target: "10.15.2.6:8080/health", status: "online",  responseMs: 4 },
  { name: "pusulanet.net", target: "pusulanet.net/",        status: "warning", responseMs: 104 },
  { name: "Fastify API",  target: "10.15.2.6:3000",        status: "offline", responseMs: null },
]

export default function PreviewPage() {
  return (
    <div className="min-h-screen bg-[#0E0E0E] p-10">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="size-10 rounded-[5px] bg-sky-950 flex items-center justify-center">
            <Activity className="size-5 text-sky-300" />
          </div>
          <h1 className="text-[24px] font-bold text-zinc-100 tracking-tight">TV Monitor Tile — Tasarım Galerisi</h1>
        </div>
        <p className="text-[13px] text-zinc-500">
          5 varyant · her biri 3 durumda (çevrimiçi / uyarı / çevrimdışı). Beğendiğini söyle, <code className="text-zinc-300">/tv</code> onunla güncellenir.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {VARIANTS.map(({ id, label, desc, Comp }) => (
          <section key={id} className="rounded-[8px] bg-[#141414] border border-white/5 p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <div>
                <h2 className="text-[18px] font-bold text-zinc-100">{label}</h2>
                <p className="text-[12px] text-zinc-500 mt-1">{desc}</p>
              </div>
              <code className="text-[11px] text-zinc-600 font-mono">{id}</code>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {STATES.map((s) => (
                <div key={s.name} className="min-w-0">
                  <Comp m={s} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
