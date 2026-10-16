"use client"

import { Check, WifiOff, ServerOff, Network, AlertTriangle, Building2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface AdServerItem {
  id:           string
  name:         string
  ip:           string
  dns:          string
  domain:       string
  rdpPort:      number | null
  isOnline:     boolean
  userCount:    number
  companyCount: number
}

/** Yoğunluk çubuğu için kullanıcı üst sınırı (eski tabloyla aynı ölçek) */
const KULLANICI_SINIRI = 500

export function StepServer({
  servers,
  selectedId,
  onSelect,
  loading,
  error,
}: {
  servers: AdServerItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
  error?: string | null
}) {
  const secili = servers.find((s) => s.id === selectedId)
  const cevrimici = servers.filter((s) => s.isOnline).length

  return (
    <div className="space-y-4">

      {/* Üst şerit: seçim özeti */}
      <div className="flex items-center gap-3 rounded-[8px] bg-[var(--section-bg)] px-3 py-2.5">
        <span className="bg-primary/10 text-primary ring-primary/20 flex size-8 shrink-0 items-center justify-center rounded-[5px] ring-1">
          <Network className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">
            {secili ? `${secili.name} seçildi` : "Active Directory sunucusunu seçin"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {secili
              ? [secili.domain, secili.dns || secili.ip].filter(Boolean).join(" · ")
              : loading ? "Sunucular yükleniyor…" : `${servers.length} sunucu, ${cevrimici} çevrimiçi — firmanın OU'su ve kullanıcıları burada açılır`}
          </p>
        </div>
      </div>

      {/* Yüklenme */}
      {loading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2.5 rounded-[8px] border-2 p-3">
              <Skeleton className="h-3.5 w-28 rounded-[5px]" />
              <Skeleton className="h-3 w-36 rounded-[5px]" />
              <Skeleton className="h-1 w-full rounded-full" />
              <Skeleton className="h-3 w-24 rounded-[5px]" />
            </div>
          ))}
        </div>
      )}

      {/* Hata */}
      {!loading && error && (
        <div className="flex items-center gap-2 rounded-[5px] bg-red-500/15 px-3 py-2.5 text-[12px] text-red-700 dark:text-red-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Boş durum */}
      {!loading && !error && servers.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed px-4 py-10 text-center">
          <ServerOff className="size-6 text-muted-foreground" />
          <p className="text-[13px] font-medium">Henüz AD sunucusu tanımlı değil</p>
          <p className="max-w-xs text-[12px] text-muted-foreground">
            Firma kurulumu yapabilmek için önce sisteme AD rolünde bir sunucu eklemelisin.
          </p>
          <Button asChild size="sm" className="mt-1"><a href="/servers">Sunucu Ekle</a></Button>
        </div>
      )}

      {/* Sunucu kartları */}
      {!loading && !error && servers.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((srv) => {
            const sec = srv.id === selectedId
            const kapali = !srv.isOnline
            const pct = Math.min(100, Math.round((srv.userCount / KULLANICI_SINIRI) * 100))
            return (
              <button
                key={srv.id}
                type="button"
                disabled={kapali}
                onClick={() => onSelect(srv.id)}
                aria-pressed={sec}
                className={cn(
                  "rounded-[8px] border-2 p-3 text-left transition-all",
                  sec ? "border-emerald-500 bg-emerald-500/10 ring-4 ring-emerald-500/15" : "border-border bg-card hover:border-foreground/30",
                  kapali && "cursor-not-allowed opacity-50",
                )}
                style={{ boxShadow: "var(--card-shadow)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {srv.isOnline ? (
                        <span className="relative flex size-1.5 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                        </span>
                      ) : (
                        <WifiOff className="size-3 shrink-0 text-red-500" />
                      )}
                      <p className="truncate text-[13px] font-semibold">{srv.name}</p>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{srv.domain || "—"}</p>
                  </div>
                  <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", sec ? "border-emerald-500 bg-emerald-500" : "border-border")}>
                    {sec && <Check className="size-2.5 text-white" strokeWidth={3} />}
                  </span>
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <span className="flex items-center gap-3 text-[12px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Building2 className="size-3" /><span className="tabular-nums">{srv.companyCount}</span> firma</span>
                    <span className="inline-flex items-center gap-1"><Users className="size-3" /><span className="tabular-nums">{srv.userCount}</span> kullanıcı</span>
                  </span>
                  <span className={cn("text-[11px] font-medium tabular-nums",
                    pct > 80 ? "text-red-600 dark:text-red-400" : pct > 60 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>%{pct}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", pct > 80 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] tabular-nums text-muted-foreground">{srv.dns ? `${srv.dns} · ${srv.ip}` : srv.ip}</span>
                  {kapali && <span className="inline-flex shrink-0 rounded-[5px] bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400">Çevrimdışı</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
