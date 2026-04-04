"use client"

import { useState, useMemo } from "react"
import { PageContainer } from "@/components/layout/page-container"
import { StatsCard } from "@/components/shared/stats-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Server,
  Database,
  Network,
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
   Mock veri
══════════════════════════════════════════════════════════ */
interface VaultEntry {
  id:        string
  category:  Exclude<CategoryId, "all">
  title:     string
  username:  string
  password:  string
  host?:     string
  url?:      string
  notes?:    string
  updatedAt: string
}

const INITIAL_ENTRIES: VaultEntry[] = [
  { id: "v1",  category: "server",   title: "DC-PRIMARY",       username: "Administrator",     password: "P@ssw0rd2024!",      host: "192.168.1.10",       updatedAt: "3 gün önce" },
  { id: "v2",  category: "server",   title: "SQL-PROD",         username: "Administrator",     password: "SqlAdmin#2024",      host: "192.168.1.20",       updatedAt: "1 hafta önce" },
  { id: "v3",  category: "server",   title: "WEB-IIS-01",       username: "webadmin",          password: "Web!Admin99",        host: "192.168.1.30",       updatedAt: "2 gün önce" },
  { id: "v4",  category: "server",   title: "UBUNTU-APP-01",    username: "root",              password: "Ubuntu@Secure1!",    host: "192.168.1.50",       updatedAt: "5 gün önce" },
  { id: "v5",  category: "database", title: "ERP Production",   username: "sa",                password: "ErpDB$2024Strong",   host: "192.168.1.20\\MSSQL",updatedAt: "1 hafta önce" },
  { id: "v6",  category: "database", title: "PostgreSQL Dev",   username: "postgres",          password: "PgDev@Local1",       host: "192.168.1.52:5432",  updatedAt: "2 hafta önce" },
  { id: "v7",  category: "database", title: "MySQL Backup",     username: "backupuser",        password: "Bck!Usr#2024",       host: "192.168.1.52:3306",  updatedAt: "10 gün önce" },
  { id: "v8",  category: "network",  title: "Core Switch",      username: "admin",             password: "Swt!Admin2024",      host: "192.168.1.1",        updatedAt: "1 ay önce" },
  { id: "v9",  category: "network",  title: "Firewall",         username: "firewall-admin",    password: "Fw@Secure99!",       host: "192.168.1.254",      updatedAt: "3 hafta önce" },
  { id: "v10", category: "network",  title: "Access Point",     username: "apadmin",           password: "Ap$Pass2024",        host: "192.168.1.2",        updatedAt: "2 ay önce" },
  { id: "v11", category: "app",      title: "PusulaHub Admin",  username: "admin",             password: "Hub!Admin2024#",     url: "http://192.168.1.100:3000", updatedAt: "1 gün önce" },
  { id: "v12", category: "app",      title: "Grafana",          username: "grafana-admin",     password: "Grafana@2024!",      url: "http://192.168.1.100:3001", updatedAt: "4 gün önce" },
  { id: "v13", category: "service",  title: "AD Servis Hesabı", username: "svc-backup",        password: "Svc!Bckp#2024",      notes: "Backup servisi için",    updatedAt: "2 hafta önce" },
  { id: "v14", category: "service",  title: "IIS App Pool",     username: "svc-iisapp",        password: "IisSvc@Pool24",      notes: "DefaultAppPool hesabı",  updatedAt: "1 hafta önce" },
  { id: "v15", category: "web",      title: "Domain Yönetimi",  username: "hostinguser",       password: "Domain!2024#Mgr",    url: "https://panel.domain.com",  updatedAt: "3 hafta önce" },
  { id: "v16", category: "web",      title: "SSL Sertifika",    username: "cert-admin",        password: "Ssl@Cert$2024",      url: "https://certpanel.com",     updatedAt: "1 ay önce" },
]

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
   Kopyala butonu
