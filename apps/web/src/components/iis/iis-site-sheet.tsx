"use client"

import { useState, useEffect } from "react"
import { SheetFooter, SheetContent, SheetHeader, SheetTitle, SheetDescription, Sheet } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/combobox-select"

import { Combobox } from "@/components/ui/combobox"
import { cn } from "@/lib/utils"
import { FolderOpen, Globe, Loader2, Check } from "lucide-react"
import type { WizardServiceDto } from "@/app/api/services/route"
import type { IisServerItem } from "@/app/api/setup/iis-servers/route"
import { loadServices, getCachedServices } from "@/lib/services-cache"

interface FirmaItem { id: string; firkod: string; firma: string }

// Modül seviyesi cache — sayfa yenilenmeden tekrar fetch yapılmaz
let _firmaCache: FirmaItem[] | null = null
let _firmaPromise: Promise<FirmaItem[]> | null = null

function loadFirmalar(): Promise<FirmaItem[]> {
  if (_firmaCache) return Promise.resolve(_firmaCache)
  if (_firmaPromise) return _firmaPromise
  _firmaPromise = fetch("/api/firma/companies")
    .then((r) => r.json())
    .then((data) => {
      _firmaCache = Array.isArray(data) ? data : []
      return _firmaCache
    })
    .catch(() => { _firmaCache = []; return [] })
  return _firmaPromise
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[5px] border border-border/50 overflow-hidden">
      <div className="px-3 py-2 bg-muted/20 border-b border-border">
        <p className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">{title}</p>
      </div>
      <div className="p-3 space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-foreground/80 text-[12px] font-medium">{label}</Label>
      {children}
    </div>
  )
}

interface IISSiteSheetProps {
  open:          boolean
  onOpenChange:  (open: boolean) => void
  onSaved?:      () => void
}

