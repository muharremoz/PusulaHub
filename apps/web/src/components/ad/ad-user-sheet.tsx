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
import { Switch } from "@/components/ui/switch"
import { companies } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import {
  Eye, EyeOff, Copy, Check,
  ChevronsUpDown, Sparkles, Users,
} from "lucide-react"

/* ── OU listesi ── */
const OU_OPTIONS = [
  { value: "IT",        label: "IT" },
  { value: "Muhasebe",  label: "Muhasebe" },
  { value: "IK",        label: "İK" },
  { value: "Satis",     label: "Satış" },
  { value: "Pazarlama", label: "Pazarlama" },
  { value: "Yonetim",   label: "Yönetim" },
]

const DOMAIN = "sirket.local"

/* ── Şifre skoru ── */
function passScore(p: string): number {
  return (
    (p.length >= 8          ? 1 : 0) +
    (/[A-Z]/.test(p)        ? 1 : 0) +
    (/[0-9]/.test(p)        ? 1 : 0) +
    (/[^a-zA-Z0-9]/.test(p) ? 1 : 0)
  )
}
const SCORE_LABEL = ["Çok zayıf", "Zayıf", "Orta", "İyi", "Güçlü"]
const SCORE_COLOR = [
  "bg-red-400", "bg-red-400", "bg-amber-400", "bg-yellow-400", "bg-emerald-500",
]

/* ── Güçlü şifre üreteci ── */
const LOWER   = "abcdefghijkmnpqrstuvwxyz"
const UPPER   = "ABCDEFGHJKLMNPQRSTUVWXYZ"
const DIGITS  = "23456789"
const SPECIAL = "!@#$%&*"
const ALL     = LOWER + UPPER + DIGITS + SPECIAL

function generateStrongPassword(len = 16): string {
  // En az 1 büyük, 1 rakam, 1 özel karakter garantisi
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SPECIAL)]
  const rest = Array.from({ length: len - required.length }, () => pick(ALL))
  return [...required, ...rest]
    .sort(() => Math.random() - 0.5)
    .join("")
}

/* ── Kullanıcı adı üret ── */
function toUsername(displayName: string): string {
  const parts = displayName.trim().toLowerCase().split(/\s+/)
  if (parts.length < 2) return parts[0] ?? ""
  return `${parts[0]}.${parts.slice(1).join(".")}`.replace(/[^a-z0-9.]/g, "")
}

/* ── Bölüm kartı ── */
function Section({ title, children, action }: {
  title: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div className="rounded-[5px] border border-border/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
        <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">{title}</p>
        {action}
      </div>
      <div className="p-3 space-y-3">{children}</div>
    </div>
  )
}

/* ── Alan ── */
function Field({ label, children, className }: {
  label: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11px] font-medium text-foreground">{label}</Label>
      {children}
    </div>
  )
}

/* ══════════════════════════════════════════════ */

interface ADUserSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ADUserSheet({ open, onOpenChange }: ADUserSheetProps) {
  const [displayName,     setDisplayName]     = useState("")
  const [username,        setUsername]        = useState("")
  const [email,           setEmail]           = useState("")
  const [ou,              setOu]              = useState("")
  const [companyId,       setCompanyId]       = useState("")
  const [companyOpen,     setCompanyOpen]     = useState(false)
  const [password,        setPassword]        = useState("")
  const [confirm,         setConfirm]         = useState("")
  const [showPass,        setShowPass]        = useState(false)
  const [showConf,        setShowConf]        = useState(false)
  const [mustChange,      setMustChange]      = useState(true)
  const [enabled,         setEnabled]         = useState(true)
  const [copied,          setCopied]          = useState(false)
  const [usernameManual,  setUsernameManual]  = useState(false)

  const selectedCompany = companies.find((c) => c.id === companyId) ?? null

  /* displayName → kullanıcı adı + e-posta otomatik */
  useEffect(() => {
    if (!usernameManual) {
      const uname = toUsername(displayName)
      setUsername(uname)
      setEmail(uname ? `${uname}@${DOMAIN}` : "")
    }
  }, [displayName, usernameManual])

  /* kullanıcı adı değişince e-posta güncelle */
  useEffect(() => {
    if (usernameManual && username) setEmail(`${username}@${DOMAIN}`)
  }, [username, usernameManual])

