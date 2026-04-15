"use client"

import { useState, useEffect, useMemo } from "react"
import { PageContainer } from "@/components/layout/page-container"
import { StatsCard } from "@/components/shared/stats-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Server,
  Database,
  AppWindow,
  UserCog,
  Wifi,
  Search,
  Plus,
  Eye,
  EyeOff,
  Copy,
  Check,
  MoreVertical,
  Pencil,
  Trash2,
  KeyRound,
  Globe,
  ShieldCheck,
  Sparkles,
  Lock,
  Activity,
  Star,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
  AlertTriangle,
  History,
  SlidersHorizontal,
  RefreshCw,
} from "lucide-react"

/* ══════════════════════════════════════════════════════════
   Kategoriler
══════════════════════════════════════════════════════════ */
const CATEGORIES = [
  { id: "all",      label: "Tümü",           icon: KeyRound,  color: "text-[#6B7280]"  },
  { id: "server",   label: "Sunucular",       icon: Server,    color: "text-blue-600"   },
  { id: "database", label: "Veritabanı",      icon: Database,  color: "text-violet-600" },
  { id: "network",  label: "Ağ Cihazları",    icon: Wifi,      color: "text-emerald-600"},
  { id: "app",      label: "Uygulamalar",     icon: AppWindow, color: "text-orange-600" },
  { id: "service",  label: "Servis Hesapları",icon: UserCog,   color: "text-rose-600"   },
  { id: "web",      label: "Web / Panel",     icon: Globe,     color: "text-sky-600"    },
] as const

type CategoryId = typeof CATEGORIES[number]["id"]

/* ══════════════════════════════════════════════════════════
   Tipler
══════════════════════════════════════════════════════════ */
interface VaultEntry {
  id:                string
  category:          Exclude<CategoryId, "all">
  title:             string
  username:          string
  password:          string
  host?:             string | null
  url?:              string | null
  notes?:            string | null
  isFavorite:        boolean
  passwordChangedAt: string | null
  updatedAt:         string
}

interface AccessLog { id: string; action: string; createdAt: string }
interface PasswordHistory { id: string; password: string; changedAt: string }

/* ══════════════════════════════════════════════════════════
   Şifre gücü
══════════════════════════════════════════════════════════ */
function passwordScore(pwd: string): number {
  let score = 0
  if (pwd.length >= 8)  score++
  if (pwd.length >= 14) score++
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++
  if (/\d/.test(pwd))   score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  return score
}

const STRENGTH = [
  { label: "Çok Zayıf", color: "bg-red-500"    },
  { label: "Zayıf",     color: "bg-orange-400"  },
  { label: "Orta",      color: "bg-amber-400"   },
  { label: "İyi",       color: "bg-lime-500"    },
  { label: "Güçlü",     color: "bg-emerald-500" },
  { label: "Çok Güçlü", color: "bg-emerald-600" },
]

function StrengthBar({ password }: { password: string }) {
  const score = Math.min(passwordScore(password), 5)
  const s = STRENGTH[score]
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5 flex-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-all",
              i < score ? s.color : "bg-muted"
            )}
          />
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground w-16 text-right">{s.label}</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Şifre yaşı kontrolü (90 gün)
══════════════════════════════════════════════════════════ */
const PASSWORD_MAX_AGE_DAYS = 90