export function IISSiteSheet({ open, onOpenChange, onSaved }: IISSiteSheetProps) {
  const [firmalar,        setFirmalar]        = useState<FirmaItem[]>(_firmaCache ?? [])
  const [firmalarLoading, setFirmalarLoading] = useState(!_firmaCache)
  const [firmaOpen,       setFirmaOpen]       = useState(false)
  const [firmaSearch,     setFirmaSearch]     = useState("")

  const [services,    setServices]    = useState<WizardServiceDto[]>(getCachedServices() ?? [])
  const [iisServers,  setIisServers]  = useState<IisServerItem[]>([])
  const [iisLoading,  setIisLoading]  = useState(false)

  useEffect(() => {
    if (_firmaCache) { setFirmalar(_firmaCache); setFirmalarLoading(false); return }
    setFirmalarLoading(true)
    loadFirmalar().then((data) => { setFirmalar(data); setFirmalarLoading(false) })
  }, [])

  useEffect(() => {
    const cached = getCachedServices()
    if (cached) { setServices(cached); return }
    loadServices().then(setServices)
  }, [])

  useEffect(() => {
    if (!open) return
    if (iisServers.length > 0) return
    setIisLoading(true)
    fetch("/api/setup/iis-servers")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setIisServers(data as IisServerItem[]) })
      .catch(() => { /* sessiz — liste boş kalır */ })
      .finally(() => setIisLoading(false))
  }, [open, iisServers.length])

  const [siteName, setSiteName] = useState("")
  const [server,   setServer]   = useState("")

  const [hostname, setHostname] = useState("")
  const [port,     setPort]     = useState("80")
  const [physPath, setPhysPath] = useState("")
  const [firma,    setFirma]    = useState("")
  const [hizmet,   setHizmet]   = useState("")
  const [status,   setStatus]   = useState("Started")

  const firmaFiltered = firmaSearch.trim()
    ? firmalar.filter((c) => {
        const q = firmaSearch.toLowerCase()
        return c.firkod.toLowerCase().includes(q) || c.firma.toLowerCase().includes(q)
      }).slice(0, 50)
    : firmalar.slice(0, 50)

  const handleReset = () => {
    setSiteName(""); setServer("")
    setHostname(""); setPort("80"); setPhysPath("")
    setFirma(""); setHizmet(""); setStatus("Started"); setFirmaSearch("")
  }

  const handleClose = () => { handleReset(); onOpenChange(false) }

  const canSave = siteName.trim() && server && hostname.trim() && port.trim() && physPath.trim() && firma && hizmet

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="!w-[520px] !max-w-[520px]">

        <SheetHeader className="px-5 py-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-muted-foreground" />
            <SheetTitle className="text-sm font-semibold">Yeni IIS Sitesi Ekle</SheetTitle>
          </div>
          <SheetDescription className="text-[11px] text-muted-foreground">
            Site bilgilerini ve binding ayarlarını girin.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-4 space-y-3">

            <Section title="Müşteri">
              <Field label="Firma">
                <Combobox
                  items={firmaFiltered}
                  getKey={(c) => c.id}
                  getLabel={(c) => c.firma}
                  value={firma}
                  onChange={(id) => { setFirma(id); setHizmet("") }}
                  search={firmaSearch}
                  onSearchChange={setFirmaSearch}
                  loading={firmalarLoading}
                  placeholder={firmalarLoading ? "Yükleniyor…" : "Firma seçin…"}
                  searchPlaceholder="Firma adı veya kodu…"
                  emptyText="Bulunamadı"
                  maxListHeight="max-h-52"
                  renderItem={(c) => (
                    <span className="flex min-w-0 items-center">
                      <span className="font-mono text-muted-foreground mr-2 shrink-0">{c.firkod}</span>
                      <span className="truncate">{c.firma}</span>
                    </span>
                  )}
                />
              </Field>
              <Field label="Hizmet">
                <Select value={hizmet} onValueChange={setHizmet} disabled={!firma}>
                  <SelectTrigger className="rounded-[5px] text-[13px] h-8 w-full">
                    <SelectValue placeholder={firma ? "Hizmet seçin…" : "Önce firma seçin"} />
                  </SelectTrigger>
                  <SelectContent className="rounded-[5px]">
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.name} className="text-[13px]">
                        {s.name}
                        <span className="ml-2 text-muted-foreground text-[10px]">{s.category}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Section>

            <Section title="Temel Bilgiler">
              <Field label="Site Adı">
                <Input placeholder="Kurumsal Web" value={siteName} onChange={(e) => setSiteName(e.target.value)} className="rounded-[5px] text-[13px] h-8" />
              </Field>
              <Field label="Sunucu">
                <Select value={server} onValueChange={setServer} disabled={iisLoading}>
                  <SelectTrigger className="rounded-[5px] text-[13px] h-8 w-full">
                    <SelectValue placeholder={iisLoading ? "Yükleniyor…" : iisServers.length === 0 ? "IIS sunucusu yok" : "Sunucu seçin…"} />
                  </SelectTrigger>
                  <SelectContent className="rounded-[5px]">
                    {iisServers.map((s) => (
                      <SelectItem key={s.id} value={s.name} className="text-[13px] font-mono">
                        <span className="flex items-center gap-2">
                          <span className={cn(
                            "inline-flex size-1.5 rounded-full shrink-0",
                            s.isOnline ? "bg-emerald-500" : "bg-slate-300",
                          )} />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Section>

            <Section title="Binding">
              <div className="grid grid-cols-[1fr_90px] gap-2.5">
                <Field label="Hostname / IP">
                  <Input placeholder="www.sirket.com" value={hostname} onChange={(e) => setHostname(e.target.value)} className="rounded-[5px] text-[13px] h-8 font-mono" />
                </Field>
                <Field label="Port">
                  <Input placeholder="80" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} className="rounded-[5px] text-[13px] h-8 font-mono" maxLength={5} />
                </Field>
              </div>
            </Section>

            <Section title="Dosya Sistemi">
              <Field label="Fiziksel Yol">
                <div className="relative">
                  <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                  <Input placeholder="C:\inetpub\wwwroot\site" value={physPath} onChange={(e) => setPhysPath(e.target.value)} className="rounded-[5px] text-[13px] h-8 pl-7 font-mono" />
                </div>
              </Field>
            </Section>

            <Section title="Durum">
              <Field label="Başlangıç Durumu">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="rounded-[5px] text-[13px] h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-[5px]">
                    <SelectItem value="Started" className="text-[13px]">Çalışıyor</SelectItem>
                    <SelectItem value="Stopped" className="text-[13px]">Durdurulmuş</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </Section>

          </div>
        </ScrollArea>

        <SheetFooter className="px-4 py-3.5 border-t border-border/50 shrink-0">
          <div className="flex items-center gap-2 w-full">
            <button type="button" onClick={handleClose} className="flex-1 text-[11px] font-medium py-2 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground">
              İptal
            </button>
            <button type="button" disabled={!canSave} className="flex-1 text-[11px] font-semibold py-2 rounded-[5px] bg-primary text-primary-foreground hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:pointer-events-none">
              Site Ekle
            </button>
          </div>
        </SheetFooter>

      </SheetContent>
    </Sheet>
  )
}
