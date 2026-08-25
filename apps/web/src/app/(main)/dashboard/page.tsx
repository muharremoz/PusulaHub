"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  CheckCircle2, XCircle, AlertTriangle, Activity,
  DatabaseBackup, WifiOff,
} from "lucide-react"
import type { SpareBackupOffline } from "@/lib/sparebackup-offline"
import { Building2, HardDrive } from "lucide-react"
import { Icon } from "@/components/shared/icon"
import type { IconName } from "@/components/shared/icon-registry"

/** Kart başlığı ikonu — animasyonlu registry ikonu (lucide-animated). */
const CardIcon = ({ name, className }: { name: IconName; className?: string }) => (
  <Icon name={name} size={14} className={`inline-flex ${className ?? ""}`} />
)

/** Registry'de animasyonlu muadili olmayan ikonlar için statik lucide fallback. */
const StaticIcon = ({ I, className }: { I: React.ElementType; className?: string }) => (
  <span className={`inline-flex ${className ?? ""}`}><I className="size-3.5" /></span>
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
    totalCompanyUsers: number
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
  ramBreakdown: {
    id: string; name: string
    totalMB: number; realUsedMB: number; cacheMB: number; freeMB: number
  }[]
  problemServers: {
    id: string; name: string; ip: string
    status: string; cpu: number; ram: number; disk: number
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
  // İzin guard'ı — admin veya 'dashboard' read varsa içerir, yoksa root'a redirect
  const router = useRouter()
  const { data: session, status } = useSession()
  useEffect(() => {
    if (status !== "authenticated") return
    const role  = session?.user?.role
    const perms = (session?.user?.permissions ?? {}) as Record<string, string>
    if (role === "admin") return
    if ((perms["dashboard"] ?? "none") === "none") {
      router.replace("/")
    }
  }, [status, session, router])

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [monitoring, setMonitoring] = useState<MonitoringSummary | null>(null)
  const [monitoringLoading, setMonitoringLoading] = useState(true)
  const [spareBackup, setSpareBackup] = useState<SpareBackupOffline | null>(null)
  const [spareBackupLoading, setSpareBackupLoading] = useState(true)

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
    const loadSpareBackup = async () => {
      try {
        const r = await fetch("/api/sparebackup/offline", { cache: "no-store" })
        const j = await r.json()
        if (mounted) setSpareBackup(j.ok ? j : null)
      } catch {
        if (mounted) setSpareBackup(null)
      } finally {
        if (mounted) setSpareBackupLoading(false)
      }
    }
    load()
    loadMonitoring()
    loadSpareBackup()
    const iv  = setInterval(load, 30_000)
    const iv2 = setInterval(loadMonitoring, 30_000)
    const iv3 = setInterval(loadSpareBackup, 60_000)
    return () => { mounted = false; clearInterval(iv); clearInterval(iv2); clearInterval(iv3) }
  }, [])

  return (
    <PageContainer title="Kontrol Paneli" description="Sistem genel görünümü">
      {/* ─── Tek panel: KPI kartları + 3 kolon + RAM ─── */}
      <div className="rounded-[8px] p-2 mb-3" style={{ backgroundColor: "var(--section-bg)" }}>
      {/* Genel durum — RDP/Disk kartlarıyla aynı kabuk, metrikler içinde. */}
      <div className="mb-2">
        <PanelCard
          title="Genel Durum"
          icon={<CardIcon name="monitor-check" />}
          footer="Sunucu, izleme, firma ve yedekleme özeti"
        >
          <div className="flex items-stretch divide-x divide-border/60">
            <OzetMetrik
              title="SUNUCULAR"
              icon={<CardIcon name="monitor-check" />}
              loading={loading}
              value={data ? data.kpi.totalServers : 0}
              extra={data ? (
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3" /> {data.kpi.onlineServers} online
                  </span>
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <XCircle className="size-3" /> {data.kpi.offlineServers} offline
                  </span>
                </div>
              ) : null}
            />
            <MonitoringKpi loading={monitoringLoading} data={monitoring} />
            <OzetMetrik
              title="FIRMALAR"
              icon={<StaticIcon I={Building2} />}
              loading={loading}
              value={data ? data.kpi.totalCompanies : 0}
              extra={<span className="text-muted-foreground">toplam firma</span>}
            />
            <OzetMetrik
              title="KULLANICI"
              icon={<CardIcon name="users" />}
              loading={loading}
              value={data ? data.kpi.totalCompanyUsers : 0}
              extra={<span className="text-muted-foreground">tüm firmalarda</span>}
            />
            <SpareBackupKpi loading={spareBackupLoading} data={spareBackup} />
          </div>
        </PanelCard>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <PanelCard
          title="Disk Kullanımı"
          icon={<StaticIcon I={HardDrive} />}
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
                    <span className={`tabular-nums shrink-0 ${d.disk >= 85 ? "text-destructive font-semibold" : d.disk >= 70 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`}>
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
          title="RDP Başarısız Denemeler"
          icon={<CardIcon name="shield-check" />}
          footer={data ? `Son 24 saatte toplam ${data.failedLogons.total24h} deneme` : undefined}
        >
          {loading ? (
            <SkeletonList rows={6} />
          ) : !data || data.failedLogons.recent.length === 0 ? (
            <EmptyState text="Son 24 saatte başarısız giriş yok." />
          ) : (
            <div className="rounded-[5px] overflow-hidden border border-border/40">
              {/* Tablo header */}
              <div className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr_0.6fr] gap-2 px-2 py-1.5 bg-muted/20 border-b border-border text-[9px] font-medium text-muted-foreground tracking-wide uppercase">
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
                      className="grid grid-cols-[1.2fr_1fr_1fr_0.8fr_0.6fr] gap-2 px-2 py-1.5 text-[11px] hover:bg-muted/70 transition-colors"
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
          title="Sorunlu Sunucular"
          icon={<CardIcon name="badge-alert" />}
          footer={data ? `${data.problemServers.length} sunucu dikkat gerektiriyor` : undefined}
        >
          {loading ? (
            <SkeletonList rows={6} />
          ) : !data || data.problemServers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="size-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
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

      {/* ─── RAM Kırılımı (gerçek / cache / boş) ─── */}
      <div className="grid grid-cols-1 gap-2 mt-2">
        <PanelCard
          title="RAM Kullanımı (gerçek vs cache)"
          icon={<CardIcon name="monitor-check" />}
          footer={data ? `${data.ramBreakdown.length} sunucu · cache azalan sıralı` : undefined}
        >
          {loading ? (
            <SkeletonList rows={5} />
          ) : !data || data.ramBreakdown.length === 0 ? (
            <EmptyState text="Henüz RAM verisi yok." />
          ) : (
            <div className="divide-y divide-border/40">
              {data.ramBreakdown.map((r) => {
                const total = r.totalMB || 1
                const realPct  = (r.realUsedMB / total) * 100
                const cachePct = (r.cacheMB / total) * 100
                const freePct  = (r.freeMB / total) * 100
                const fmtGB = (mb: number) => (mb / 1024).toFixed(1)
                return (
                  <Link
                    key={r.id}
                    href={`/servers/${r.id}`}
                    className="block py-2 hover:bg-muted/20 -mx-1 px-1 rounded"
                  >
                    <div className="flex items-center justify-between mb-1 text-[11px]">
                      <span className="font-medium truncate">{r.name}</span>
                      <span className="tabular-nums text-muted-foreground text-[10px]">
                        Toplam {fmtGB(r.totalMB)} GB
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full overflow-hidden bg-muted/30 flex">
                      <div style={{ width: `${realPct}%`,  backgroundColor: "#10b981" }} title={`Gerçek: ${fmtGB(r.realUsedMB)} GB`} />
                      <div style={{ width: `${cachePct}%`, backgroundColor: "var(--chart-3)" }} title={`Cache: ${fmtGB(r.cacheMB)} GB`} />
                      <div style={{ width: `${freePct}%`,  backgroundColor: "var(--muted)" }} title={`Boş: ${fmtGB(r.freeMB)} GB`} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full" style={{ backgroundColor: "#10b981" }} />
                        Gerçek {fmtGB(r.realUsedMB)} GB ({realPct.toFixed(0)}%)
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full" style={{ backgroundColor: "var(--chart-3)" }} />
                        Cache {fmtGB(r.cacheMB)} GB ({cachePct.toFixed(0)}%)
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-neutral-300" />
                        Boş {fmtGB(r.freeMB)} GB ({freePct.toFixed(0)}%)
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </PanelCard>
      </div>
      </div>

    </PageContainer>
  )
}

/* ─────────────────────────────────────────────────────────── */

/**
 * Genel Durum panelindeki tek metrik — başlık + büyük sayı + alt bilgi.
 * Kendi kart kabuğu YOK; PanelCard'ın içinde dikey ayırıcılarla yan yana durur.
 */
function OzetMetrik({
  title, icon, iconTone, value, extra, loading, href,
}: {
  title: string
  icon: React.ReactNode
  /** İkonun rengi (durum vurgusu için). */
  iconTone?: string
  value: React.ReactNode
  extra: React.ReactNode
  loading: boolean
  href?: string
}) {
  const govde = (
    <>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase truncate">
          {title}
        </span>
        <span className={iconTone ?? "text-muted-foreground"}>{icon}</span>
      </div>
      {loading ? (
        <>
          <Skeleton className="h-7 w-16 mb-1.5" />
          <Skeleton className="h-3 w-24" />
        </>
      ) : (
        <>
          <div className="text-2xl font-bold tabular-nums leading-tight">{value}</div>
          <div className="mt-1 text-[11px] truncate">{extra}</div>
        </>
      )}
    </>
  )

  const cls = "flex-1 min-w-0 px-3 first:pl-0 last:pr-0"
  return href ? (
    <Link href={href} className={`${cls} block hover:opacity-90 transition-opacity`}>
      {govde}
    </Link>
  ) : (
    <div className={cls}>{govde}</div>
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
    <OzetMetrik
      title="İZLEME"
      icon={<Activity className="size-3.5" />}
      iconTone={hasOffline ? "text-destructive" : hasWarn ? "text-amber-500" : "text-muted-foreground"}
      loading={loading}
      value={!data ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <>
          <span className={allGreen ? "text-emerald-600 dark:text-emerald-400" : hasOffline ? "text-destructive" : "text-amber-600 dark:text-amber-400"}>
            {data.counts.online}
          </span>
          <span className="text-muted-foreground">/{data.counts.total}</span>
        </>
      )}
      extra={!data ? (
        <span className="text-muted-foreground">Kuma'ya ulaşılamadı</span>
      ) : (
        <div className="flex items-center gap-3">
            {hasOffline ? (
              <span className="inline-flex items-center gap-1 text-destructive truncate" title={downNames.join(", ")}>
                <XCircle className="size-3 shrink-0" />
                <span className="truncate">
                  {downNames.length > 0 ? downNames.join(", ") : `${data.counts.offline} çevrimdışı`}
                  {data.counts.offline > downNames.length && ` +${data.counts.offline - downNames.length}`}
                </span>
              </span>
            ) : hasWarn ? (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-3" /> {data.counts.warning} uyarı
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Activity className="size-3" /> tüm servisler çevrimiçi
              </span>
            )}
        </div>
      )}
    />
  )
}

/* ── SpareBackup offline KPI kartı ── */
function SpareBackupKpi({
  loading, data,
}: {
  loading: boolean
  data: SpareBackupOffline | null
}) {
  const hasOffline = !!data && data.offlineCount > 0
  const allOnline  = !!data && data.offlineCount === 0 && data.totalActive > 0

  return (
    <OzetMetrik
      title="YEDEKLEME"
      icon={<DatabaseBackup className="size-3.5" />}
      iconTone={hasOffline ? "text-destructive" : "text-muted-foreground"}
      loading={loading}
      value={!data ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <>
          <span className={allOnline ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
            {data.onlineCount}
          </span>
          <span className="text-muted-foreground">/{data.totalActive}</span>
        </>
      )}
      extra={!data ? (
        <span className="text-muted-foreground">Servise ulaşılamadı</span>
      ) : (
        <div className="flex items-center gap-3">
            {hasOffline ? (
              <span className="inline-flex items-center gap-1 text-destructive">
                <WifiOff className="size-3 shrink-0" />
                {data.offlineCount} çevrimdışı
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3" /> tümü çevrimiçi
              </span>
            )}
        </div>
      )}
    />
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
    <div className="bg-card rounded-[5px] flex flex-col" style={{ boxShadow: "var(--card-shadow)" }}>
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



function formatDate(d: string): string {
  try {
    const date = new Date(d)
    if (isNaN(date.getTime())) return d
    return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })
  } catch {
    return d
  }
}