function getPasswordAgeDays(changedAt: string | null): number | null {
  if (!changedAt) return null
  const d = new Date(changedAt)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function PasswordAgeBadge({ changedAt }: { changedAt: string | null }) {
  const days = getPasswordAgeDays(changedAt)
  if (days === null) return null
  if (days < 60) return null
  if (days < PASSWORD_MAX_AGE_DAYS) {
    return (
      <span className="flex items-center gap-0.5 text-[9px] text-amber-600 font-medium" title={`${days} gün önce değiştirildi`}>
        <Clock className="size-2.5" /> {days}g
      </span>
    )
  }
  return (
    <span className="flex items-center gap-0.5 text-[9px] text-red-600 font-semibold animate-pulse" title={`${days} gün önce — güncellenmeli!`}>
      <AlertTriangle className="size-2.5" /> {days}g
    </span>
  )
}

/* ══════════════════════════════════════════════════════════
   Kopyala butonu
══════════════════════════════════════════════════════════ */
function CopyButton({ value, label, entryId, action }: { value: string; label: string; entryId?: string; action?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    toast.success(`${label} kopyalandı`)
    setTimeout(() => setCopied(false), 2000)
    // Erişim logu
    if (entryId && action) {
      fetch(`/api/vault/${entryId}/access`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }).catch(() => {})
    }
  }
  return (
    <button
      onClick={copy}
      className="h-6 w-6 flex items-center justify-center rounded-[4px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════
   Şifre Satırı
══════════════════════════════════════════════════════════ */
function PasswordField({ password, entryId }: { password: string; entryId?: string }) {
  const [show, setShow] = useState(false)
  const handleShow = () => {
    const next = !show
    setShow(next)
    if (next && entryId) {
      fetch(`/api/vault/${entryId}/access`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "password_viewed" }),
      }).catch(() => {})
    }
  }
  return (
    <div className="flex items-center gap-1">
      <span className={cn("text-[11px] font-mono flex-1 truncate", !show && "tracking-widest")}>
        {show ? password : "••••••••••••"}
      </span>
      <button
        onClick={handleShow}
        className="h-6 w-6 flex items-center justify-center rounded-[4px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        {show ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </button>
      <CopyButton value={password} label="Şifre" entryId={entryId} action="password_copied" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Güçlü Şifre Üret (ayarlanabilir)
══════════════════════════════════════════════════════════ */
interface PwdGenOptions {
  length:     number
  uppercase:  boolean
  lowercase:  boolean
  digits:     boolean
  special:    boolean
}

const DEFAULT_GEN: PwdGenOptions = { length: 16, uppercase: true, lowercase: true, digits: true, special: true }

function generatePasswordWithOptions(opts: PwdGenOptions): string {
  const upper  = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const lower  = "abcdefghijklmnopqrstuvwxyz"
  const digits = "0123456789"
  const special= "!@#$%^&*()-_=+"

  let pool = ""
  const required: string[] = []
  if (opts.uppercase) { pool += upper;  required.push(upper[Math.floor(Math.random() * upper.length)]) }
  if (opts.lowercase) { pool += lower;  required.push(lower[Math.floor(Math.random() * lower.length)]) }
  if (opts.digits)    { pool += digits; required.push(digits[Math.floor(Math.random() * digits.length)]) }
  if (opts.special)   { pool += special;required.push(special[Math.floor(Math.random() * special.length)]) }

  if (!pool) pool = lower + digits
  const remaining = opts.length - required.length
  for (let i = 0; i < Math.max(0, remaining); i++) {
    required.push(pool[Math.floor(Math.random() * pool.length)])
  }
  // Fisher-Yates shuffle
  for (let i = required.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [required[i], required[j]] = [required[j], required[i]]
  }
  return required.join("")
}

/* ══════════════════════════════════════════════════════════
   Tarih formatlama
══════════════════════════════════════════════════════════ */
function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  const now  = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)    return "Az önce"
  if (mins < 60)   return `${mins} dk önce`
  const hours = Math.floor(mins / 60)
  if (hours < 24)  return `${hours} saat önce`
  const days = Math.floor(hours / 24)
  if (days < 7)    return `${days} gün önce`
  if (days < 30)   return `${Math.floor(days / 7)} hafta önce`
  if (days < 365)  return `${Math.floor(days / 30)} ay önce`
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })
}

/* ══════════════════════════════════════════════════════════
   Sıralama
══════════════════════════════════════════════════════════ */
type SortKey = "title" | "strength" | "updatedAt" | "category"
type SortDir = "asc" | "desc"

