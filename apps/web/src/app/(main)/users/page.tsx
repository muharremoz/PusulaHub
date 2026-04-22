"use client"

import { useState, useEffect } from "react"
import { useSession }          from "next-auth/react"
import { useRouter }           from "next/navigation"
import {
  Plus, Pencil, Trash2, User, MoreVertical,
  ToggleLeft, ToggleRight, ShieldCheck, ShieldOff,
  ChevronDown, ChevronRight, AlertTriangle,
  Eye, EyeOff, Sparkles, Copy,
} from "lucide-react"
import { Button }       from "@/components/ui/button"
import { Input }        from "@/components/ui/input"
import { Label }        from "@/components/ui/label"
import { Skeleton }     from "@/components/ui/skeleton"
import { Switch }       from "@/components/ui/switch"
import { ScrollArea }   from "@/components/ui/scroll-area"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast }   from "sonner"
import { cn }      from "@/lib/utils"
import type { AppUser } from "@/app/api/users/route"
import { APP_REGISTRY } from "@/lib/apps-registry"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })
}

/* ── Kullanıcı Sheet ── */
type AppRole = "admin" | "user"
type Level   = "none" | "read" | "write"
interface AppGrant { id: string; role: AppRole }
interface ModuleDef { key: string; label: string; group: "general" | "services" | "data" | "admin" | "dev" }

const GROUP_LABELS: Record<ModuleDef["group"], string> = {
  general:  "Genel",
  services: "Servisler",
  data:     "Veri & Raporlar",
  admin:    "Yönetim",
  dev:      "Geliştirici",
}

const APP_ROLE_HINT: Record<AppRole, string> = {
  admin: "Uygulamadaki tüm sayfalara erişir",
  user:  "Alttan seçtiğin sayfalara erişir",
}

type FieldHintState = "idle" | "checking" | "ok" | "taken" | "invalid"
function FieldHint({ state, kind }: { state: FieldHintState; kind: "username" | "email" }) {
  if (state === "idle") return null
  const map: Record<Exclude<FieldHintState, "idle">, { text: string; cls: string }> = {
    checking: { text: "Kontrol ediliyor…",                                              cls: "text-muted-foreground" },
    ok:       { text: "Uygun",                                                          cls: "text-emerald-600" },
    taken:    { text: kind === "username" ? "Bu kullanıcı adı zaten kullanılıyor" : "Bu e-posta zaten kayıtlı", cls: "text-destructive" },
    invalid:  { text: kind === "username" ? "3-32 karakter, harf/rakam/._- olabilir"  : "Geçerli bir e-posta girin", cls: "text-amber-600" },
  }
  return <span className={cn("text-[10px]", map[state].cls)}>{map[state].text}</span>
}

/** Karışık-karakter 14 haneli şifre — benzer görünen karakterler (0/O, 1/l/I) hariç tutuldu. */
function generatePassword(): string {
  const lower = "abcdefghijkmnpqrstuvwxyz"
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const digit = "23456789"
  const sym   = "!@#$%&*?-_"
  const all   = lower + upper + digit + sym
  const rand  = (s: string) => s[Math.floor(Math.random() * s.length)]
  // Her karakter sınıfından en az 1 garanti
  const base  = [rand(lower), rand(upper), rand(digit), rand(sym)]
  for (let i = 0; i < 10; i++) base.push(rand(all))
  // Fisher-Yates shuffle
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[base[i], base[j]] = [base[j], base[i]]
  }
  return base.join("")
}

