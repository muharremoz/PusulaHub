"use client"

import { useState } from "react"
import { PageContainer } from "@/components/layout/page-container"
import { servers } from "@/lib/mock-data"
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  ArrowUpRight,
  Wifi,
  WifiOff,
  Activity,
  Server,
} from "lucide-react"
import { StatsCard } from "@/components/shared/stats-card"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

/* ══════════════════════════════════════════════════════════
   Mock uptime geçmişi — son 30 gün
══════════════════════════════════════════════════════════ */
function generateHistory(id: string, status: string): ("up" | "down" | "degraded")[] {
  // Deterministik — id'ye göre sabit pattern
  const seed = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  return Array.from({ length: 30 }, (_, i) => {
    if (status === "offline" && i >= 28) return "down"
    if (status === "warning" && (i === 12 || i === 20 || i === 27)) return "degraded"
    if ((seed + i * 7) % 23 === 0) return "degraded"
    return "up"
  })
}

const RESPONSE_MS: Record<string, number> = {
  "srv-001": 12, "srv-002": 28, "srv-003": 9,  "srv-004": 55,
  "srv-005": 18, "srv-006": 22, "srv-007": 14, "srv-008": 67,
  "srv-009": 11, "srv-010": 31, "srv-011": 19, "srv-012": 44,
}

const UPTIME_PCT: Record<string, number> = {
  "srv-001": 99.97, "srv-002": 99.85, "srv-003": 99.91, "srv-004": 99.12,
  "srv-005": 99.98, "srv-006": 99.95, "srv-007": 99.89, "srv-008": 98.74,
  "srv-009": 99.99, "srv-010": 99.76, "srv-011": 99.93, "srv-012": 99.81,
}

const UPTIME_DATA = servers.map((s) => ({
  ...s,
  history:    generateHistory(s.id, s.status),
  responseMs: s.status === "offline" ? null : (RESPONSE_MS[s.id] ?? 20),
  uptimePct:  s.status === "offline" ? 97.20 : s.status === "warning" ? 99.10 : (UPTIME_PCT[s.id] ?? 99.80),
  incident:   s.status === "offline" ? "3 saat 42 dk önce çevrimdışı oldu" : null,
}))

const STATUS_CONFIG = {
  online:  { label: "Çevrimiçi",  dot: "bg-emerald-500", glow: "shadow-[0_0_0_4px_rgba(16,185,129,0.15)]",  badge: "bg-emerald-50 text-emerald-700 border-emerald-200", pct: "text-emerald-600" },
  warning: { label: "Uyarı",      dot: "bg-amber-400",   glow: "shadow-[0_0_0_4px_rgba(251,191,36,0.15)]",   badge: "bg-amber-50 text-amber-700 border-amber-200",       pct: "text-amber-600"   },
  offline: { label: "Çevrimdışı", dot: "bg-red-500",     glow: "shadow-[0_0_0_4px_rgba(239,68,68,0.15)]",    badge: "bg-red-50 text-red-700 border-red-200",             pct: "text-red-600"     },
} as const

const BAR_COLOR: Record<string, string> = {
  up:       "bg-emerald-400",
  degraded: "bg-amber-400",
  down:     "bg-red-500",
}

