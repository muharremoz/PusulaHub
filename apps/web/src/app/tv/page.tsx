"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { cn } from "@/lib/utils"
import { Activity, AlertTriangle, CheckCircle2, WifiOff, Volume2, VolumeX } from "lucide-react"

/* ══════════════════════════════════════════════════════════
   Proje stili — Dark varyantı
   ──────────────────────────────────────────────────────────
   Light'taki çift katmanlı kart:
     outer  #F4F2F0      → dark: #171717 (zinc-900)
     inner  #FFFFFF      → dark: #27272A (zinc-800)
     shadow 0 2px 4px…   → dark: 0 2px 6px rgba(0,0,0,.4)
   Aynı radius ve padding pattern: p-2 pb-0, rounded-[8px]/[4px].
   TV 4K 55" için font ölçekleri büyütülmüş ama tipografi mantığı aynı:
   uppercase tracking-wide label + tabular-nums büyük sayı.
══════════════════════════════════════════════════════════ */

const OUTER_BG = "bg-[#171717]"
const OUTER_BG_HEX = "#171717"
const INNER_BG = "bg-[#27272A]"
const INNER_SHADOW = { boxShadow: "0 2px 6px rgba(0,0,0,0.4)" } as const

/** Dış kart arka planına status rengiyle 135° çapraz çizgi pattern */
function stripedBg(color: string): React.CSSProperties {
  return {
    backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 1px, transparent 1px 10px), linear-gradient(${OUTER_BG_HEX},${OUTER_BG_HEX})`,
  }
}

const STRIPE_COLOR = {
  emerald: "rgba(52,211,153,0.09)",
  amber:   "rgba(251,191,36,0.12)",
  red:     "rgba(239,68,68,0.15)",
  sky:     "rgba(125,211,252,0.08)",
  zinc:    "rgba(255,255,255,0.05)",
} as const

type KumaStatus = "up" | "down" | "pending" | "maintenance" | "unknown"

interface KumaMonitor {
  name:       string
  type:       string
  hostname:   string | null
  url:        string | null
  port:       string | null
  status:     KumaStatus
  responseMs: number | null
}

interface ExchangeHealthEntry {
  status:        string
  state:         string
  lastUpdatedAt: string
  lastChangedAt: string
  lastError:     string | null
}
interface MonitoringResponse {
  ok:              true
  fetchedAt:       string
  counts:          { total: number; online: number; warning: number; offline: number }
  monitors:        KumaMonitor[]
  exchangeHealth?: Record<string, ExchangeHealthEntry> | null
}

/** Birkaç saniye önce / dakika önce / saat önce formatı */
function formatAgo(iso: string, now: Date): string {
  const diff = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return `${Math.round(diff)} sn önce`
  if (diff < 3600)  return `${Math.round(diff / 60)} dk önce`
  if (diff < 86400) return `${Math.round(diff / 3600)} sa önce`
  return `${Math.round(diff / 86400)} gün önce`
}

/** Döviz mini kartlarında kaynak adını health endpoint anahtarına eşle */
const EXCHANGE_HEALTH_KEY: Record<string, string> = {
  "Altınkaynak": "altinkaynak",
  "Datshop":     "datshop",
  "Ozankur":     "ozankur",
  "TCMB":        "tcmb",
  "Pusula":      "pusula",
}

type UiStatus = "online" | "warning" | "offline"

function mapStatus(s: KumaStatus): UiStatus {
  if (s === "up") return "online"
  if (s === "down") return "offline"
  return "warning"
}

function formatTarget(m: KumaMonitor): string {
  if (m.hostname) return m.hostname
  if (m.url) return m.url.replace(/^https?:\/\//, "")
  return "—"
}

/* ══════════════════════════════════════════════════════════
   Saat
══════════════════════════════════════════════════════════ */
function useClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** "3 dk" / "1 sa 4 dk" kısa süre formatı */
function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60)    return `${s} sn`
  const m = Math.floor(s / 60)
  if (m < 60)    return `${m} dk`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h} sa ${rm} dk` : `${h} sa`
}

/**
 * Her monitor'ün (status, since) durumunu takip eder — status değiştiğinde
 * `since` sıfırlanır. DOWN süresi ve olay log'u için referans.
 */
interface StatusTrack { status: KumaStatus; since: number }
interface StatusEvent { name: string; from: KumaStatus; to: KumaStatus; at: number }