  const handleReset = () => {
    setDisplayName(""); setUsername(""); setEmail(""); setOu("")
    setCompanyId(""); setPassword(""); setConfirm("")
    setShowPass(false); setShowConf(false)
    setMustChange(true); setEnabled(true); setCopied(false)
    setUsernameManual(false)
  }

  const handleClose = () => { handleReset(); onOpenChange(false) }

  const handleSuggestPassword = () => {
    const p = generateStrongPassword()
    setPassword(p); setConfirm(p); setShowPass(true)
  }

  const handleCopy = () => {
    if (!password) return
    navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const score     = passScore(password)
  const passMatch = password === confirm
  const canSave   = displayName.trim() && username.trim() && ou && companyId && password && passMatch && score >= 2

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="!w-[520px] !max-w-[520px] p-0 flex flex-col gap-0">

        {/* Başlık */}
        <SheetHeader className="px-5 py-4 border-b border-border/50 shrink-0">
          <SheetTitle className="text-sm font-semibold">Yeni Kullanıcı Ekle</SheetTitle>
          <SheetDescription className="text-[11px] text-muted-foreground">
            Active Directory kullanıcı bilgilerini girin.
          </SheetDescription>
        </SheetHeader>

        {/* İçerik */}
        <ScrollArea className="flex-1">
          <div className="px-4 py-4 space-y-3">

            {/* ── Firma ── */}
            <Section title="Firma">
              <Field label="Firma Seçimi">
                <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      role="combobox"
                      aria-expanded={companyOpen}
                      className={cn(
                        "w-full flex items-center justify-between h-8 px-3 rounded-[5px] border border-input bg-transparent text-[11px] transition-[color,box-shadow] outline-none",
                        "hover:border-ring/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        !selectedCompany && "text-muted-foreground"
                      )}
                    >
                      {selectedCompany ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{selectedCompany.name}</span>
                          {/* Kullanıcı sayısı badge */}
                          <span className="flex items-center gap-0.5 text-[9px] font-medium bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-[4px] shrink-0">
                            <Users className="size-2.5" />
                            {selectedCompany.userCount} kullanıcı
                          </span>
                        </div>
                      ) : "Firma seçiniz…"}
                      <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0 ml-2" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 rounded-[5px]" align="start">
                    <Command>
                      <CommandInput placeholder="Firma ara…" className="text-[11px] h-8" />
                      <CommandList>
                        <CommandEmpty className="text-[11px] text-muted-foreground py-3 text-center">
                          Bulunamadı.
                        </CommandEmpty>
                        <CommandGroup>
                          {companies.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.name}
                              onSelect={() => {
                                setCompanyId(c.id === companyId ? "" : c.id)
                                setCompanyOpen(false)
                              }}
                              className="text-[11px]"
                            >
                              <Check className={cn(
                                "size-3.5 mr-2 shrink-0",
                                companyId === c.id ? "opacity-100" : "opacity-0"
                              )} />
                              <div className="flex items-center justify-between w-full gap-2 min-w-0">
                                <div className="min-w-0">
                                  <span className="truncate font-medium">{c.name}</span>
                                  <span className="text-[10px] text-muted-foreground ml-1.5">{c.sector}</span>
                                </div>
                                <span className="flex items-center gap-0.5 text-[9px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded-[4px] shrink-0">
                                  <Users className="size-2.5" />
                                  {c.userCount}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {/* Seçili firma bilgi satırı */}
                {selectedCompany && (
                  <div className="flex items-center gap-3 mt-1.5 px-2 py-1.5 rounded-[5px] bg-muted/30 border border-border/40">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="font-medium text-foreground">{selectedCompany.sector}</span>
                    </div>
                    <div className="h-3 w-px bg-border" />
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Users className="size-3" />
                      <span><span className="font-medium text-foreground">{selectedCompany.userCount}</span> mevcut kullanıcı</span>
                    </div>
                    <div className="h-3 w-px bg-border" />
                    <span className={cn(
                      "text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border",
                      selectedCompany.status === "active"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    )}>
                      {selectedCompany.status === "active" ? "Aktif" : "Deneme"}
                    </span>
                  </div>
                )}
              </Field>
            </Section>

