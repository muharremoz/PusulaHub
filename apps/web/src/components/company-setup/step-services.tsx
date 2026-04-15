"use client"

import { useState, useEffect } from "react"
import type { WizardServiceDto } from "@/app/api/services/route"
import type { IisServerItem } from "@/app/api/setup/iis-servers/route"
import type { DepoServerItem } from "@/app/api/setup/depo-servers/route"
import { Check, AlertTriangle, Loader2, Server, Globe, WifiOff, ServerOff, HardDrive } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface Props {
  services: WizardServiceDto[]
  loading?: boolean
  error?: string | null
  selectedIds: number[]
  onToggle: (id: number) => void
  onToggleAll: (category: string, selected: boolean) => void

  /** IIS sunucu seçimi (yalnızca iis-site hizmet seçildiğinde gerekli) */
  iisServers:        IisServerItem[]
  iisServersLoading?: boolean
  iisServersError?:   string | null
  selectedIisServerId: string | null
  onSelectIisServer:   (id: string) => void

  /** Depo sunucu seçimi (yalnızca Pusula programı seçildiğinde gerekli) */
  depoServers:         DepoServerItem[]
  depoServersLoading?: boolean
  depoServersError?:   string | null
  selectedDepoServerId: string | null
  onSelectDepoServer:   (id: string) => void
}

function getSourcePath(svc: WizardServiceDto): string {
  if (svc.config && "sourceFolderPath" in svc.config) return svc.config.sourceFolderPath
  return "—"
}