function UserSheet({ open, user, onClose, onSaved }: {
  open: boolean; user: AppUser | null
  onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!user
  const [username,    setUsername]    = useState("")
  const [email,       setEmail]       = useState("")
  const [fullName,    setFullName]    = useState("")
  const [role,        setRole]        = useState("user")
  const [password,    setPassword]    = useState("")
  const [allowedApps, setAllowedApps] = useState<AppGrant[]>([])
  const [saving,      setSaving]      = useState(false)
  const [showPwd,     setShowPwd]     = useState(false)

  // Anlık unique kontrolü (debounced)
  type FieldState = "idle" | "checking" | "ok" | "taken" | "invalid"
  const [usernameState, setUsernameState] = useState<FieldState>("idle")
  const [emailState,    setEmailState]    = useState<FieldState>("idle")

  // Sayfa izinleri — app başına lazy-load + genişletme
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())
  const [modulesByApp, setModulesByApp] = useState<Record<string, ModuleDef[]>>({})
  const [permsByApp,   setPermsByApp]   = useState<Record<string, Record<string, Level>>>({})
  const [loadedApps,   setLoadedApps]   = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setShowPwd(false)
    setUsernameState("idle"); setEmailState("idle")
    setExpanded(new Set()); setModulesByApp({}); setPermsByApp({}); setLoadedApps(new Set())
    if (user) {
      setUsername(user.username); setEmail(user.email ?? "")
      setFullName(user.fullName ?? ""); setRole(user.role); setPassword("")
      const raw = user.allowedApps ?? []
      setAllowedApps(raw.map((x) => {
        if (typeof x === "string") return { id: x, role: "user" as AppRole }
        // Artık per-app "viewer" desteklenmiyor → "user"'a düşür
        const r: AppRole = x.role === "admin" ? "admin" : "user"
        return { id: x.id, role: r }
      }))
    } else {
      setUsername(""); setEmail(""); setFullName(""); setRole("user"); setPassword("")
      setAllowedApps([])
    }
  }, [open, user])

  // Username uniqueness — debounced, sadece yeni kullanıcıda (edit'te username salt-okunur)
  useEffect(() => {
    if (!open || isEdit) return
    const v = username.trim()
    if (!v) { setUsernameState("idle"); return }
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(v)) { setUsernameState("invalid"); return }
    setUsernameState("checking")
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/users/check?username=${encodeURIComponent(v)}`)
        const d = await r.json()
        setUsernameState(d.taken ? "taken" : "ok")
      } catch { setUsernameState("idle") }
    }, 400)
    return () => clearTimeout(t)
  }, [username, open, isEdit])

  // Email uniqueness — boş kabul edilmiyor, ayrıca format + DB kontrolü
  useEffect(() => {
    if (!open) return
    const v = email.trim()
    if (!v) { setEmailState("idle"); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setEmailState("invalid"); return }
    setEmailState("checking")
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ email: v })
        if (isEdit && user?.id) qs.set("exceptId", user.id)
        const r = await fetch(`/api/users/check?${qs.toString()}`)
        const d = await r.json()
        setEmailState(d.taken ? "taken" : "ok")
      } catch { setEmailState("idle") }
    }, 400)
    return () => clearTimeout(t)
  }, [email, open, isEdit, user?.id])

  const grantFor = (id: string) => allowedApps.find((g) => g.id === id)
  const hasApp   = (id: string) => !!grantFor(id)
  const roleFor  = (id: string): AppRole => grantFor(id)?.role ?? "user"

  function toggleApp(id: string) {
    const turningOn = !hasApp(id)
    setAllowedApps((cur) =>
      cur.some((g) => g.id === id)
        ? cur.filter((g) => g.id !== id)
        : [...cur, { id, role: "user" }],
    )
    setExpanded((s) => {
      const n = new Set(s)
      if (turningOn) { n.add(id); loadAppPerms(id) }
      else            { n.delete(id) }
      return n
    })
  }

  function setAppRole(id: string, r: AppRole) {
    setAllowedApps((cur) => cur.map((g) => (g.id === id ? { ...g, role: r } : g)))
  }

  async function loadAppPerms(appId: string): Promise<{ mods: ModuleDef[]; perms: Record<string, Level> }> {
    if (loadedApps.has(appId)) {
      return { mods: modulesByApp[appId] ?? [], perms: permsByApp[appId] ?? {} }
    }
    try {
      const modsP = fetch(`/api/permissions/modules?appId=${appId}`).then((r) => r.json())
      const dataP = user?.id
        ? fetch(`/api/users/${user.id}/permissions?appId=${appId}`).then((r) => r.json())
        : Promise.resolve({ permissions: [] })
      const [mods, data] = await Promise.all([modsP, dataP]) as [ModuleDef[], { permissions: Array<{ moduleKey: string; level: Level }> }]
      const m: Record<string, Level> = {}
      for (const p of data.permissions ?? []) m[p.moduleKey] = p.level
      setModulesByApp((s) => ({ ...s, [appId]: mods }))
      setPermsByApp((s) => ({ ...s, [appId]: m }))
      setLoadedApps((s) => new Set(s).add(appId))
      return { mods, perms: m }
    } catch {
      toast.error("Modül izinleri yüklenemedi")
      return { mods: [], perms: {} }
    }
  }

  function toggleExpand(appId: string) {
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(appId)) n.delete(appId)
      else { n.add(appId); loadAppPerms(appId) }
      return n
    })
  }

  function setLevel(appId: string, moduleKey: string, lvl: Level) {
    setPermsByApp((s) => ({ ...s, [appId]: { ...(s[appId] ?? {}), [moduleKey]: lvl } }))
  }

  function setAllLevels(appId: string, lvl: Level) {
    const mods = modulesByApp[appId] ?? []
    const next: Record<string, Level> = {}
    for (const m of mods) next[m.key] = lvl
    setPermsByApp((s) => ({ ...s, [appId]: next }))
  }

  async function handleSave() {
    if (!isEdit && !username.trim())    { toast.error("Kullanıcı adı gerekli"); return }
    if (!isEdit && usernameState === "invalid") { toast.error("Kullanıcı adı formatı geçersiz"); return }
    if (!isEdit && usernameState === "taken")   { toast.error("Bu kullanıcı adı zaten kullanılıyor"); return }
    if (!email.trim())                   { toast.error("E-posta zorunlu"); return }
    if (emailState === "invalid")        { toast.error("Geçerli bir e-posta girin"); return }
    if (emailState === "taken")          { toast.error("Bu e-posta zaten kayıtlı"); return }
    if (!isEdit && !password)            { toast.error("Şifre gerekli"); return }
    if (!isEdit && password.length < 6)  { toast.error("Şifre en az 6 karakter olmalı"); return }
    if (isEdit && password && password.length < 6) { toast.error("Yeni şifre en az 6 karakter olmalı"); return }

    // Global rol admin değilse: "Kullanıcı" rolündeki her app için en az 1 izin zorunlu
    if (role !== "admin") {
      for (const g of allowedApps) {
        if (g.role !== "user") continue
        const { mods, perms } = await loadAppPerms(g.id)
        if (mods.length === 0) continue // katalog yoksa zorunlu tutma
        const hasAny = Object.values(perms).some((v) => v && v !== "none")
        if (!hasAny) {
          const appName = APP_REGISTRY.find((a) => a.id === g.id)?.name ?? g.id
          setExpanded((s) => new Set(s).add(g.id))
          toast.error(`${appName} için en az bir sayfa izni seçmelisin`, {
            description: "Admin yap ya da aşağıdan sayfa seç.",
          })
          return
        }
      }
    }

    setSaving(true)
    try {
      const url    = isEdit ? `/api/users/${user!.id}` : "/api/users"
      const method = isEdit ? "PATCH" : "POST"
      const body   = isEdit
        ? { email: email || null, fullName: fullName || null, role, allowedApps, ...(password ? { password } : {}) }
        : { username: username.trim(), email: email || null, fullName: fullName || null, role, password, allowedApps }

      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? "Hata"); return }

      // Yeni kullanıcıysa id response'tan gelir; edit'teyse zaten biliyoruz
      const userId: string | undefined = isEdit ? user!.id : d?.id

      // Sayfa izinleri: sadece genişletilip yüklenmiş, non-admin rolündeki app'ler için PUT
      if (userId) {
        for (const appId of loadedApps) {
          if (roleFor(appId) === "admin") continue
          if (!hasApp(appId)) continue
          const mods = modulesByApp[appId] ?? []
          const pmap = permsByApp[appId] ?? {}
          const payload = mods.map((m) => ({ moduleKey: m.key, level: pmap[m.key] ?? "none" }))
          await fetch(`/api/users/${userId}/permissions`, {
            method:  "PUT",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ appId, permissions: payload }),
          })
        }
      }

      toast.success(isEdit ? "Kullanıcı güncellendi" : "Kullanıcı oluşturuldu")
      onSaved(); onClose()
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="!w-[560px] !max-w-[560px] p-0 flex flex-col gap-0">
        <SheetHeader className="px-5 py-4 border-b border-border/50">
          <SheetTitle className="text-sm">{isEdit ? "Kullanıcıyı Düzenle" : "Yeni Kullanıcı"}</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-4 space-y-3">

            {/* ── Hesap Bilgileri ─────────────────────────────────────── */}
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="px-3 py-1.5 bg-muted/30 border-b border-border/40">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Hesap Bilgileri
                </span>
              </div>
              <div className="p-3 space-y-2.5">
                {!isEdit && (
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Kullanıcı Adı <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="kullaniciadi"
                      className={cn(
                        "h-8 text-[12px] rounded-[5px] font-mono",
                        usernameState === "taken"   && "border-destructive focus-visible:ring-destructive/30",
                        usernameState === "invalid" && "border-amber-400 focus-visible:ring-amber-300",
                        usernameState === "ok"      && "border-emerald-500/60",
                      )}
                    />
                    <FieldHint state={usernameState} kind="username" />
                  </div>
                )}
                {isEdit && (
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Kullanıcı Adı
                    </Label>
                    <Input value={username} disabled className="h-8 text-[12px] rounded-[5px] font-mono bg-muted/30" />
                    <span className="text-[10px] text-muted-foreground">Kullanıcı adı değiştirilemez</span>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Ad Soyad</Label>
                  <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Ad Soyad" className="h-8 text-[12px] rounded-[5px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    E-posta <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="kullanici@sirket.com"
                    className={cn(
                      "h-8 text-[12px] rounded-[5px]",
                      emailState === "taken"   && "border-destructive focus-visible:ring-destructive/30",
                      emailState === "invalid" && "border-amber-400 focus-visible:ring-amber-300",
                      emailState === "ok"      && "border-emerald-500/60",
                    )}
                  />
                  <FieldHint state={emailState} kind="email" />
                </div>
              </div>
            </div>

            {/* ── Güvenlik ─────────────────────────────────────────────── */}
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="px-3 py-1.5 bg-muted/30 border-b border-border/40">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Güvenlik
                </span>
              </div>
              <div className="p-3 space-y-1">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                {isEdit ? "Yeni Şifre (değiştirmek için doldur)" : "Şifre *"}
              </Label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Input
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={isEdit ? "Değiştirmek için girin" : "En az 6 karakter"}
                    className="h-8 text-[12px] rounded-[5px] pr-8 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted/60 text-muted-foreground"
                    aria-label={showPwd ? "Şifreyi gizle" : "Şifreyi göster"}
                    tabIndex={-1}
                  >
                    {showPwd ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const p = generatePassword()
                    setPassword(p)
                    setShowPwd(true)
                    try { navigator.clipboard.writeText(p); toast.success("Şifre üretildi ve panoya kopyalandı") }
                    catch { toast.success("Şifre üretildi") }
                  }}
                  className="h-8 px-2 rounded-[5px] border border-border/60 bg-muted/30 hover:bg-muted/60 text-[11px] flex items-center gap-1.5 text-muted-foreground"
                  title="Güçlü şifre üret + panoya kopyala"
                >
                  <Sparkles className="size-3.5" />
                  Üret
                </button>
                {password && (
                  <button
                    type="button"
                    onClick={() => {
                      try { navigator.clipboard.writeText(password); toast.success("Panoya kopyalandı") }
                      catch { toast.error("Kopyalanamadı") }
                    }}
                    className="h-8 w-8 rounded-[5px] border border-border/60 bg-muted/30 hover:bg-muted/60 text-muted-foreground flex items-center justify-center"
                    title="Şifreyi kopyala"
                  >
                    <Copy className="size-3.5" />
                  </button>
                )}
              </div>
              </div>
            </div>

            {/* ── Yetki ─────────────────────────────────────────────── */}
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="px-3 py-1.5 bg-muted/30 border-b border-border/40">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Yetki
                </span>
              </div>
              <div className="p-3 flex items-start gap-3">
                <ShieldCheck className={cn("size-4 mt-[1px] shrink-0", role === "admin" ? "text-amber-600" : "text-muted-foreground")} />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium">Süper Admin</div>
                  <div className="text-[10px] text-muted-foreground leading-snug">
                    Tüm uygulamalara ve kullanıcı yönetim paneline sınırsız erişim verir.
                  </div>
                </div>
                <Switch
                  checked={role === "admin"}
                  onCheckedChange={(v) => setRole(v ? "admin" : "user")}
                  aria-label="Süper Admin"
                />
              </div>
            </div>

            {/* ── Uygulama Erişimi ───────────────────────────────────── */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1">Uygulama Erişimi</Label>
              {role === "admin" ? (
                <div className="text-[11px] text-muted-foreground rounded-[5px] border border-dashed border-border/60 px-3 py-2">
                  Süper Admin tüm uygulamalara ve tüm sayfalara otomatik erişir.
                </div>
              ) : (
                <div className="rounded-[5px] border border-border/50 divide-y divide-border/40 overflow-hidden">
                  {APP_REGISTRY.map((app) => {
                    const on       = hasApp(app.id)
                    const appRole  = roleFor(app.id)
                    const isOpen   = expanded.has(app.id)
                    const loaded   = loadedApps.has(app.id)
                    const mods     = modulesByApp[app.id] ?? []
                    const pmap     = permsByApp[app.id]   ?? {}
                    const grouped: Record<string, ModuleDef[]> = {}
                    for (const m of mods) { (grouped[m.group] ??= []).push(m) }

                    return (
                      <div key={app.id}>
                        {/* App satırı */}
                        <div className="px-3 py-2 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => on && toggleExpand(app.id)}
                            disabled={!on}
                            className={cn(
                              "size-5 flex items-center justify-center rounded-[4px] text-muted-foreground shrink-0",
                              on ? "hover:bg-muted/60 cursor-pointer" : "opacity-30 cursor-not-allowed",
                            )}
                            aria-label="Sayfa izinlerini aç/kapat"
                          >
                            {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                          </button>

                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-[12px] font-medium truncate">{app.name}</span>
                            <span className="text-[10px] text-muted-foreground truncate">
                              {on ? APP_ROLE_HINT[appRole] : app.description}
                            </span>
                          </div>

                          {on && (
                            <Select value={appRole} onValueChange={(v) => setAppRole(app.id, v as AppRole)}>
                              <SelectTrigger className="h-7 text-[11px] rounded-[4px] w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin" className="text-[11px]">Admin</SelectItem>
                                <SelectItem value="user"  className="text-[11px]">Kullanıcı</SelectItem>
                              </SelectContent>
                            </Select>
                          )}

                          <Switch
                            checked={on}
                            onCheckedChange={() => toggleApp(app.id)}
                            aria-label={`${app.name} erişimi`}
                          />
                        </div>

                        {/* "Kullanıcı" rolü + 0 izin → /no-access uyarısı */}
                        {on && appRole === "user" && loaded && mods.length > 0 &&
                          Object.values(pmap).every((v) => !v || v === "none") && (
                          <div className="px-3 pb-2 -mt-1 flex items-start gap-2">
                            <AlertTriangle className="size-3.5 text-amber-600 mt-[1px] shrink-0" />
                            <span className="text-[10px] text-amber-700">
                              Hiçbir sayfa seçili değil — kullanıcı bu uygulamanın hiçbir sayfasına giremez.
                            </span>
                          </div>
                        )}

                        {/* Sayfa izinleri — genişletilmişse */}
                        {on && isOpen && (
                          <div className="px-3 pb-3 pt-0 bg-muted/10 border-t border-border/40">
                            {appRole === "admin" ? (
                              <div className="mt-2 rounded-[5px] border border-amber-200 bg-amber-50/60 px-3 py-2 flex items-start gap-2">
                                <ShieldCheck className="size-3.5 text-amber-700 mt-[1px] shrink-0" />
                                <div className="text-[11px] text-amber-800">
                                  Bu uygulamadaki Admin rolü tüm modüllere otomatik yazma yetkisi verir.
                                </div>
                              </div>
                            ) : !loaded ? (
                              <div className="mt-2 space-y-1.5">
                                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-full rounded-[4px]" />)}
                              </div>
                            ) : mods.length === 0 ? (
                              <div className="mt-2 text-[11px] text-muted-foreground italic">
                                Bu uygulama henüz modül kataloğunu bildirmemiş.
                              </div>
                            ) : (
                              <div className="mt-2 space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-1">Toplu:</span>
                                  <button type="button" onClick={() => setAllLevels(app.id, "write")}
                                    className="text-[10px] font-medium px-2 py-0.5 rounded-[4px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                                    Tümünü Aç
                                  </button>
                                  <button type="button" onClick={() => setAllLevels(app.id, "none")}
                                    className="text-[10px] font-medium px-2 py-0.5 rounded-[4px] bg-muted/60 text-muted-foreground hover:bg-muted">
                                    Temizle
                                  </button>
                                </div>
                                {(["general", "services", "data", "admin", "dev"] as const).map((g) => (
                                  grouped[g]?.length ? (
                                    <div key={g} className="rounded-[5px] border border-border/50 overflow-hidden bg-white">
                                      <div className="px-3 py-1 bg-muted/30 border-b border-border/40">
                                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                          {GROUP_LABELS[g]}
                                        </span>
                                      </div>
                                      <div className="divide-y divide-border/40">
                                        {grouped[g].map((m) => {
                                          const lvl = pmap[m.key] ?? "none"
                                          const onM = lvl !== "none"
                                          return (
                                            <div key={m.key} className="px-3 py-1.5 flex items-center justify-between gap-3">
                                              <span className="text-[11px]">{m.label}</span>
                                              <Switch
                                                checked={onM}
                                                onCheckedChange={(v) => setLevel(app.id, m.key, v ? "write" : "none")}
                                                aria-label={`${m.label} erişimi`}
                                              />
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  ) : null
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="px-5 py-3 border-t border-border/50 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} className="h-8 text-[12px] rounded-[5px]">İptal</Button>
          <Button onClick={handleSave} disabled={saving} className="h-8 text-[12px] rounded-[5px]">
            {saving ? "Kaydediliyor..." : isEdit ? "Güncelle" : "Oluştur"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ── Ana Sayfa ── */
export default function UsersPage() {
  const { data: session } = useSession()
  const router            = useRouter()
  const [users,      setUsers]      = useState<AppUser[]>([])
  const [loading,    setLoading]    = useState(true)
  const [sheetOpen,  setSheetOpen]  = useState(false)
  const [editUser,   setEditUser]   = useState<AppUser | null>(null)
  const [deleteUser, setDeleteUser] = useState<AppUser | null>(null)

  useEffect(() => {
    if (session === undefined) return
    if (session?.user?.role !== "admin") { router.replace("/dashboard"); return }
    load()
  }, [session])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch("/api/users")
      if (r.ok) setUsers(await r.json())
    } finally { setLoading(false) }
  }

  async function reset2FA(user: AppUser) {
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset2FA: true }),
    })
    toast.success(`${user.fullName ?? user.username} için 2FA sıfırlandı`)
    load()
  }

  async function toggleActive(user: AppUser) {
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    })
    toast.success(user.isActive ? "Kullanıcı devre dışı bırakıldı" : "Kullanıcı etkinleştirildi")
    load()
  }

  async function handleDelete() {
    if (!deleteUser) return
    const r = await fetch(`/api/users/${deleteUser.id}`, { method: "DELETE" })
    const d = await r.json()
    if (!r.ok) { toast.error(d.error ?? "Silinemedi"); return }
    toast.success("Kullanıcı silindi")
    setDeleteUser(null); load()
  }

  const roleLabel = (r: string) => r === "admin" ? "Süper Admin" : "Kullanıcı"
  const roleBadge = (r: string) =>
    r === "admin" ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-blue-50 text-blue-700 border-blue-200"

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="rounded-[8px] p-2" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="bg-white rounded-[4px] px-4 py-3 flex items-center justify-between" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
          <div>
            <h1 className="text-[13px] font-semibold">Kullanıcı Yönetimi</h1>
            <p className="text-[11px] text-muted-foreground">{users.length} kullanıcı</p>
          </div>
          <Button onClick={() => { setEditUser(null); setSheetOpen(true) }} className="h-8 text-[12px] rounded-[5px] gap-1.5">
            <Plus className="size-3.5" />Yeni Kullanıcı
          </Button>
        </div>
      </div>

      {/* Tablo */}
      <div className="rounded-[8px] p-2" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="bg-white rounded-[4px] overflow-hidden" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 border-b border-border/40">
                <TableHead className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide h-8">Kullanıcı</TableHead>
                <TableHead className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide h-8">E-posta</TableHead>
                <TableHead className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide h-8">Rol</TableHead>
                <TableHead className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide h-8">Durum</TableHead>
                <TableHead className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide h-8">2FA</TableHead>
                <TableHead className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide h-8">Uygulamalar</TableHead>
                <TableHead className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide h-8">Oluşturuldu</TableHead>
                <TableHead className="h-8 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border/40">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-3 w-full rounded-[3px]" /></TableCell>
                    ))}
                    <TableCell />
                  </TableRow>
                ))
              ) : users.map(u => {
                const isSelf = session?.user?.id === u.id
                return (
                  <TableRow key={u.id} className="hover:bg-muted/20 transition-colors">
                    <TableCell className="text-[11px] py-2.5">
                      <div>
                        <p className="font-medium">{u.fullName ?? u.username}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">@{u.username}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{u.email ?? "—"}</TableCell>
                    <TableCell>
                      <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-[5px] border", roleBadge(u.role))}>
                        {roleLabel(u.role)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-[5px] border",
                        u.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200")}>
                        {u.isActive ? "Aktif" : "Pasif"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {u.twoFactorEnabled ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-[5px] border bg-green-50 text-green-700 border-green-200 w-fit">
                          <ShieldCheck className="size-3" />Aktif
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-[5px] border border-border/40 bg-muted/20">
                          Pasif
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.role === "admin" ? (
                        <span className="text-[10px] text-muted-foreground italic">Tümü</span>
                      ) : u.allowedApps.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.allowedApps.map((g) => {
                            const id   = typeof g === "string" ? g : g.id
                            const role = typeof g === "string" ? null : g.role
                            const app  = APP_REGISTRY.find((a) => a.id === id)
                            return (
                              <span key={id} className="text-[10px] font-medium px-1.5 py-0.5 rounded-[4px] border bg-muted/30 border-border/40">
                                {app?.name ?? id}
                                {role ? <span className="ml-1 text-muted-foreground">· {role}</span> : null}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 rounded hover:bg-muted/60 text-muted-foreground transition-colors">
                            <MoreVertical className="size-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-[12px] w-44">
                          <DropdownMenuItem onClick={() => { setEditUser(u); setSheetOpen(true) }} className="gap-2">
                            <Pencil className="size-3.5" />Düzenle
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleActive(u)} disabled={isSelf} className="gap-2">
                            {u.isActive ? <ToggleLeft className="size-3.5" /> : <ToggleRight className="size-3.5" />}
                            {u.isActive ? "Devre Dışı Bırak" : "Etkinleştir"}
                          </DropdownMenuItem>
                          {u.twoFactorEnabled && (
                            <DropdownMenuItem onClick={() => reset2FA(u)} className="gap-2 text-amber-600 focus:text-amber-600">
                              <ShieldOff className="size-3.5" />2FA Sıfırla
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDeleteUser(u)} disabled={isSelf}
                            className="gap-2 text-destructive focus:text-destructive">
                            <Trash2 className="size-3.5" />Sil
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <div className="px-4 py-2 border-t border-border/40 flex items-center gap-1.5 text-muted-foreground">
            <User className="size-3" />
            <span className="text-[10px]">{users.length} kullanıcı listeleniyor</span>
          </div>
        </div>
      </div>

      <UserSheet open={sheetOpen} user={editUser} onClose={() => setSheetOpen(false)} onSaved={load} />

      <AlertDialog open={!!deleteUser} onOpenChange={v => !v && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Kullanıcıyı Sil</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px]">
              <strong>{deleteUser?.fullName ?? deleteUser?.username}</strong> kullanıcısı kalıcı olarak silinecek.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[12px] h-8">İptal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="text-[12px] h-8 bg-destructive text-white hover:bg-destructive/90">Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
