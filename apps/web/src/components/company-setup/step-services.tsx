"use client"

import { useState, useEffect } from "react"
import type { WizardServiceDto } from "@/app/api/services/route"
import type { IisServerItem } from "@/app/api/setup/iis-servers/route"
import type { DepoServerItem } from "@/app/api/setup/depo-servers/route"
import { Check, AlertTriangle, Loader2, Server, Globe, WifiOff, ServerOff, HardDrive, Smartphone, Layers, Image as ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { StepServicesPars } from "./step-services-pars"
import type { ComponentProps } from "react"

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
  onSelectIisServer:   (id: string | null) => void

  /** Depo sunucu seçimi (yalnızca Pusula programı seçildiğinde gerekli) */
  depoServers:         DepoServerItem[]
  depoServersLoading?: boolean
  depoServersError?:   string | null
  selectedDepoServerId: string | null
  onSelectDepoServer:   (id: string | null) => void

  /** Pars paneli — yalnız Pars hizmeti seçiliyken dolu */
  pars?: ComponentProps<typeof StepServicesPars> | null

  /** Hangi hizmetler listelenir: "program" = Pusula programı, Resim, Pars · "api" = data gerektiren IIS siteleri.
   *  Sihirbazda Programlar SQL'den önce (data hangi programın), API hizmetleri SQL'den sonra (hangi data, hangi kullanıcı). */
  kapsam?: "program" | "api"
}

/** Kapsama giren hizmet türü — API hizmeti = iis-site (Pusula MOBIL, RFID, Kivi…) */
export const kapsamdaMi = (tip: string, kapsam: "program" | "api" | undefined) =>
  !kapsam ? true : kapsam === "api" ? tip === "iis-site" : tip !== "iis-site"

function getSourcePath(svc: WizardServiceDto): string {
  if (svc.config && "sourceFolderPath" in svc.config) return svc.config.sourceFolderPath
  if (svc.config && "subFolder" in svc.config) {
    return `Depo\\Resimler\\{firmaKod}${svc.config.subFolder ? `\\${svc.config.subFolder}` : ""}`
  }
  if (svc.config && "dbPath" in svc.config) return svc.config.dbPath
  return "—"
}

/** IIS sunucusu isteyen türler — iis-resim de IIS'te site kurar. */
const isIisType = (t: string) => t === "iis-site" || t === "iis-resim"

