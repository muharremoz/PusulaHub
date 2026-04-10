"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Database, FolderOpen, Loader2, Wrench } from "lucide-react"
import { toast } from "sonner"
import type { DemoDatabaseDto } from "@/app/api/demo-databases/route"
import type { WizardServiceDto } from "@/app/api/services/route"
import { deriveDataName } from "@/lib/demo-database-naming"

const LOCATION_TYPES = ["Yerel", "Şablon", "Uzak"] as const

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[5px] border border-border/50 overflow-hidden">
      <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
        <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">{title}</p>
      </div>
      <div className="p-3 space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11px] font-medium text-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

interface DemoDatabaseSheetProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
  /** null → create modu, dolu → edit modu */
  editing?:     DemoDatabaseDto | null
  onSaved?:     () => void
}

export function DemoDatabaseSheet({ open, onOpenChange, editing = null, onSaved }: DemoDatabaseSheetProps) {
  const isEdit = !!editing

  const [name,         setName]         = useState("")
  const [locationType, setLocationType] = useState<string>("Yerel")
  const [locationPath, setLocationPath] = useState("")
  const [description,  setDescription]  = useState("")
  const [displayOrder, setDisplayOrder] = useState("0")
  const [isActive,     setIsActive]     = useState(true)
  const [serviceIds,   setServiceIds]   = useState<number[]>([])

  const [saving, setSaving] = useState(false)

  // Pusula programları (sadece type === "pusula-program")
  const [services, setServices]             = useState<WizardServiceDto[]>([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [servicesError, setServicesError]     = useState<string | null>(null)

  /* ── Sheet açıldığında formu + hizmet listesini yükle ── */
  useEffect(() => {
    if (!open) return

    if (editing) {
      setName(editing.name)
      setLocationType(editing.locationType)
      setLocationPath(editing.locationPath ?? "")
      setDescription(editing.description ?? "")
      setDisplayOrder(String(editing.displayOrder))
      setIsActive(editing.isActive)
      setServiceIds(editing.serviceIds ?? [])
    } else {
      setName("")
      setLocationType("Yerel")
      setLocationPath("")
      setDescription("")
      setDisplayOrder("0")
      setIsActive(true)
      setServiceIds([])
    }

    // Pusula programlarını çek
    setServicesLoading(true)
    setServicesError(null)
    fetch("/api/services?onlyActive=true")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setServices((data as WizardServiceDto[]).filter((s) => s.type === "pusula-program"))
        } else {
          setServicesError(data.error ?? "Hizmetler alınamadı")
        }
      })
      .catch(() => setServicesError("Hizmet API bağlantı hatası"))
      .finally(() => setServicesLoading(false))
  }, [open, editing])

  const handleClose = () => {
    if (saving) return
    onOpenChange(false)
  }

  const toggleService = (id: number) =>
    setServiceIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])

  // Kategorilere göre grupla (hizmetler sayfasındaki gibi)
  const servicesByCategory = useMemo(() => {
    const map = new Map<string, WizardServiceDto[]>()
    for (const s of services) {
      const list = map.get(s.category) ?? []
      list.push(s)
      map.set(s.category, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [services])

  /* ── Validation ── */
  const derivedDataName = deriveDataName(name)
  const canSave = (() => {
    if (saving) return false
    if (!name.trim()) return false
    if (!derivedDataName) return false
    if (!LOCATION_TYPES.includes(locationType as typeof LOCATION_TYPES[number])) return false
    return true
  })()

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = {
        name:         name.trim(),
        locationType,
        locationPath: locationPath.trim() || null,
        description:  description.trim() || null,
        displayOrder: Number(displayOrder) || 0,
        isActive,
        serviceIds,
      }

      const url    = isEdit ? `/api/demo-databases/${editing!.id}` : "/api/demo-databases"
      const method = isEdit ? "PATCH" : "POST"
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error ?? "Kaydedilemedi")

      toast.success(isEdit ? "Demo veritabanı güncellendi" : "Demo veritabanı eklendi")
      onSaved?.()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="!w-[520px] !max-w-[520px] p-0 flex flex-col gap-0 overflow-hidden">

        <SheetHeader className="px-5 py-4 border-b border-border/50 shrink-0">
          <SheetTitle className="text-sm font-semibold">
            {isEdit ? "Demo Veritabanını Düzenle" : "Yeni Demo Veritabanı"}
          </SheetTitle>
          <SheetDescription className="text-[11px] text-muted-foreground">
            Firma kurulum sihirbazında seçilebilen demo veritabanı kataloğu.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-4 space-y-3">

            {/* ── Temel Bilgiler ── */}
            <Section title="Temel Bilgiler">
              <Field
                label="Görünen Ad"
                hint={
                  derivedDataName
                    ? `Teknik ad otomatik: ${derivedDataName} — restore hedefi için kullanılır.`
                    : "Sihirbazda listelenen isim. Teknik ad buradan türetilir."
                }
              >
                <div className="relative">
                  <Database className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="ERP Demo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-[5px] text-[11px] h-8 pl-7"
                  />
                </div>
              </Field>

              <Field label="Açıklama (opsiyonel)" hint="Kullanıcıya yardımcı olacak kısa not.">
                <Input
                  placeholder="Hazır ERP şablonu — başlangıç için uygundur"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-[5px] text-[11px] h-8"
                />
              </Field>
            </Section>

            {/* ── Kaynak ── */}
            <Section title="Kaynak">
              <Field label="Konum Tipi">
                <Select value={locationType} onValueChange={setLocationType}>
                  <SelectTrigger className="rounded-[5px] text-[11px] h-8 w-full">
                    <SelectValue placeholder="Konum tipi seçin…" />
                  </SelectTrigger>
                  <SelectContent className="rounded-[5px]">
                    {LOCATION_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="text-[11px]">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="Kaynak Yolu (opsiyonel)"
                hint={
                  locationType === "Yerel"
                    ? "SQL sunucusunda .bak dosyasının tam yolu (örn. D:\\Demo Data\\ERP.bak)."
                    : locationType === "Şablon"
                      ? "Boş şablon için yol gerekmeyebilir."
                      : "Uzak paylaşım yolu (UNC)."
                }
              >
                <div className="relative">
                  <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder={locationType === "Yerel" ? "D:\\Demo Data\\ERP.bak" : ""}
                    value={locationPath}
                    onChange={(e) => setLocationPath(e.target.value)}
                    className="rounded-[5px] text-[11px] h-8 pl-7 font-mono"
                  />
                </div>
              </Field>
            </Section>

            {/* ── İlgili Pusula Programları ── */}
            <Section title={`İlgili Pusula Programları — ${serviceIds.length} seçili`}>
              {servicesLoading && (
                <div className="space-y-1.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                      <Skeleton className="size-4 rounded-[3px]" />
                      <Skeleton className="h-3 w-32 rounded-[3px]" />
                      <Skeleton className="h-3 w-16 rounded-[3px] ml-auto" />
                    </div>
                  ))}
                </div>
              )}

              {!servicesLoading && servicesError && (
                <p className="text-[11px] text-red-600 px-1">{servicesError}</p>
              )}

              {!servicesLoading && !servicesError && services.length === 0 && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1 py-2">
                  <Wrench className="size-3.5 shrink-0" />
                  <span>Aktif Pusula programı tanımlı değil.</span>
                </div>
              )}

              {!servicesLoading && !servicesError && services.length > 0 && (
                <div className="space-y-3">
                  {servicesByCategory.map(([category, list]) => (
                    <div key={category}>
                      <p className="text-[9px] font-medium text-muted-foreground tracking-wide uppercase mb-1 px-1">
                        {category}
                      </p>
                      <div className="rounded-[4px] border border-border/40 divide-y divide-border/40 overflow-hidden">
                        {list.map((svc) => {
                          const checked = serviceIds.includes(svc.id)
                          return (
                            <label
                              key={svc.id}
                              className={cn(
                                "flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition-colors",
                                checked ? "bg-foreground/[0.03]" : "hover:bg-muted/30",
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleService(svc.id)}
                              />
                              <span className="text-[11px] font-medium flex-1 truncate">{svc.name}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* ── Sıra & Durum ── */}
            <Section title="Sıra & Durum">
              <Field label="Sıralama" hint="Düşük sayı önce gelir.">
                <Input
                  type="number"
                  placeholder="0"
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(e.target.value)}
                  className="rounded-[5px] text-[11px] h-8 tabular-nums"
                />
              </Field>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium">Aktif</p>
                  <p className="text-[10px] text-muted-foreground">
                    Pasif demo veritabanları sihirbazda görünmez.
                  </p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </Section>

          </div>
        </ScrollArea>

        <SheetFooter className="px-4 py-3.5 border-t border-border/50 shrink-0">
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="flex-1 text-[11px] font-medium py-2 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              İptal
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold py-2 rounded-[5px] bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {isEdit ? "Kaydet" : "Demo DB Ekle"}
            </button>
          </div>
        </SheetFooter>

      </SheetContent>
    </Sheet>
  )
}
