"use client"

import { useState, useEffect } from "react"
import { useSession }          from "next-auth/react"
import { useRouter }           from "next/navigation"
import {
  Plus, Pencil, Trash2, User, MoreVertical,
  ToggleLeft, ToggleRight, ShieldCheck, ShieldOff, Shield,
} from "lucide-react"
import { PermissionsSheet } from "@/components/users/permissions-sheet"
import { Button }       from "@/components/ui/button"
import { Input }        from "@/components/ui/input"
import { Label }        from "@/components/ui/label"
import { Skeleton }     from "@/components/ui/skeleton"
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
import { Checkbox } from "@/components/ui/checkbox"
import { toast }   from "sonner"
import { cn }      from "@/lib/utils"
import type { AppUser } from "@/app/api/users/route"
import { APP_REGISTRY } from "@/lib/apps-registry"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })
}

/* ── Kullanıcı Sheet ── */
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
  const [allowedApps, setAllowedApps] = useState<Array<{ id: string; role: "admin" | "user" | "viewer" }>>([])
  const [saving,      setSaving]      = useState(false)

  useEffect(() => {
    if (!open) return
    if (user) {
      setUsername(user.username); setEmail(user.email ?? "")
      setFullName(user.fullName ?? ""); setRole(user.role); setPassword("")
      // Eski string[] formatini da tolere et
      const raw = user.allowedApps ?? []
      setAllowedApps(raw.map((x) =>
        typeof x === "string" ? { id: x, role: "user" as const } : x,
      ))
    } else {
      setUsername(""); setEmail(""); setFullName(""); setRole("user"); setPassword("")
      setAllowedApps([])
    }
  }, [open, user])

  function toggleApp(id: string) {
    setAllowedApps((cur) =>
      cur.some((g) => g.id === id)
        ? cur.filter((g) => g.id !== id)
        : [...cur, { id, role: "user" }],
    )
  }
  const hasApp = (id: string) => allowedApps.some((g) => g.id === id)

  async function handleSave() {
    if (!isEdit && !username.trim()) { toast.error("Kullanıcı adı gerekli"); return }
    if (!isEdit && !password)        { toast.error("Şifre gerekli"); return }
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
      toast.success(isEdit ? "Kullanıcı güncellendi" : "Kullanıcı oluşturuldu")
      onSaved(); onClose()
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="!w-[440px] !max-w-[440px] p-0 flex flex-col gap-0">
        <SheetHeader className="px-5 py-4 border-b border-border/50">
          <SheetTitle className="text-sm">{isEdit ? "Kullanıcıyı Düzenle" : "Yeni Kullanıcı"}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 px-5 py-4 space-y-3 overflow-y-auto">
          {!isEdit && (
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Kullanıcı Adı *</Label>
              <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="kullaniciadi" className="h-8 text-[12px] rounded-[5px]" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Ad Soyad</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Ad Soyad" className="h-8 text-[12px] rounded-[5px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">E-posta</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="kullanici@sirket.com" className="h-8 text-[12px] rounded-[5px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Rol</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-8 text-[12px] rounded-[5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin"  className="text-[12px]">Admin — Tam yetki</SelectItem>
                <SelectItem value="user"   className="text-[12px]">Kullanıcı — Standart erişim</SelectItem>
                <SelectItem value="viewer" className="text-[12px]">İzleyici — Sadece okuma</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              {isEdit ? "Yeni Şifre (değiştirmek için doldur)" : "Şifre *"}
            </Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={isEdit ? "Değiştirmek için girin" : "En az 6 karakter"} className="h-8 text-[12px] rounded-[5px]" />
          </div>

          {/* Uygulama Erişimi */}
          <div className="space-y-1.5 pt-2">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Uygulama Erişimi</Label>
            {role === "admin" ? (
              <div className="text-[11px] text-muted-foreground rounded-[5px] border border-dashed border-border/60 px-3 py-2">
                Admin rolü tüm uygulamalara otomatik erişir.
              </div>
            ) : (
              <div className="rounded-[5px] border border-border/50 divide-y divide-border/40">
                {APP_REGISTRY.map((app) => (
                  <label key={app.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/20">
                    <Checkbox
                      checked={hasApp(app.id)}
                      onCheckedChange={() => toggleApp(app.id)}
                    />
                    <span className="text-[12px]">{app.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono ml-auto">{app.id}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border/50 flex gap-2">
          <Button onClick={handleSave} disabled={saving} className="h-8 text-[12px] rounded-[5px] flex-1">
            {saving ? "Kaydediliyor..." : isEdit ? "Güncelle" : "Oluştur"}
          </Button>
          <Button variant="outline" onClick={onClose} className="h-8 text-[12px] rounded-[5px]">İptal</Button>
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
  const [permsUser,  setPermsUser]  = useState<AppUser | null>(null)

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

  const roleLabel = (r: string) => r === "admin" ? "Admin" : r === "viewer" ? "İzleyici" : "Kullanıcı"
  const roleBadge = (r: string) =>
    r === "admin"  ? "bg-red-50 text-red-700 border-red-200" :
    r === "viewer" ? "bg-gray-50 text-gray-600 border-gray-200" :
                     "bg-blue-50 text-blue-700 border-blue-200"

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
                          <DropdownMenuItem onClick={() => setPermsUser(u)} className="gap-2">
                            <Shield className="size-3.5" />İzinler
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

      <PermissionsSheet
        userId={permsUser?.id ?? null}
        userName={permsUser?.fullName ?? permsUser?.username ?? ""}
        initialAllowedApps={permsUser?.allowedApps ?? []}
        open={!!permsUser}
        onClose={() => setPermsUser(null)}
        onSaved={load}
      />

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
