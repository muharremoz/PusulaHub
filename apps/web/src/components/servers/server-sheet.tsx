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
import { Eye, EyeOff, Check, ChevronsUpDown } from "lucide-react"

const OS_OPTIONS = [
  "Windows Server 2022",
  "Windows Server 2019",
  "Ubuntu 24.04",
  "Ubuntu 22.04",
]

const ROLES = [
  { value: "AD",      label: "Active Directory" },
  { value: "DNS",     label: "DNS" },
  { value: "DHCP",    label: "DHCP" },
  { value: "SQL",     label: "SQL Server" },
  { value: "IIS",     label: "IIS" },
  { value: "File",    label: "File Server" },
  { value: "General", label: "General" },
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

interface ServerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ServerSheet({ open, onOpenChange }: ServerSheetProps) {
  const [name, setName]           = useState("")
  const [ip, setIp]               = useState("")
  const [dns, setDns]             = useState("")
  const [os, setOs]               = useState("")
  const [role, setRole]           = useState("")
  const [roleOpen, setRoleOpen]   = useState(false)
  const [apiKey, setApiKey]       = useState("")
  const [agentPort, setAgentPort] = useState("5000")
  const [username, setUsername]   = useState("")
  const [password, setPassword]   = useState("")
  const [showPw, setShowPw]       = useState(false)

  const selectedRole = ROLES.find((r) => r.value === role)

  const handleReset = () => {
    setName(""); setIp(""); setDns(""); setOs(""); setRole("")
    setApiKey(""); setAgentPort("5000")
    setUsername(""); setPassword(""); setShowPw(false)
  }

  const handleClose = () => {
    handleReset()
    onOpenChange(false)
  }

  const canSave = name.trim() && ip.trim() && os && role && apiKey.trim()

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="!w-[520px] !max-w-[520px] p-0 flex flex-col gap-0">

        {/* Başlık */}
        <SheetHeader className="px-5 py-4 border-b border-border/50 shrink-0">
          <SheetTitle className="text-sm font-semibold">Yeni Sunucu Ekle</SheetTitle>
          <SheetDescription className="text-[11px] text-muted-foreground">
            Sunucu bilgilerini ve agent bağlantı ayarlarını girin.
          </SheetDescription>
        </SheetHeader>

        {/* İçerik */}
        <ScrollArea className="flex-1">
          <div className="px-4 py-4 space-y-3">

            {/* ── Temel Bilgiler ── */}
            <Section title="Temel Bilgiler">
              <Field label="Sunucu Adı">
                <Input
                  placeholder="DC-PRIMARY"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-[5px] text-[11px] h-8"
                />
              </Field>

              <div className="grid grid-cols-2 gap-2.5">
                <Field label="IP Adresi">
                  <Input
                    placeholder="192.168.1.10"
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    className="rounded-[5px] text-[11px] h-8 font-mono"
                  />
                </Field>
                <Field label="DNS Adresi">
                  <Input
                    placeholder="sunucu.sirket.local"
                    value={dns}
                    onChange={(e) => setDns(e.target.value)}
                    className="rounded-[5px] text-[11px] h-8 font-mono"
                  />
                </Field>
              </div>

              <Field label="İşletim Sistemi">
                <Select value={os} onValueChange={setOs}>
                  <SelectTrigger className="rounded-[5px] text-[11px] h-8 w-full">
                    <SelectValue placeholder="Seçiniz…" />
                  </SelectTrigger>
                  <SelectContent className="rounded-[5px]">
                    {OS_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt} className="text-[11px]">{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Rol">
                <Popover open={roleOpen} onOpenChange={setRoleOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      role="combobox"
                      aria-expanded={roleOpen}
                      className={cn(
                        "w-full flex items-center justify-between h-8 px-3 rounded-[5px] border border-input bg-transparent text-[11px] transition-[color,box-shadow] outline-none",
                        "hover:border-ring/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        !selectedRole && "text-muted-foreground"
                      )}
                    >
                      {selectedRole ? selectedRole.label : "Seçiniz…"}
                      <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 rounded-[5px]" align="start">
                    <Command>
                      <CommandInput placeholder="Rol ara…" className="text-[11px] h-8" />
                      <CommandList>
                        <CommandEmpty className="text-[11px] text-muted-foreground py-3 text-center">
                          Bulunamadı.
                        </CommandEmpty>
                        <CommandGroup>
                          {ROLES.map((r) => (
                            <CommandItem
                              key={r.value}
                              value={r.value}
                              onSelect={(val) => {
                                setRole(val === role ? "" : val)
                                setRoleOpen(false)
                              }}
                              className="text-[11px]"
                            >
                              <Check className={cn("size-3.5 mr-2 shrink-0", role === r.value ? "opacity-100" : "opacity-0")} />
                              {r.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </Field>
            </Section>

            {/* ── Agent Bilgileri ── */}
            <Section title="Agent Bilgileri">
              <Field label="API Key">
                <Input
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="rounded-[5px] text-[11px] h-8 font-mono"
                />
              </Field>
              <Field label="Port">
                <Input
                  placeholder="5000"
                  value={agentPort}
                  onChange={(e) => setAgentPort(e.target.value)}
                  className="rounded-[5px] text-[11px] h-8 font-mono w-28"
                />
              </Field>
            </Section>

            {/* ── Kullanıcı Bilgileri ── */}
            <Section title="Kullanıcı Bilgileri">
              <Field label="Kullanıcı Adı">
                <Input
                  placeholder="Administrator"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="rounded-[5px] text-[11px] h-8"
                />
              </Field>
              <Field label="Şifre">
                <div className="relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-[5px] text-[11px] h-8 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
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
              Sunucu Ekle
            </button>
          </div>
        </SheetFooter>

      </SheetContent>
    </Sheet>
  )
}