/* ══════════════════════════════════════════════════════════
   Giriş Satırı (tablo)
══════════════════════════════════════════════════════════ */
function EntryRow({
  entry, onEdit, onDelete, onToggleFavorite,
}: {
  entry: VaultEntry
  onEdit: (e: VaultEntry) => void
  onDelete: (id: string) => void
  onToggleFavorite: (id: string) => void
}) {
  const cat    = CATEGORIES.find((c) => c.id === entry.category) ?? CATEGORIES[0]
  const Icon   = cat.icon
  const score  = Math.min(passwordScore(entry.password), 5)
  const strength = STRENGTH[score]

  return (
    <div className="grid grid-cols-[auto_1.5fr_1.3fr_1.4fr_1.6fr_0.8fr_0.8fr_auto] gap-3 items-center px-4 py-2.5 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors group">

      {/* Favori */}
      <button
        onClick={() => onToggleFavorite(entry.id)}
        className={cn(
          "h-6 w-6 flex items-center justify-center rounded-[4px] transition-colors",
          entry.isFavorite ? "text-amber-500" : "text-muted-foreground/30 hover:text-amber-400"
        )}
      >
        <Star className={cn("size-3.5", entry.isFavorite && "fill-current")} />
      </button>

      {/* Başlık */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] bg-muted/50", cat.color)}>
          <Icon className="size-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold truncate">{entry.title}</p>
          {entry.notes && <p className="text-[9px] text-muted-foreground truncate">{entry.notes}</p>}
        </div>
      </div>

      {/* Host / IP */}
      <div className="min-w-0">
        <span className="text-[11px] font-mono text-muted-foreground truncate block">
          {entry.host || entry.url || "—"}
        </span>
      </div>

      {/* Kullanıcı adı */}
      <div className="flex items-center gap-1.5 min-w-0 bg-muted/30 rounded-[5px] px-2 py-1">
        <span className="text-[11px] font-mono truncate flex-1">{entry.username}</span>
        <CopyButton value={entry.username} label="Kullanıcı adı" entryId={entry.id} action="username_copied" />
      </div>

      {/* Şifre */}
      <div className="bg-muted/30 rounded-[5px] px-2 py-1">
        <PasswordField password={entry.password} entryId={entry.id} />
      </div>

      {/* Güç + yaş */}
      <div className="flex flex-col items-start gap-0.5">
        <div className="flex items-center gap-1.5">
          <div className="flex gap-[2px]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={cn("h-1.5 w-2.5 rounded-full", i < score ? strength.color : "bg-muted")} />
            ))}
          </div>
        </div>
        <PasswordAgeBadge changedAt={entry.passwordChangedAt} />
      </div>

      {/* Güncelleme */}
      <span className="text-[10px] text-muted-foreground">{formatRelativeDate(entry.updatedAt)}</span>

      {/* Aksiyon */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="h-7 w-7 flex items-center justify-center rounded-[4px] text-muted-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100">
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-[12px]">
          <DropdownMenuItem onClick={() => onEdit(entry)}>
            <Pencil className="size-3.5 mr-2" /> Düzenle
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onToggleFavorite(entry.id)}>
            <Star className="size-3.5 mr-2" /> {entry.isFavorite ? "Favoriden Çıkar" : "Favorilere Ekle"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onDelete(entry.id)} className="text-destructive focus:text-destructive">
            <Trash2 className="size-3.5 mr-2" /> Sil
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Giriş Sheet (Ekle / Düzenle)
══════════════════════════════════════════════════════════ */
const EMPTY: Omit<VaultEntry, "id" | "updatedAt" | "isFavorite" | "passwordChangedAt"> = {
  category: "server", title: "", username: "", password: "", host: "", url: "", notes: "",
}

