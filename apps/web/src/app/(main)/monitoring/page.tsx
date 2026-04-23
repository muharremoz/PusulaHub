"use client"

import { useEffect, useState, useCallback } from "react"
import { PageContainer } from "@/components/layout/page-container"
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Wifi,
  WifiOff,
  Activity,
} from "lucide-react"
import { StatsCard } from "@/components/shared/stats-card"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

/* ══════════════════════════════════════════════════════════
   Types — /api/monitoring response
══════════════════════════════════════════════════════════ */
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

type BeatStatus = "up" | "down" | "pending" | "maintenance"

interface BeatPoint {
  status: BeatStatus
  time:   string
  ping:   number | null
}

interface MonitorHistory {
  name:      string
  beats:     BeatPoint[]   // en eskiden yeniye, max 100
  uptimePct: number | null
}

interface MonitoringResponse {
  ok:        true
  fetchedAt: string
  counts:    { total: number; online: number; warning: number; offline: number }
  monitors:  KumaMonitor[]
  history:   Record<string, MonitorHistory> | null
}

/* ── UI tipi: Kuma statüsünü mevcut UI paletine mapler ── */
type UiStatus = "online" | "warning" | "offline"

function mapStatus(s: KumaStatus): UiStatus {
  if (s === "up") return "online"
  if (s === "down") return "offline"
  return "warning" // pending, maintenance, unknown
}

const STATUS_CONFIG: Record<UiStatus, { label: string; dot: string; glow: string; badge: string; pct: string }> = {
  online:  { label: "Çevrimiçi",  dot: "bg-emerald-500", glow: "shadow-[0_0_0_4px_rgba(16,185,129,0.15)]",  badge: "bg-emerald-50 text-emerald-700 border-emerald-200", pct: "text-emerald-600" },
  warning: { label: "Uyarı",      dot: "bg-amber-400",   glow: "shadow-[0_0_0_4px_rgba(251,191,36,0.15)]",   badge: "bg-amber-50 text-amber-700 border-amber-200",       pct: "text-amber-600"   },
  offline: { label: "Çevrimdışı", dot: "bg-red-500",     glow: "shadow-[0_0_0_4px_rgba(239,68,68,0.15)]",    badge: "bg-red-50 text-red-700 border-red-200",             pct: "text-red-600"     },
}

