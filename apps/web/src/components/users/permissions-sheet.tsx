"use client"

import { useEffect, useState, useMemo } from "react"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Shield, ShieldCheck, Eye, Pencil, Ban, Boxes } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { APP_REGISTRY } from "@/lib/apps-registry"

type Level = "none" | "read" | "write"
type Role  = "admin" | "user" | "viewer"
interface Perm { moduleKey: string; level: Level }
interface ModuleDef { key: string; label: string; group: "general" | "services" | "data" | "admin" | "dev" }
interface AppGrant { id: string; role: Role }

const GROUP_LABELS: Record<ModuleDef["group"], string> = {
  general:  "Genel",
  services: "Servisler",
  data:     "Veri & Raporlar",
  admin:    "Yönetim",
  dev:      "Geliştirici",
}

const ROLE_LABELS: Record<Role, string> = {
  admin:  "Admin",
  user:   "Kullanıcı",
  viewer: "Görüntüleyici",
}

interface Props {
  userId:             string | null
  userName:           string
  /** Yeni format: [{id, role}]; eski string[] de gelebilir. */
  initialAllowedApps: Array<string | AppGrant>
  open:               boolean
  onClose:            () => void
  onSaved?:           () => void
}

function normalizeGrants(input: Array<string | AppGrant>): AppGrant[] {
  return input.map((x) =>
    typeof x === "string" ? { id: x, role: "user" as Role } : x,
  )
}