function useStatusTracker(monitors: KumaMonitor[] | null): {
  tracker: Map<string, StatusTrack>
  events:  StatusEvent[]
  lastDownAt: number | null
} {
  const trackerRef = useRef<Map<string, StatusTrack>>(new Map())
  const [events, setEvents] = useState<StatusEvent[]>([])
  const [lastDownAt, setLastDownAt] = useState<number | null>(null)

  useEffect(() => {
    if (!monitors) return
    const now = Date.now()
    const map = trackerRef.current
    const newEvents: StatusEvent[] = []
    let anyNewDown = false

    for (const m of monitors) {
      const prev = map.get(m.name)
      if (!prev) {
        map.set(m.name, { status: m.status, since: now })
      } else if (prev.status !== m.status) {
        newEvents.push({ name: m.name, from: prev.status, to: m.status, at: now })
        if (m.status === "down" && prev.status !== "down") anyNewDown = true
        map.set(m.name, { status: m.status, since: now })
      }
    }
    if (newEvents.length > 0) {
      setEvents((prev) => [...newEvents, ...prev].slice(0, 20))
    }
    if (anyNewDown) setLastDownAt(now)
  }, [monitors])

  return { tracker: trackerRef.current, events, lastDownAt }
}

/** Kısa beep — DOWN olayında çalmak için. WebAudio, asset yok. */
function playBeep() {
  try {
    type WindowWithWebkit = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }
    const w = window as WindowWithWebkit
    const Ctx = window.AudioContext ?? w.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = "square"
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
    setTimeout(() => ctx.close(), 700)
  } catch {
    // sessiz fail
  }
}

