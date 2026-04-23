"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  CheckCircle2, XCircle, Clock, Pin, User, Tag, AlertTriangle, Activity,
} from "lucide-react"
import {
  Monitor as IsMonitor,
  Building as IsBuilding,
  Kanban as IsKanban,
  SecurityUser as IsSecurityUser,
  Driver as IsDriver,
  Danger as IsDanger,
  Calendar as IsCalendar,
  Note1 as IsNote,
} from "iconsax-reactjs"

const CardIcon = ({ Icon, className }: { Icon: React.ComponentType<Record<string, unknown>>; className?: string }) => (
  <span className={`inline-flex ${className ?? ""}`}>
    <Icon size="14" color="currentColor" variant="TwoTone" />
  </span>
)
import { PageContainer } from "@/components/layout/page-container"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"

interface DashboardData {
  kpi: {
    totalServers: number
    onlineServers: number
    offlineServers: number
    totalCompanies: number
    activeProjects: number
  }
  failedLogons: {
    total24h: number
    recent: {
      timestamp: string
      serverName: string
      username: string
      clientIp: string
    }[]
  }
  disks: { id: string; name: string; drive: string; disk: number; totalGB: number; usedGB: number }[]
  problemServers: {
    id: string; name: string; ip: string
    status: string; cpu: number; ram: number; disk: number
  }[]
  projects: {
    id: string; name: string; color: string
    companyName: string | null
    taskCount: number; doneCount: number
    nextDueDate: string | null
  }[]
  calendar: {
    id: string; title: string
    startDate: string; endDate: string
    allDay: boolean; color: string; type: string
  }[]
  notes: {
    id: string; title: string
    color: string; pinned: boolean
    tags: string[]; createdBy: string
    createdAt: string; updatedAt: string
  }[]
}

interface MonitoringSummary {
  ok:     boolean
  counts: { total: number; online: number; warning: number; offline: number }
  monitors: { name: string; status: string }[]
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [monitoring, setMonitoring] = useState<MonitoringSummary | null>(null)
  const [monitoringLoading, setMonitoringLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const r = await fetch("/api/dashboard/summary", { cache: "no-store" })
        if (!r.ok) throw new Error("fetch fail")
        const d = await r.json()
        if (mounted) setData(d)
      } catch {
        if (mounted) setData(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    const loadMonitoring = async () => {
      try {
        const r = await fetch("/api/monitoring", { cache: "no-store" })
        const j = await r.json()
        if (mounted) setMonitoring(j.ok ? j : null)
      } catch {
        if (mounted) setMonitoring(null)
      } finally {
        if (mounted) setMonitoringLoading(false)
      }
    }
    load()
    loadMonitoring()
    const iv  = setInterval(load, 30_000)
    const iv2 = setInterval(loadMonitoring, 30_000)
    return () => { mounted = false; clearInterval(iv); clearInterval(iv2) }
  }, [])

