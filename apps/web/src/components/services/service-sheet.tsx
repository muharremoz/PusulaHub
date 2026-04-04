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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { Check, ChevronsUpDown, FolderOpen } from "lucide-react"

const CATEGORIES = [
  { value: "Yazılım",     label: "Yazılım" },
  { value: "Entegrasyon", label: "Entegrasyon" },
  { value: "API",         label: "API" },
]

const STATUSES = [
  { value: "active",      label: "Aktif" },
  { value: "maintenance", label: "Bakımda" },
  { value: "inactive",    label: "Pasif" },
]

const TAGS = [
  { value: "ERP",        label: "ERP" },
  { value: "CRM",        label: "CRM" },
  { value: "İK",         label: "İK" },
  { value: "Bordro",     label: "Bordro" },
  { value: "Muhasebe",   label: "Muhasebe" },
  { value: "Stok",       label: "Stok" },
  { value: "Satış",      label: "Satış" },
  { value: "GİB",        label: "GİB" },
  { value: "E-Fatura",   label: "E-Fatura" },
  { value: "E-Arşiv",    label: "E-Arşiv" },
  { value: "Banka",      label: "Banka" },
  { value: "REST",       label: "REST" },
  { value: "Webhook",    label: "Webhook" },
  { value: "OAuth",      label: "OAuth" },
  { value: "Senkron",    label: "Senkron" },
  { value: "Depo",       label: "Depo" },
  { value: "Lojistik",   label: "Lojistik" },
]

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
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11px] font-medium text-foreground">{label}</Label>
      {children}
    </div>
  )
}

interface ServiceSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ServiceSheet({ open, onOpenChange }: ServiceSheetProps) {
  const [name, setName]           = useState("")
  const [description, setDesc]    = useState("")
  const [category, setCategory]   = useState("")
  const [status, setStatus]       = useState("active")
  const [folder, setFolder]       = useState("")
  const [tag, setTag]             = useState("")
  const [tagOpen, setTagOpen]     = useState(false)

  const selectedTag = TAGS.find((t) => t.value === tag)

  const handleReset = () => {
    setName(""); setDesc(""); setCategory(""); setStatus("active")
    setFolder(""); setTag("")
  }

  const handleClose = () => {
    handleReset()
    onOpenChange(false)
  }

  const canSave = name.trim() && category && description.trim()

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="!w-[520px] !max-w-[520px] p-0 flex flex-col gap-0">

        {/* Başlık */}
        <SheetHeader className="px-5 py-4 border-b border-border/50 shrink-0">
          <SheetTitle className="text-sm font-semibold">Yeni Hizmet Ekle</SheetTitle>
          <SheetDescription className="text-[11px] text-muted-foreground">
            Hizmet bilgilerini ve kategori ayarlarını girin.
          </SheetDescription>
        </SheetHeader>

        {/* İçerik */}
        <ScrollArea className="flex-1">
          <div className="px-4 py-4 space-y-3">

            {/* ── Temel Bilgiler ── */}
            <Section title="Temel Bilgiler">
              <Field label="Hizmet Adı">
                <Input
                  placeholder="PusulaERP"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-[5px] text-[11px] h-8"
                />
              </Field>

              <Field label="Açıklama">
                <Textarea
                  placeholder="Hizmet hakkında kısa açıklama..."
                  value={description}
                  onChange={(e) => setDesc(e.target.value)}
                  className="rounded-[5px] text-[11px] resize-none min-h-[72px]"
                />
              </Field>

              <Field label="Kategori">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="rounded-[5px] text-[11px] h-8 w-full">
                    <SelectValue placeholder="Seçiniz…" />
                  </SelectTrigger>
                  <SelectContent className="rounded-[5px]">
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value} className="text-[11px]">{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Hizmet Klasörü">
                <div className="relative">
                  <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="C:\Program Files\PusulaERP"
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                    className="rounded-[5px] text-[11px] h-8 pl-7 font-mono"
                  />
                </div>
              </Field>

              <Field label="Etiket">
                <Popover open={tagOpen} onOpenChange={setTagOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      role="combobox"
                      aria-expanded={tagOpen}
                      className={cn(
                        "w-full flex items-center justify-between h-8 px-3 rounded-[5px] border border-input bg-transparent text-[11px] transition-[color,box-shadow] outline-none",
                        "hover:border-ring/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        !selectedTag && "text-muted-foreground"
                      )}
                    >
                      {selectedTag ? selectedTag.label : "Seçiniz…"}
                      <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 rounded-[5px]" align="start">
                    <Command>
                      <CommandInput placeholder="Etiket ara…" className="text-[11px] h-8" />
                      <CommandList>
                        <CommandEmpty className="text-[11px] text-muted-foreground py-3 text-center">
                          Bulunamadı.
                        </CommandEmpty>
                        <CommandGroup>
                          {TAGS.map((t) => (
                            <CommandItem
                              key={t.value}
                              value={t.value}
                              onSelect={(val) => {
                                setTag(val === tag ? "" : val)
                                setTagOpen(false)
                              }}
                              className="text-[11px]"
                            >
                              <Check className={cn("size-3.5 mr-2 shrink-0", tag === t.value ? "opacity-100" : "opacity-0")} />
                              {t.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
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

        {/* Footer */}
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
              Hizmet Ekle
            </button>
          </div>
        </SheetFooter>

      </SheetContent>
    </Sheet>
  )
}