function EntrySheet({
  open, entry, onClose, onSave, saving,
}: {
  open: boolean
  entry: VaultEntry | null
  onClose: () => void
  onSave: (e: Omit<VaultEntry, "id" | "updatedAt" | "isFavorite" | "passwordChangedAt">) => void
  saving: boolean
}) {
  const [form, setForm] = useState(EMPTY)
  const [showPwd, setShowPwd] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [genOpts, setGenOpts] = useState<PwdGenOptions>(DEFAULT_GEN)
  const [genPreview, setGenPreview] = useState("")

  // Şifre geçmişi + erişim logları
  const [historyItems, setHistoryItems] = useState<PasswordHistory[]>([])
  const [accessItems, setAccessItems]   = useState<AccessLog[]>([])
  const [histLoading, setHistLoading]   = useState(false)
  const [accLoading, setAccLoading]     = useState(false)

  useEffect(() => {
    setForm(entry
      ? { category: entry.category, title: entry.title, username: entry.username,
          password: entry.password, host: entry.host, url: entry.url, notes: entry.notes }
      : EMPTY)
    setShowPwd(false)
    if (entry) {
      loadHistory(entry.id)
      loadAccess(entry.id)
    } else {
      setHistoryItems([])
      setAccessItems([])
    }
  }, [entry])

  async function loadHistory(id: string) {
    setHistLoading(true)
    try {
      const r = await fetch(`/api/vault/${id}/history`)
      if (r.ok) setHistoryItems(await r.json())
    } catch { /* */ } finally { setHistLoading(false) }
  }

  async function loadAccess(id: string) {
    setAccLoading(true)
    try {
      const r = await fetch(`/api/vault/${id}/access`)
      if (r.ok) setAccessItems(await r.json())
    } catch { /* */ } finally { setAccLoading(false) }
  }

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const canSave = form.title.trim() && form.username.trim() && form.password.trim()

  function openGenerator() {
    setGenPreview(generatePasswordWithOptions(genOpts))
    setGenOpen(true)
  }

  function acceptGenerated() {
    set("password", genPreview)
    setGenOpen(false)
  }

  const ACTION_LABELS: Record<string, string> = {
    password_viewed: "Şifre görüntülendi",
    password_copied: "Şifre kopyalandı",
    username_copied: "Kullanıcı adı kopyalandı",
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="!w-[540px] !max-w-[540px] p-0 flex flex-col gap-0">
          <SheetHeader className="px-5 py-4 border-b border-border/50">
            <SheetTitle className="text-sm">{entry ? "Girişi Düzenle" : "Yeni Giriş Ekle"}</SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-4 py-4 space-y-3">

              {/* Kategori */}
              <div className="rounded-[5px] border border-border/50 overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Kategori</p>
                </div>
                <div className="px-3 py-3">
                  <Select value={form.category} onValueChange={(v) => set("category", v)}>
                    <SelectTrigger className="h-8 text-[11px] rounded-[5px] w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.filter((c) => c.id !== "all").map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-[11px]">
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Temel Bilgiler */}
              <div className="rounded-[5px] border border-border/50 overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Temel Bilgiler</p>
                </div>
                <div className="px-3 py-3 space-y-3">
                  <div>
                    <Label className="text-[11px] font-semibold mb-1 block">Başlık</Label>
                    <Input className="h-8 text-[11px] rounded-[5px]" placeholder="DC-PRIMARY" value={form.title} onChange={(e) => set("title", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold mb-1 block">Kullanıcı Adı</Label>
                    <Input className="h-8 text-[11px] rounded-[5px] font-mono" placeholder="Administrator" value={form.username} onChange={(e) => set("username", e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-[11px] font-semibold">Şifre</Label>
                      <button
                        type="button"
                        onClick={openGenerator}
                        className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-700 transition-colors"
                      >
                        <Sparkles className="size-3" /> Şifre Üret
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        className="h-8 text-[11px] rounded-[5px] font-mono pr-8"
                        type={showPwd ? "text" : "password"}
                        placeholder="••••••••"
                        value={form.password}
                        onChange={(e) => set("password", e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPwd ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    </div>
                    {form.password && (
                      <div className="mt-1.5">
                        <StrengthBar password={form.password} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Ek Bilgiler */}
              <div className="rounded-[5px] border border-border/50 overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Ek Bilgiler</p>
                </div>
                <div className="px-3 py-3 space-y-3">
                  <div>
                    <Label className="text-[11px] font-semibold mb-1 block">Host / IP</Label>
                    <Input className="h-8 text-[11px] rounded-[5px] font-mono" placeholder="192.168.1.10" value={form.host ?? ""} onChange={(e) => set("host", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold mb-1 block">URL</Label>
                    <Input className="h-8 text-[11px] rounded-[5px]" placeholder="https://panel.example.com" value={form.url ?? ""} onChange={(e) => set("url", e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold mb-1 block">Notlar</Label>
                    <Input className="h-8 text-[11px] rounded-[5px]" placeholder="Açıklama..." value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Şifre Geçmişi (sadece düzenlemede) */}
              {entry && (
                <div className="rounded-[5px] border border-border/50 overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <History className="size-3" /> Şifre Geçmişi
                      {historyItems.length > 0 && <span className="ml-1 text-[9px] bg-muted px-1.5 py-0.5 rounded-[3px]">{historyItems.length}</span>}
                    </p>
                  </div>
                  <div className="px-3 py-3">
                    {histLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-full rounded-[3px]" />
                        <Skeleton className="h-4 w-2/3 rounded-[3px]" />
                      </div>
                    ) : historyItems.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground text-center py-2">Henüz şifre değişikliği yok</p>
                    ) : (
                      <div className="space-y-1.5">
                        {historyItems.map((h) => (
                          <HistoryRow key={h.id} item={h} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Erişim Logları (sadece düzenlemede) */}
              {entry && (
                <div className="rounded-[5px] border border-border/50 overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Activity className="size-3" /> Erişim Geçmişi
                      {accessItems.length > 0 && <span className="ml-1 text-[9px] bg-muted px-1.5 py-0.5 rounded-[3px]">{accessItems.length}</span>}
                    </p>
                  </div>
                  <div className="px-3 py-3">
                    {accLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-full rounded-[3px]" />
                        <Skeleton className="h-3 w-2/3 rounded-[3px]" />
                      </div>
                    ) : accessItems.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground text-center py-2">Henüz erişim kaydı yok</p>
                    ) : (
                      <div className="space-y-1">
                        {accessItems.slice(0, 15).map((a) => (
                          <div key={a.id} className="flex items-center gap-2 text-[10px]">
                            <div className="size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                            <span className="text-muted-foreground flex-1">
                              {ACTION_LABELS[a.action] || a.action}
                            </span>
                            <span className="text-muted-foreground/60 text-[9px]">
                              {formatRelativeDate(a.createdAt)}
                            </span>
                          </div>
                        ))}
                        {accessItems.length > 15 && (
                          <p className="text-[9px] text-muted-foreground/50 text-center">+{accessItems.length - 15} kayıt daha</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border/50 flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={onClose}>İptal</Button>
            <Button size="sm" className="h-8 text-[11px]" disabled={!canSave || saving} onClick={() => onSave(form)}>
              {saving ? "Kaydediliyor..." : entry ? "Kaydet" : "Ekle"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Şifre üretici dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="rounded-[8px] max-w-sm p-0 gap-0">
          <DialogHeader className="px-5 py-4 border-b border-border/50">
            <DialogTitle className="text-[13px] font-semibold flex items-center gap-2">
              <SlidersHorizontal className="size-4" /> Şifre Üretici
            </DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4">
            {/* Önizleme */}
            <div className="flex items-center gap-2 bg-muted/30 rounded-[5px] p-2.5">
              <span className="text-[13px] font-mono font-bold flex-1 truncate select-all">{genPreview}</span>
              <CopyButton value={genPreview} label="Şifre" />
              <button onClick={() => setGenPreview(generatePasswordWithOptions(genOpts))}
                className="h-6 w-6 flex items-center justify-center rounded-[4px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <RefreshCw className="size-3" />
              </button>
            </div>
            {genPreview && <StrengthBar password={genPreview} />}

            {/* Uzunluk */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-semibold">Uzunluk</Label>
                <span className="text-[11px] font-mono font-bold tabular-nums">{genOpts.length}</span>
              </div>
              <Slider
                value={[genOpts.length]}
                onValueChange={([v]) => {
                  const next = { ...genOpts, length: v }
                  setGenOpts(next)
                  setGenPreview(generatePasswordWithOptions(next))
                }}
                min={8} max={64} step={1}
                className="w-full"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>8</span><span>64</span>
              </div>
            </div>

            {/* Karakter setleri */}
            <div className="space-y-2.5">
              <Label className="text-[11px] font-semibold">Karakter Setleri</Label>
              {([
                { key: "uppercase", label: "Büyük harf (A-Z)" },
                { key: "lowercase", label: "Küçük harf (a-z)" },
                { key: "digits",    label: "Rakam (0-9)" },
                { key: "special",   label: "Özel karakter (!@#$...)" },
              ] as const).map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                  <Switch
                    checked={genOpts[key]}
                    onCheckedChange={(v) => {
                      const next = { ...genOpts, [key]: v }
                      setGenOpts(next)
                      setGenPreview(generatePasswordWithOptions(next))
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="px-5 py-3 border-t border-border/50 flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => setGenOpen(false)}>İptal</Button>
            <Button size="sm" className="h-8 text-[11px]" onClick={acceptGenerated}>Kullan</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ── Şifre geçmişi satır bileşeni ── */
function HistoryRow({ item }: { item: PasswordHistory }) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex items-center gap-2 bg-muted/20 rounded-[4px] px-2.5 py-1.5">
      <span className={cn("text-[10px] font-mono flex-1 truncate", !show && "tracking-widest")}>
        {show ? item.password : "••••••••"}
      </span>
      <button onClick={() => setShow(!show)}
        className="text-muted-foreground hover:text-foreground transition-colors">
        {show ? <EyeOff className="size-2.5" /> : <Eye className="size-2.5" />}
      </button>
      <CopyButton value={item.password} label="Eski şifre" />
      <span className="text-[9px] text-muted-foreground/60 shrink-0">{formatRelativeDate(item.changedAt)}</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Sıralama başlık butonu
══════════════════════════════════════════════════════════ */
function SortHeader({
  label, sortKey, currentKey, dir, onSort,
}: {
  label: string; sortKey: SortKey; currentKey: SortKey; dir: SortDir
  onSort: (key: SortKey) => void
}) {
  const active = currentKey === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
    >
      {label}
      {active ? (
        dir === "asc" ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />
      ) : (
        <ArrowUpDown className="size-2.5 opacity-30" />
      )}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════
   Ana Sayfa
══════════════════════════════════════════════════════════ */
export default function VaultPage() {
  const [entries, setEntries]     = useState<VaultEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [category, setCategory]   = useState<CategoryId>("all")
  const [search, setSearch]       = useState("")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing]     = useState<VaultEntry | null>(null)
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)

  // Sıralama
  const [sortKey, setSortKey] = useState<SortKey>("title")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  /* ── Veri yükle ── */
  async function load() {
    try {
      const r = await fetch("/api/vault")
      if (r.ok) setEntries(await r.json())
    } catch { /* */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  /* ── Sıralama toggle ── */
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  /* ── Filtreleme + sıralama ── */
  const filtered = useMemo(() => {
    let result = entries.filter((e) => {
      const inCat = category === "all" || e.category === category
      const q     = search.toLowerCase()
      const inSearch = !q || e.title.toLowerCase().includes(q) ||
                       e.username.toLowerCase().includes(q) ||
                       (e.host ?? "").toLowerCase().includes(q) ||
                       (e.url  ?? "").toLowerCase().includes(q)
      return inCat && inSearch
    })

    // Sıralama
    result.sort((a, b) => {
      // Favoriler her zaman üstte
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1

      let cmp = 0
      switch (sortKey) {
        case "title":
          cmp = a.title.localeCompare(b.title, "tr")
          break
        case "strength":
          cmp = passwordScore(a.password) - passwordScore(b.password)
          break
        case "updatedAt":
          cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          break
        case "category":
          cmp = a.category.localeCompare(b.category)
          break
      }
      return sortDir === "asc" ? cmp : -cmp
    })

    return result
  }, [entries, category, search, sortKey, sortDir])

  const countFor = (id: CategoryId) =>
    id === "all" ? entries.length : entries.filter((e) => e.category === id).length

  /* ── Favori toggle ── */
  async function handleToggleFavorite(id: string) {
    // Optimistic
    setEntries((es) => es.map((e) => e.id === id ? { ...e, isFavorite: !e.isFavorite } : e))
    try {
      await fetch(`/api/vault/${id}/favorite`, { method: "PATCH" })
    } catch {
      setEntries((es) => es.map((e) => e.id === id ? { ...e, isFavorite: !e.isFavorite } : e))
    }
  }

  /* ── Kaydet (ekle/güncelle) ── */
  const handleSave = async (form: Omit<VaultEntry, "id" | "updatedAt" | "isFavorite" | "passwordChangedAt">) => {
    setSaving(true)
    try {
      if (editing) {
        const r = await fetch(`/api/vault/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        if (!r.ok) throw new Error()
        toast.success("Giriş güncellendi")
      } else {
        const r = await fetch("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        if (!r.ok) throw new Error()
        toast.success("Giriş eklendi")
      }
      setSheetOpen(false)
      setEditing(null)
      load()
    } catch {
      toast.error(editing ? "Güncellenemedi" : "Eklenemedi")
    } finally { setSaving(false) }
  }

  /* ── Sil ── */
  const handleDelete = async (id: string) => {
    try {
      const r = await fetch(`/api/vault/${id}`, { method: "DELETE" })
      if (!r.ok) throw new Error()
      toast.success("Giriş silindi")
      setDeleteId(null)
      load()
    } catch {
      toast.error("Silinemedi")
    }
  }

  // KPI hesaplamaları
  const expiredCount = entries.filter((e) => {
    const days = getPasswordAgeDays(e.passwordChangedAt)
    return days !== null && days >= PASSWORD_MAX_AGE_DAYS
  }).length

  return (
    <PageContainer title="Şifre Kasası" description="Sunucu ve servis kimlik bilgileri">

      {/* ── KPI Satırı ── */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatsCard
          title="TOPLAM GİRİŞ"
          value={loading ? "—" : entries.length}
          icon={<KeyRound className="h-4 w-4" />}
          subtitle="Tüm kategoriler"
        />
        <StatsCard
          title="GÜÇLÜ ŞİFRE"
          value={loading ? "—" : entries.filter((e) => passwordScore(e.password) >= 4).length}
          icon={<ShieldCheck className="h-4 w-4" />}
          trend={{ value: "Güç skoru 4 ve üzeri", positive: true }}
          subtitle="Güvenli girişler"
        />
        <StatsCard
          title="ZAYIF ŞİFRE"
          value={loading ? "—" : entries.filter((e) => passwordScore(e.password) <= 2).length}
          icon={<Lock className="h-4 w-4" />}
          trend={{ value: "Güncelleme gerekiyor", positive: false }}
          subtitle="Risk altındaki girişler"
        />
        <StatsCard
          title="SÜRESİ DOLAN"
          value={loading ? "—" : expiredCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          trend={expiredCount > 0 ? { value: `${PASSWORD_MAX_AGE_DAYS}+ gün`, positive: false } : undefined}
          subtitle={`${PASSWORD_MAX_AGE_DAYS} günü aşan`}
        />
      </div>

      <div className="flex gap-4">

        {/* ── Sol: Kategori Paneli ── */}
        <div className="w-52 shrink-0">
          <div className="rounded-[8px] p-2 pb-0 bg-[#F4F2F0]">
            <div className="rounded-[4px] bg-white overflow-hidden" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
              <div className="px-3 py-2.5 border-b border-border/40 bg-muted/30">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Kategoriler</p>
              </div>
              <div className="p-1.5 space-y-0.5">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon
                  const count = countFor(cat.id)
                  const active = category === cat.id
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[5px] text-left transition-colors",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-foreground"
                      )}
                    >
                      <Icon className={cn("size-3.5 shrink-0", active ? "text-primary-foreground" : cat.color)} />
                      <span className="text-[11px] font-medium flex-1 truncate">{cat.label}</span>
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-[3px]",
                        active ? "bg-white/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="h-2" />
          </div>

          {/* Güvenlik özeti */}
          <div className="rounded-[8px] p-2 pb-0 bg-[#F4F2F0] mt-0">
            <div className="rounded-[4px] bg-white overflow-hidden" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
              <div className="px-3 py-2.5 border-b border-border/40 bg-muted/30">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Güvenlik</p>
              </div>
              <div className="p-3 space-y-2">
                {STRENGTH.slice(3).map((s, i) => {
                  const count = entries.filter((e) => Math.min(passwordScore(e.password), 5) === i + 3).length
                  return (
                    <div key={s.label} className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full shrink-0", s.color)} />
                      <span className="text-[10px] text-muted-foreground flex-1">{s.label}</span>
                      <span className="text-[11px] font-semibold tabular-nums">{count}</span>
                    </div>
                  )
                })}
                {STRENGTH.slice(0, 3).map((s, i) => {
                  const count = entries.filter((e) => Math.min(passwordScore(e.password), 5) === i).length
                  return count > 0 ? (
                    <div key={s.label} className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full shrink-0", s.color)} />
                      <span className="text-[10px] text-muted-foreground flex-1">{s.label}</span>
                      <span className="text-[11px] font-semibold tabular-nums text-red-600">{count}</span>
                    </div>
                  ) : null
                })}
                {/* Süre aşımı */}
                {expiredCount > 0 && (
                  <>
                    <Separator className="my-1" />
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="size-2.5 text-red-500 shrink-0" />
                      <span className="text-[10px] text-red-600 flex-1">Süresi dolan</span>
                      <span className="text-[11px] font-semibold tabular-nums text-red-600">{expiredCount}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="h-2" />
          </div>

          {/* Favoriler */}
          {entries.filter((e) => e.isFavorite).length > 0 && (
            <div className="rounded-[8px] p-2 pb-0 bg-[#F4F2F0] mt-0">
              <div className="rounded-[4px] bg-white overflow-hidden" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
                <div className="px-3 py-2.5 border-b border-border/40 bg-muted/30">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Star className="size-3 text-amber-500 fill-amber-500" /> Favoriler
                  </p>
                </div>
                <div className="p-1.5 space-y-0.5">
                  {entries.filter((e) => e.isFavorite).map((e) => {
                    const cat = CATEGORIES.find((c) => c.id === e.category) ?? CATEGORIES[0]
                    const Icon = cat.icon
                    return (
                      <button
                        key={e.id}
                        onClick={() => { setEditing(e); setSheetOpen(true) }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[5px] hover:bg-muted/60 transition-colors text-left"
                      >
                        <Icon className={cn("size-3 shrink-0", cat.color)} />
                        <span className="text-[10px] font-medium truncate flex-1">{e.title}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="h-2" />
            </div>
          )}
        </div>

        {/* ── Sağ: Giriş Listesi ── */}
        <div className="flex-1 min-w-0">
          {/* Araç çubuğu */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                className="h-8 text-[11px] pl-8 rounded-[5px]"
                placeholder="Başlık, kullanıcı adı veya host ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              className="h-8 text-[11px] gap-1.5 shrink-0"
              onClick={() => { setEditing(null); setSheetOpen(true) }}
            >
              <Plus className="size-3.5" /> Yeni Giriş
            </Button>
          </div>

          <div className="rounded-[8px] p-2 pb-0 bg-[#F4F2F0]">
            <div className="rounded-[4px] bg-white overflow-hidden" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>

              {/* Tablo başlığı — sıralanabilir */}
              <div className="grid grid-cols-[auto_1.5fr_1.3fr_1.4fr_1.6fr_0.8fr_0.8fr_auto] gap-3 items-center px-4 py-2.5 bg-muted/30 border-b border-border/40">
                <span className="w-6" />
                <SortHeader label="Başlık" sortKey="title" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Host / IP</span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Kullanıcı Adı</span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Şifre</span>
                <SortHeader label="Güç" sortKey="strength" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Güncelleme" sortKey="updatedAt" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                <span className="w-7" />
              </div>

              {/* Satırlar */}
              {loading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-7 w-7 rounded-[5px]" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-16 flex flex-col items-center gap-3">
                  <Lock className="size-8 text-muted-foreground/30" />
                  <p className="text-[12px] text-muted-foreground font-medium">
                    {entries.length === 0 ? "Henüz giriş eklenmedi" : "Sonuç bulunamadı"}
                  </p>
                  {entries.length === 0 && (
                    <Button size="sm" className="h-8 text-[11px] gap-1.5"
                      onClick={() => { setEditing(null); setSheetOpen(true) }}>
                      <Plus className="size-3.5" /> İlk Girişi Ekle
                    </Button>
                  )}
                </div>
              ) : (
                <div>
                  {filtered.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      onEdit={(e) => { setEditing(e); setSheetOpen(true) }}
                      onDelete={(id) => setDeleteId(id)}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              )}

              {/* Footer */}
              {!loading && filtered.length > 0 && (
                <div className="flex items-center gap-1.5 px-4 py-2.5 border-t border-border/40 bg-muted/20">
                  <ShieldCheck className="size-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    {filtered.length} giriş listeleniyor
                    {entries.filter((e) => e.isFavorite).length > 0 && (
                      <span className="ml-2">· <Star className="size-2.5 inline text-amber-500 fill-amber-500" /> {entries.filter((e) => e.isFavorite).length} favori</span>
                    )}
                  </span>
                </div>
              )}
            </div>
            <div className="h-2" />
          </div>

        </div>
      </div>

      {/* Sheet */}
      <EntrySheet
        open={sheetOpen}
        entry={editing}
        onClose={() => { setSheetOpen(false); setEditing(null) }}
        onSave={handleSave}
        saving={saving}
      />

      {/* Silme onay dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Girişi sil</AlertDialogTitle>
            <AlertDialogDescription>
              Bu kimlik bilgisi ve şifre geçmişi kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => { handleDelete(deleteId!); setDeleteId(null) }}
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </PageContainer>
  )
}