            {/* ── Kimlik Bilgileri ── */}
            <Section title="Kimlik Bilgileri">
              <Field label="Ad Soyad">
                <Input
                  placeholder="Ahmet Yılmaz"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="rounded-[5px] text-[11px] h-8"
                />
              </Field>

              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Kullanıcı Adı">
                  <div className="relative">
                    <Input
                      placeholder="ahmet.yilmaz"
                      value={username}
                      onChange={(e) => { setUsernameManual(true); setUsername(e.target.value) }}
                      className="rounded-[5px] text-[11px] h-8 font-mono pr-[72px]"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/50 select-none pointer-events-none">
                      @{DOMAIN}
                    </span>
                  </div>
                </Field>

                <Field label="Organizasyon Birimi">
                  <Select value={ou} onValueChange={setOu}>
                    <SelectTrigger className="rounded-[5px] text-[11px] h-8 w-full">
                      <SelectValue placeholder="Seçiniz…" />
                    </SelectTrigger>
                    <SelectContent className="rounded-[5px]">
                      {OU_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-[11px]">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="E-posta">
                <Input
                  placeholder={`kullanici@${DOMAIN}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-[5px] text-[11px] h-8"
                />
              </Field>
            </Section>

            {/* ── Şifre ── */}
            <Section title="Şifre">
              <Field label="Şifre">
                {/* Güçlü şifre öner butonu */}
                <button
                  type="button"
                  onClick={handleSuggestPassword}
                  className="w-full flex items-center gap-2 px-3 py-2 mb-1 rounded-[5px] border border-dashed border-border/70 hover:border-ring/50 hover:bg-muted/20 transition-colors text-left group"
                >
                  <Sparkles className="size-3.5 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-foreground group-hover:text-foreground">Güçlü Şifre Öner</p>
                    <p className="text-[10px] text-muted-foreground">16 karakter, büyük/küçük harf, rakam ve özel karakter</p>
                  </div>
                </button>

                <div className="relative">
                  <Input
                    type={showPass ? "text" : "password"}
                    placeholder="En az 8 karakter"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(
                      "rounded-[5px] text-[11px] h-8 pr-16 font-mono",
                      password && score < 2 && "border-destructive focus-visible:ring-destructive/30"
                    )}
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    {password && (
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="h-6 w-6 flex items-center justify-center rounded-[4px] hover:bg-muted/60 transition-colors"
                      >
                        {copied
                          ? <Check className="size-3 text-emerald-600" />
                          : <Copy className="size-3 text-muted-foreground" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="h-6 w-6 flex items-center justify-center rounded-[4px] hover:bg-muted/60 transition-colors"
                    >
                      {showPass
                        ? <EyeOff className="size-3 text-muted-foreground" />
                        : <Eye    className="size-3 text-muted-foreground" />}
                    </button>
                  </div>
                </div>

                {/* Güç göstergesi */}
                {password && (
                  <div className="flex items-center gap-1 mt-1">
                    {[...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1 flex-1 rounded-full transition-colors",
                          i < score ? SCORE_COLOR[score] : "bg-muted"
                        )}
                      />
                    ))}
                    <span className="text-[9px] text-muted-foreground ml-1 shrink-0">{SCORE_LABEL[score]}</span>
                  </div>
                )}
              </Field>

              <Field label="Şifre Tekrar">
                <div className="relative">
                  <Input
                    type={showConf ? "text" : "password"}
                    placeholder="Şifreyi tekrar girin"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={cn(
                      "rounded-[5px] text-[11px] h-8 pr-9 font-mono",
                      confirm && !passMatch && "border-destructive focus-visible:ring-destructive/30"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConf((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-[4px] hover:bg-muted/60 transition-colors"
                  >
                    {showConf
                      ? <EyeOff className="size-3 text-muted-foreground" />
                      : <Eye    className="size-3 text-muted-foreground" />}
                  </button>
                </div>
                {confirm && !passMatch && (
                  <p className="text-[10px] text-destructive">Şifreler eşleşmiyor.</p>
                )}
              </Field>
            </Section>

            {/* ── Hesap Ayarları ── */}
            <Section title="Hesap Ayarları">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium">İlk Girişte Şifre Değiştir</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Kullanıcı ilk girişte yeni şifre belirler.</p>
                </div>
                <Switch checked={mustChange} onCheckedChange={setMustChange} />
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/40">
                <div>
                  <p className="text-[11px] font-medium">Hesap Aktif</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Kapalıysa kullanıcı giriş yapamaz.</p>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
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
              Kullanıcı Oluştur
            </button>
          </div>
        </SheetFooter>

      </SheetContent>
    </Sheet>
  )
}
