"use client"

import { useState, useEffect } from "react"
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
import { Eye, EyeOff, Check, ChevronsUpDown, Copy, RefreshCw } from "lucide-react"
import { toast } from "sonner"

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
  { value: "RDP",     label: "RDP" },
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
  onSaved?: () => void
  editServerId?: string | null
}

export function ServerSheet({ open, onOpenChange, onSaved, editServerId }: ServerSheetProps) {
  const isEdit = !!editServerId

  const [name, setName]           = useState("")
  const [ip, setIp]               = useState("")
  const [dns, setDns]             = useState("")
  const [domain, setDomain]       = useState("")
  const [os, setOs]               = useState("")
  const [role, setRole]           = useState("")
  const [roleOpen, setRoleOpen]   = useState(false)
  const [apiKey, setApiKey]       = useState("")
  const [agentPort, setAgentPort] = useState("5000")
  const [rdpPort, setRdpPort]     = useState("")
  const [username, setUsername]   = useState("")
  const [password, setPassword]   = useState("")
  const [showPw, setShowPw]       = useState(false)
  const [sqlUsername, setSqlUsername] = useState("")
  const [sqlPassword, setSqlPassword] = useState("")
  const [showSqlPw, setShowSqlPw]     = useState(false)
  const [saving, setSaving]       = useState(false)

  // Düzenleme modunda mevcut veriyi yükle
  useEffect(() => {
    if (!open) return
    if (!editServerId) { handleReset(); return }
    fetch(`/api/servers/${editServerId}`)
      .then((r) => r.json())
      .then((data) => {
        setName(data.name ?? "")
        setIp(data.ip ?? "")
        setDns(data.dns ?? "")
        setDomain(data.domain ?? "")
        setOs(data.os ?? "")
        setRole(data.roles?.[0] ?? "")
        setApiKey(data.apiKey ?? "")
        setAgentPort(String(data.agentPort ?? 5000))
        setRdpPort(data.rdpPort != null ? String(data.rdpPort) : "")
        setUsername(data.username ?? "")
        setPassword(data.password ?? "")
        setSqlUsername(data.sqlUsername ?? "")
        setSqlPassword(data.sqlPassword ?? "")
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editServerId])

  const selectedRole = ROLES.find((r) => r.value === role)

  const handleReset = () => {
    setName(""); setIp(""); setDns(""); setDomain(""); setOs(""); setRole("")
    setApiKey(""); setAgentPort("5000"); setRdpPort("")
    setUsername(""); setPassword(""); setShowPw(false)
    setSqlUsername(""); setSqlPassword(""); setShowSqlPw(false)
  }

  const handleClose = () => {
    handleReset()
    onOpenChange(false)
  }

  const isSqlRole = role === "SQL"
  const canSave =
    name.trim() && ip.trim() && os && role && apiKey.trim() &&
    (!isSqlRole || (sqlUsername.trim() && sqlPassword))

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const payload = {
        name:        name.trim(),
        ip:          ip.trim(),
        dns:         dns.trim() || null,
        domain:      domain.trim() || null,
        os,
        roles:       [role],
        apiKey:      apiKey.trim(),
        agentPort:   parseInt(agentPort) || 5000,
        rdpPort:     (role === "RDP" || role === "AD") && rdpPort.trim() ? parseInt(rdpPort) || null : null,
        username:    username.trim() || null,
        password:    password || null,
        sqlUsername: isSqlRole ? (sqlUsername.trim() || null) : null,
        sqlPassword: isSqlRole ? (sqlPassword || null) : null,
      }

      const res = await fetch(
        isEdit ? `/api/servers/${editServerId}` : "/api/servers",
        {
          method:  isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(isEdit ? "Güncellenemedi" : "Sunucu eklenemedi", { description: err.error ?? "Bir hata oluştu" })
        return
      }
      toast.success(isEdit ? "Sunucu güncellendi" : "Sunucu eklendi", { description: name.trim() })
      handleClose()
      onSaved?.()
    } catch {
      toast.error("Bağlantı hatası")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="!w-[520px] !max-w-[520px] p-0 flex flex-col gap-0">

        {/* Başlık */}
        <SheetHeader className="px-5 py-4 border-b border-border/50 shrink-0">
          <SheetTitle className="text-sm font-semibold">{isEdit ? "Sunucuyu Düzenle" : "Yeni Sunucu Ekle"}</SheetTitle>
          <SheetDescription className="text-[11px] text-muted-foreground">
            {isEdit ? "Sunucu bilgilerini güncelleyin." : "Sunucu bilgilerini ve agent bağlantı ayarlarını girin."}
          </SheetDescription>
        </SheetHeader>

        {/* İçerik */}
        <ScrollArea className="flex-1 min-h-0">
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

              <Field label="Domain Adresi">
                <Input
                  placeholder="sirket.local"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="rounded-[5px] text-[11px] h-8 font-mono"
                />
              </Field>

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

            {/* ── RDP Port (AD/RDP rolündeki sunucular için) ── */}
            {(role === "RDP" || role === "AD") && (
              <Section title="RDP Bilgileri">
                <Field label="RDP Port">
                  <Input
                    placeholder="3389"
                    value={rdpPort}
                    onChange={(e) => setRdpPort(e.target.value)}
                    className="rounded-[5px] text-[11px] h-8 font-mono w-28"
                  />
                </Field>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  Müşteri bilgilendirme mesajında <span className="font-mono">dns:port</span> olarak gösterilir.
                </p>
              </Section>
            )}

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
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
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
                  <button
                    type="button"
                    onClick={() => {
                      if (!password) return
                      navigator.clipboard.writeText(password)
                      toast.success("Şifre kopyalandı")
                    }}
                    title="Kopyala"
                    className="flex items-center justify-center h-8 w-8 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <Copy className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*"
                      const pw = Array.from(crypto.getRandomValues(new Uint8Array(16)))
                        .map((b) => chars[b % chars.length])
                        .join("")
                      setPassword(pw)
                      setShowPw(true)
                    }}
                    title="Şifre üret"
                    className="flex items-center justify-center h-8 w-8 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <RefreshCw className="size-3.5" />
                  </button>
                </div>
              </Field>
            </Section>

            {/* ── SQL Bilgileri (sadece SQL rolü seçilince) ── */}
            {isSqlRole && (
              <Section title="SQL Bilgileri">
                <p className="text-[10px] text-muted-foreground -mt-1">
                  SQL sunucusuna (veritabanı listesi, boyut vb.) bağlanırken kullanılacak SA kullanıcısı.
                </p>
                <Field label="SA Kullanıcı Adı">
                  <Input
                    placeholder="sa"
                    value={sqlUsername}
                    onChange={(e) => setSqlUsername(e.target.value)}
                    className="rounded-[5px] text-[11px] h-8 font-mono"
                  />
                </Field>
                <Field label="SA Şifresi">
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <Input
                        type={showSqlPw ? "text" : "password"}
                        placeholder="••••••••"
                        value={sqlPassword}
                        onChange={(e) => setSqlPassword(e.target.value)}
                        className="rounded-[5px] text-[11px] h-8 pr-9 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSqlPw((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showSqlPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!sqlPassword) return
                        navigator.clipboard.writeText(sqlPassword)
                        toast.success("Şifre kopyalandı")
                      }}
                      title="Kopyala"
                      className="flex items-center justify-center h-8 w-8 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                </Field>
              </Section>
            )}

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
              onClick={handleSave}
              disabled={!canSave || saving}
              className="flex-1 text-[11px] font-semibold py-2 rounded-[5px] bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              {saving ? (isEdit ? "Kaydediliyor..." : "Ekleniyor...") : (isEdit ? "Kaydet" : "Sunucu Ekle")}
            </button>
          </div>
        </SheetFooter>

      </SheetContent>
    </Sheet>
  )
}