export function StepServices({
  services, loading, error, selectedIds, onToggle, onToggleAll,
  iisServers, iisServersLoading, iisServersError,
  selectedIisServerId, onSelectIisServer,
  depoServers, depoServersLoading, depoServersError,
  selectedDepoServerId, onSelectDepoServer,
  pars, kapsam,
}: Props) {
  // Sunucu seçimini temizleme kararı TÜM seçimlere bakar (Resim için seçilen IIS sunucusu API adımında kaybolmasın);
  // liste, özet ve seçiciler yalnız bu adımın kapsamındaki hizmetlere.
  const tumHizmetler = services
  services = services.filter((s) => kapsamdaMi(s.type, kapsam))
  const categories = [...new Set(services.map((s) => s.category))]
  const [activeTab, setActiveTab] = useState<string | undefined>(categories[0])

  // Veri sonradan geldiğinde ilk kategoriyi otomatik aktif et
  useEffect(() => {
    if (!activeTab && categories.length > 0) setActiveTab(categories[0])
  }, [activeTab, categories])

  const catItems = services.filter((s) => s.category === activeTab)
  const allSelected = catItems.length > 0 && catItems.every((s) => selectedIds.includes(s.id))
  const kapsamSecili = services.filter((s) => selectedIds.includes(s.id)).length

  // Seçili hizmetler arasında IIS'te kurulan (iis-site / iis-resim) var mı?
  const hasIisSelected = services.some((s) => isIisType(s.type) && selectedIds.includes(s.id))
  // IIS picker'ı yalnız IIS'te kurulan bir hizmet seçiliyken göster (sekmeye geçmek yetmez)
  const showIisPicker = hasIisSelected
  const herhangiIis = tumHizmetler.some((s) => isIisType(s.type) && selectedIds.includes(s.id))
  const herhangiDepo = tumHizmetler.some((s) => (s.type === "pusula-program" || s.type === "iis-resim") && selectedIds.includes(s.id))

  // Pusula programı ya da Resim seçili mi? Seçiliyse depo sunucusu istenir
  // (Resim: yayınlanan paylaşım Depo'da, Connect as kimliği de oradan).
  const hasPusulaSelected = services.some((s) => s.type === "pusula-program" && selectedIds.includes(s.id))
  const hasResimSelected  = services.some((s) => s.type === "iis-resim" && selectedIds.includes(s.id))
  const showDepoPicker = kapsam !== "api" && (hasPusulaSelected || hasResimSelected)

  // Seçici gizlenince (ilgili hizmet bırakıldı) seçili sunucu da bırakılır — kurulum ona iş göndermesin
  useEffect(() => { if (!herhangiIis && selectedIisServerId) onSelectIisServer(null) }, [herhangiIis, selectedIisServerId, onSelectIisServer])
  useEffect(() => { if (!herhangiDepo && selectedDepoServerId) onSelectDepoServer(null) }, [herhangiDepo, selectedDepoServerId, onSelectDepoServer])

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Hizmetler yükleniyor…
        </div>
        <div className="flex items-center gap-1 border-b border-border/50 pb-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-[5px] mx-1 my-1" />
          ))}
        </div>
        <div className="rounded-[5px] border border-border/50 overflow-hidden">
          <div className="px-3 py-2 bg-muted/20 border-b border-border">
            <Skeleton className="h-3 w-32 rounded-[5px]" />
          </div>
          <div className="divide-y divide-border/40">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="size-4 rounded-[5px]" />
                <Skeleton className="h-3 flex-1 rounded-[5px]" />
                <Skeleton className="h-3 w-32 rounded-[5px]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-500/25 bg-red-500/15 text-[11px] text-red-600 dark:text-red-400">
        <AlertTriangle className="size-3.5 shrink-0" />
        {error}
      </div>
    )
  }

  if (services.length === 0 && kapsam === "api") {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <p className="text-[12px] font-medium text-foreground">Tanımlı API hizmeti yok</p>
        <p className="text-[11px] text-muted-foreground mt-1">Bu adımı atlayıp devam edebilirsiniz.</p>
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
    <div className="space-y-4">

      {/* Üst şerit: seçim özeti */}
      <div className="flex items-center gap-3 rounded-[8px] bg-[var(--section-bg)] px-3 py-2.5">
        <span className="bg-primary/10 text-primary ring-primary/20 flex size-8 shrink-0 items-center justify-center rounded-[5px] ring-1">
          <Layers className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">
            {kapsamSecili > 0 ? `${kapsamSecili} ${kapsam === "api" ? "API hizmeti" : "hizmet"} seçildi` : kapsam === "api" ? "Data gerektiren API hizmetlerini seçin" : "Firmaya atanacak hizmetleri seçin"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {kapsamSecili > 0
              ? categories.map((cat) => {
                  const n = services.filter((s) => s.category === cat && selectedIds.includes(s.id)).length
                  return n > 0 ? `${cat}: ${n}` : null
                }).filter(Boolean).join(" · ")
              : `${services.length} hizmet, ${categories.length} kategori`}
          </p>
        </div>
      </div>

      {/* Kategori seçici + tümünü seç */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-[8px] bg-muted p-1">
          {categories.map((cat) => {
            const count = services.filter((s) => s.category === cat && selectedIds.includes(s.id)).length
            const isActive = activeTab === cat
            return (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={cn(
                  "flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-[12px] font-medium transition-colors",
                  isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {cat}
                {count > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">{count}</span>
                )}
              </button>
            )
          })}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => activeTab && onToggleAll(activeTab, !allSelected)}
          disabled={!activeTab || catItems.length === 0}
        >
          {allSelected ? "Tümünü Kaldır" : `Tümünü Seç (${catItems.length})`}
        </Button>
      </div>

      {/* Hizmet kartları */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {catItems.map((service) => {
          const secili = selectedIds.includes(service.id)
          const tur = turBilgisi(service.type)
          const TurIkon = tur.ikon
          return (
            <button
              key={service.id}
              type="button"
              onClick={() => onToggle(service.id)}
              aria-pressed={secili}
              className={cn(
                "flex items-center gap-3 rounded-[8px] border-2 p-3 text-left transition-all",
                secili
                  ? "border-emerald-500 bg-emerald-500/10 ring-4 ring-emerald-500/15"
                  : "border-border bg-card hover:border-foreground/30",
              )}
              style={{ boxShadow: "var(--card-shadow)" }}
            >
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[5px]", tur.renk)}>
                <TurIkon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{service.name}</p>
                <p className="truncate text-[11px] text-muted-foreground" title={getSourcePath(service)}>
                  {tur.ad} · {getSourcePath(service)}
                </p>
              </div>
              <span className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border",
                secili ? "border-emerald-500 bg-emerald-500" : "border-border",
              )}>
                {secili && <Check className="size-2.5 text-white" strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>

      {/* Pars — kullanıcılar + rapor seçimi (Pars hizmeti seçildiyse) */}
      {pars && <StepServicesPars {...pars} />}

      {/* IIS sunucusu — IIS'te kurulan hizmet (API hizmeti / Resim) seçiliyse */}
      {showIisPicker && (
        <SunucuSecici
          baslik="IIS Sunucusu"
          ikon={<Globe className="size-3.5 text-muted-foreground" />}
          aciklama="Web sitesi ve resim paylaşımının kurulacağı sunucu"
          sunucular={iisServers.map((s) => {
            const max = s.totalRamGB > 0 ? s.totalRamGB * 4 : 0
            return { ...s, alt: `${s.userCount} site`, yogunluk: max > 0 ? Math.min(100, Math.round((s.userCount / max) * 100)) : null }
          })}
          yukleniyor={iisServersLoading}
          hata={iisServersError}
          seciliId={selectedIisServerId}
          onSec={onSelectIisServer}
          bos={{ ikon: <ServerOff className="size-6 text-muted-foreground" />, baslik: "IIS sunucusu tanımlı değil", metin: "IIS tabanlı hizmetlerin kurulacağı bir sunucuyu sisteme IIS rolüyle eklemelisin." }}
        />
      )}

      {/* Depo sunucusu — Pusula programı (resim klasörü) ya da Resim (paylaşım) için */}
      {showDepoPicker && (
        <SunucuSecici
          baslik="Depo Sunucusu"
          ikon={<HardDrive className="size-3.5 text-muted-foreground" />}
          aciklama="D:\Resimler\<firmaId> klasörü ve NTFS yetkisi bu sunucuda açılır"
          sunucular={depoServers.map((s) => ({ ...s, alt: s.type, yogunluk: null }))}
          yukleniyor={depoServersLoading}
          hata={depoServersError}
          seciliId={selectedDepoServerId}
          onSec={onSelectDepoServer}
          bos={{ ikon: <HardDrive className="size-6 text-muted-foreground" />, baslik: "Depo sunucusu tanımlı değil", metin: "Pusula programlarının resim klasörünün açılacağı bir sunucuyu sisteme Depo rolüyle eklemelisin." }}
        />
      )}
    </div>
  )
}

/** Hizmet türüne göre ikon, renk ve kısa ad */
function turBilgisi(t: string): { ikon: typeof Server; renk: string; ad: string } {
  if (t === "iis-site")  return { ikon: Globe,      renk: "bg-sky-500/15 text-sky-700 dark:text-sky-400",           ad: "IIS sitesi" }
  if (t === "iis-resim") return { ikon: ImageIcon,  renk: "bg-violet-500/15 text-violet-700 dark:text-violet-400",  ad: "Resim paylaşımı" }
  if (t === "pars")      return { ikon: Smartphone, renk: "bg-amber-500/15 text-amber-700 dark:text-amber-400",     ad: "Pars (mobil)" }
  return { ikon: Server, renk: "bg-primary/10 text-primary", ad: "Program" }
}

interface SeciciSunucu { id: string; name: string; ip: string; dns: string; isOnline: boolean; alt: string; yogunluk: number | null }

/** Sunucu seçimi — bağlantı sunucusu kartlarıyla aynı görünüm (ayrık kart, seçili yeşil) */
function SunucuSecici({ baslik, ikon, aciklama, sunucular, yukleniyor, hata, seciliId, onSec, bos }: {
  baslik: string
  ikon: React.ReactNode
  aciklama: string
  sunucular: SeciciSunucu[]
  yukleniyor?: boolean
  hata?: string | null
  seciliId: string | null
  /** Seçili karta tekrar tıklanınca null → seçim bırakılır */
  onSec: (id: string | null) => void
  bos: { ikon: React.ReactNode; baslik: string; metin: string }
}) {
  const secili = sunucular.find((s) => s.id === seciliId)
  return (
    <div>
      <div className="flex items-center justify-between gap-3 pb-2">
        <p className="flex items-center gap-1.5 text-[12px] font-medium">{ikon}{baslik}</p>
        <span className="truncate text-[11px] text-muted-foreground">
          {secili ? <span className="font-medium text-emerald-700 dark:text-emerald-400">Seçili: {secili.name}</span> : aciklama}
        </span>
      </div>

      {yukleniyor && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-2.5 rounded-[8px] border-2 p-3">
              <Skeleton className="h-3.5 w-24 rounded-[5px]" />
              <Skeleton className="h-3 w-32 rounded-[5px]" />
            </div>
          ))}
        </div>
      )}

      {!yukleniyor && hata && (
        <div className="flex items-center gap-2 rounded-[5px] bg-red-500/15 px-3 py-2.5 text-[12px] text-red-700 dark:text-red-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          {hata}
        </div>
      )}

      {!yukleniyor && !hata && sunucular.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed px-4 py-8 text-center">
          {bos.ikon}
          <p className="text-[13px] font-medium">{bos.baslik}</p>
          <p className="max-w-xs text-[12px] text-muted-foreground">{bos.metin}</p>
          <Button asChild size="sm" className="mt-1"><a href="/servers">Sunucu Ekle</a></Button>
        </div>
      )}

      {!yukleniyor && !hata && sunucular.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {sunucular.map((srv) => {
            const sec = seciliId === srv.id
            const kapali = !srv.isOnline
            const pct = srv.yogunluk
            return (
              <button
                key={srv.id}
                type="button"
                disabled={kapali}
                onClick={() => onSec(sec ? null : srv.id)}
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
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{srv.dns || srv.ip}</p>
                  </div>
                  <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", sec ? "border-emerald-500 bg-emerald-500" : "border-border")}>
                    {sec && <Check className="size-2.5 text-white" strokeWidth={3} />}
                  </span>
                </div>
                {pct !== null && (
                  <>
                    <div className="mt-3 flex items-end justify-between">
                      <span className="text-[12px] text-muted-foreground">{srv.alt}</span>
                      <span className={cn("text-[11px] font-medium tabular-nums",
                        pct > 80 ? "text-red-600 dark:text-red-400" : pct > 60 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>%{pct}</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", pct > 80 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
                    </div>
                  </>
                )}
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] tabular-nums text-muted-foreground">{srv.dns ? srv.ip : srv.alt}</span>
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
