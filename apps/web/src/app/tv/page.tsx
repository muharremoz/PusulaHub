"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Activity, AlertTriangle, WifiOff, Volume2, VolumeX, ArrowDown, ArrowUp } from "lucide-react"
import type { SpareBackupOffline } from "@/lib/sparebackup-offline"
import type { DomainExpiry } from "@/lib/domain-expiry"
import type { BandwidthData } from "@/lib/bandwidth"
import {
  type ExchangeHealthEntry,
  type KumaMonitor,
  type KumaStatus,
  type StatusEvent,
  type StatusTrack,
  type UiStatus,
  EXCHANGE_HEALTH_KEY,
  aggregateStatus,
  formatAgo,
  formatDuration,
  mapStatus,
  stripExchangePrefix,
} from "./_shared/types"
import { useAlarmSound, useClock, useTvData } from "./_shared/use-tv-data"

/* ══════════════════════════════════════════════════════════
   Proje tasarım standardı — açık tema
   ──────────────────────────────────────────────────────────
   Çift katmanlı kart:
     dış   #F4F2F0   rounded-[8px]  p-2 pb-0
     iç    #FFFFFF   rounded-[4px]  shadow 0 2px 4px rgba(0,0,0,.06)
   Sayfa zemini dış karttan bir ton koyu (#EAE7E4) — katmanlar ayrışsın.

   Bu ekran 7/24 açık kalıyor ve uzaktan izleniyor: **hiçbir animasyon yok**
   (nabız, ping halkası, akan gradient, scramble yazı). Dikkat çekmesi gereken
   tek şey kırmızı renk ve konum — hareket değil.
══════════════════════════════════════════════════════════ */

const PAGE_BG  = "#EAE7E4"
const OUTER_BG = "#F4F2F0"
const ALERT_BG = "#FBE9E9"   // DOWN durumunda dış kart
const PANEL_BG = "#FAF9F8"   // başlık şeridi + ölçüm bloğu zemini
const BORDER   = "#E0DCD8"
const DOWN_BORDER = "#F5A3A3"   // çevrimdışı kart/panel çerçevesi

const INNER_SHADOW = { boxShadow: "0 2px 4px rgba(0,0,0,0.06)" } as const

/* ══════════════════════════════════════════════════════════
   Durum paleti
══════════════════════════════════════════════════════════ */

interface StatusStyle {
  label:  string
  dot:    string   // gösterge noktası
  text:   string   // vurgulu metin rengi
  badge:  string   // rozet
  inner:  string   // iç kart zemini
  stroke: string   // sparkline çizgi rengi
}

const STATUS: Record<UiStatus, StatusStyle> = {
  online: {
    label:  "Çevrimiçi",
    dot:    "bg-emerald-600",
    text:   "text-emerald-700",
    badge:  "text-emerald-700 bg-emerald-50 border-emerald-200",
    inner:  "#FFFFFF",
    stroke: "#16A34A",
  },
  warning: {
    label:  "Uyarı",
    dot:    "bg-amber-500",
    text:   "text-amber-700",
    badge:  "text-amber-700 bg-amber-50 border-amber-200",
    inner:  "#FFFBEB",
    stroke: "#D97706",
  },
  offline: {
    label:  "Çevrimdışı",
    dot:    "bg-red-600",
    text:   "text-red-700",
    badge:  "text-red-700 bg-red-50 border-red-200",
    inner:  "#FEF2F2",
    stroke: "#DC2626",
  },
}

/** Durum noktası — sabit, halka/animasyon yok */
function StatusDot({ ui, size = "size-2" }: { ui: UiStatus; size?: string }) {
  return <span className={cn("inline-block shrink-0 rounded-full", size, STATUS[ui].dot)} />
}

/* ══════════════════════════════════════════════════════════
   Kart kabuğu — dış (beige) + iç (beyaz) katman
══════════════════════════════════════════════════════════ */