export function StepServices({
  services, loading, error, selectedIds, onToggle, onToggleAll,
  iisServers, iisServersLoading, iisServersError,
  selectedIisServerId, onSelectIisServer,
  depoServers, depoServersLoading, depoServersError,
  selectedDepoServerId, onSelectDepoServer,
}: Props) {
  const categories = [...new Set(services.map((s) => s.category))]
  const [activeTab, setActiveTab] = useState<string | undefined>(categories[0])

  // Veri sonradan geldiğinde ilk kategoriyi otomatik aktif et
  useEffect(() => {
    if (!activeTab && categories.length > 0) setActiveTab(categories[0])
  }, [activeTab, categories])

  const catItems = services.filter((s) => s.category === activeTab)
  const allSelected = catItems.length > 0 && catItems.every((s) => selectedIds.includes(s.id))

  // Seçili hizmetler arasında iis-site var mı?
  const hasIisSelected = services.some((s) => s.type === "iis-site" && selectedIds.includes(s.id))
  // Aktif tab IIS hizmetlerini içeriyor mu? (henüz seçilmemiş olsa bile)
  const activeTabHasIis = catItems.some((s) => s.type === "iis-site")
  // IIS picker'ı göster: ya zaten seçili ya da aktif tab IIS kategorisi
  const showIisPicker = hasIisSelected || activeTabHasIis

  // Pusula programı seçili mi? Seçiliyse depo sunucusu istenir.
  const hasPusulaSelected = services.some((s) => s.type === "pusula-program" && selectedIds.includes(s.id))

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Hizmetler yükleniyor…
        </div>
        <div className="flex items-center gap-1 border-b border-border/50 pb-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-[3px] mx-1 my-1" />
          ))}
        </div>
        <div className="rounded-[5px] border border-border/50 overflow-hidden">
          <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
            <Skeleton className="h-3 w-32 rounded-[3px]" />
          </div>
          <div className="divide-y divide-border/40">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="size-4 rounded-[3px]" />
                <Skeleton className="h-3 flex-1 rounded-[3px]" />
                <Skeleton className="h-3 w-32 rounded-[3px]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-200 bg-red-50 text-[11px] text-red-600">
        <AlertTriangle className="size-3.5 shrink-0" />
        {error}
      </div>
    )
  }

  if (services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <p className="text-[12px] font-medium text-foreground">Henüz hizmet tanımlı değil</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          WizardServices tablosuna en az bir kayıt eklemeniz gerekiyor.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">

      {/* Özet satırı */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {selectedIds.length > 0
            ? <><span className="font-semibold text-foreground">{selectedIds.length}</span> hizmet seçildi</>
            : "Firmaya atanacak hizmetleri seçin"}
        </span>
        {selectedIds.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {categories.map((cat) => {
              const n = services.filter((s) => s.category === cat && selectedIds.includes(s.id)).length
              return n > 0 ? `${cat}: ${n}` : null
            }).filter(Boolean).join(" · ")}
          </span>
        )}
      </div>

      {/* Kategori sekmeleri */}
      <div className="flex items-center gap-1 border-b border-border/50 pb-0">
        {categories.map((cat) => {
          const count = services.filter((s) => s.category === cat && selectedIds.includes(s.id)).length
          const isActive = activeTab === cat
          return (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {cat}
              {count > 0 && (
                <span className="size-4 rounded-full bg-foreground text-background text-[9px] flex items-center justify-center font-bold">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Hizmet listesi */}
      <div className="rounded-[5px] border border-border/50 overflow-hidden">
        {/* Liste başlık satırı */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
            {activeTab} — {catItems.length} hizmet
          </span>
          <button
            onClick={() => activeTab && onToggleAll(activeTab, !allSelected)}
            disabled={!activeTab}
            className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            {allSelected ? "Tümünü Kaldır" : "Tümünü Seç"}
          </button>
        </div>

        {/* Satırlar */}
        <div className="divide-y divide-border/40">
          {catItems.map((service) => {
            const isSelected = selectedIds.includes(service.id)
            return (
              <button
                key={service.id}
                onClick={() => onToggle(service.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  isSelected ? "bg-foreground/[0.03]" : "hover:bg-muted/20"
                )}
              >
                {/* Checkbox */}
                <span className={cn(
                  "size-4 rounded-[3px] border-2 flex items-center justify-center shrink-0 transition-all",
                  isSelected ? "bg-foreground border-foreground" : "border-border"
                )}>
                  {isSelected && <Check className="size-2.5 text-background" strokeWidth={3} />}
                </span>

                {/* Tip ikonu */}
                <span
                  className={cn(
                    "shrink-0",
                    isSelected ? "text-foreground" : "text-muted-foreground/70"
                  )}
                  title={service.type === "iis-site" ? "IIS Sitesi" : "Pusula Programı"}
                >
                  {service.type === "iis-site"
                    ? <Globe className="size-3" />
                    : <Server className="size-3" />}
                </span>

                {/* İsim */}
                <span className={cn(
                  "text-[11px] font-medium flex-1",
                  isSelected ? "text-foreground" : "text-muted-foreground"
                )}>
                  {service.name}
                </span>

                {/* Klasör yolu */}
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[240px]">
                  {getSourcePath(service)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* IIS Sunucusu seçimi — hizmet listesinin altında (aktif tab IIS kategorisindeyse veya iis-site seçildiyse) */}
      {showIisPicker && (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase mb-2">
            IIS Sunucusu
          </p>

          {/* Yükleniyor */}
          {iisServersLoading && (
            <div className="rounded-[4px] border border-border/50 overflow-hidden divide-y divide-border/40">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="h-3 w-32 rounded-[4px]" />
                  <Skeleton className="h-3 w-24 rounded-[4px]" />
                  <Skeleton className="h-3 w-28 rounded-[4px]" />
                  <Skeleton className="h-3 w-16 rounded-[4px] ml-auto" />
                </div>
              ))}
            </div>
          )}

          {/* Hata */}
          {!iisServersLoading && iisServersError && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-200 bg-red-50 text-[11px] text-red-600">
              <AlertTriangle className="size-3.5 shrink-0" />
              {iisServersError}
            </div>
          )}

          {/* Boş */}
          {!iisServersLoading && !iisServersError && iisServers.length === 0 && (
            <div className="rounded-[4px] border border-border/50 px-4 py-8 flex flex-col items-center justify-center gap-2 text-center">
              <ServerOff className="size-6 text-muted-foreground" />
              <p className="text-[12px] font-medium">IIS sunucusu tanımlı değil</p>
              <p className="text-[10px] text-muted-foreground max-w-xs">
                IIS tabanlı hizmetlerin kurulacağı bir sunucuyu sisteme
                IIS rolüyle eklemelisin.
              </p>
              <a
                href="/servers"
                className="mt-1 text-[11px] font-medium px-3 py-1.5 rounded-[5px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
              >
                Sunucu Ekle
              </a>
            </div>
          )}

          {/* Tablo */}
          {!iisServersLoading && !iisServersError && iisServers.length > 0 && (
            <>
              <div className="rounded-[4px] border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 border-b border-border/40 hover:bg-muted/30">
                      <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">Sunucu</TableHead>
                      <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">IP</TableHead>
                      <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">DNS</TableHead>
                      <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">Tip</TableHead>
                      <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8 text-center">Site</TableHead>
                      <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">Yoğunluk</TableHead>
                      <TableHead className="h-8 w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {iisServers.map((srv) => {
                      const isSelected = selectedIisServerId === srv.id
                      const isDisabled = !srv.isOnline
                      const maxSites = srv.totalRamGB > 0 ? srv.totalRamGB * 4 : 0
                      const densityPct = maxSites > 0
                        ? Math.min(100, Math.round((srv.userCount / maxSites) * 100))
                        : 0
                      const dColor = densityPct > 80 ? "text-red-500" : densityPct > 60 ? "text-amber-500" : "text-emerald-600"
                      const barColor = densityPct > 80 ? "bg-red-500" : densityPct > 60 ? "bg-amber-500" : "bg-emerald-500"
                      return (
                        <TableRow
                          key={srv.id}
                          onClick={() => !isDisabled && onSelectIisServer(srv.id)}
                          className={cn(
                            "border-b border-border/40 transition-colors",
                            isSelected ? "bg-foreground/[0.04]" : "hover:bg-muted/20",
                            isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                          )}
                        >
                          <TableCell className="py-2.5">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] font-medium">{srv.name}</p>
                              {srv.isOnline ? (
                                <span className="relative flex size-1.5 shrink-0">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                                </span>
                              ) : (
                                <WifiOff className="size-3 text-red-400 shrink-0" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground font-mono py-2.5">
                            {srv.ip}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground font-mono py-2.5 truncate max-w-[160px]">
                            {srv.dns || "—"}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground py-2.5">
                            {srv.type}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground tabular-nums text-center py-2.5">
                            {srv.userCount}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                                <div className={cn("h-full rounded-full", barColor)} style={{ width: `${densityPct}%` }} />
                              </div>
                              <span className={cn("text-[10px] tabular-nums w-7 text-right shrink-0", dColor)}>%{densityPct}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className={cn(
                              "size-4 rounded-full border flex items-center justify-center",
                              isSelected ? "bg-foreground border-foreground" : "border-border"
                            )}>
                              {isSelected && <Check className="size-2.5 text-background" strokeWidth={3} />}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-[10px] text-muted-foreground px-1 mt-2">
                {iisServers.length} sunucu listeleniyor
              </p>
            </>
          )}
        </div>
      )}

      {/* Depo Sunucusu — Pusula programı seçildiyse resim klasörü için gerekli */}
      {hasPusulaSelected && (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase mb-2">
            Depo Sunucusu
            <span className="ml-2 text-muted-foreground/70 normal-case tracking-normal">
              — D:\Resimler\&lt;firmaId&gt; klasörü ve NTFS yetkisi bu sunucuda açılır
            </span>
          </p>

          {depoServersLoading && (
            <div className="rounded-[4px] border border-border/50 overflow-hidden divide-y divide-border/40">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="h-3 w-32 rounded-[4px]" />
                  <Skeleton className="h-3 w-24 rounded-[4px]" />
                  <Skeleton className="h-3 w-16 rounded-[4px] ml-auto" />
                </div>
              ))}
            </div>
          )}

          {!depoServersLoading && depoServersError && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-200 bg-red-50 text-[11px] text-red-600">
              <AlertTriangle className="size-3.5 shrink-0" />
              {depoServersError}
            </div>
          )}

          {!depoServersLoading && !depoServersError && depoServers.length === 0 && (
            <div className="rounded-[4px] border border-border/50 px-4 py-8 flex flex-col items-center justify-center gap-2 text-center">
              <HardDrive className="size-6 text-muted-foreground" />
              <p className="text-[12px] font-medium">Depo sunucusu tanımlı değil</p>
              <p className="text-[10px] text-muted-foreground max-w-xs">
                Pusula programlarının resim klasörünün açılacağı bir sunucuyu
                sisteme <span className="font-semibold">Depo</span> rolüyle eklemelisin.
              </p>
              <a
                href="/servers"
                className="mt-1 text-[11px] font-medium px-3 py-1.5 rounded-[5px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
              >
                Sunucu Ekle
              </a>
            </div>
          )}

          {!depoServersLoading && !depoServersError && depoServers.length > 0 && (
            <>
              <div className="rounded-[4px] border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 border-b border-border/40 hover:bg-muted/30">
                      <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">Sunucu</TableHead>
                      <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">IP</TableHead>
                      <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">DNS</TableHead>
                      <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">Tip</TableHead>
                      <TableHead className="h-8 w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {depoServers.map((srv) => {
                      const isSelected = selectedDepoServerId === srv.id
                      const isDisabled = !srv.isOnline
                      return (
                        <TableRow
                          key={srv.id}
                          onClick={() => !isDisabled && onSelectDepoServer(srv.id)}
                          className={cn(
                            "border-b border-border/40 transition-colors",
                            isSelected ? "bg-foreground/[0.04]" : "hover:bg-muted/20",
                            isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                          )}
                        >
                          <TableCell className="py-2.5">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] font-medium">{srv.name}</p>
                              {srv.isOnline ? (
                                <span className="relative flex size-1.5 shrink-0">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                                </span>
                              ) : (
                                <WifiOff className="size-3 text-red-400 shrink-0" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground font-mono py-2.5">
                            {srv.ip}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground font-mono py-2.5 truncate max-w-[160px]">
                            {srv.dns || "—"}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground py-2.5">
                            {srv.type}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className={cn(
                              "size-4 rounded-full border flex items-center justify-center",
                              isSelected ? "bg-foreground border-foreground" : "border-border"
                            )}>
                              {isSelected && <Check className="size-2.5 text-background" strokeWidth={3} />}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-[10px] text-muted-foreground px-1 mt-2">
                {depoServers.length} sunucu listeleniyor
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