══════════════════════════════════════════════════════════ */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    toast.success(`${label} kopyalandı`)
    setTimeout(() => setCopied(false), 2000)
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
function PasswordField({ password }: { password: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex items-center gap-1">
      <span className={cn("text-[11px] font-mono flex-1 truncate", !show && "tracking-widest")}>
        {show ? password : "••••••••••••"}
      </span>
      <button
        onClick={() => setShow((v) => !v)}
        className="h-6 w-6 flex items-center justify-center rounded-[4px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        {show ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </button>
      <CopyButton value={password} label="Şifre" />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Güçlü Şifre Üret
══════════════════════════════════════════════════════════ */
function generatePassword(): string {
  const upper  = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const lower  = "abcdefghijklmnopqrstuvwxyz"
  const digits = "0123456789"
  const special= "!@#$%^&*()-_=+"
  const all    = upper + lower + digits + special
  const rand   = (s: string) => s[Math.floor(Math.random() * s.length)]
  const base   = [rand(upper), rand(lower), rand(digits), rand(special)]
  for (let i = 0; i < 12; i++) base.push(rand(all))
  return base.sort(() => Math.random() - 0.5).join("")
}

/* ══════════════════════════════════════════════════════════
   Giriş Satırı (tablo)
══════════════════════════════════════════════════════════ */
function EntryRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: VaultEntry
  onEdit: (e: VaultEntry) => void
  onDelete: (id: string) => void
}) {
  const cat    = CATEGORIES.find((c) => c.id === entry.category)!
  const Icon   = cat.icon
  const score  = Math.min(passwordScore(entry.password), 5)
  const strength = STRENGTH[score]

  return (
    <div className="grid grid-cols-[1.6fr_1.4fr_1.5fr_1.7fr_0.9fr_0.9fr_auto] gap-4 items-center px-4 py-2.5 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">

      {/* Başlık */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] bg-muted/50", cat.color)}>
          <Icon className="size-3.5" />
        </div>
        <p className="text-[12px] font-semibold truncate">{entry.title}</p>
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
        <CopyButton value={entry.username} label="Kullanıcı adı" />
      </div>

      {/* Şifre */}
      <div className="bg-muted/30 rounded-[5px] px-2 py-1">
        <PasswordField password={entry.password} />
      </div>

      {/* Güç */}
      <div className="flex items-center gap-1.5">
        <div className="flex gap-[2px]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={cn("h-1.5 w-3 rounded-full", i < score ? strength.color : "bg-muted")} />
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground hidden xl:block">{strength.label}</span>
      </div>

      {/* Güncelleme */}
      <span className="text-[10px] text-muted-foreground">{entry.updatedAt}</span>

      {/* Aksiyon */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="h-7 w-7 flex items-center justify-center rounded-[4px] text-muted-foreground hover:bg-muted transition-colors">
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-[12px]">
          <DropdownMenuItem onClick={() => onEdit(entry)}>
            <Pencil className="size-3.5 mr-2" /> Düzenle
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
const EMPTY: Omit<VaultEntry, "id" | "updatedAt"> = {
  category: "server", title: "", username: "", password: "", host: "", url: "", notes: "",
}

function EntrySheet({
  open,
  entry,
  onClose,
  onSave,
}: {
  open: boolean
  entry: VaultEntry | null
  onClose: () => void
  onSave: (e: Omit<VaultEntry, "id" | "updatedAt">) => void
}) {
  const [form, setForm] = useState<Omit<VaultEntry, "id" | "updatedAt">>(
    entry ? { category: entry.category, title: entry.title, username: entry.username,
              password: entry.password, host: entry.host, url: entry.url, notes: entry.notes }
          : EMPTY
  )
  const [showPwd, setShowPwd] = useState(false)

  // entry değişince formu güncelle
  useMemo(() => {
    setForm(entry
      ? { category: entry.category, title: entry.title, username: entry.username,
          password: entry.password, host: entry.host, url: entry.url, notes: entry.notes }
      : EMPTY)
  }, [entry])

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const canSave = form.title.trim() && form.username.trim() && form.password.trim()

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="!w-[520px] !max-w-[520px] p-0 flex flex-col gap-0">
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
                      onClick={() => set("password", generatePassword())}
                      className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-700 transition-colors"
                    >
                      <Sparkles className="size-3" /> Güçlü Şifre Öner
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

          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/50 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={onClose}>İptal</Button>
          <Button size="sm" className="h-8 text-[11px]" disabled={!canSave} onClick={() => { onSave(form); onClose() }}>
            {entry ? "Kaydet" : "Ekle"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ══════════════════════════════════════════════════════════
   Ana Sayfa
══════════════════════════════════════════════════════════ */
export default function VaultPage() {
  const [entries, setEntries]     = useState<VaultEntry[]>(INITIAL_ENTRIES)
  const [category, setCategory]   = useState<CategoryId>("all")
  const [search, setSearch]       = useState("")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing]     = useState<VaultEntry | null>(null)
  const [deleteId, setDeleteId]   = useState<string | null>(null)

  const filtered = useMemo(() =>
    entries.filter((e) => {
      const inCat = category === "all" || e.category === category
      const q     = search.toLowerCase()
      const inSearch = !q || e.title.toLowerCase().includes(q) ||
                       e.username.toLowerCase().includes(q) ||
                       (e.host ?? "").toLowerCase().includes(q) ||
                       (e.url  ?? "").toLowerCase().includes(q)
      return inCat && inSearch
    }),
  [entries, category, search])

  const countFor = (id: CategoryId) =>
    id === "all" ? entries.length : entries.filter((e) => e.category === id).length

  const handleSave = (form: Omit<VaultEntry, "id" | "updatedAt">) => {
    if (editing) {
      setEntries((es) => es.map((e) => e.id === editing.id ? { ...e, ...form, updatedAt: "Az önce" } : e))
      toast.success("Giriş güncellendi")
    } else {
      setEntries((es) => [...es, { ...form, id: `v${Date.now()}`, updatedAt: "Az önce" }])
      toast.success("Giriş eklendi")
    }
  }

  const handleDelete = (id: string) => {
    setEntries((es) => es.filter((e) => e.id !== id))
    toast.success("Giriş silindi")
  }

  return (
    <PageContainer title="Şifre Kasası" description="Sunucu ve servis kimlik bilgileri">

      {/* ── KPI Satırı ── */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatsCard
          title="TOPLAM GİRİŞ"
          value={entries.length}
          icon={<KeyRound className="h-4 w-4" />}
          subtitle="Tüm kategoriler"
        />
        <StatsCard
          title="GÜÇLÜ ŞİFRE"
          value={entries.filter((e) => passwordScore(e.password) >= 4).length}
          icon={<ShieldCheck className="h-4 w-4" />}
          trend={{ value: "Güç skoru 4 ve üzeri", positive: true }}
          subtitle="Güvenli girişler"
        />
        <StatsCard
          title="ZAYIF ŞİFRE"
          value={entries.filter((e) => passwordScore(e.password) <= 2).length}
          icon={<Lock className="h-4 w-4" />}
          trend={{ value: "Güncelleme gerekiyor", positive: false }}
          subtitle="Risk altındaki girişler"
        />
        <StatsCard
          title="KATEGORİ"
          value={CATEGORIES.length - 1}
          icon={<Activity className="h-4 w-4" />}
          subtitle="Farklı grup"
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
              </div>
            </div>
            <div className="h-2" />
          </div>
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

              {/* Tablo başlığı */}
              <div className="grid grid-cols-[1.6fr_1.4fr_1.5fr_1.7fr_0.9fr_0.9fr_auto] gap-4 items-center px-4 py-2.5 bg-muted/30 border-b border-border/40">
                {["BAŞLIK", "HOST / IP", "KULLANICI ADI", "ŞİFRE", "GÜÇ", "GÜNCELLEME", ""].map((h) => (
                  <span key={h} className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{h}</span>
                ))}
              </div>

              {/* Satırlar */}
              {filtered.length === 0 ? (
                <div className="py-16 flex flex-col items-center gap-2">
                  <Lock className="size-8 text-muted-foreground/30" />
                  <p className="text-[12px] text-muted-foreground">Sonuç bulunamadı</p>
                </div>
              ) : (
                <div>
                  {filtered.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      onEdit={(e) => { setEditing(e); setSheetOpen(true) }}
                      onDelete={(id) => setDeleteId(id)}
                    />
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center gap-1.5 px-4 py-2.5 border-t border-border/40 bg-muted/20">
                <ShieldCheck className="size-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{filtered.length} giriş listeleniyor</span>
              </div>
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
      />

      {/* Silme onay dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Girişi sil</AlertDialogTitle>
            <AlertDialogDescription>
              Bu kimlik bilgisi kalıcı olarak silinecek. Bu işlem geri alınamaz.
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
