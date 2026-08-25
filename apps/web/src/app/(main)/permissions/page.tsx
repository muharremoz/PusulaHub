"use client"

/**
 * Yetkiler — kullanıcıların Hub (ve diğer uygulama) modül izinleri.
 *
 * Kullanıcı OLUŞTURMA/silme burada YOK: kimlik ve uygulama erişimi Pusula
 * CRM'den yönetiliyor (docs/YENI-SISTEM.md). Bu sayfa yalnız
 * `user_permissions` düzenler — CRM'de Hub izinlerini yöneten bir ekran yok,
 * her uygulama kendi yetkilendirmesini kendi içinden yapıyor.
 *
 * Görsel dil CRM'in "Sayfa Yetkileri" ekranından: sayaç + toplu aksiyon
 * şeridi, ayraçlı satır listesi. Fark: CRM'de yetki açık/kapalı, Hub'da üç
 * seviyeli (Yok / Okuma / Yazma), o yüzden Switch yerine segment kontrol.
 */

import { useState, useEffect, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { APP_REGISTRY } from "@/lib/apps-registry"
import type { AppUser } from "@/app/api/users/route"
import { ListeKarti, ListeThead, ListeBosSatir } from "@/components/shared/liste-karti"
import { MetinFiltre, SecimFiltre } from "@/components/shared/liste-filtreleri"

type Level = "none" | "read" | "write"
interface ModuleDef { key: string; label: string; group: string }

const SEVIYELER: { value: Level; label: string }[] = [
  { value: "none",  label: "Yok" },
  { value: "read",  label: "Okuma" },
  { value: "write", label: "Yazma" },
]

const roleLabel = (r: string) => (r === "admin" ? "Süper Admin" : "Kullanıcı")

export default function PermissionsPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [users,   setUsers]   = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AppUser | null>(null)

  /* Sütun başlığı filtreleri */
  const [adFiltre,    setAdFiltre]    = useState("")
  const [emailFiltre, setEmailFiltre] = useState("")
  const [rolFiltre,   setRolFiltre]   = useState<string[]>([])

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
    } catch {
      toast.error("Kullanıcılar yüklenemedi")
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const ad = adFiltre.trim().toLocaleLowerCase("tr-TR")
    const em = emailFiltre.trim().toLocaleLowerCase("tr-TR")
    return users.filter((u) => {
      const isim = (u.fullName ?? u.username).toLocaleLowerCase("tr-TR")
      if (ad && !isim.includes(ad) && !u.username.toLocaleLowerCase("tr-TR").includes(ad)) return false
      if (em && !(u.email ?? "").toLocaleLowerCase("tr-TR").includes(em)) return false
      if (rolFiltre.length && !rolFiltre.includes(u.role)) return false
      return true
    })
  }, [users, adFiltre, emailFiltre, rolFiltre])

  return (
    <div className="p-4">
      <ListeKarti
        className="min-h-0 flex-1"
        baslik="Yetkiler"
        ikon={<ShieldCheck className="size-3.5" />}
        toplam={users.length}
        filtreli={filtered.length}
      >
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-[14px] font-medium leading-[20px]">
            <ListeThead>
              <th className="px-4 py-1.5 text-left font-medium">
                <MetinFiltre label="Kullanıcı" value={adFiltre} onChange={setAdFiltre} />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">
                <MetinFiltre label="E-posta" value={emailFiltre} onChange={setEmailFiltre} />
              </th>
              <th className="w-px px-4 py-1.5 text-left font-medium whitespace-nowrap">
                <SecimFiltre
                  label="Rol"
                  options={["admin", "user"] as const}
                  getLabel={(o) => roleLabel(o)}
                  selected={rolFiltre}
                  onChange={(v) => setRolFiltre(v as string[])}
                />
              </th>
              <th className="w-px px-4 py-1.5 text-right font-medium whitespace-nowrap">İşlem</th>
            </ListeThead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 3 }).map((_, j) => (
                      <td key={j} className="px-4 py-1.5"><Skeleton className="h-3 w-full rounded-[5px]" /></td>
                    ))}
                    <td />
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <ListeBosSatir sutunSayisi={4} toplam={users.length} bosMesaj="Henüz kullanıcı yok." />
              ) : filtered.map((u) => (
                <tr key={u.id} className="hover:bg-muted/70 transition-colors">
                  <td className="px-4 py-1.5 whitespace-nowrap text-[12px]">
                    <span className="font-medium">{u.fullName ?? u.username}</span>
                    <span className="text-muted-foreground ml-1.5 font-mono">@{u.username}</span>
                  </td>
                  <td className="text-muted-foreground px-4 py-1.5 whitespace-nowrap text-[12px]">{u.email ?? "—"}</td>
                  <td className="px-4 py-1.5 whitespace-nowrap">
                    <span className={cn(
                      "inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium",
                      u.role === "admin"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : "bg-blue-500/15 text-blue-700 dark:text-blue-400",
                    )}>
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-right whitespace-nowrap">
                    {u.role === "admin" ? (
                      <span className="text-muted-foreground text-[11px] italic">Tüm yetkiler</span>
                    ) : (
                      <button
                        onClick={() => setEditing(u)}
                        className="border-border/60 hover:bg-muted/40 text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1 text-[12px] font-medium transition-colors"
                      >
                        <ShieldCheck className="size-3.5" />
                        Yetkileri Düzenle
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListeKarti>

      <YetkiSheet user={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Yetki düzenleme — uygulama başına modül listesi
   ══════════════════════════════════════════════════════════════ */

function YetkiSheet({ user, onClose }: { user: AppUser | null; onClose: () => void }) {
  const [appId,   setAppId]   = useState<string>("hub")
  const [mods,    setMods]    = useState<ModuleDef[]>([])
  const [perms,   setPerms]   = useState<Record<string, Level>>({})
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)

  /** Kullanıcının erişebildiği uygulamalar — izin yalnız bunlar için anlamlı. */
  const apps = useMemo(() => {
    if (!user) return []
    const ids = (user.allowedApps ?? []).map((g) => (typeof g === "string" ? g : g.id))
    return APP_REGISTRY.filter((a) => ids.includes(a.id))
  }, [user])

  useEffect(() => {
    if (!user) return
    const ilk = apps[0]?.id ?? "hub"
    setAppId(ilk)
  }, [user, apps])

  useEffect(() => {
    if (!user || !appId) return
    let iptal = false
    setLoading(true)
    Promise.all([
      fetch(`/api/permissions/modules?appId=${appId}`).then((r) => r.json()),
      fetch(`/api/users/${user.id}/permissions?appId=${appId}`).then((r) => r.json()),
    ])
      .then(([m, d]: [ModuleDef[], { permissions?: { moduleKey: string; level: Level }[] }]) => {
        if (iptal) return
        const map: Record<string, Level> = {}
        for (const p of d.permissions ?? []) map[p.moduleKey] = p.level
        setMods(Array.isArray(m) ? m : [])
        setPerms(map)
      })
      .catch(() => { if (!iptal) toast.error("Modül izinleri yüklenemedi") })
      .finally(() => { if (!iptal) setLoading(false) })
    return () => { iptal = true }
  }, [user, appId])

  const aktifSayisi = mods.filter((m) => (perms[m.key] ?? "none") !== "none").length

  function hepsi(lvl: Level) {
    const next: Record<string, Level> = {}
    for (const m of mods) next[m.key] = lvl
    setPerms(next)
  }

  async function kaydet() {
    if (!user) return
    setSaving(true)
    try {
      const payload = mods.map((m) => ({ moduleKey: m.key, level: perms[m.key] ?? "none" }))
      const r = await fetch(`/api/users/${user.id}/permissions`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ appId, permissions: payload }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        toast.error("Yetkiler kaydedilemedi", { description: d?.error })
        return
      }
      toast.success("Yetkiler kaydedildi", { description: user.fullName ?? user.username })
      onClose()
    } catch {
      toast.error("Yetkiler kaydedilemedi")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={!!user} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="!w-[520px] !max-w-[520px]">
        <SheetHeader>
          <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
            <ShieldCheck className="size-4" />
          </span>
          <SheetTitle>Sayfa Yetkileri</SheetTitle>
          <SheetDescription>
            {user ? `${user.fullName ?? user.username} — erişebileceği modüller` : ""}
          </SheetDescription>
        </SheetHeader>

        {/* Uygulama seçimi — kullanıcı birden fazla uygulamaya erişiyorsa */}
        {apps.length > 1 && (
          <div className="border-border/60 flex items-center gap-1.5 border-b px-4 py-2">
            {apps.map((a) => (
              <button
                key={a.id}
                onClick={() => setAppId(a.id)}
                className={cn(
                  "rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-colors",
                  appId === a.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}

        {/* Sayaç + toplu aksiyon şeridi (CRM deseni) */}
        <div className="border-border/60 bg-muted/30 flex shrink-0 items-center justify-between border-b px-4 py-2">
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {aktifSayisi} / {mods.length} modül açık
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => hepsi("write")}
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-[5px] px-2 py-1 text-[11px] font-medium transition-colors"
            >
              Tümüne yazma
            </button>
            <button
              onClick={() => hepsi("read")}
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-[5px] px-2 py-1 text-[11px] font-medium transition-colors"
            >
              Tümüne okuma
            </button>
            <button
              onClick={() => hepsi("none")}
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-[5px] px-2 py-1 text-[11px] font-medium transition-colors"
            >
              Temizle
            </button>
          </div>
        </div>

        <div className="divide-border/60 min-h-0 flex-1 divide-y overflow-y-auto">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-[5px]" />)}
            </div>
          ) : mods.length === 0 ? (
            <p className="text-muted-foreground px-4 py-10 text-center text-[13px]">
              Bu uygulama için modül tanımı yok.
            </p>
          ) : mods.map((m) => {
            const lvl = perms[m.key] ?? "none"
            return (
              <div key={m.key} className="hover:bg-muted/30 flex items-center justify-between gap-3 px-4 py-2 transition-colors">
                <span className="text-foreground truncate text-[13px] font-medium">{m.label}</span>
                {/* CRM'de açık/kapalı Switch; Hub üç seviyeli olduğu için segment. */}
                <div className="border-border/60 flex shrink-0 items-center rounded-[5px] border p-0.5">
                  {SEVIYELER.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setPerms((p) => ({ ...p, [m.key]: s.value }))}
                      className={cn(
                        "rounded-[4px] px-2 py-0.5 text-[11px] font-medium transition-colors",
                        lvl === s.value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <SheetFooter className="flex-row">
          <Button variant="outline" className="flex-1 h-8 text-[12px]" onClick={onClose} disabled={saving}>
            İptal
          </Button>
          <Button className="flex-1 h-8 text-[12px]" onClick={kaydet} disabled={saving || loading}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
