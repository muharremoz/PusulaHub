"use client"

import { useEffect, useState, useCallback } from "react"
import { PageContainer } from "@/components/layout/page-container"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  MoreVertical,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Globe,
  Plus,
  RefreshCw,
  AlertTriangle,
  ServerOff,
} from "lucide-react"
import { IISSiteSheet } from "@/components/iis/iis-site-sheet"
import type { IISSiteDto } from "@/app/api/iis/sites/route"

/* ── Tipler ── */
type SortKey = "name" | "server" | "appPool" | "status"
type SortDir = "asc" | "desc"

/* ── Durum renkleri ── */
const SITE_STATUS_BADGE: Record<string, string> = {
  Started: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Stopped: "bg-muted text-muted-foreground border-border",
  Unknown: "bg-muted text-muted-foreground border-border",
}
const SITE_STATUS_DOT: Record<string, string> = {
  Started: "bg-emerald-500",
  Stopped: "bg-slate-300",
  Unknown: "bg-slate-300",
}
const SITE_STATUS_LABEL: Record<string, string> = {
  Started: "Çalışıyor",
  Stopped: "Durduruldu",
  Unknown: "Bilinmiyor",
}

/* ── SortHeader ── */
function SortHeader<T extends string>({ label, sortKey, active, dir, onSort }: {
  label:   string
  sortKey: T
  active:  T
  dir:     SortDir
  onSort:  (k: T) => void
}) {
  const isActive = active === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase transition-colors select-none",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span className="shrink-0">
        {isActive
          ? dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
          : <ChevronsUpDown className="size-3 opacity-40" />}
      </span>
    </button>
  )
}

/* ── Ana Bileşen ── */
export default function IISPage() {
  const [sites,   setSites]   = useState<IISSiteDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [sheetOpen, setSheetOpen] = useState(false)

  const fetchSites = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch("/api/iis/sites")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSites(data as IISSiteDto[])
        else setError((data as { error?: string }).error ?? "IIS siteleri alınamadı")
      })
      .catch(() => setError("API bağlantı hatası"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchSites() }, [fetchSites])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
  }

  const sorted = [...sites].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1
    return String(a[sortKey]).localeCompare(String(b[sortKey])) * mul
  })

  return (
    <PageContainer title="IIS Yönetimi" description="Web siteleri ve uygulama havuzları">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-end mb-4 gap-2">
        <button
          onClick={fetchSites}
          disabled={loading}
          className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[6px] border border-border/60 hover:bg-muted/40 transition-colors disabled:opacity-40 text-muted-foreground hover:text-foreground"
        >
          {loading
            ? <RefreshCw className="size-3.5 animate-spin" />
            : <RefreshCw className="size-3.5" />}
          Yenile
        </button>
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-[6px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
        >
          <Plus className="size-3.5" />
          Yeni Site
        </button>
      </div>

      {/* ── Web Siteleri ── */}
      <div className="rounded-[8px] p-2 pb-0 mb-3" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px] overflow-hidden"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          {/* Header */}
          <div className="grid grid-cols-[16px_1.6fr_1.2fr_1fr_1.4fr_1.8fr_80px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
            <span />
            <SortHeader label="Site Adı"  sortKey="name"    active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Sunucu"    sortKey="server"  active={sortKey} dir={sortDir} onSort={handleSort} />
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Firma</span>
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Hizmet</span>
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Binding</span>
            <SortHeader label="Durum"     sortKey="status"  active={sortKey} dir={sortDir} onSort={handleSort} />
            <span />
          </div>

          {/* Yükleniyor */}
          {loading && (
            <div className="divide-y divide-border/40">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[16px_1.6fr_1.2fr_1fr_1.4fr_1.8fr_80px_28px] gap-3 px-3 py-3 items-center">
                  <Skeleton className="size-1.5 rounded-full" />
                  <Skeleton className="h-3 w-36 rounded-[4px]" />
                  <Skeleton className="h-3 w-24 rounded-[4px]" />
                  <Skeleton className="h-3 w-20 rounded-[4px]" />
                  <Skeleton className="h-5 w-24 rounded-[4px]" />
                  <Skeleton className="h-3 w-40 rounded-[4px]" />
                  <Skeleton className="h-5 w-20 rounded-[4px]" />
                  <span />
                </div>
              ))}
            </div>
          )}

          {/* Hata */}
          {!loading && error && (
            <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-red-600">
              <AlertTriangle className="size-3.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Boş */}
          {!loading && !error && sites.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <ServerOff className="size-7 text-muted-foreground" />
              <p className="text-[12px] font-medium">IIS sitesi bulunamadı</p>
              <p className="text-[10px] text-muted-foreground">
                IIS rolündeki sunuculardan henüz veri gelmedi veya hiç site kurulmadı.
              </p>
            </div>
          )}

          {/* Satırlar */}
          {!loading && !error && sorted.length > 0 && (
            <div className="divide-y divide-border/40">
              {sorted.map((site) => (
                <div
                  key={site.id}
                  className="grid grid-cols-[16px_1.6fr_1.2fr_1fr_1.4fr_1.8fr_80px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
                >
                  {/* Durum noktası */}
                  <span className="flex items-center justify-center">
                    <span className="relative flex size-1.5">
                      {site.status === "Started" && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      )}
                      <span className={cn("relative inline-flex size-1.5 rounded-full", SITE_STATUS_DOT[site.status] ?? "bg-slate-300")} />
                    </span>
                  </span>

                  {/* Site adı */}
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe className="size-3 text-muted-foreground shrink-0" />
                    <span className="text-[11px] font-medium truncate">{site.name}</span>
                  </div>

                  {/* Sunucu */}
                  <span className="text-[11px] text-muted-foreground font-mono truncate">{site.server}</span>

                  {/* Firma */}
                  <span className="text-[11px] text-muted-foreground font-mono truncate">{site.firma || "—"}</span>

                  {/* Hizmet */}
                  {site.hizmet
                    ? <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[4px] text-muted-foreground font-medium w-fit truncate max-w-full">{site.hizmet}</span>
                    : <span className="text-[11px] text-muted-foreground/40">—</span>
                  }

                  {/* Binding */}
                  <span className="text-[10px] font-mono text-muted-foreground truncate">{site.binding || "—"}</span>

                  {/* Durum */}
                  <span className={cn(
                    "text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border w-fit",
                    SITE_STATUS_BADGE[site.status] ?? "bg-muted text-muted-foreground border-border",
                  )}>
                    {SITE_STATUS_LABEL[site.status] ?? site.status}
                  </span>

                  {/* Aksiyon */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                        <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-[6px]">
                      {site.status === "Stopped"
                        ? <DropdownMenuItem className="text-xs cursor-pointer text-emerald-600">Başlat</DropdownMenuItem>
                        : <DropdownMenuItem className="text-xs cursor-pointer text-amber-600">Durdur</DropdownMenuItem>
                      }
                      <DropdownMenuItem className="text-xs cursor-pointer">Yeniden Başlat</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-xs cursor-pointer text-muted-foreground" disabled>
                        Log Dosyaları (yakında)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
          <Globe className="size-3" />
          {loading
            ? <span>Siteler yükleniyor…</span>
            : <span>{sites.length} web sitesi listeleniyor</span>
          }
        </div>
      </div>

      <IISSiteSheet open={sheetOpen} onOpenChange={setSheetOpen} onSaved={fetchSites} />

    </PageContainer>
  )
}
