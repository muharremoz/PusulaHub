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
import { Textarea } from "@/components/ui/textarea"
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
import { Waypoints, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { PortRangeDto, PortProtocol } from "@/app/api/port-ranges/route"

const PROTOCOLS: { value: PortProtocol; label: string }[] = [
  { value: "TCP",     label: "TCP" },
  { value: "UDP",     label: "UDP" },
  { value: "TCP/UDP", label: "TCP/UDP" },
]

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

interface PortRangeSheetProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
  /** null → create modu, dolu → edit modu */
  editing?:     PortRangeDto | null
  onSaved?:     () => void
}

export function PortRangeSheet({ open, onOpenChange, editing = null, onSaved }: PortRangeSheetProps) {
  const isEdit = !!editing

  const [name,        setName]        = useState("")
  const [portStart,   setPortStart]   = useState("")
  const [portEnd,     setPortEnd]     = useState("")
  const [protocol,    setProtocol]    = useState<PortProtocol>("TCP")
  const [description, setDescription] = useState("")
  const [isActive,    setIsActive]    = useState(true)
  const [saving,      setSaving]      = useState(false)

  // Sheet açıldığında / editing değiştiğinde formu yükle
  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setPortStart(String(editing.portStart))
      setPortEnd(String(editing.portEnd))
      setProtocol(editing.protocol)
      setDescription(editing.description ?? "")
      setIsActive(editing.isActive)
    } else {
      setName("")
      setPortStart("")
      setPortEnd("")
      setProtocol("TCP")
      setDescription("")
      setIsActive(true)
    }
  }, [open, editing])

  const handleClose = () => {
    if (saving) return
    onOpenChange(false)
  }

  /* Port aralığı önizleme ve doğrulama */
  const startNum = parseInt(portStart)
  const endNum   = parseInt(portEnd)
  const totalPorts = (portStart && portEnd && !isNaN(startNum) && !isNaN(endNum) && endNum >= startNum)
    ? endNum - startNum + 1
    : null
  const portRangeValid = totalPorts !== null && startNum >= 1 && endNum <= 65535

  const canSave = !!name.trim() && portRangeValid && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = {
        name:        name.trim(),
        portStart:   startNum,
        portEnd:     endNum,
        protocol,
        description: description.trim() || null,
        isActive,
      }
      const url    = isEdit ? `/api/port-ranges/${editing!.id}` : "/api/port-ranges"
      const method = isEdit ? "PATCH" : "POST"
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error ?? "Kaydedilemedi")

      toast.success(isEdit ? "Aralık güncellendi" : "Aralık eklendi")
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
          <div className="flex items-center gap-2">
            <Waypoints className="size-4 text-muted-foreground" />
            <SheetTitle className="text-sm font-semibold">
              {isEdit ? "Port Aralığını Düzenle" : "Yeni Port Aralığı Ekle"}
            </SheetTitle>
          </div>
          <SheetDescription className="text-[11px] text-muted-foreground">
            IIS sitesi gerektiren hizmetler bu havuzdan port alır. Sihirbaz, kurulum sırasında sıradaki boş portu atar.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-4 space-y-3">

            <Section title="Tanım">
              <Field label="Aralık Adı" hint="Hizmet eklerken bu isimle seçilecek.">
                <Input
                  placeholder="Örn: RFID Portları"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-[5px] text-[11px] h-8"
                />
              </Field>
            </Section>

            <Section title="Port Aralığı">
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Başlangıç Portu">
                  <Input
                    placeholder="8000"
                    value={portStart}
                    onChange={(e) => setPortStart(e.target.value.replace(/\D/g, ""))}
                    className="rounded-[5px] text-[11px] h-8 font-mono"
                    maxLength={5}
                  />
                </Field>
                <Field label="Bitiş Portu">
                  <Input
                    placeholder="8099"
                    value={portEnd}
                    onChange={(e) => setPortEnd(e.target.value.replace(/\D/g, ""))}
                    className="rounded-[5px] text-[11px] h-8 font-mono"
                    maxLength={5}
                  />
                </Field>
              </div>

              <Field label="Protokol">
                <Select value={protocol} onValueChange={(v) => setProtocol(v as PortProtocol)}>
                  <SelectTrigger className="rounded-[5px] text-[11px] h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-[5px]">
                    {PROTOCOLS.map((p) => (
                      <SelectItem key={p.value} value={p.value} className="text-[11px]">{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {/* Önizleme */}
              {portStart && portEnd && (
                <div className={cn(
                  "rounded-[5px] px-3 py-2 text-[11px] font-mono border",
                  portRangeValid
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-red-50 border-red-200 text-red-700"
                )}>
                  {portRangeValid
                    ? <>Aralık: <strong>{portStart} – {portEnd}</strong> · <strong>{totalPorts}</strong> port · {protocol}</>
                    : endNum < startNum
                      ? "Bitiş portu başlangıç portundan küçük olamaz"
                      : "Geçerli port aralığı: 1 – 65535"
                  }
                </div>
              )}
            </Section>

            <Section title="Açıklama">
              <Field label="Açıklama (opsiyonel)">
                <Textarea
                  placeholder="Bu aralığın kullanım amacını belirtin…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-[5px] text-[11px] resize-none min-h-[72px]"
                />
              </Field>
            </Section>

            <Section title="Durum">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium">Aktif</p>
                  <p className="text-[10px] text-muted-foreground">
                    Pasif aralıklardan port atanmaz.
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
              {isEdit ? "Kaydet" : "Aralık Ekle"}
            </button>
          </div>
        </SheetFooter>

      </SheetContent>
    </Sheet>
  )
}