  return (
    <PageContainer title="Kontrol Paneli" description="Sistem genel görünümü">
      {/* ─── KPI Kartları (4) ─── */}
      <div className="rounded-[8px] p-2 mb-3" style={{ backgroundColor: "#F4F2F0" }}>
      <div className="grid grid-cols-4 gap-2">
        <KpiCard
          title="SUNUCULAR"
          icon={<CardIcon Icon={IsMonitor} />}
          loading={loading}
          value={data ? data.kpi.totalServers : 0}
          extra={data ? (
            <div className="flex items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="size-3" /> {data.kpi.onlineServers} online
              </span>
              <span className="inline-flex items-center gap-1 text-destructive">
                <XCircle className="size-3" /> {data.kpi.offlineServers} offline
              </span>
            </div>
          ) : null}
        />
        <MonitoringKpi loading={monitoringLoading} data={monitoring} />
        <KpiCard
          title="FIRMALAR"
          icon={<CardIcon Icon={IsBuilding} />}
          loading={loading}
          value={data ? data.kpi.totalCompanies : 0}
          extra={<span className="text-[11px] text-muted-foreground">toplam kayıtlı firma</span>}
        />
        <KpiCard
          title="AKTİF PROJELER"
          icon={<CardIcon Icon={IsKanban} />}
          loading={loading}
          value={data ? data.kpi.activeProjects : 0}
          extra={<span className="text-[11px] text-muted-foreground">devam eden proje</span>}
        />
      </div>
      </div>

      {/* ─── Orta Blok: 3 kolon ─── */}
      <div className="rounded-[8px] p-2 mb-3" style={{ backgroundColor: "#F4F2F0" }}>
      <div className="grid grid-cols-3 gap-2">
        <PanelCard
          title="RDP Başarısız Denemeler"
          icon={<CardIcon Icon={IsSecurityUser} />}
          footer={data ? `Son 24 saatte toplam ${data.failedLogons.total24h} deneme` : undefined}
        >
          {loading ? (
            <SkeletonList rows={6} />
          ) : !data || data.failedLogons.recent.length === 0 ? (
            <EmptyState text="Son 24 saatte başarısız giriş yok." />
          ) : (
            <div className="rounded-[4px] overflow-hidden border border-border/40">
              {/* Tablo header */}
              <div className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr_0.6fr] gap-2 px-2 py-1.5 bg-muted/30 border-b border-border/40 text-[9px] font-medium text-muted-foreground tracking-wide uppercase">
                <span>Kullanıcı</span>
                <span>Sunucu</span>
                <span>IP</span>
                <span>Tarih</span>
                <span>Saat</span>
              </div>
              {/* Veri satırları */}
              <div className="divide-y divide-border/40">
                {data.failedLogons.recent.map((f, i) => {
                  const d = parseDate(f.timestamp)
                  return (
                    <div
                      key={i}
                      className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr_0.6fr] gap-2 px-2 py-1.5 text-[11px] hover:bg-muted/20 transition-colors"
                    >
                      <span className="font-medium truncate" title={f.username}>{f.username}</span>
                      <span className="text-muted-foreground truncate" title={f.serverName}>{f.serverName}</span>
                      <span className="text-muted-foreground font-mono text-[10px] truncate">{f.clientIp !== "-" ? f.clientIp : "—"}</span>
                      <span className="text-muted-foreground tabular-nums text-[10px]">{d ? d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }) : "—"}</span>
                      <span className="text-muted-foreground tabular-nums text-[10px]">{d ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </PanelCard>

        <PanelCard
          title="Disk Kullanımı"
          icon={<CardIcon Icon={IsDriver} />}
          footer="En dolu ilk 8 sunucu"
        >
          {loading ? (
            <SkeletonList rows={6} />
          ) : !data || data.disks.length === 0 ? (
            <EmptyState text="Henüz disk verisi yok." />
          ) : (
            <div className="space-y-2">
              {data.disks.map((d) => (
                <div key={d.id}>
                  <div className="flex items-center justify-between mb-1 text-[11px]">
                    <span className="truncate font-medium">
                      {d.name}
                      {d.drive && <span className="text-muted-foreground font-normal ml-1">{d.drive}</span>}
                    </span>
                    <span className={`tabular-nums shrink-0 ${d.disk >= 85 ? "text-destructive font-semibold" : d.disk >= 70 ? "text-orange-600" : "text-muted-foreground"}`}>
                      %{d.disk}
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${d.disk >= 85 ? "bg-destructive" : d.disk >= 70 ? "bg-orange-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(d.disk, 100)}%` }}
                    />
                  </div>
                  {d.totalGB > 0 && (
                    <div className="flex items-center justify-end mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                      {formatGB(d.usedGB)} / {formatGB(d.totalGB)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard
          title="Sorunlu Sunucular"
          icon={<CardIcon Icon={IsDanger} />}
          footer={data ? `${data.problemServers.length} sunucu dikkat gerektiriyor` : undefined}
        >
          {loading ? (
            <SkeletonList rows={6} />
          ) : !data || data.problemServers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="size-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="size-5 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="text-[12px] font-medium text-foreground">Tüm sunucular sağlıklı</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {data ? `${data.kpi.onlineServers} sunucu aktif · CPU, RAM ve disk eşikleri normal` : ""}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {data.problemServers.map((s) => (
                <Link
                  key={s.id}
                  href={`/servers/${s.id}`}
                  className="py-1.5 flex items-center gap-2 text-[11px] hover:bg-muted/20 -mx-1 px-1 rounded"
                >
                  {s.status === "offline" ? (
                    <XCircle className="size-3 text-destructive shrink-0" />
                  ) : (
                    <AlertTriangle className="size-3 text-orange-500 shrink-0" />
                  )}
                  <span className="font-medium truncate flex-1">{s.name}</span>
                  {s.status === "offline" ? (
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-destructive/40 text-destructive">offline</Badge>
                  ) : (
                    <span className="tabular-nums text-muted-foreground text-[10px]">
                      CPU {s.cpu}% · RAM {s.ram}% · Disk {s.disk}%
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </PanelCard>
      </div>
      </div>

      {/* ─── Alt Blok: 2 kolon (Projeler + Takvim) ─── */}
      <div className="rounded-[8px] p-2" style={{ backgroundColor: "#F4F2F0" }}>
      <div className="grid grid-cols-2 gap-2">
        <PanelCard
          title="Aktif Projeler"
          icon={<CardIcon Icon={IsKanban} />}
          footer={data ? `${data.kpi.activeProjects} aktif proje${data.kpi.activeProjects > data.projects.length ? ` · son ${data.projects.length} gösteriliyor` : ""}` : undefined}
          action={<Link href="/projects" className="text-[11px] text-primary hover:underline">Tümü</Link>}
        >
          {loading ? (
            <SkeletonList rows={5} />
          ) : !data || data.projects.length === 0 ? (
            <EmptyState text="Henüz aktif proje yok." />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {data.projects.map((p) => {
                const pct      = p.taskCount > 0 ? Math.round((p.doneCount / p.taskCount) * 100) : 0
                const hasTasks = p.taskCount > 0
                const color    = p.color || "#6366f1"
                // Due date urgency
                let dueCls = "text-muted-foreground bg-muted/40"
                let dueLabel: string | null = null
                if (p.nextDueDate) {
                  const now = new Date(); now.setHours(0,0,0,0)
                  const due = new Date(p.nextDueDate); due.setHours(0,0,0,0)
                  const dueDays = Math.round((due.getTime() - now.getTime()) / 86400000)
                  if (dueDays < 0)       { dueCls = "text-red-700 bg-red-50";     dueLabel = `${Math.abs(dueDays)}g gecikti` }
                  else if (dueDays === 0){ dueCls = "text-amber-700 bg-amber-50"; dueLabel = "Bugün" }
                  else if (dueDays <= 3) { dueCls = "text-amber-700 bg-amber-50"; dueLabel = `${dueDays}g kaldı` }
                  else                   { dueCls = "text-blue-700 bg-blue-50";   dueLabel = formatDate(p.nextDueDate) }
                }
                const trendPositive = hasTasks && pct === 100
                const trendText = hasTasks
                  ? `${p.doneCount}/${p.taskCount} görev tamamlandı`
                  : "Henüz görev eklenmedi"
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="rounded-[8px] p-2 pb-0 flex flex-col hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: "#F4F2F0" }}
                  >
                    <div
                      className="rounded-[4px] px-4 py-3 flex-1"
                      style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-medium text-muted-foreground tracking-wide truncate">
                          {p.name.toUpperCase()}
                        </p>
                        <span
                          className="size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                      </div>
                      <p className="text-2xl font-bold tracking-tight tabular-nums">
                        {hasTasks ? `%${pct}` : "—"}
                      </p>
                      <p className={`text-[11px] mt-1 ${hasTasks ? (trendPositive ? "text-emerald-600" : "text-muted-foreground") : "text-muted-foreground/70"}`}>
                        {trendText}
                      </p>
                    </div>
                    <div className="px-2 py-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground truncate">
                        {p.companyName ?? "Firma atanmamış"}
                      </span>
                      {dueLabel && (
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] flex items-center gap-1 shrink-0 ${dueCls}`}>
                          <Clock className="size-2.5" />
                          {dueLabel}
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </PanelCard>

        <div className="flex flex-col gap-2 min-h-0">
        <PanelCard
          title="Bugünkü Takvim"
          icon={<CardIcon Icon={IsCalendar} />}
          footer={data ? `${data.calendar.length} etkinlik` : undefined}
          action={<Link href="/calendar" className="text-[11px] text-primary hover:underline">Takvim</Link>}
        >
          {loading ? (
            <SkeletonList rows={5} />
          ) : !data || data.calendar.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="size-10 rounded-full bg-muted/60 flex items-center justify-center">
                <IsCalendar size="20" color="currentColor" variant="TwoTone" className="text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-[12px] font-medium text-foreground">Bugün için etkinlik yok</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Planlanmış toplantı, görev veya hatırlatma bulunmuyor
                </p>
              </div>
              <Link href="/calendar" className="mt-1 text-[11px] text-primary hover:underline">
                Etkinlik ekle
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {data.calendar.map((e) => (
                <div
                  key={e.id}
                  className="py-1.5 flex items-center gap-2 text-[11px]"
                >
                  <span
                    className="w-1 h-6 rounded-full shrink-0"
                    style={{ backgroundColor: e.color || "#6366f1" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{e.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {e.allDay
                        ? "Tüm gün"
                        : `${formatTime(e.startDate)} – ${formatTime(e.endDate)}`}
                    </div>
                  </div>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                    {eventTypeLabel(e.type)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard
          title="Son Notlar"
          icon={<CardIcon Icon={IsNote} />}
          footer={data ? `${data.notes.length} not` : undefined}
          action={<Link href="/notes" className="text-[11px] text-primary hover:underline">Tümü</Link>}
        >
          {loading ? (
            <SkeletonList rows={4} />
          ) : !data || data.notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <div className="size-10 rounded-full bg-muted/60 flex items-center justify-center">
                <IsNote size="20" color="currentColor" variant="TwoTone" className="text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-[12px] font-medium text-foreground">Henüz not yok</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Hızlı notlar, hatırlatmalar ve fikirler için
                </p>
              </div>
              <Link href="/notes" className="mt-1 text-[11px] text-primary hover:underline">
                Not ekle
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {data.notes.map((n) => (
                <Link
                  key={n.id}
                  href={`/notes?id=${n.id}`}
                  className="py-2 flex items-stretch gap-2 text-[11px] hover:bg-muted/20 -mx-1 px-1 rounded"
                >
                  <span
                    className="w-1 rounded-full shrink-0"
                    style={{ backgroundColor: n.color || "#6366f1" }}
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {n.pinned && <Pin className="size-2.5 text-amber-500 shrink-0 fill-amber-500" />}
                      <span className="font-medium truncate">{n.title}</span>
                      {n.tags.length > 0 && (
                        <div className="flex items-center gap-1 shrink-0">
                          {n.tags.slice(0, 2).map((t) => (
                            <Badge
                              key={t}
                              variant="outline"
                              className="h-4 px-1.5 text-[9px] font-normal gap-0.5"
                            >
                              <Tag className="size-2" />
                              {t}
                            </Badge>
                          ))}
                          {n.tags.length > 2 && (
                            <span className="text-[9px] text-muted-foreground">+{n.tags.length - 2}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5 truncate">
                        <User className="size-2.5" />
                        {n.createdBy}
                      </span>
                      <span className="flex items-center gap-0.5 tabular-nums shrink-0">
                        <Clock className="size-2.5" />
                        {formatDateTime(n.updatedAt)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </PanelCard>
        </div>
      </div>
      </div>
    </PageContainer>
  )
}

/* ─────────────────────────────────────────────────────────── */

function KpiCard({
  title, icon, value, extra, loading,
}: {
  title: string
  icon: React.ReactNode
  value: number
  extra: React.ReactNode
  loading: boolean
}) {
  return (
    <div className="bg-white rounded-[4px] p-3" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
          {title}
        </span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      {loading ? (
        <>
          <Skeleton className="h-7 w-16 mb-1.5" />
          <Skeleton className="h-3 w-32" />
        </>
      ) : (
        <>
          <div className="text-2xl font-bold tabular-nums leading-tight">{value}</div>
          <div className="mt-1">{extra}</div>
        </>
      )}
    </div>
  )
}

function MonitoringKpi({
  loading, data,
}: {
  loading: boolean
  data: MonitoringSummary | null
}) {
  const hasOffline = !!data && data.counts.offline > 0
  const hasWarn    = !!data && data.counts.warning > 0
  const allGreen   = !!data && !hasOffline && !hasWarn && data.counts.total > 0

  // Offline olan ilk 2 monitor — detay olarak göstermek için
  const downNames = data?.monitors.filter((m) => m.status === "down").slice(0, 2).map((m) => m.name) ?? []

  return (
    <Link
      href="/monitoring"
      className="bg-white rounded-[4px] p-3 hover:opacity-95 transition-opacity block"
      style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
          İZLEME
        </span>
        <span className={hasOffline ? "text-destructive" : hasWarn ? "text-amber-500" : "text-muted-foreground"}>
          <Activity className="size-3.5" />
        </span>
      </div>
      {loading ? (
        <>
          <Skeleton className="h-7 w-20 mb-1.5" />
          <Skeleton className="h-3 w-32" />
        </>
      ) : !data ? (
        <>
          <div className="text-2xl font-bold tabular-nums leading-tight text-muted-foreground">—</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Kuma'ya ulaşılamadı</div>
        </>
      ) : (
        <>
          <div className="text-2xl font-bold tabular-nums leading-tight">
            <span className={allGreen ? "text-emerald-600" : hasOffline ? "text-destructive" : "text-amber-600"}>
              {data.counts.online}
            </span>
            <span className="text-muted-foreground">/{data.counts.total}</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px]">
            {hasOffline ? (
              <span className="inline-flex items-center gap-1 text-destructive truncate" title={downNames.join(", ")}>
                <XCircle className="size-3 shrink-0" />
                <span className="truncate">
                  {downNames.length > 0 ? downNames.join(", ") : `${data.counts.offline} çevrimdışı`}
                  {data.counts.offline > downNames.length && ` +${data.counts.offline - downNames.length}`}
                </span>
              </span>
            ) : hasWarn ? (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <AlertTriangle className="size-3" /> {data.counts.warning} uyarı
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Activity className="size-3" /> tüm servisler çevrimiçi
              </span>
            )}
          </div>
        </>
      )}
    </Link>
  )
}

function PanelCard({
  title, icon, children, footer, action,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  footer?: string
  action?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-[4px] flex flex-col" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="text-[11px] font-semibold tracking-wide uppercase text-foreground">
            {title}
          </span>
        </div>
        {action}
      </div>
      <div className="p-3 flex-1">{children}</div>
      {footer && (
        <div className="px-3 py-1.5 border-t border-border/40 text-[10px] text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  )
}

function SkeletonList({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-24 text-[11px] text-muted-foreground">
      {text}
    </div>
  )
}

/* ─── Yardımcılar ─── */
function formatGB(gb: number): string {
  if (!gb || gb <= 0) return "0 GB"
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`
  if (gb >= 100)  return `${Math.round(gb)} GB`
  return `${gb.toFixed(1)} GB`
}

function parseDate(ts: string): Date | null {
  try {
    const d = new Date(ts.replace(" ", "T"))
    return isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

function formatDateTime(ts: string): string {
  try {
    const d = new Date(ts.replace(" ", "T"))
    if (isNaN(d.getTime())) return ts
    const today = new Date()
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    if (sameDay) return `Bugün ${time}`
    const date = d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" })
    return `${date} ${time}`
  } catch {
    return ts
  }
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts.replace(" ", "T"))
    if (isNaN(d.getTime())) return ts.slice(11, 16)
    return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ts.slice(11, 16)
  }
}

function formatDate(d: string): string {
  try {
    const date = new Date(d)
    if (isNaN(date.getTime())) return d
    return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })
  } catch {
    return d
  }
}

function eventTypeLabel(t: string): string {
  switch (t) {
    case "task":     return "Görev"
    case "note":     return "Not"
    case "reminder": return "Hatırlatma"
    default:         return "Etkinlik"
  }
}