export function PermissionsSheet({ userId, userName, initialAllowedApps, open, onClose, onSaved }: Props) {
  const [grants, setGrants] = useState<AppGrant[]>([])
  const [activeTab, setActiveTab] = useState<string>("hub")

  // Her app için ayrı modül + perm state'i — appId → (...)
  const [modulesByApp, setModulesByApp] = useState<Record<string, ModuleDef[]>>({})
  const [permsByApp,   setPermsByApp]   = useState<Record<string, Record<string, Level>>>({})
  const [loadedApps,   setLoadedApps]   = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)

  const grantFor = (appId: string) => grants.find((g) => g.id === appId)
  const isAppEnabled = (appId: string) => !!grantFor(appId)
  const roleFor = (appId: string): Role => grantFor(appId)?.role ?? "user"

  // ── İlk açılış: grants + aktif tab'ın izinleri ───────────────────────────
  useEffect(() => {
    if (!open || !userId) return
    const initial = normalizeGrants(initialAllowedApps ?? [])
    setGrants(initial)
    setModulesByApp({})
    setPermsByApp({})
    setLoadedApps(new Set())
    // İlk tab: erişim olan ilk app, yoksa hub
    const first = initial[0]?.id ?? "hub"
    setActiveTab(first)
    loadApp(first, userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId])

  // Tab değişince o app'in izinlerini lazy-load et
  useEffect(() => {
    if (!open || !userId || !activeTab) return
    if (loadedApps.has(activeTab)) return
    loadApp(activeTab, userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  async function loadApp(appId: string, uid: string) {
    setLoading(true)
    try {
      const [mods, data] = await Promise.all([
        fetch(`/api/permissions/modules?appId=${appId}`).then((r) => r.json()),
        fetch(`/api/users/${uid}/permissions?appId=${appId}`).then((r) => r.json()),
      ]) as [ModuleDef[], { permissions: Perm[] }]
      setModulesByApp((s) => ({ ...s, [appId]: mods }))
      const m: Record<string, Level> = {}
      for (const p of data.permissions ?? []) m[p.moduleKey] = p.level
      setPermsByApp((s) => ({ ...s, [appId]: m }))
      setLoadedApps((s) => new Set(s).add(appId))
    } catch {
      toast.error("İzinler yüklenemedi")
    } finally { setLoading(false) }
  }

  // ── App erişim & rol ────────────────────────────────────────────────────
  function toggleApp(appId: string) {
    setGrants((cur) =>
      cur.some((g) => g.id === appId)
        ? cur.filter((g) => g.id !== appId)
        : [...cur, { id: appId, role: "user" }],
    )
  }

  function setRole(appId: string, role: Role) {
    setGrants((cur) => cur.map((g) => (g.id === appId ? { ...g, role } : g)))
  }

  // ── Modül izinleri ──────────────────────────────────────────────────────
  function setLevel(appId: string, moduleKey: string, level: Level) {
    setPermsByApp((s) => ({
      ...s,
      [appId]: { ...(s[appId] ?? {}), [moduleKey]: level },
    }))
  }

  function setAll(appId: string, level: Level) {
    const mods = modulesByApp[appId] ?? []
    const next: Record<string, Level> = {}
    for (const m of mods) next[m.key] = level
    setPermsByApp((s) => ({ ...s, [appId]: next }))
  }

  async function save() {
    if (!userId) return
    setSaving(true)
    try {
      // 1) AllowedApps (grants)
      const rApps = await fetch(`/api/users/${userId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ allowedApps: grants }),
      })
      if (!rApps.ok) throw new Error("apps")

      // 2) Her load edilmiş app için modül izinleri (admin ise atla — admin = full)
      for (const appId of loadedApps) {
        if (roleFor(appId) === "admin") continue
        const mods = modulesByApp[appId] ?? []
        const pmap = permsByApp[appId] ?? {}
        const payload = mods.map((m) => ({ moduleKey: m.key, level: pmap[m.key] ?? "none" }))
        const rPerms = await fetch(`/api/users/${userId}/permissions`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ appId, permissions: payload }),
        })
        if (!rPerms.ok) throw new Error("perms")
      }

      toast.success("Yetkiler kaydedildi", {
        description: "Kullanıcı bir sonraki girişinde değişiklikler geçerli olur.",
      })
      onSaved?.()
      onClose()
    } catch {
      toast.error("Kaydedilemedi")
    } finally { setSaving(false) }
  }

  // Aktif tab'ın modülleri ve izinleri
  const activeModules = modulesByApp[activeTab] ?? []
  const activePerms   = permsByApp[activeTab]   ?? {}
  const activeRole    = roleFor(activeTab)
  const activeIsAdmin = activeRole === "admin"
  const activeEnabled = isAppEnabled(activeTab)

  const grouped = useMemo(() => {
    const g: Record<string, ModuleDef[]> = {}
    for (const m of activeModules) {
      if (!g[m.group]) g[m.group] = []
      g[m.group].push(m)
    }
    return g
  }, [activeModules])

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="!w-[560px] !max-w-[560px] p-0 flex flex-col gap-0">
        <SheetHeader className="px-5 py-4 border-b border-border/50">
          <SheetTitle className="text-[13px] font-semibold flex items-center gap-2">
            <Shield className="size-4" />
            Yetkilendirme — {userName}
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Kullanıcının erişebileceği uygulamaları, her uygulamadaki rolünü ve sayfa bazlı izinleri buradan yönetin.
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-3 space-y-3">

            {/* ── Uygulama Erişimi + Rol ─────────────────────────────────── */}
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="px-3 py-1.5 bg-muted/30 border-b border-border/40 flex items-center gap-1.5">
                <Boxes className="size-3 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Uygulama Erişimi & Rol
                </span>
              </div>
              <div className="divide-y divide-border/40">
                {APP_REGISTRY.map((app) => {
                  const on   = isAppEnabled(app.id)
                  const role = roleFor(app.id)
                  return (
                    <div key={app.id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-[12px] font-medium truncate">{app.name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{app.id}</span>
                      </div>
                      {on && (
                        <Select value={role} onValueChange={(v) => setRole(app.id, v as Role)}>
                          <SelectTrigger className="h-7 text-[11px] rounded-[4px] w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin"><span className="text-[11px]">Admin</span></SelectItem>
                            <SelectItem value="user"><span className="text-[11px]">Kullanıcı</span></SelectItem>
                            <SelectItem value="viewer"><span className="text-[11px]">Görüntüleyici</span></SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Switch
                        checked={on}
                        onCheckedChange={() => toggleApp(app.id)}
                        aria-label={`${app.name} erişimi`}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Sayfa İzinleri (tabs per app) ────────────────────────── */}
            <div>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="h-8 p-0.5 rounded-[5px]">
                  {APP_REGISTRY.map((app) => (
                    <TabsTrigger
                      key={app.id}
                      value={app.id}
                      className="h-7 px-3 text-[11px] rounded-[4px]"
                      disabled={!isAppEnabled(app.id)}
                    >
                      {app.name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {APP_REGISTRY.map((app) => (
                  <TabsContent key={app.id} value={app.id} className="mt-2">
                    {!activeEnabled ? (
                      <div className="rounded-[5px] border border-dashed border-border/60 px-4 py-6 text-center text-[11px] text-muted-foreground">
                        Bu uygulama için erişim kapalı. İzin vermek için üstteki toggle'ı açın.
                      </div>
                    ) : activeIsAdmin ? (
                      <div className="rounded-[5px] border border-amber-200 bg-amber-50/60 px-3 py-2.5 flex items-start gap-2">
                        <ShieldCheck className="size-3.5 text-amber-700 mt-[1px]" />
                        <div className="text-[11px] text-amber-800">
                          Admin rolündeki kullanıcı bu uygulamada tüm modüllere otomatik olarak yazma yetkisine sahiptir.
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-1">Toplu:</span>
                          <button onClick={() => setAll(activeTab, "write")}
                            className="text-[10px] font-medium px-2 py-1 rounded-[4px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                            Tümüne Yaz
                          </button>
                          <button onClick={() => setAll(activeTab, "read")}
                            className="text-[10px] font-medium px-2 py-1 rounded-[4px] bg-blue-50 text-blue-700 hover:bg-blue-100">
                            Tümüne Oku
                          </button>
                          <button onClick={() => setAll(activeTab, "none")}
                            className="text-[10px] font-medium px-2 py-1 rounded-[4px] bg-muted/60 text-muted-foreground hover:bg-muted">
                            Temizle
                          </button>
                        </div>

                        {loading ? (
                          <div className="space-y-2">
                            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-[4px]" />)}
                          </div>
                        ) : activeModules.length === 0 ? (
                          <div className="rounded-[5px] border border-dashed border-border/60 px-4 py-6 text-center text-[11px] text-muted-foreground">
                            Bu uygulama henüz modül kataloğunu bildirmemiş.
                          </div>
                        ) : (
                          (["general", "services", "data", "admin", "dev"] as const).map((g) => (
                            grouped[g]?.length ? (
                              <div key={g} className="rounded-[5px] border border-border/50 overflow-hidden mb-2">
                                <div className="px-3 py-1.5 bg-muted/30 border-b border-border/40">
                                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                    {GROUP_LABELS[g]}
                                  </span>
                                </div>
                                <div className="divide-y divide-border/40">
                                  {grouped[g].map((m) => {
                                    const lvl = activePerms[m.key] ?? "none"
                                    return (
                                      <div key={m.key} className="px-3 py-2 flex items-center justify-between gap-3">
                                        <span className="text-[12px]">{m.label}</span>
                                        <div className="flex gap-0.5 rounded-[5px] border border-border/60 bg-muted/20 p-0.5">
                                          <LevelBtn active={lvl === "none"}  onClick={() => setLevel(activeTab, m.key, "none")}
                                            icon={<Ban className="size-3" />}     label="Yok"  cls="text-muted-foreground" />
                                          <LevelBtn active={lvl === "read"}  onClick={() => setLevel(activeTab, m.key, "read")}
                                            icon={<Eye className="size-3" />}     label="Oku"  cls="text-blue-700 bg-blue-50" />
                                          <LevelBtn active={lvl === "write"} onClick={() => setLevel(activeTab, m.key, "write")}
                                            icon={<Pencil className="size-3" />}  label="Yaz"  cls="text-emerald-700 bg-emerald-50" />
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ) : null
                          ))
                        )}
                      </>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </div>
        </ScrollArea>

        <div className="px-5 py-3 border-t border-border/50 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="h-8 text-[12px] rounded-[5px]">İptal</Button>
          <Button onClick={save} disabled={saving || loading}
            className="h-8 text-[12px] rounded-[5px]">
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function LevelBtn({
  active, onClick, disabled, icon, label, cls,
}: {
  active: boolean; onClick: () => void; disabled?: boolean
  icon: React.ReactNode; label: string; cls: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-medium transition-colors",
        active ? cls : "text-muted-foreground hover:bg-muted/40",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {icon}{label}
    </button>
  )
}

// useless placeholder usage to avoid unused import warning
void ROLE_LABELS
