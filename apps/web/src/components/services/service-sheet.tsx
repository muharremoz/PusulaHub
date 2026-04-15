"use client"

import { useEffect, useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { FolderOpen, FileText, Loader2, Server, Globe, Waypoints, MonitorDot } from "lucide-react"
import { toast } from "sonner"
import type { WizardServiceDto, ServiceType } from "@/app/api/services/route"
import type { PortRangeDto } from "@/app/api/port-ranges/route"

/* ── Sabitler ── */
const TYPE_OPTIONS: { value: ServiceType; label: string; icon: React.ReactNode; defaultCategory: string }[] = [
  { value: "pusula-program", label: "Pusula Programı",      icon: <Server className="size-3.5" />, defaultCategory: "Pusula Programları" },
  { value: "iis-site",       label: "IIS Sitesi",            icon: <Globe  className="size-3.5" />, defaultCategory: "API Hizmeti" },
]

const IIS_CATEGORIES = ["API Hizmeti", "Entegrasyonlar"]

/* ── Bölüm kartı ── */
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

/* ── Alan ── */
function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11px] font-medium text-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

interface ServiceSheetProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
  /** null → create modu, dolu → edit modu */
  editing?:     WizardServiceDto | null
  onSaved?:     () => void
}

export function ServiceSheet({ open, onOpenChange, editing = null, onSaved }: ServiceSheetProps) {
  const isEdit = !!editing

  /* ── Ortak alanlar ── */
  const [type,         setType]         = useState<ServiceType>("pusula-program")
  const [name,         setName]         = useState("")
  const [category,     setCategory]     = useState("Pusula Programları")
  const [displayOrder, setDisplayOrder] = useState("0")
  const [isActive,     setIsActive]     = useState(true)

  /* ── pusula-program config ── */
  const [pSourceFolderPath, setPSourceFolderPath] = useState("")
  const [pParamFileName,    setPParamFileName]    = useState("")
  const [pProgramCode,      setPProgramCode]      = useState("")
  const [pExeName,          setPExeName]          = useState("")

  /* ── iis-site config ── */
  const [iSourceFolderPath, setISourceFolderPath] = useState("")
  const [iConfigFileName,   setIConfigFileName]   = useState("")
  const [iSiteNamePattern,  setISiteNamePattern]  = useState("")
  const [iPortRangeId,      setIPortRangeId]      = useState<string>("")

  const [portRanges,        setPortRanges]        = useState<PortRangeDto[]>([])
  const [portRangesLoading, setPortRangesLoading] = useState(false)

  const [saving, setSaving] = useState(false)

  /* ── Sheet açıldığında formu yükle ── */
  useEffect(() => {
    if (!open) return

    if (editing) {
      setType(editing.type)
      setName(editing.name)
      setCategory(editing.category)
      setDisplayOrder(String(editing.displayOrder))
      setIsActive(editing.isActive)

      if (editing.type === "pusula-program" && editing.config && "paramFileName" in editing.config) {
        setPSourceFolderPath(editing.config.sourceFolderPath ?? "")
        setPParamFileName(editing.config.paramFileName ?? "")
        setPProgramCode(editing.config.programCode ?? "")
        setPExeName(editing.config.exeName ?? "")
      } else if (editing.type === "iis-site" && editing.config && "portRangeId" in editing.config) {
        setISourceFolderPath(editing.config.sourceFolderPath ?? "")
        setIConfigFileName(editing.config.configFileName ?? "")
        setISiteNamePattern(editing.config.siteNamePattern ?? "")
        setIPortRangeId(String(editing.config.portRangeId ?? ""))
      }
    } else {
      setType("pusula-program")
      setName("")
      setCategory("Pusula Programları")
      setDisplayOrder("0")
      setIsActive(true)
      setPSourceFolderPath("")
      setPParamFileName("")
      setPProgramCode("")
      setPExeName("")
      setISourceFolderPath("")
      setIConfigFileName("")
      setISiteNamePattern("")
      setIPortRangeId("")
    }
  }, [open, editing])

  /* ── Port aralıklarını çek (iis-site seçilince) ── */
  useEffect(() => {
    if (!open || type !== "iis-site") return
    setPortRangesLoading(true)
    fetch("/api/port-ranges?onlyActive=true")
      .then((r) => r.json())
      .then((data) => setPortRanges(Array.isArray(data) ? data : []))
      .catch(() => setPortRanges([]))
      .finally(() => setPortRangesLoading(false))
  }, [open, type])

  /* ── Type değişince default category set et (yeni ekleme modunda) ── */
  const handleTypeChange = (newType: ServiceType) => {
    setType(newType)
    if (!isEdit) {
      const def = TYPE_OPTIONS.find((t) => t.value === newType)
      if (def) setCategory(def.defaultCategory)
    }
  }

  const handleClose = () => {
    if (saving) return
    onOpenChange(false)
  }

  /* ── Validation ── */
  const canSave = (() => {
    if (saving) return false
    if (!name.trim() || !category.trim()) return false
    if (type === "pusula-program") {
      return !!pSourceFolderPath.trim()
    }
    if (type === "iis-site") {
      return !!iSourceFolderPath.trim() && !!iPortRangeId
    }
    return false
  })()

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const config = type === "pusula-program"
        ? {
            sourceFolderPath: pSourceFolderPath.trim(),
            paramFileName:    pParamFileName.trim() || null,
            programCode:      pProgramCode.trim() || null,
            exeName:          pExeName.trim() || null,
          }
        : {
            sourceFolderPath: iSourceFolderPath.trim(),
            configFileName:   iConfigFileName.trim() || null,
            siteNamePattern:  iSiteNamePattern.trim() || null,
            portRangeId:      Number(iPortRangeId),
          }

      const payload = {
        name:         name.trim(),
        category:     category.trim(),
        type,
        config,
        displayOrder: Number(displayOrder) || 0,
        isActive,
      }

      const url    = isEdit ? `/api/services/${editing!.id}` : "/api/services"
      const method = isEdit ? "PATCH" : "POST"
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error ?? "Kaydedilemedi")

      toast.success(isEdit ? "Hizmet güncellendi" : "Hizmet eklendi")
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
            {isEdit ? "Hizmeti Düzenle" : "Yeni Hizmet Ekle"}
          </SheetTitle>
          <SheetDescription className="text-[11px] text-muted-foreground">
            Önce hizmetin tipini seçin — alanlar tipe göre değişir.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-4 space-y-3">

            {/* ── Tip Seçimi ── */}
            <Section title="Hizmet Tipi">
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map((t) => {
                  const active = type === t.value
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => handleTypeChange(t.value)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2.5 rounded-[5px] border transition-colors text-[11px] font-medium",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/60 hover:border-foreground/40 hover:bg-muted/30",
                      )}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  )
                })}
              </div>
              {type === "iis-site" && (
                <p className="text-[10px] text-muted-foreground">
                  IIS rolündeki sunucuda klasör kopyalanır, config güncellenir, IIS sitesi oluşturulur ve port havuzundan port atanır.
                </p>
              )}
              {type === "pusula-program" && (
                <p className="text-[10px] text-muted-foreground">
                  RDP rolündeki sunucuda klasör kopyalanır, varsa parametre dosyasına firma kodu yazılır.
                </p>
              )}
            </Section>

            {/* ── Temel Bilgiler ── */}
            <Section title="Temel Bilgiler">
              <Field label="Hizmet Adı">
                <Input
                  placeholder={type === "iis-site" ? "Pusula RFID" : "Toptan Satış"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-[5px] text-[11px] h-8"
                />
              </Field>

              <Field label="Kategori">
                {type === "iis-site" ? (
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="rounded-[5px] text-[11px] h-8 w-full">
                      <SelectValue placeholder="Kategori seçin…" />
                    </SelectTrigger>
                    <SelectContent className="rounded-[5px]">
                      {IIS_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c} className="text-[11px]">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="rounded-[5px] text-[11px] h-8"
                    placeholder="Pusula Programları"
                  />
                )}
              </Field>

              <Field label="Sıralama" hint="Düşük sayı önce gelir.">
                <Input
                  type="number"
                  placeholder="0"
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(e.target.value)}
                  className="rounded-[5px] text-[11px] h-8 tabular-nums"
                />
              </Field>
            </Section>

            {/* ── Type-specific: pusula-program ── */}
            {type === "pusula-program" && (
              <>
                <Section title="Kaynak Klasör">
                  <Field label="Kaynak Klasör Yolu" hint="RDP sunucusundaki gerçek klasör. Sihirbaz bunu firmaya kopyalar.">
                    <div className="relative">
                      <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="C:\Pusula\Toptan"
                        value={pSourceFolderPath}
                        onChange={(e) => setPSourceFolderPath(e.target.value)}
                        className="rounded-[5px] text-[11px] h-8 pl-7 font-mono"
                      />
                    </div>
                  </Field>
                </Section>

                <Section title="Parametre Dosyası">
                  <Field label="Parametre TXT Adı (opsiyonel)" hint="Dolu ise içine [DATA KODU] {firmaId} yazılır. Boş bırakılırsa atlanır.">
                    <div className="relative">
                      <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="TptParametre.txt"
                        value={pParamFileName}
                        onChange={(e) => setPParamFileName(e.target.value)}
                        className="rounded-[5px] text-[11px] h-8 pl-7 font-mono"
                      />
                    </div>
                  </Field>

                  <Field label="Program Kodu (opsiyonel)" hint="Eski uygulamada kullanılan kısa kod.">
                    <Input
                      placeholder="TPT"
                      value={pProgramCode}
                      onChange={(e) => setPProgramCode(e.target.value)}
                      className="rounded-[5px] text-[11px] h-8 font-mono uppercase"
                    />
                  </Field>
                </Section>

                <Section title="Masaüstü Kısayolu">
                  <Field
                    label="EXE Dosya Adı (opsiyonel)"
                    hint="Firma kurulumunda masaüstü MUSTERILER klasörüne bu exe için kısayol oluşturulur. Boş bırakılırsa kısayol atlanır."
                  >
                    <div className="relative">
                      <MonitorDot className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="pusulax.exe"
                        value={pExeName}
                        onChange={(e) => setPExeName(e.target.value)}
                        className="rounded-[5px] text-[11px] h-8 pl-7 font-mono"
                      />
                    </div>
                  </Field>
                </Section>
              </>
            )}

            {/* ── Type-specific: iis-site ── */}
            {type === "iis-site" && (
              <>
                <Section title="Kaynak / Hedef">
                  <Field label="Kaynak Klasör Yolu" hint="IIS sunucusundaki kaynak klasör (Pusula tarafında).">
                    <div className="relative">
                      <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="C:\Pusula\RFID"
                        value={iSourceFolderPath}
                        onChange={(e) => setISourceFolderPath(e.target.value)}
                        className="rounded-[5px] text-[11px] h-8 pl-7 font-mono"
                      />
                    </div>
                  </Field>

                  <p className="text-[10px] text-muted-foreground">
                    Hedef yol sabittir: <span className="font-mono">C:\Pusula\Service\&lt;hizmet&gt;_&lt;firmaKod&gt;</span>
                  </p>
                </Section>

                <Section title="Config & Site">
                  <Field label="Config Dosya Adı (opsiyonel)" hint="Hedefte port placeholder'ı bu dosyada güncellenir.">
                    <div className="relative">
                      <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="appsettings.json"
                        value={iConfigFileName}
                        onChange={(e) => setIConfigFileName(e.target.value)}
                        className="rounded-[5px] text-[11px] h-8 pl-7 font-mono"
                      />
                    </div>
                  </Field>

                  <Field label="IIS Site Adı Pattern" hint="{firmaKod} placeholder kullanabilirsiniz.">
                    <Input
                      placeholder={"RFID_{firmaKod}"}
                      value={iSiteNamePattern}
                      onChange={(e) => setISiteNamePattern(e.target.value)}
                      className="rounded-[5px] text-[11px] h-8 font-mono"
                    />
                  </Field>
                </Section>

                <Section title="Port Havuzu">
                  <Field label="Port Aralığı" hint="Sihirbaz çalıştığında bu havuzdan sıradaki boş port atanır.">
                    <Select value={iPortRangeId} onValueChange={setIPortRangeId}>
                      <SelectTrigger className="rounded-[5px] text-[11px] h-8 w-full">
                        <SelectValue placeholder={portRangesLoading ? "Yükleniyor…" : "Port aralığı seçin…"} />
                      </SelectTrigger>
                      <SelectContent className="rounded-[5px]">
                        {portRanges.length === 0 && !portRangesLoading && (
                          <div className="px-2 py-3 text-[11px] text-muted-foreground text-center">
                            Tanımlı aralık yok. Önce /ports sayfasından ekleyin.
                          </div>
                        )}
                        {portRanges.map((r) => {
                          const free = r.totalPorts - r.usedCount
                          return (
                            <SelectItem key={r.id} value={String(r.id)} className="text-[11px]">
                              <div className="flex items-center gap-2 w-full">
                                <Waypoints className="size-3 text-muted-foreground shrink-0" />
                                <span className="font-medium">{r.name}</span>
                                <span className="text-muted-foreground font-mono ml-2">{r.portStart}–{r.portEnd}</span>
                                <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">{free} boş</span>
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </Field>
                </Section>
              </>
            )}

            {/* ── Durum ── */}
            <Section title="Durum">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium">Aktif</p>
                  <p className="text-[10px] text-muted-foreground">
                    Pasif hizmetler firma kurulum sihirbazında görünmez.
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
              {isEdit ? "Kaydet" : "Hizmet Ekle"}
            </button>
          </div>
        </SheetFooter>

      </SheetContent>
    </Sheet>
  )
}