function formatTarget(m: KumaMonitor): string {
  if (m.hostname) return m.hostname
  if (m.url) return m.url.replace(/^https?:\/\//, "")
  return "—"
}

function formatFetchedAt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

/* ── Heartbeat bar (Kuma tarzı, her bar = tek beat) ─────── */
const BEAT_COLOR: Record<BeatStatus, string> = {
  up:          "bg-emerald-400",
  pending:     "bg-amber-400",
  down:        "bg-red-500",
  maintenance: "bg-blue-400",
}

const BEAT_TITLE: Record<BeatStatus, string> = {
  up:          "Sorunsuz",
  pending:     "Beklemede",
  down:        "Çevrimdışı",
  maintenance: "Bakımda",
}

/** Görsel olarak rahat okunsun diye 25 slot — eksik beat'leri sola yasla. */
const BEAT_SLOTS = 25

function formatBeatTime(iso: string): string {
  // Kuma "YYYY-MM-DD HH:MM:SS.fff" formatında dönüyor (TZ yok)
  const d = new Date(iso.replace(" ", "T"))
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

function HeartbeatBar({ beats }: { beats: BeatPoint[] }) {
  // Son BEAT_SLOTS beat (Kuma tarzı: sağ = en yeni). Eksik slot varsa solda boş.
  const visible = beats.slice(-BEAT_SLOTS)
  const missing = Math.max(0, BEAT_SLOTS - visible.length)
  return (
    <TooltipProvider delayDuration={100} skipDelayDuration={50}>
      <div
        className="grid items-stretch gap-1 h-8"
        style={{ gridTemplateColumns: `repeat(${BEAT_SLOTS}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: missing }).map((_, i) => (
          <div key={`e${i}`} className="rounded-[2px] bg-muted/30" />
        ))}
        {visible.map((b, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "rounded-[2px] cursor-default transition-opacity hover:opacity-70",
                  BEAT_COLOR[b.status],
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="px-2 py-1.5">
              <div className="flex flex-col gap-0.5 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", BEAT_COLOR[b.status])} />
                  <span className="font-semibold">{BEAT_TITLE[b.status]}</span>
                </div>
                <span className="text-muted-foreground tabular-nums">{formatBeatTime(b.time)}</span>
                {b.ping != null && (
                  <span className="text-muted-foreground tabular-nums">{Math.round(b.ping)} ms</span>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}

/* ══════════════════════════════════════════════════════════
   Sunucu Kartı
══════════════════════════════════════════════════════════ */
function MonitorCard({ m, history }: { m: KumaMonitor; history: MonitorHistory | null }) {
  const ui  = mapStatus(m.status)
  const cfg = STATUS_CONFIG[ui]

  return (
    <div className="rounded-[8px] p-2 pb-0 bg-[#F4F2F0]">
      <div
        className="rounded-[4px] bg-white overflow-hidden"
        style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
      >
        <div className="p-4">
          {/* Başlık */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={cn("size-2.5 rounded-full shrink-0 mt-0.5", cfg.dot, cfg.glow)} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-none truncate">{m.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">{formatTarget(m)}</p>
              </div>
            </div>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-[4px] border shrink-0", cfg.badge)}>
              {cfg.label}
            </span>
          </div>

          {/* Metrikler */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-[8px] p-1.5 pb-0 bg-[#F4F2F0]">
              <div className="rounded-[4px] bg-white px-3 py-2" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
                <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Yanıt</p>
                <div className="flex items-center gap-1.5">
                  {m.responseMs !== null ? (
                    <>
                      <Wifi className="size-3 text-muted-foreground" />
                      <span className={cn(
                        "text-[16px] font-bold tabular-nums",
                        m.responseMs < 30 ? "text-emerald-600" : m.responseMs < 80 ? "text-amber-600" : "text-red-600"
                      )}>
                        {m.responseMs < 1 ? "<1" : Math.round(m.responseMs)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">ms</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="size-3 text-red-400" />
                      <span className="text-[16px] font-bold text-red-500">—</span>
                    </>
                  )}
                </div>
              </div>
              <div className="h-1.5" />
            </div>

            <div className="rounded-[8px] p-1.5 pb-0 bg-[#F4F2F0]">
              <div className="rounded-[4px] bg-white px-3 py-2" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
                <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Uptime (100 beat)</p>
                <span className={cn(
                  "text-[16px] font-bold tabular-nums",
                  history?.uptimePct == null
                    ? "text-muted-foreground"
                    : history.uptimePct >= 99
                    ? "text-emerald-600"
                    : history.uptimePct >= 95
                    ? "text-amber-600"
                    : "text-red-600"
                )}>
                  {history?.uptimePct == null ? "—" : `%${history.uptimePct.toFixed(2)}`}
                </span>
              </div>
              <div className="h-1.5" />
            </div>
          </div>

          {/* Heartbeat bar — her bar = tek beat */}
          {history && history.beats.length > 0 ? (
            <>
              <HeartbeatBar beats={history.beats} />
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-muted-foreground">
                  {formatBeatTime(history.beats.slice(-BEAT_SLOTS)[0].time)}
                </span>
                <span className="text-[9px] text-muted-foreground">Şu an</span>
              </div>
            </>
          ) : (
            <div className="h-6 rounded-[2px] bg-muted/20 flex items-center justify-center">
              <span className="text-[9px] text-muted-foreground">
                {history ? "Heartbeat verisi yok" : "Geçmiş yükleniyor…"}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border/40 bg-muted/20">
          <Clock className="size-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            {ui === "online" ? "Çalışıyor" : ui === "offline" ? "Erişilemiyor" : "Bekleniyor"}
          </span>
        </div>
      </div>
      <div className="h-2" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Döviz Grubu — 5 kaynağı tek karta toplar
══════════════════════════════════════════════════════════ */
const EXCHANGE_PREFIX = "Döviz - "

/** "Döviz - Datshop" → "Datshop" */
function stripExchangePrefix(name: string): string {
  return name.startsWith(EXCHANGE_PREFIX) ? name.slice(EXCHANGE_PREFIX.length) : name
}

/** Grup statüsü: biri down ise down, biri warning ise warning, hepsi up ise up. */
function aggregateStatus(monitors: KumaMonitor[]): UiStatus {
  if (monitors.some((m) => mapStatus(m.status) === "offline")) return "offline"
  if (monitors.some((m) => mapStatus(m.status) === "warning")) return "warning"
  return "online"
}

function ExchangeCard({ monitors, histories }: {
  monitors:  KumaMonitor[]
  histories: Record<string, MonitorHistory> | null
}) {
  const ui  = aggregateStatus(monitors)
  const cfg = STATUS_CONFIG[ui]
  const downSources    = monitors.filter((m) => mapStatus(m.status) === "offline").map((m) => stripExchangePrefix(m.name))
  const warningSources = monitors.filter((m) => mapStatus(m.status) === "warning").map((m) => stripExchangePrefix(m.name))

  return (
    <div className="rounded-[8px] p-2 pb-0 bg-[#F4F2F0] col-span-2 row-span-2">
      <div
        className="rounded-[4px] bg-white overflow-hidden h-full"
        style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
      >
        <div className="p-4">
          {/* Başlık */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={cn("size-2.5 rounded-full shrink-0 mt-0.5", cfg.dot, cfg.glow)} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-none">Döviz Kurları</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                  api.pusulanet.net:8080/health · {monitors.length} kaynak
                </p>
              </div>
            </div>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-[4px] border shrink-0", cfg.badge)}>
              {ui === "online"
                ? "Tümü Çalışıyor"
                : ui === "offline"
                ? `${downSources.length} Çevrimdışı`
                : `${warningSources.length} Uyarı`}
            </span>
          </div>

          {/* Kaynak listesi */}
          <div className="rounded-[4px] border border-border/40 divide-y divide-border/40 overflow-hidden mb-3">
            {monitors
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name, "tr"))
              .map((m) => {
                const s    = mapStatus(m.status)
                const sCfg = STATUS_CONFIG[s]
                const hist = histories?.[m.name] ?? null
                return (
                  <div key={m.name} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/20 transition-colors">
                    <span className={cn("size-2 rounded-full shrink-0", sCfg.dot)} />
                    <span className="text-[12px] font-medium flex-1 truncate">
                      {stripExchangePrefix(m.name)}
                    </span>
                    {m.responseMs !== null ? (
                      <span className={cn(
                        "text-[11px] font-mono tabular-nums shrink-0",
                        m.responseMs < 30 ? "text-emerald-600" : m.responseMs < 80 ? "text-amber-600" : "text-red-600"
                      )}>
                        {m.responseMs < 1 ? "<1" : Math.round(m.responseMs)} ms
                      </span>
                    ) : (
                      <span className="text-[11px] text-red-500 shrink-0">—</span>
                    )}
                    <span className={cn(
                      "text-[11px] font-semibold tabular-nums shrink-0 w-14 text-right",
                      hist?.uptimePct == null
                        ? "text-muted-foreground"
                        : hist.uptimePct >= 99
                        ? "text-emerald-600"
                        : hist.uptimePct >= 95
                        ? "text-amber-600"
                        : "text-red-600"
                    )}>
                      {hist?.uptimePct == null ? "—" : `%${hist.uptimePct.toFixed(1)}`}
                    </span>
                  </div>
                )
              })}
          </div>

          {/* Alt bilgi */}
          <div className="text-[10px] text-muted-foreground">
            {ui === "online" && "Tüm kur kaynakları sorunsuz."}
            {ui === "warning" && `Uyarı: ${warningSources.join(", ")}`}
            {ui === "offline" && `Erişilemiyor: ${downSources.join(", ")}`}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border/40 bg-muted/20">
          <Clock className="size-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            Pusula Kur API — Datshop · Ozankur · Altınkaynak · TCMB · Pusula
          </span>
        </div>
      </div>
      <div className="h-2" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Ana Sayfa
══════════════════════════════════════════════════════════ */
export default function MonitoringPage() {
  const [filter, setFilter]       = useState<"all" | "online" | "warning" | "offline">("all")
  const [data, setData]           = useState<MonitoringResponse | null>(null)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    try {
      // history=1 → son 100 heartbeat (Kuma tarzı dakikalık bar). SSH +
      // sqlite3 ilk istekte 1-3 sn, sonrası 30sn cache'lenir.
      const qs = new URLSearchParams({ history: "1" })
      if (refresh) qs.set("refresh", "1")
      const res = await fetch(`/api/monitoring?${qs}`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setError(json.error ?? `HTTP ${res.status}`)
        setData(null)
      } else {
        setData(json)
        setError(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata")
      setData(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => load(), 30_000) // 30 sn otomatik yenile (Kuma /metrics cache ile senkron)
    return () => clearInterval(t)
  }, [load])

  /* ── Loading ── */
  if (loading) {
    return (
      <PageContainer title="İzleme" description="Sunucu uptime ve erişilebilirlik durumu">
        <div className="grid grid-cols-4 gap-3 mb-5">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-[4px]" />)}
        </div>
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="grid grid-cols-4 gap-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-[8px] p-2 pb-0 bg-[#F4F2F0]">
              <Skeleton className="h-[180px] rounded-[4px]" />
              <div className="h-2" />
            </div>
          ))}
        </div>
      </PageContainer>
    )
  }

  /* ── Error ── */
  if (error || !data) {
    return (
      <PageContainer title="İzleme" description="Sunucu uptime ve erişilebilirlik durumu">
        <div className="rounded-[8px] p-2 pb-0 bg-[#F4F2F0]">
          <div className="rounded-[4px] bg-white p-8 text-center" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
            <AlertTriangle className="size-10 text-amber-500 mx-auto mb-3" />
            <p className="text-[13px] font-semibold mb-1">Uptime Kuma'ya ulaşılamadı</p>
            <p className="text-[11px] text-muted-foreground mb-4">{error ?? "Bilinmeyen hata"}</p>
            <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => load(true)}>
              <RefreshCw className="size-3 mr-1.5" /> Tekrar Dene
            </Button>
          </div>
          <div className="h-2" />
        </div>
      </PageContainer>
    )
  }

  const { counts, monitors, fetchedAt } = data

  // Döviz monitor'lerini ayır, grouplanmış "Döviz Kurları" kartı tek render.
  const exchangeMonitors = monitors.filter((m) => m.name.startsWith(EXCHANGE_PREFIX))
  const regularMonitors  = monitors.filter((m) => !m.name.startsWith(EXCHANGE_PREFIX))

  // Filtre döviz grubunu komple gösterir/gizler — grubun agregat statüsüne göre.
  const exchangeUi = exchangeMonitors.length > 0 ? aggregateStatus(exchangeMonitors) : null
  const showExchange = exchangeMonitors.length > 0 && (filter === "all" || exchangeUi === filter)

  const filteredRegular = filter === "all"
    ? regularMonitors
    : regularMonitors.filter((m) => mapStatus(m.status) === filter)
  const filtered = filteredRegular // legacy ref (empty check altta)

  /* ── Empty ── */
  if (monitors.length === 0) {
    return (
      <PageContainer title="İzleme" description="Sunucu uptime ve erişilebilirlik durumu">
        <div className="rounded-[8px] p-2 pb-0 bg-[#F4F2F0]">
          <div className="rounded-[4px] bg-white p-8 text-center" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
            <Activity className="size-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-[13px] font-semibold mb-1">Henüz monitör yok</p>
            <p className="text-[11px] text-muted-foreground">Uptime Kuma panelinden monitör eklenmesi gerekiyor.</p>
          </div>
          <div className="h-2" />
        </div>
      </PageContainer>
    )
  }

  const uptimePct = counts.total === 0 ? 0 : (counts.online / counts.total) * 100

  return (
    <PageContainer title="İzleme" description="Sunucu uptime ve erişilebilirlik durumu">
      {/* ── KPI Kartları ── */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatsCard
          title="CANLI UPTIME"
          value={`%${uptimePct.toFixed(1)}`}
          icon={<Activity className="h-4 w-4" />}
          trend={{ value: `${counts.online}/${counts.total} çevrimiçi`, positive: counts.offline === 0 }}
          subtitle="Anlık durum"
        />
        <StatsCard
          title="ÇEVRİMİÇİ"
          value={counts.online}
          icon={<CheckCircle2 className="h-4 w-4" />}
          trend={{ value: "Sorunsuz çalışıyor", positive: true }}
          subtitle={`${counts.total} monitörden`}
        />
        <StatsCard
          title="UYARI"
          value={counts.warning}
          icon={<AlertTriangle className="h-4 w-4" />}
          trend={{ value: counts.warning > 0 ? "Dikkat gerekiyor" : "Sorun yok", positive: counts.warning === 0 }}
          subtitle="Beklemede / Bakım"
        />
        <StatsCard
          title="ÇEVRİMDIŞI"
          value={counts.offline}
          icon={<XCircle className="h-4 w-4" />}
          trend={{ value: counts.offline > 0 ? "Erişilemiyor" : "Hepsi erişilebilir", positive: counts.offline === 0 }}
          subtitle="Müdahale gerekiyor"
        />
      </div>

      {/* ── Filtre + Yenile ── */}
      <div className="flex items-center justify-between mb-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList className="h-8">
            <TabsTrigger value="all"     className="text-[11px] px-3">Tümü ({counts.total})</TabsTrigger>
            <TabsTrigger value="online"  className="text-[11px] px-3">Çevrimiçi ({counts.online})</TabsTrigger>
            <TabsTrigger value="warning" className="text-[11px] px-3">Uyarı ({counts.warning})</TabsTrigger>
            <TabsTrigger value="offline" className="text-[11px] px-3">Çevrimdışı ({counts.offline})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Son güncelleme: {formatFetchedAt(fetchedAt)}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[11px] gap-1.5"
            onClick={() => load(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
            Yenile
          </Button>
        </div>
      </div>

      {/* ── Kart Grid ── */}
      <div className="grid grid-cols-4 gap-0">
        {showExchange && (
          <ExchangeCard monitors={exchangeMonitors} histories={data.history} />
        )}
        {filteredRegular.map((m) => (
          <MonitorCard key={m.name} m={m} history={data.history?.[m.name] ?? null} />
        ))}
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-5 mt-1 px-1">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Durumlar:</span>
        {[
          { color: "bg-emerald-500", label: "Çevrimiçi" },
          { color: "bg-amber-400",   label: "Beklemede / Bakım" },
          { color: "bg-red-500",     label: "Çevrimdışı" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={cn("w-3 h-3 rounded-full", color)} />
            <span className="text-[11px] text-muted-foreground">{label}</span>
          </div>
        ))}
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <Activity className="size-3" />
          {filtered.length} monitör gösteriliyor · Veri: Uptime Kuma
        </span>
      </div>
    </PageContainer>
  )
}
