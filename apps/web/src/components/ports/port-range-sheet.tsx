"use client"

import { useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Waypoints } from "lucide-react"
import { mockServices } from "@/lib/mock-services"

const PROTOCOLS = [
  { value: "TCP",     label: "TCP" },
  { value: "UDP",     label: "UDP" },
  { value: "TCP/UDP", label: "TCP/UDP" },
]

const STATUSES = [
  { value: "active",   label: "Aktif" },
  { value: "reserved", label: "Rezerve" },
  { value: "inactive", label: "Pasif" },
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

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11px] font-medium text-foreground">{label}</Label>
      {children}
    </div>
  )
}

interface PortRangeSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PortRangeSheet({ open, onOpenChange }: PortRangeSheetProps) {
  const [hizmet,      setHizmet]      = useState("")
  const [portStart,   setPortStart]   = useState("")
  const [portEnd,     setPortEnd]     = useState("")
  const [protocol,    setProtocol]    = useState("TCP")
  const [description, setDescription] = useState("")
  const [status,      setStatus]      = useState("active")

  const handleReset = () => {
    setHizmet(""); setPortStart(""); setPortEnd("")
    setProtocol("TCP"); setDescription(""); setStatus("active")
  }

  const handleClose = () => { handleReset(); onOpenChange(false) }

  /* Port aralığı önizleme ve doğrulama */
  const startNum = parseInt(portStart)
  const endNum   = parseInt(portEnd)
  const totalPorts = (portStart && portEnd && !isNaN(startNum) && !isNaN(endNum) && endNum >= startNum)
    ? endNum - startNum + 1
    : null
  const portRangeValid = totalPorts !== null && startNum >= 1 && endNum <= 65535

  const canSave = hizmet && portRangeValid && description.trim()

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="!w-[520px] !max-w-[520px] p-0 flex flex-col gap-0 overflow-hidden">

        <SheetHeader className="px-5 py-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <Waypoints className="size-4 text-muted-foreground" />
            <SheetTitle className="text-sm font-semibold">Yeni Port Aralığı Ekle</SheetTitle>
          </div>
          <SheetDescription className="text-[11px] text-muted-foreground">
            Hizmet için port aralığı tanımlayın ve takibe alın.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-4 space-y-3">

            {/* ── Hizmet ── */}
            <Section title="Hizmet">
              <Field label="Hizmet">
                <Select value={hizmet} onValueChange={setHizmet}>
                  <SelectTrigger className="rounded-[5px] text-[11px] h-8 w-full">
                    <SelectValue placeholder="Hizmet seçin…" />
                  </SelectTrigger>
                  <SelectContent className="rounded-[5px]">
                    {mockServices.map((s) => (
                      <SelectItem key={s.id} value={s.name} className="text-[11px]">
                        {s.name}
                        <span className="ml-2 text-muted-foreground text-[10px]">{s.category}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Section>

            {/* ── Port Aralığı ── */}
            <Section title="Port Aralığı">
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Başlangıç Portu">
                  <Input
                    placeholder="8080"
                    value={portStart}
                    onChange={(e) => setPortStart(e.target.value.replace(/\D/g, ""))}
                    className="rounded-[5px] text-[11px] h-8 font-mono"
                    maxLength={5}
                  />
                </Field>
                <Field label="Bitiş Portu">
                  <Input
                    placeholder="8089"
                    value={portEnd}
                    onChange={(e) => setPortEnd(e.target.value.replace(/\D/g, ""))}
                    className="rounded-[5px] text-[11px] h-8 font-mono"
                    maxLength={5}
                  />
                </Field>
              </div>

              <Field label="Protokol">
                <Select value={protocol} onValueChange={setProtocol}>
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

            {/* ── Açıklama ── */}
            <Section title="Açıklama">
              <Field label="Açıklama">
                <Textarea
                  placeholder="Bu port aralığının kullanım amacını belirtin…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-[5px] text-[11px] resize-none min-h-[72px]"
                />
              </Field>
            </Section>

            {/* ── Durum ── */}
            <Section title="Durum">
              <Field label="Başlangıç Durumu">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="rounded-[5px] text-[11px] h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-[5px]">
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-[11px]">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Section>

          </div>
        </ScrollArea>

        <SheetFooter className="px-4 py-3.5 border-t border-border/50 shrink-0">
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 text-[11px] font-medium py-2 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
            >
              İptal
            </button>
            <button
              type="button"
              disabled={!canSave}
              className="flex-1 text-[11px] font-semibold py-2 rounded-[5px] bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Aralık Ekle
            </button>
          </div>
        </SheetFooter>

      </SheetContent>
    </Sheet>
  )
}