function UptimeBar({ history }: { history: ("up" | "down" | "degraded")[] }) {
  return (
    <div className="flex items-center gap-[2px]">
      {history.map((s, i) => (
        <div
          key={i}
          title={s === "up" ? "Normal" : s === "degraded" ? "Yavaş / Uyarı" : "Çevrimdışı"}
          className={cn("h-6 flex-1 rounded-[2px] cursor-default transition-opacity hover:opacity-70", BAR_COLOR[s])}
        />
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Sunucu Kartı
══════════════════════════════════════════════════════════ */
function ServerCard({ srv }: { srv: typeof UPTIME_DATA[0] }) {
  const cfg = STATUS_CONFIG[srv.status as keyof typeof STATUS_CONFIG]

  return (
    <div className="rounded-[8px] p-2 pb-0 bg-[#F4F2F0]">
      <div
        className="rounded-[4px] bg-white overflow-hidden"
        style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
      >

        <div className="p-4">
          {/* Başlık satırı */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className={cn("size-2.5 rounded-full shrink-0 mt-0.5", cfg.dot, cfg.glow)} />
              <div>
                <p className="text-[13px] font-semibold leading-none">{srv.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{srv.ip}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-[4px] border", cfg.badge)}>
                {cfg.label}
              </span>
              <a href={`/servers/${srv.id}`}>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground">
                  <ArrowUpRight className="size-3.5" />
                </Button>
              </a>
            </div>
          </div>

          {/* Metrikler */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {/* Yanıt Süresi */}
            <div className="rounded-[8px] p-1.5 pb-0 bg-[#F4F2F0]">
              <div className="rounded-[4px] bg-white px-3 py-2" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
                <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Yanıt</p>
                <div className="flex items-center gap-1.5">
                  {srv.responseMs !== null ? (
                    <>
                      <Wifi className="size-3 text-muted-foreground" />
                      <span className={cn(
                        "text-[16px] font-bold tabular-nums",
                        srv.responseMs < 30 ? "text-emerald-600" : srv.responseMs < 80 ? "text-amber-600" : "text-red-600"
                      )}>
                        {srv.responseMs}
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

            {/* Uptime % */}
            <div className="rounded-[8px] p-1.5 pb-0 bg-[#F4F2F0]">
              <div className="rounded-[4px] bg-white px-3 py-2" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
                <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Uptime</p>
                <span className={cn("text-[16px] font-bold tabular-nums", cfg.pct)}>
                  %{srv.uptimePct.toFixed(2)}
                </span>
              </div>
              <div className="h-1.5" />
            </div>
          </div>

          {/* Uptime bar */}
          <UptimeBar history={srv.history} />
          <div className="flex justify-between mt-1 mb-1">
            <span className="text-[9px] text-muted-foreground">30 gün önce</span>
            <span className="text-[9px] text-muted-foreground">Bugün</span>
          </div>

          {/* Incident uyarısı */}
          {srv.incident && (
            <div className="flex items-center gap-2 mt-3 rounded-[5px] bg-red-50 border border-red-100 px-3 py-1.5">
              <AlertTriangle className="size-3 text-red-500 shrink-0" />
              <span className="text-[11px] text-red-600">{srv.incident}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border/40 bg-muted/20">
          <Clock className="size-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">Uptime: {srv.uptime}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{srv.lastChecked}</span>
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
  const [filter, setFilter] = useState<"all" | "online" | "warning" | "offline">("all")

  const online  = UPTIME_DATA.filter((s) => s.status === "online").length
  const warning = UPTIME_DATA.filter((s) => s.status === "warning").length
  const offline = UPTIME_DATA.filter((s) => s.status === "offline").length
  const avgUptime = (UPTIME_DATA.reduce((a, s) => a + s.uptimePct, 0) / UPTIME_DATA.length).toFixed(2)

  const filtered = filter === "all" ? UPTIME_DATA : UPTIME_DATA.filter((s) => s.status === filter)

  return (
    <PageContainer title="İzleme" description="Sunucu uptime ve erişilebilirlik durumu">

      {/* ── KPI Kartları ── */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatsCard
          title="GENEL UPTIME"
          value={`%${avgUptime}`}
          icon={<Activity className="h-4 w-4" />}
          trend={{ value: "Son 30 günlük ortalama", positive: true }}
          subtitle="Tüm sunucular"
        />
        <StatsCard
          title="ÇEVRİMİÇİ"
          value={online}
          icon={<CheckCircle2 className="h-4 w-4" />}
          trend={{ value: "Sorunsuz çalışıyor", positive: true }}
          subtitle={`${UPTIME_DATA.length} sunucudan`}
        />
        <StatsCard
          title="UYARI"
          value={warning}
          icon={<AlertTriangle className="h-4 w-4" />}
          trend={{ value: "Dikkat gerekiyor", positive: false }}
          subtitle="Yüksek kaynak kullanımı"
        />
        <StatsCard
          title="ÇEVRİMDIŞI"
          value={offline}
          icon={<XCircle className="h-4 w-4" />}
          trend={{ value: "Erişilemiyor", positive: false }}
          subtitle="Müdahale gerekiyor"
        />
      </div>

      {/* ── Filtre + Yenile ── */}
      <div className="flex items-center justify-between mb-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList className="h-8">
            <TabsTrigger value="all"     className="text-[11px] px-3">Tümü ({UPTIME_DATA.length})</TabsTrigger>
            <TabsTrigger value="online"  className="text-[11px] px-3">Çevrimiçi ({online})</TabsTrigger>
            <TabsTrigger value="warning" className="text-[11px] px-3">Uyarı ({warning})</TabsTrigger>
            <TabsTrigger value="offline" className="text-[11px] px-3">Çevrimdışı ({offline})</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button variant="outline" size="sm" className="h-8 text-[11px] gap-1.5">
          <RefreshCw className="size-3" />
          Yenile
        </Button>
      </div>

      {/* ── Kart Grid ── */}
      <div className="grid grid-cols-4 gap-0">
        {filtered.map((srv) => (
          <ServerCard key={srv.id} srv={srv} />
        ))}
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-5 mt-1 px-1">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Renk Açıklaması:</span>
        {[
          { color: "bg-emerald-400", label: "Normal" },
          { color: "bg-amber-400",   label: "Yavaş / Uyarı" },
          { color: "bg-red-500",     label: "Çevrimdışı" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={cn("w-4 h-3 rounded-[2px]", color)} />
            <span className="text-[11px] text-muted-foreground">{label}</span>
          </div>
        ))}
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          <Activity className="size-3" />
          {filtered.length} sunucu gösteriliyor
        </span>
      </div>

    </PageContainer>
  )
}