function Card({
  children,
  className,
  innerClassName,
  ui,
}: {
  children: React.ReactNode
  className?: string
  innerClassName?: string
  /** offline ise dış kart kırmızıya, iç kart açık kırmızıya döner */
  ui?: UiStatus
}) {
  const alert = ui === "offline"
  return (
    <div
      className={cn("flex min-h-0 flex-col rounded-[8px] p-2 pb-0", className)}
      style={{ background: alert ? ALERT_BG : OUTER_BG }}
    >
      <div
        className={cn("flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px]", innerClassName)}
        style={{
          ...INNER_SHADOW,
          background: ui ? STATUS[ui].inner : "#FFFFFF",
          ...(alert ? { border: `1px solid ${DOWN_BORDER}` } : null),
        }}
      >
        {children}
      </div>
      <div className="h-2 shrink-0" />
    </div>
  )
}

/** Kart içi bölüm başlığı */
function TileHead({
  title,
  ui,
  right,
}: {
  title: string
  ui?: UiStatus
  right?: React.ReactNode
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-2 px-3 py-2"
      style={{ background: PANEL_BG, borderBottom: `1px solid ${BORDER}` }}
    >
      {ui && <StatusDot ui={ui} size="size-2" />}
      <h3 className="min-w-0 flex-1 truncate text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </h3>
      {right}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   KPI Kartı
══════════════════════════════════════════════════════════ */

function KpiCard({
  title,
  value,
  subtitle,
  trend,
  accent,
}: {
  title:    string
  value:    string | number
  subtitle: string
  trend?:   { value: string; positive: boolean }
  accent:   "emerald" | "amber" | "red" | "zinc"
}) {
  const txt =
    accent === "emerald" ? "text-emerald-700" :
    accent === "amber"   ? "text-amber-700"   :
    accent === "red"     ? "text-red-700"     :
                           "text-zinc-800"

  return (
    <Card ui={accent === "red" ? "offline" : undefined}>
      <div className="px-4 py-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{title}</p>
        <p className={cn("mt-1.5 text-[40px] font-bold leading-none tabular-nums", txt)}>{value}</p>
        {trend && (
          <p className={cn("mt-2 text-[11px] font-medium", trend.positive ? "text-emerald-700" : "text-red-700")}>
            {trend.value}
          </p>
        )}
        <p className="mt-0.5 text-[10px] text-zinc-500">{subtitle}</p>
      </div>
    </Card>
  )
}

function ClockCard({ fetchedAt }: { fetchedAt?: string }) {
  const now = useClock()
  const time = now?.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? "—"
  const date = now?.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long" }) ?? ""
  const updated = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null

  return (
    <Card>
      <div className="px-4 py-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Saat</p>
        <p className="mt-1.5 font-mono text-[40px] font-bold leading-none tabular-nums text-zinc-800">{time}</p>
        <p className="mt-2 text-[11px] capitalize text-zinc-600">{date}</p>
        {updated && (
          <p className="mt-0.5 text-[10px] text-zinc-500">
            Son güncelleme <span className="font-mono tabular-nums text-zinc-700">{updated}</span>
          </p>
        )}
      </div>
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════
   Sparkline — durağan çizgi (akan parlaklık / atan uç nokta yok)
══════════════════════════════════════════════════════════ */

function Sparkline({
  data,
  color,
  width = 200,
  height = 28,
}: {
  data: number[]
  color: string
  width?: number
  height?: number
}) {
  if (data.length < 2) {
    return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block w-full" />
  }
  const pad  = 2
  const max  = Math.max(...data, 1)
  const min  = Math.min(...data, 0)
  const span = Math.max(max - min, 1)
  const w = width - pad * 2
  const h = height - pad * 2
  const step = w / (data.length - 1)
  const points = data.map((v, i) => ({
    x: pad + i * step,
    y: pad + h - ((v - min) / span) * h,
  }))
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${height} L${points[0].x.toFixed(1)},${height} Z`
  const gradId = `spark-${color.replace(/[^a-z0-9]/gi, "")}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block w-full"
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════
   Monitör kartı
══════════════════════════════════════════════════════════ */

/**
 * Bölünmüş kart: solda kimlik (ad + adres), sağda sabit genişlikte ölçüm
 * bloğu. Blok sabit genişlikte olduğu için rakamlar bütün kartlar arasında
 * dikey hizada durur — göz tek sütunu tarar.
 *
 * Durum hem renkle hem YAZIYLA bildirilir (bloğun alt satırı); renk körü bir
 * izleyici de kartı okuyabilsin diye.
 */
function MonitorTile({ m, since }: { m: KumaMonitor; since?: number }) {
  const ui  = mapStatus(m.status)
  const now = useClock()

  const respClass =
    m.responseMs === null ? "text-red-700"     :
    m.responseMs < 30     ? "text-emerald-700" :
    m.responseMs < 80     ? "text-amber-700"   :
                            "text-red-700"

  const downDuration = ui === "offline" && since && now ? formatDuration(now.getTime() - since) : null
  const isDown = ui === "offline"
  // DOWN kartın çerçevesi kırmızı — uzaktan bakınca kart sınırı da sinyal versin
  const edge = isDown ? DOWN_BORDER : BORDER

  return (
    <div
      className="flex min-w-0 overflow-hidden rounded-[6px] bg-white"
      style={{ ...INNER_SHADOW, border: `1px solid ${edge}` }}
    >
      {/* Kimlik */}
      <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2.5">
        <div className="truncate text-[14px] font-semibold text-zinc-800" title={m.name}>
          {m.name}
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-500" title={m.hostname ?? m.url ?? ""}>
          {m.hostname ?? m.url ?? "—"}
          {m.port ? `:${m.port}` : ""}
        </div>
      </div>

      {/* Ölçüm bloğu — sabit genişlik, kartlar arası hizalı */}
      <div
        className="flex w-[118px] shrink-0 flex-col items-center justify-center gap-1"
        style={{ borderLeft: `1px solid ${edge}`, background: isDown ? STATUS[ui].inner : PANEL_BG }}
      >
        <div className="flex items-baseline gap-1">
          <span className={cn("font-mono text-[22px] font-bold leading-none tabular-nums", respClass)}>
            {m.responseMs === null ? "—" : m.responseMs.toFixed(0)}
          </span>
          <span className="text-[9px] font-medium uppercase text-zinc-400">ms</span>
        </div>
        <div className={cn("text-[9px] font-bold uppercase tracking-wide", STATUS[ui].text)}>
          {downDuration ?? STATUS[ui].label}
        </div>
      </div>
    </div>
  )
}

function MonitorGroup({
  title,
  count,
  monitors,
  tracker,
}: {
  title: string
  count: number
  monitors: KumaMonitor[]
  tracker: Map<string, StatusTrack>
}) {
  const downCount = monitors.filter((m) => mapStatus(m.status) === "offline").length
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-3 px-1">
        <h2 className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{title}</h2>
        <span className="font-mono text-[10px] text-zinc-400">{count} monitör</span>
        {downCount > 0 && (
          <span className="rounded-[3px] border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
            {downCount} çevrimdışı
          </span>
        )}
        <div className="h-px flex-1" style={{ background: BORDER }} />
      </div>
      <div className="grid content-start grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {monitors.map((m) => (
          <MonitorTile key={m.name} m={m} since={tracker.get(m.name)?.since} />
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   DOWN uyarı şeridi — sabit, yanıp sönmüyor
══════════════════════════════════════════════════════════ */

function DownBanner({ monitors, tracker }: { monitors: KumaMonitor[]; tracker: Map<string, StatusTrack> }) {
  const now = useClock()
  // En uzun süredir DOWN olan en başta
  const sorted = [...monitors].sort(
    (a, b) => (tracker.get(a.name)?.since ?? 0) - (tracker.get(b.name)?.since ?? 0),
  )

  return (
    <div
      className="flex shrink-0 items-center gap-4 rounded-[8px] px-4 py-3"
      style={{ background: STATUS.offline.inner, border: `1px solid ${DOWN_BORDER}` }}
    >
      <AlertTriangle className="size-7 shrink-0 text-red-600" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-700">
          {monitors.length === 1 ? "1 sistem çevrimdışı" : `${monitors.length} sistem çevrimdışı`}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-4">
          {sorted.map((m) => {
            const since = tracker.get(m.name)?.since
            const dur   = since && now ? formatDuration(now.getTime() - since) : null
            return (
              <span key={m.name} className="inline-flex items-baseline gap-2 text-[18px] font-bold text-red-800">
                <span>{m.name}</span>
                {dur && <span className="font-mono text-[13px] font-medium text-red-600">· {dur}</span>}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   DOWN Spotlight — çevrimdışı monitörü tam ekran göster
══════════════════════════════════════════════════════════ */

function DownTimer({ since }: { since: number }) {
  const now = useClock()
  if (!now) return null
  return (
    <div className="text-right">
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Süre</div>
      <div className="font-mono text-[36px] font-bold leading-none tabular-nums text-red-700">
        {formatDuration(now.getTime() - since)}
      </div>
    </div>
  )
}

function DownSpotlight({
  monitors,
  tracker,
  histories,
}: {
  monitors: KumaMonitor[]
  tracker: Map<string, { since: number }>
  histories: Record<string, number[]>
}) {
  const [idx, setIdx] = useState(0)
  // Birden fazla DOWN varsa 8 saniyede bir sıradakine geç
  useEffect(() => {
    if (monitors.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % monitors.length), 8000)
    return () => clearInterval(t)
  }, [monitors.length])

  const safeIdx = Math.min(idx, monitors.length - 1)
  const m = monitors[safeIdx]
  if (!m) return null

  const since = tracker.get(m.name)?.since

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-8"
      style={{ background: "rgba(234,231,228,0.96)" }}
    >
      <div className="w-full max-w-[1100px]">
        <Card ui="offline">
          <div className="flex min-h-[440px] flex-col p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="size-5" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.25em]">Çevrimdışı</span>
                </div>
                <div className="mt-3 truncate text-[44px] font-bold leading-none tracking-tight text-zinc-900">
                  {m.name}
                </div>
                <div className="mt-2 truncate font-mono text-[16px] text-zinc-500">
                  {m.hostname ?? m.url ?? "—"}
                  {m.port ? `:${m.port}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {monitors.length > 1 && (
                  <span className="font-mono text-[11px] tabular-nums text-zinc-400">
                    {safeIdx + 1} / {monitors.length}
                  </span>
                )}
                <span
                  className="rounded-[5px] border px-3 py-1 font-mono text-[13px] font-medium uppercase tracking-wide text-red-700"
                  style={{ borderColor: DOWN_BORDER, background: STATUS.offline.inner }}
                >
                  {m.type}
                </span>
              </div>
            </div>

            <div className="mt-auto space-y-5 pt-8">
              <div>
                <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  Yanıt Geçmişi
                </div>
                <Sparkline data={histories[m.name] ?? []} color="#DC2626" width={1000} height={110} />
              </div>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Yanıt</div>
                  <div className="font-mono text-[56px] font-bold leading-none tabular-nums text-red-700">—</div>
                </div>
                {since && <DownTimer since={since} />}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Olay log'u
══════════════════════════════════════════════════════════ */

function EventLog({ events }: { events: StatusEvent[] }) {
  const visible = events.slice(0, 5)
  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  const statusLabel = (s: KumaStatus) =>
    s === "up" ? "UP" : s === "down" ? "DOWN" : s === "pending" ? "BEKLEMEDE" : s === "maintenance" ? "BAKIM" : "?"
  const statusColor = (s: KumaStatus) =>
    s === "up" ? "text-emerald-700" : s === "down" ? "text-red-700" : "text-amber-700"

  return (
    <div
      className="flex shrink-0 items-center gap-4 overflow-hidden rounded-[6px] px-3 py-2"
      style={{ background: "#FFFFFF", border: `1px solid ${BORDER}` }}
    >
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Son Olaylar</span>
      <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
        {visible.map((e, i) => (
          <span
            key={`${e.name}-${e.at}-${i}`}
            className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-zinc-500"
          >
            <span className="tabular-nums text-zinc-400">{fmtTime(e.at)}</span>
            <span className="text-zinc-800">{e.name}</span>
            <span className="text-zinc-400">{statusLabel(e.from)}</span>
            <span className="text-zinc-400">→</span>
            <span className={cn("font-bold", statusColor(e.to))}>{statusLabel(e.to)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Döviz kaynakları
══════════════════════════════════════════════════════════ */

function ExchangeTile({
  monitors,
  health,
}: {
  monitors: KumaMonitor[]
  health?: Record<string, ExchangeHealthEntry> | null
}) {
  const ui     = aggregateStatus(monitors)
  const sorted = [...monitors].sort((a, b) => a.name.localeCompare(b.name, "tr"))
  const down   = monitors.filter((m) => mapStatus(m.status) === "offline").length
  const warn   = monitors.filter((m) => mapStatus(m.status) === "warning").length
  const now    = useClock()

  return (
    <Card ui={ui}>
      <TileHead
        title="Döviz Kurları"
        ui={ui}
        right={
          <span className={cn("shrink-0 text-[9px] font-bold uppercase tracking-wide", STATUS[ui].text)}>
            {ui === "online" ? `${monitors.length}/${monitors.length}` : ui === "offline" ? `${down} DOWN` : `${warn} UYARI`}
          </span>
        }
      />
      <div className="divide-y" style={{ borderColor: BORDER }}>
        {sorted.map((m) => {
          const s   = mapStatus(m.status)
          const key = EXCHANGE_HEALTH_KEY[stripExchangePrefix(m.name)]
          const hs  = key && health ? health[key] : null
          const ping = m.responseMs === null ? "—" : String(Math.max(1, Math.round(m.responseMs)))
          const respClass =
            m.responseMs === null ? "text-red-700"     :
            m.responseMs < 30     ? "text-emerald-700" :
            m.responseMs < 80     ? "text-amber-700"   :
                                    "text-red-700"
          return (
            <div
              key={m.name}
              className="px-3 py-2"
              style={s === "offline" ? { background: "#FEF2F2" } : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusDot ui={s} size="size-1.5" />
                  <span className="truncate text-[14px] font-semibold text-zinc-800">
                    {stripExchangePrefix(m.name)}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className={cn("text-[18px] font-bold leading-none tabular-nums", respClass)}>{ping}</span>
                  {hs && now && (
                    <span className="font-mono text-[10px] tabular-nums text-zinc-500">
                      {formatAgo(hs.lastUpdatedAt, now)}
                    </span>
                  )}
                </div>
              </div>
              {hs?.lastError && (
                <div className="mt-0.5 truncate pl-3.5 font-mono text-[10px] text-red-600" title={hs.lastError}>
                  {hs.lastError}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════
   Çevrimdışı yedekler
══════════════════════════════════════════════════════════ */

/** minutesAgo → kısa Türkçe süre ("20 sa", "3 g", "45 dk") */
function formatMinutesAgo(mins: number): string {
  if (mins < 60)   return `${mins} dk`
  if (mins < 1440) return `${Math.floor(mins / 60)} sa`
  return `${Math.floor(mins / 1440)} g`
}

function OfflineFirmsTile({ data }: { data: SpareBackupOffline | null }) {
  const offline = data?.offline ?? []
  const count   = offline.length
  const ui: UiStatus = !data ? "warning" : count > 0 ? "offline" : "online"

  return (
    <Card ui={ui}>
      <TileHead
        title="Çevrimdışı Yedekler"
        ui={ui}
        right={
          <span className={cn("shrink-0 text-[9px] font-bold uppercase tracking-wide", STATUS[ui].text)}>
            {!data ? "—" : count === 0 ? `0/${data.totalActive}` : `${count} DOWN`}
          </span>
        }
      />
      <div className="max-h-[40vh] overflow-y-auto divide-y" style={{ borderColor: BORDER }}>
        {!data ? (
          <p className="py-3 text-center text-[11px] text-zinc-500">Servise ulaşılamadı</p>
        ) : count === 0 ? (
          <p className="py-3 text-center text-[11px] text-emerald-700">Tüm yedeklemeler çevrimiçi</p>
        ) : (
          offline.map((f) => (
            <div key={f.firkod} className="flex items-center gap-2 px-3 py-1.5" style={{ background: "#FEF2F2" }}>
              <WifiOff className="size-3.5 shrink-0 text-red-600" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-800" title={f.firma}>
                {f.firma}
              </span>
              <span className="shrink-0 text-[12px] font-bold tabular-nums text-red-700">
                {formatMinutesAgo(f.minutesAgo)}
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════
   Domain yenileme
══════════════════════════════════════════════════════════ */

/** daysLeft → <30 kritik, <90 uyarı, üzeri normal */
function domainUi(daysLeft: number | null): UiStatus {
  if (daysLeft === null) return "warning"
  if (daysLeft < 30) return "offline"
  if (daysLeft < 90) return "warning"
  return "online"
}

function DomainExpiryTile({ data }: { data: DomainExpiry[] | null }) {
  const list = data ?? []
  const worst = list.reduce<UiStatus>((acc, d) => {
    const u = domainUi(d.daysLeft)
    if (u === "offline") return "offline"
    if (u === "warning" && acc !== "offline") return "warning"
    return acc
  }, "online")
  const ui: UiStatus = !data ? "warning" : list.length === 0 ? "online" : worst

  return (
    <Card ui={ui}>
      <TileHead
        title="Domain Yenileme"
        ui={ui}
        right={<span className="shrink-0 font-mono text-[10px] text-zinc-400">{data ? list.length : "—"}</span>}
      />
      <div className="max-h-[40vh] overflow-y-auto divide-y" style={{ borderColor: BORDER }}>
        {!data ? (
          <p className="py-3 text-center text-[11px] text-zinc-500">Sorgulanıyor…</p>
        ) : list.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-zinc-500">Domain bulunamadı</p>
        ) : (
          list.map((d) => {
            const u = domainUi(d.daysLeft)
            return (
              <div
                key={d.domain}
                className="flex items-center gap-2 px-3 py-1.5"
                style={u === "offline" ? { background: "#FEF2F2" } : u === "warning" ? { background: "#FFFBEB" } : undefined}
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-zinc-700" title={d.domain}>
                  {d.domain}
                </span>
                <span className={cn("shrink-0 text-[12px] font-bold tabular-nums", STATUS[u].text)}>
                  {d.daysLeft === null ? "?" : `${d.daysLeft} g`}
                </span>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════
   İnternet trafiği
══════════════════════════════════════════════════════════ */

function formatMbps(v: number): string {
  if (!isFinite(v) || v < 0) return "0"
  return v < 10 ? v.toFixed(1) : Math.round(v).toString()
}

/** GB → 1000+ ise TB, küçükse 1 ondalık GB */
function formatTraffic(gb: number): string {
  if (!isFinite(gb)) return "—"
  if (gb >= 1000) return `${(gb / 1000).toFixed(2)} TB`
  if (gb < 100)   return `${gb.toFixed(1)} GB`
  return `${Math.round(gb)} GB`
}

function BandwidthTile({ data }: { data: BandwidthData | null }) {
  // Sparkline için yerel hız geçmişi (indirme + yükleme toplamı Mbps)
  const [hist, setHist] = useState<number[]>([])
  useEffect(() => {
    if (!data) return
    setHist((prev) => {
      const next = [...prev, data.live.rxMbps + data.live.txMbps]
      if (next.length > 40) next.splice(0, next.length - 40)
      return next
    })
  }, [data])

  const ui: UiStatus = data ? "online" : "warning"

  return (
    <Card ui={data ? undefined : "warning"}>
      <TileHead
        title="İnternet Trafiği"
        ui={ui}
        right={<span className="shrink-0 font-mono text-[10px] text-zinc-400">{data?.interface ?? "—"}</span>}
      />
      <div className="flex flex-col gap-2 p-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-[5px] px-2.5 py-2" style={{ background: "#F0FDF4", border: "1px solid #C6E9D3" }}>
            <div className="flex items-center gap-1 text-emerald-700">
              <ArrowDown className="size-3" />
              <span className="text-[9px] font-bold uppercase tracking-wide">İndirme</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-[24px] font-bold leading-none tabular-nums text-emerald-700">
                {data ? formatMbps(data.live.rxMbps) : "—"}
              </span>
              <span className="text-[9px] font-medium uppercase tracking-wide text-zinc-400">Mbps</span>
            </div>
          </div>
          <div className="rounded-[5px] px-2.5 py-2" style={{ background: "#F0F7FF", border: "1px solid #C5DCF5" }}>
            <div className="flex items-center gap-1 text-sky-700">
              <ArrowUp className="size-3" />
              <span className="text-[9px] font-bold uppercase tracking-wide">Yükleme</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-[24px] font-bold leading-none tabular-nums text-sky-700">
                {data ? formatMbps(data.live.txMbps) : "—"}
              </span>
              <span className="text-[9px] font-medium uppercase tracking-wide text-zinc-400">Mbps</span>
            </div>
          </div>
        </div>

        <div className="px-0.5">
          <Sparkline data={hist} color="#0284C7" height={36} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-[5px] px-2.5 py-1.5" style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}>
            <div className="text-[9px] font-medium uppercase tracking-wide text-zinc-500">Bugün</div>
            <div className="font-mono text-[15px] font-bold leading-tight tabular-nums text-zinc-800">
              {data ? formatTraffic(data.daily.totalGB) : "—"}
            </div>
          </div>
          <div className="rounded-[5px] px-2.5 py-1.5" style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}>
            <div className="text-[9px] font-medium uppercase tracking-wide text-zinc-500">Bu Ay</div>
            <div className="font-mono text-[15px] font-bold leading-tight tabular-nums text-zinc-800">
              {data ? formatTraffic(data.monthly.totalGB) : "—"}
            </div>
          </div>
        </div>

        {!data && <p className="py-1 text-center text-[11px] text-zinc-500">Servise ulaşılamadı</p>}
      </div>
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════
   Ana sayfa
══════════════════════════════════════════════════════════ */

export default function TvMonitoringPage() {
  const {
    data, error,
    offlineFirms, domains, bandwidth,
    histories,
    tracker, events, lastDownAt,
    downMonitors, serverMonitors, serviceMonitors, exchangeMonitors,
    uptimePct,
    testDown, triggerTestDown,
  } = useTvData()

  const { soundOn, setSoundOn } = useAlarmSound(lastDownAt, downMonitors.length > 0)

  /* ── Yükleniyor ── */
  if (!data && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: PAGE_BG }}>
        <div className="flex items-center gap-4 text-zinc-500">
          <Activity className="size-10" />
          <span className="text-[24px]">Uptime Kuma&apos;ya bağlanılıyor…</span>
        </div>
      </div>
    )
  }

  /* ── Hata ── */
  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-16" style={{ background: PAGE_BG }}>
        <div className="w-full max-w-2xl">
          <Card>
            <div className="px-10 py-12 text-center">
              <AlertTriangle className="mx-auto mb-6 size-16 text-amber-500" />
              <p className="mb-2 text-[24px] font-bold text-zinc-800">Uptime Kuma&apos;ya ulaşılamadı</p>
              <p className="text-[14px] text-zinc-500">{error ?? "Bilinmeyen hata"}</p>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  const { counts, fetchedAt } = data

  return (
    <div
      className="flex min-h-screen flex-col gap-2 p-2 text-zinc-900 md:p-3"
      style={{ background: PAGE_BG, colorScheme: "light" }}
    >
      {/* ── DOWN uyarı şeridi ── */}
      {downMonitors.length > 0 && <DownBanner monitors={downMonitors} tracker={tracker} />}

      {/* ── Başlık şeridi ── */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-1 md:px-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-[4px] bg-[#1d64ff]">
            <Activity className="size-3.5 text-white" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-[12px] font-bold tracking-tight text-zinc-800 md:text-[13px]">
              DEVOPS İZLEME MERKEZİ
            </h1>
            <div className="truncate text-[9px] font-medium uppercase tracking-[0.2em] text-zinc-500 md:text-[10px]">
              Pusula Yazılım
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={triggerTestDown}
            disabled={testDown}
            className={cn(
              "h-7 rounded-[5px] border px-2 text-[10px] font-bold uppercase tracking-widest transition-colors",
              testDown
                ? "cursor-wait border-red-300 bg-red-50 text-red-600"
                : "border-[#DCD8D4] bg-white text-zinc-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600",
            )}
            title="Test: Active Directory'yi 8 sn boyunca DOWN göster"
          >
            {testDown ? "Test aktif…" : "Alarm Testi"}
          </button>
          <button
            type="button"
            onClick={() => setSoundOn((v) => !v)}
            className={cn(
              "flex size-7 items-center justify-center rounded-[5px] border transition-colors",
              soundOn
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-[#DCD8D4] bg-white text-zinc-400 hover:bg-[#F4F2F0]",
            )}
            title={soundOn ? "Ses açık — kapatmak için tıkla" : "Ses kapalı — açmak için tıkla"}
          >
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <div className="hidden font-mono text-[10px] uppercase tracking-widest text-zinc-400 sm:block">
            Uptime Kuma · 10.15.2.6:3001
          </div>
        </div>
      </div>

      {/* ── KPI şeridi ── */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          title="Canlı Uptime"
          value={`%${uptimePct.toFixed(1)}`}
          subtitle="Anlık durum"
          trend={{ value: `${counts.online}/${counts.total} çevrimiçi`, positive: counts.offline === 0 }}
          accent={counts.offline > 0 ? "red" : counts.warning > 0 ? "amber" : "emerald"}
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
        />
        <ClockCard fetchedAt={fetchedAt} />
      </div>

      {/* ── İçerik: solda bilgi kartları, sağda monitör grupları ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
        <div className="flex w-full shrink-0 flex-col gap-2 lg:w-[260px] xl:w-[300px]">
          <BandwidthTile data={bandwidth} />
          {exchangeMonitors.length > 0 && (
            <ExchangeTile monitors={exchangeMonitors} health={data.exchangeHealth} />
          )}
          <OfflineFirmsTile data={offlineFirms} />
          <DomainExpiryTile data={domains} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {serverMonitors.length > 0 && (
            <MonitorGroup
              title="Sunucular"
              count={serverMonitors.length}
              monitors={serverMonitors}
              tracker={tracker}
            />
          )}
          {serviceMonitors.length > 0 && (
            <MonitorGroup
              title="Servisler & Web"
              count={serviceMonitors.length}
              monitors={serviceMonitors}
              tracker={tracker}
            />
          )}
        </div>
      </div>

      {/* ── Son olaylar ── */}
      {events.length > 0 && <EventLog events={events} />}

      {/* ── DOWN Spotlight ── */}
      {downMonitors.length > 0 && (
        <DownSpotlight monitors={downMonitors} tracker={tracker} histories={histories} />
      )}
    </div>
  )
}
