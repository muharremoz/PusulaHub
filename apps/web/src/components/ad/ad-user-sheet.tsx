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
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { Eye, EyeOff, RefreshCw, Copy, Check } from "lucide-react"

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

/* ── Şifre üreteci ── */
const CHARSET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*"
function generatePassword(len = 14): string {
  return Array.from({ length: len }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]).join("")
}

/* ── Kullanıcı adı üret ── */
function toUsername(displayName: string): string {
  const parts = displayName.trim().toLowerCase().split(/\s+/)
  if (parts.length < 2) return parts[0] ?? ""
  return `${parts[0]}.${parts.slice(1).join(".")}`
    .replace(/[^a-z0-9.]/g, "")
}

/* ── Bölüm kartı ── */
function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
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
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11px] font-medium text-foreground">{label}</Label>
      {children}
    </div>
  )
}

interface ADUserSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ADUserSheet({ open, onOpenChange }: ADUserSheetProps) {
  const [displayName, setDisplayName] = useState("")
  const [username,    setUsername]    = useState("")
  const [email,       setEmail]       = useState("")
  const [ou,          setOu]          = useState("")
  const [password,    setPassword]    = useState("")
  const [confirm,     setConfirm]     = useState("")
  const [showPass,    setShowPass]    = useState(false)
  const [showConf,    setShowConf]    = useState(false)
  const [mustChange,  setMustChange]  = useState(true)
  const [enabled,     setEnabled]     = useState(true)
  const [copied,      setCopied]      = useState(false)
  const [usernameManual, setUsernameManual] = useState(false)

  /* displayName değişince kullanıcı adı + e-posta otomatik */
  useEffect(() => {
    if (!usernameManual) {
      const uname = toUsername(displayName)
      setUsername(uname)
      setEmail(uname ? `${uname}@${DOMAIN}` : "")
    }
  }, [displayName, usernameManual])

  /* kullanıcı adı değişince e-posta güncelle */
  useEffect(() => {
    if (usernameManual && username) {
      setEmail(`${username}@${DOMAIN}`)
    }
  }, [username, usernameManual])

  const handleReset = () => {
    setDisplayName(""); setUsername(""); setEmail(""); setOu("")
    setPassword(""); setConfirm(""); setShowPass(false); setShowConf(false)
    setMustChange(true); setEnabled(true); setCopied(false)
    setUsernameManual(false)
  }

  const handleClose = () => { handleReset(); onOpenChange(false) }

  const handleGenPassword = () => {
    const p = generatePassword()
    setPassword(p)
    setConfirm(p)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const passMatch   = password === confirm
  const passStrong  = password.length >= 8
  const canSave     = displayName.trim() && username.trim() && ou && password && passMatch && passStrong

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
                      onChange={(e) => {
                        setUsernameManual(true)
                        setUsername(e.target.value)
                      }}
                      className="rounded-[5px] text-[11px] h-8 font-mono pr-16"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/60 select-none pointer-events-none">
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
            <Section
              title="Şifre"
              action={
                <button
                  type="button"
                  onClick={handleGenPassword}
                  className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className="size-3" />
                  Üret
                </button>
              }
            >
              <Field label="Şifre">
                <div className="relative">
                  <Input
                    type={showPass ? "text" : "password"}
                    placeholder="En az 8 karakter"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(
                      "rounded-[5px] text-[11px] h-8 pr-16 font-mono",
                      password && !passStrong && "border-destructive focus-visible:ring-destructive/30"
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
                  <div className="flex gap-1 mt-1">
                    {[...Array(4)].map((_, i) => {
                      const score =
                        (password.length >= 8 ? 1 : 0) +
                        (/[A-Z]/.test(password) ? 1 : 0) +
                        (/[0-9]/.test(password) ? 1 : 0) +
                        (/[^a-zA-Z0-9]/.test(password) ? 1 : 0)
                      const filled = i < score
                      const color  = score <= 1 ? "bg-red-400" : score === 2 ? "bg-amber-400" : score === 3 ? "bg-yellow-400" : "bg-emerald-500"
                      return (
                        <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", filled ? color : "bg-muted")} />
                      )
                    })}
                    <span className="text-[9px] text-muted-foreground ml-1 leading-tight">
                      {(() => {
                        const score =
                          (password.length >= 8 ? 1 : 0) +
                          (/[A-Z]/.test(password) ? 1 : 0) +
                          (/[0-9]/.test(password) ? 1 : 0) +
                          (/[^a-zA-Z0-9]/.test(password) ? 1 : 0)
                        return ["Çok zayıf", "Zayıf", "Orta", "İyi", "Güçlü"][score]
                      })()}
                    </span>
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