/* ══════════════════════════════════════════════════════════
   KPI Kartı — /monitoring'deki StatsCard'ın dark + TV ölçekli hali
══════════════════════════════════════════════════════════ */
function KpiCard({
  title, value, subtitle, trend, accent, pulse,
}: {
  title:    string
  value:    string | number
  subtitle: string
  trend?:   { value: string; positive: boolean }
  accent:   "emerald" | "amber" | "red" | "zinc"
  pulse?:   boolean
}) {
  const accentText =
    accent === "emerald" ? "text-emerald-400" :
    accent === "amber"   ? "text-amber-400"   :
    accent === "red"     ? "text-red-400"     :
                           "text-zinc-100"

  return (
    <div className={cn("rounded-[8px] p-2 pb-0 flex flex-col", OUTER_BG)}>
      <div
        className={cn("rounded-[4px] flex-1", INNER_BG, pulse && "ring-2 ring-red-500/60 animate-[pulse_1.5s_ease-in-out_infinite]")}
        style={INNER_SHADOW}
      >
        <div className="px-4 py-3 h-full">
          <p className="text-[11px] font-medium tracking-widest uppercase text-zinc-500">{title}</p>
          <p className={cn("text-[44px] font-bold tabular-nums leading-none mt-1.5", accentText)}>
            {value}
          </p>
          {trend && (
            <p className={cn("text-[12px] mt-2 font-medium", trend.positive ? "text-emerald-400/80" : "text-red-400/80")}>
              {trend.value}
            </p>
          )}
          <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="h-2" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Saat Kartı — KPI row'a hizalı
══════════════════════════════════════════════════════════ */
function ClockCard({ fetchedAt }: { fetchedAt?: string }) {
  const now = useClock()
  const time = now?.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? "—"
  const date = now?.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long" }) ?? ""
  const updatedTime = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null

  return (
    <div className={cn("rounded-[8px] p-2 pb-0 flex flex-col", OUTER_BG)}>
      <div className={cn("rounded-[4px] flex-1 relative", INNER_BG)} style={INNER_SHADOW}>
        {/* Kuma Bağlı — sağ üst köşede canlı yeşil dot */}
        <span className="absolute top-2 right-2">
          <LiveDot ui="online" size="size-2" />
        </span>
        <div className="px-4 py-3 h-full">
          <p className="text-[11px] font-medium tracking-widest uppercase text-zinc-500">Saat</p>
          <p className="text-[44px] font-bold tabular-nums leading-none mt-1.5 font-mono text-zinc-100">{time}</p>
          <p className="text-[11px] text-zinc-500 mt-2 capitalize">{date}</p>
          {updatedTime && (
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Son güncelleme: <span className="text-zinc-300 font-mono tabular-nums">{updatedTime}</span>
            </p>
          )}
        </div>
      </div>
      <div className="h-2" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Monitor Tile — MonitorCard'ın dark TV hali
══════════════════════════════════════════════════════════ */
const STATUS_CONFIG: Record<UiStatus, { label: string; dot: string; dotPing: string; badge: string; bg: string; ring: string; name: string; target: string }> = {
  online: {
    label: "Çevrimiçi",
    dot:    "bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]",
    dotPing: "bg-emerald-400",
    badge:  "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    bg:     INNER_BG,
    ring:   "",
    name:   "text-zinc-100",
    target: "text-zinc-500",
  },
  warning: {
    label: "Uyarı",
    dot:    "bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.8)]",
    dotPing: "bg-amber-400",
    badge:  "text-amber-200 bg-amber-500/15 border-amber-500/40",
    bg:     "bg-amber-950/40",
    ring:   "ring-1 ring-amber-500/30",
    name:   "text-amber-100",
    target: "text-amber-200/50",
  },
  offline: {
    label: "Çevrimdışı",
    dot:    "bg-red-500 shadow-[0_0_18px_rgba(239,68,68,1)]",
    dotPing: "bg-red-500",
    badge:  "text-red-200 bg-red-500/15 border-red-500/40",
    bg:     "bg-red-950/60",
    ring:   "ring-2 ring-red-500/50 animate-[pulse_1.5s_ease-in-out_infinite]",
    name:   "text-red-100",
    target: "text-red-200/60",
  },
}

/**
 * Canlı yayın noktası — dolu bir daire + genişleyip kaybolan ping halkası
 * (radar efekti). Tailwind `animate-ping` opacity 1→0 + scale 1→2.
 */
function LiveDot({ ui, size = "size-4", className }: { ui: UiStatus; size?: string; className?: string }) {
  const cfg = STATUS_CONFIG[ui]
  return (
    <span className={cn("relative inline-flex shrink-0", size, className)}>
      <span className={cn("absolute inset-0 rounded-full opacity-75 animate-ping", cfg.dotPing)} />
      <span className={cn("relative inline-block rounded-full w-full h-full", cfg.dot)} />
    </span>
  )
}

/** Bir grup başlık + o grubun monitor kartları */
function MonitorGroup({ title, count, monitors, tracker }: { title: string; count: number; monitors: KumaMonitor[]; tracker: Map<string, StatusTrack> }) {
  const downCount = monitors.filter((m) => mapStatus(m.status) === "offline").length
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-3 px-1">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400">{title}</h2>
        <span className="text-[10px] font-mono text-zinc-600">{count} monitor</span>
        {downCount > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-300 bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 rounded-[3px]">
            {downCount} çevrimdışı
          </span>
        )}
        <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 to-transparent" />
      </div>
      <div
        className="grid content-start gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
      >
        {monitors.map((m) => <MonitorTile key={m.name} m={m} since={tracker.get(m.name)?.since} />)}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   DOWN Alarm Banner — ekranın en üstünde tam genişlik kırmızı şerit
══════════════════════════════════════════════════════════ */
function DownBanner({ monitors, tracker }: { monitors: KumaMonitor[]; tracker: Map<string, StatusTrack> }) {
  const now = useClock()
  // En uzun süredir DOWN olan en başta
  const sorted = [...monitors].sort((a, b) => (tracker.get(a.name)?.since ?? 0) - (tracker.get(b.name)?.since ?? 0))

  return (
    <div className="rounded-[8px] bg-red-950/80 border-2 border-red-500/60 px-4 py-3 flex items-center gap-4 animate-[pulse_1.2s_ease-in-out_infinite] shadow-[0_0_30px_rgba(239,68,68,0.4)]">
      <AlertTriangle className="size-8 text-red-300 shrink-0 animate-pulse" />
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-red-300">
          {monitors.length === 1 ? "1 SİSTEM ÇEVRİMDIŞI" : `${monitors.length} SİSTEM ÇEVRİMDIŞI`}
        </p>
        <div className="flex items-center gap-4 mt-1 flex-wrap">
          {sorted.map((m) => {
            const since = tracker.get(m.name)?.since
            const dur   = since && now ? formatDuration(now.getTime() - since) : null
            return (
              <span key={m.name} className="text-[20px] font-bold text-white inline-flex items-baseline gap-2">
                <span>{m.name}</span>
                {dur && <span className="text-[13px] font-mono text-red-200/80">· {dur}</span>}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Event Log — son durum değişiklikleri
══════════════════════════════════════════════════════════ */
function EventLog({ events }: { events: StatusEvent[] }) {
  const visible = events.slice(0, 5)
  const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  const statusLabel = (s: KumaStatus) => s === "up" ? "UP" : s === "down" ? "DOWN" : s === "pending" ? "BEKLEMEDE" : s === "maintenance" ? "BAKIM" : "?"
  const statusColor = (s: KumaStatus) =>
    s === "up" ? "text-emerald-300" :
    s === "down" ? "text-red-300" :
    "text-amber-300"

  return (
    <div className="rounded-[6px] bg-zinc-900/60 border border-zinc-800/60 px-3 py-2 flex items-center gap-4 overflow-hidden">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 shrink-0">Son Olaylar</span>
      <div className="flex items-center gap-4 overflow-hidden flex-1 min-w-0">
        {visible.map((e, i) => (
          <span key={`${e.name}-${e.at}-${i}`} className="text-[11px] font-mono text-zinc-400 inline-flex items-center gap-1.5 shrink-0">
            <span className="text-zinc-600 tabular-nums">{fmtTime(e.at)}</span>
            <span className="text-zinc-200">{e.name}</span>
            <span className={cn("text-zinc-600")}>{statusLabel(e.from)}</span>
            <span className="text-zinc-600">→</span>
            <span className={cn("font-bold", statusColor(e.to))}>{statusLabel(e.to)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function MonitorTile({ m, since }: { m: KumaMonitor; since?: number }) {
  const ui  = mapStatus(m.status)
  const cfg = STATUS_CONFIG[ui]
  const now = useClock()
  const respClass =
    m.responseMs === null ? "text-red-400" :
    m.responseMs < 30     ? "text-emerald-300" :
    m.responseMs < 80     ? "text-amber-300" :
                            "text-red-300"
  const downDuration = ui === "offline" && since && now ? formatDuration(now.getTime() - since) : null

  return (
    <div
      className={cn("rounded-[8px] p-2 pb-0 relative overflow-hidden min-w-0", OUTER_BG)}
      style={stripedBg(ui === "online" ? STRIPE_COLOR.emerald : ui === "warning" ? STRIPE_COLOR.amber : STRIPE_COLOR.red)}
    >
      <div
        className={cn("rounded-[4px] relative overflow-hidden", cfg.bg, cfg.ring)}
        style={INNER_SHADOW}
      >
        {/* Üst — dot + ad */}
        <div className="px-4 pt-3 flex items-center gap-2 min-w-0">
          <LiveDot ui={ui} size="size-2.5" />
          <h3 className={cn("text-[16px] font-semibold truncate", cfg.name)}>{m.name}</h3>
        </div>

        {/* Orta — devasa ms sayı */}
        <div className={cn("flex items-end justify-center gap-2 pt-3", downDuration ? "pb-2" : "pb-4")}>
          {m.responseMs !== null ? (
            <>
              <span className={cn("text-[56px] font-black tabular-nums leading-none tracking-tight", respClass)}>
                {Math.max(1, Math.round(m.responseMs))}
              </span>
            </>
          ) : (
            <>
              <WifiOff className="size-10 text-red-400 self-center" />
              <span className="text-[56px] font-black text-red-400 leading-none">—</span>
            </>
          )}
        </div>

        {/* DOWN süresi — sadece offline durumda */}
        {downDuration && (
          <div className="flex items-center justify-center gap-1.5 pb-3 animate-pulse">
            <span className="text-[9px] font-bold uppercase tracking-widest text-red-300">Down</span>
            <span className="text-[13px] font-mono font-bold text-red-200 tabular-nums">{downDuration}</span>
          </div>
        )}
      </div>
      <div className="h-2" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Döviz Grup Tile — ExchangeCard'ın dark TV hali
══════════════════════════════════════════════════════════ */
const EXCHANGE_PREFIX = "Döviz - "

function stripExchangePrefix(name: string): string {
  return name.startsWith(EXCHANGE_PREFIX) ? name.slice(EXCHANGE_PREFIX.length) : name
}

function aggregateStatus(monitors: KumaMonitor[]): UiStatus {
  if (monitors.some((m) => mapStatus(m.status) === "offline")) return "offline"
  if (monitors.some((m) => mapStatus(m.status) === "warning")) return "warning"
  return "online"
}

function ExchangeTile({ monitors, health }: { monitors: KumaMonitor[]; health?: Record<string, ExchangeHealthEntry> | null }) {
  const ui    = aggregateStatus(monitors)
  const cfg   = STATUS_CONFIG[ui]
  const sorted = [...monitors].sort((a, b) => a.name.localeCompare(b.name, "tr"))
  const downSources    = monitors.filter((m) => mapStatus(m.status) === "offline").length
  const warningSources = monitors.filter((m) => mapStatus(m.status) === "warning").length
  const now = useClock()

  return (
    <div
      className={cn("rounded-[8px] p-2 pb-0 flex flex-col shrink-0 w-full lg:w-[260px] xl:w-[300px]", OUTER_BG)}
    >
      <div
        className={cn("rounded-[4px] flex flex-col flex-1", cfg.bg, cfg.ring)}
        style={INNER_SHADOW}
      >
        <div className="px-3 pt-2.5 pb-2 flex items-center gap-2 border-b border-white/5">
          <LiveDot ui={ui} size="size-2.5" />
          <h3 className={cn("text-[13px] font-bold leading-none flex-1 truncate", cfg.name)}>Döviz Kurları</h3>
          <span className={cn("text-[8px] font-bold uppercase tracking-wider shrink-0", ui === "online" ? "text-emerald-300" : ui === "warning" ? "text-amber-300" : "text-red-300")}>
            {ui === "online" ? `${monitors.length}/${monitors.length}` : ui === "offline" ? `${downSources} DOWN` : `${warningSources} UYARI`}
          </span>
        </div>

        {/* 5 kaynak — mini kart grid */}
        <div className="p-2 grid grid-cols-1 gap-2">
          {sorted.map((m) => {
            const s   = mapStatus(m.status)
            const sc  = STATUS_CONFIG[s]
            const ping = m.responseMs === null ? "—" : String(Math.max(1, Math.round(m.responseMs)))
            const respClass =
              m.responseMs === null ? "text-red-400" :
              m.responseMs < 30     ? "text-emerald-300" :
              m.responseMs < 80     ? "text-amber-300" :
                                      "text-red-300"
            return (
              <div
                key={m.name}
                className={cn(
                  "rounded-[5px] px-3 py-2 flex items-center justify-between gap-2 border",
                  s === "offline" ? "bg-red-500/10 border-red-500/30"
                  : s === "warning" ? "bg-amber-500/10 border-amber-500/30"
                  : "bg-black/30 border-white/5",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <LiveDot ui={s} size="size-1.5" />
                  <span className={cn("text-[17px] font-semibold truncate", sc.name)}>{stripExchangePrefix(m.name)}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className={cn("text-[20px] font-black tabular-nums leading-none", respClass)}>{ping}</span>
                  {(() => {
                    const key = EXCHANGE_HEALTH_KEY[stripExchangePrefix(m.name)]
                    const hs  = key && health ? health[key] : null
                    if (!hs || !now) return null
                    return (
                      <span className="text-[11px] font-mono font-semibold text-zinc-300 tabular-nums">
                        {formatAgo(hs.lastUpdatedAt, now)}
                      </span>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="h-2" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Ana Sayfa
══════════════════════════════════════════════════════════ */
export default function TvMonitoringPage() {
  const [data, setData]   = useState<MonitoringResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  /* ── Test modu: fake DOWN monitor enjekte et (Active Directory'yi yapay DOWN göster) ── */
  const [testDown, setTestDown] = useState(false)
  const testDownUntilRef = useRef<number>(0)

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/monitoring`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok || !json.ok) setError(json.error ?? `HTTP ${res.status}`)
      else { setData(json); setError(null) }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata")
    }
  }, [])

  // Test butonu aktifken data'yı mutasyona uğrat — Active Directory'yi DOWN yap
  const dataForRender = useMemo<MonitoringResponse | null>(() => {
    if (!data || !testDown) return data
    const mutated = data.monitors.map((m) =>
      m.name === "Active Directory"
        ? { ...m, status: "down" as KumaStatus, responseMs: null }
        : m,
    )
    const online  = mutated.filter((m) => m.status === "up").length
    const warning = mutated.filter((m) => m.status === "pending" || m.status === "maintenance").length
    const offline = mutated.filter((m) => m.status === "down").length
    return { ...data, monitors: mutated, counts: { total: mutated.length, online, warning, offline } }
  }, [data, testDown])

  useEffect(() => {
    load()
    const t = setInterval(load, 1_000)
    return () => clearInterval(t)
  }, [load])

  const { exchangeMonitors, regularMonitors } = useMemo(() => {
    if (!dataForRender) return { exchangeMonitors: [], regularMonitors: [] as KumaMonitor[] }
    return {
      exchangeMonitors: dataForRender.monitors.filter((m) => m.name.startsWith(EXCHANGE_PREFIX)),
      regularMonitors:  dataForRender.monitors.filter((m) => !m.name.startsWith(EXCHANGE_PREFIX)),
    }
  }, [dataForRender])

  const { serverMonitors, serviceMonitors } = useMemo(() => {
    const rank = (s: KumaStatus) => (s === "down" ? 0 : s === "pending" || s === "maintenance" ? 1 : 2)
    const sort = (a: KumaMonitor, b: KumaMonitor) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name, "tr")
    // ping monitors → sunucular, geri kalan (http/keyword/dns) → servisler
    const servers  = regularMonitors.filter((m) => m.type === "ping").sort(sort)
    const services = regularMonitors.filter((m) => m.type !== "ping").sort(sort)
    return { serverMonitors: servers, serviceMonitors: services }
  }, [regularMonitors])

  /* ── Alarm tracker (DOWN süresi + olay log) ── */
  const { tracker, events, lastDownAt } = useStatusTracker(dataForRender?.monitors ?? null)
  const downMonitors = useMemo(
    () => (dataForRender?.monitors ?? []).filter((m) => m.status === "down"),
    [dataForRender],
  )

  /* ── Ses toggle (localStorage) ── */
  const [soundOn, setSoundOn] = useState(false)
  useEffect(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("tv.sound") : null
    if (v === "1") setSoundOn(true)
  }, [])
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("tv.sound", soundOn ? "1" : "0")
  }, [soundOn])

  /* ── Alarm sesi —
     · Yeni DOWN olduğunda hemen çal (çift beep)
     · DOWN aktif kaldığı sürece her 5 saniyede bir tekrar
     · Tüm sistemler UP olunca sus
  ── */
  const lastBeepAtRef = useRef<number>(0)
  const anyDown = downMonitors.length > 0
  useEffect(() => {
    if (!soundOn || !lastDownAt) return
    if (lastDownAt <= lastBeepAtRef.current) return
    lastBeepAtRef.current = lastDownAt
    // Yeni olay → daha belirgin: iki kısa beep
    playBeep()
    setTimeout(() => playBeep(), 250)
  }, [lastDownAt, soundOn])

  useEffect(() => {
    if (!soundOn || !anyDown) return
    const t = setInterval(() => playBeep(), 5000)
    return () => clearInterval(t)
  }, [soundOn, anyDown])

  /* ── Loading ── */
  if (!data && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-4 text-zinc-400">
          <Activity className="size-10 animate-pulse" />
          <span className="text-[28px]">Uptime Kuma'ya bağlanılıyor…</span>
        </div>
      </div>
    )
  }

  /* ── Error ── */
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-16">
        <div className={cn("rounded-[8px] p-2 pb-0 max-w-2xl w-full", OUTER_BG)}>
          <div className={cn("rounded-[4px] text-center px-10 py-12", INNER_BG)} style={INNER_SHADOW}>
            <AlertTriangle className="size-20 text-amber-400 mx-auto mb-6" />
            <p className="text-[28px] font-bold mb-2 text-zinc-100">Uptime Kuma'ya ulaşılamadı</p>
            <p className="text-[16px] text-zinc-400">{error ?? "Bilinmeyen hata"}</p>
          </div>
          <div className="h-2" />
        </div>
      </div>
    )
  }

  const { counts, fetchedAt } = dataForRender ?? data
  const uptimePct = counts.total === 0 ? 0 : (counts.online / counts.total) * 100

  return (
    <div className="min-h-screen flex flex-col p-3 md:p-5 gap-3 bg-[#0E0E0E]">
      {/* ── DOWN Alarm Banner — tam genişlik, yanıp söner ── */}
      {downMonitors.length > 0 && (
        <DownBanner monitors={downMonitors} tracker={tracker} />
      )}

      {/* ── Başlık şeridi (kompakt) ── */}
      <div className="flex items-center justify-between gap-2 px-2 md:px-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-6 rounded-[4px] bg-sky-950 flex items-center justify-center shrink-0">
            <Activity className="size-3.5 text-sky-300" />
          </div>
          <h1 className="text-[12px] md:text-[13px] font-bold tracking-tight text-zinc-100 truncate">PUSULA İZLEME MERKEZİ</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              setTestDown(true)
              testDownUntilRef.current = Date.now() + 8000
              setTimeout(() => {
                if (Date.now() >= testDownUntilRef.current - 50) setTestDown(false)
              }, 8000)
            }}
            disabled={testDown}
            className={cn(
              "h-7 px-2 rounded-[4px] text-[10px] font-bold uppercase tracking-widest transition-colors",
              testDown
                ? "bg-red-500/20 text-red-300 border border-red-500/40 cursor-wait animate-pulse"
                : "bg-zinc-800 text-zinc-400 hover:bg-red-500/20 hover:text-red-300 border border-zinc-700 hover:border-red-500/40",
            )}
            title="Test: Active Directory'yi 8 sn boyunca DOWN göster"
          >
            {testDown ? "Test aktif…" : "Alarm Testi"}
          </button>
          <button
            type="button"
            onClick={() => setSoundOn((v) => !v)}
            className={cn(
              "size-7 rounded-[4px] flex items-center justify-center transition-colors",
              soundOn ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                      : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700",
            )}
            title={soundOn ? "Ses açık — kapatmak için tıkla" : "Ses kapalı — açmak için tıkla"}
          >
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <div className="hidden sm:block text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
            Uptime Kuma · 10.15.2.6:3001
          </div>
        </div>
      </div>

      {/* ── KPI Row — 5 kart (saat dahil) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          title="Canlı Uptime"
          value={`%${uptimePct.toFixed(1)}`}
          subtitle="Anlık durum"
          trend={{ value: `${counts.online}/${counts.total} çevrimiçi`, positive: counts.offline === 0 }}
          accent={counts.offline > 0 ? "red" : counts.warning > 0 ? "amber" : "emerald"}
          pulse={counts.offline > 0}
        />
        <KpiCard
          title="Çevrimiçi"
          value={counts.online}
          subtitle={`${counts.total} monitörden`}
          trend={{ value: "Sorunsuz çalışıyor", positive: true }}
          accent="emerald"
        />
        <KpiCard
          title="Uyarı"
          value={counts.warning}
          subtitle="Beklemede / Bakım"
          trend={{ value: counts.warning > 0 ? "Dikkat gerekiyor" : "Sorun yok", positive: counts.warning === 0 }}
          accent={counts.warning > 0 ? "amber" : "zinc"}
        />
        <KpiCard
          title="Çevrimdışı"
          value={counts.offline}
          subtitle="Müdahale gerekiyor"
          trend={{ value: counts.offline > 0 ? "Erişilemiyor" : "Hepsi erişilebilir", positive: counts.offline === 0 }}
          accent={counts.offline > 0 ? "red" : "zinc"}
          pulse={counts.offline > 0}
        />
        <ClockCard fetchedAt={fetchedAt} />
      </div>

      {/* ── İçerik: mobilde üstte Döviz + altta gruplar; lg+ solda sidebar + sağda gruplar ── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-3">
        {exchangeMonitors.length > 0 && (
          <ExchangeTile monitors={exchangeMonitors} health={(dataForRender ?? data).exchangeHealth} />
        )}
        <div className="flex flex-col flex-1 gap-3 min-w-0">
          {serverMonitors.length > 0 && (
            <MonitorGroup title="Sunucular" count={serverMonitors.length} monitors={serverMonitors} tracker={tracker} />
          )}
          {serviceMonitors.length > 0 && (
            <MonitorGroup title="Servisler & Web" count={serviceMonitors.length} monitors={serviceMonitors} tracker={tracker} />
          )}
        </div>
      </div>

      {/* ── Son olaylar (event log) ── */}
      {events.length > 0 && <EventLog events={events} />}

    </div>
  )
}
