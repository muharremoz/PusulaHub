"use client"

import { useEffect, useState } from "react"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Shield, ShieldCheck, Eye, Pencil, Ban } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Level = "none" | "read" | "write"
interface Perm { moduleKey: string; level: Level }
interface ModuleDef { key: string; label: string; group: "general" | "services" | "data" | "admin" | "dev" }

const GROUP_LABELS: Record<ModuleDef["group"], string> = {
  general:  "Genel",
  services: "Servisler",
  data:     "Veri & Raporlar",
  admin:    "Yönetim",
  dev:      "Geliştirici",
}

interface Props {
  userId:   string | null
  userName: string
  open:     boolean
  onClose:  () => void
}

export function PermissionsSheet({ userId, userName, open, onClose }: Props) {
  const [modules, setModules] = useState<ModuleDef[]>([])
  const [perms,   setPerms]   = useState<Record<string, Level>>({})
  const [role,    setRole]    = useState<string>("user")
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    if (!open || !userId) return
    setLoading(true)
    Promise.all([
      fetch("/api/permissions/modules").then((r) => r.json()),
      fetch(`/api/users/${userId}/permissions`).then((r) => r.json()),
    ])
      .then(([mods, data]: [ModuleDef[], { role: string; permissions: Perm[] }]) => {
        setModules(mods)
        setRole(data.role)
        const m: Record<string, Level> = {}
        for (const p of data.permissions) m[p.moduleKey] = p.level
        setPerms(m)
      })
      .catch(() => toast.error("İzinler yüklenemedi"))
      .finally(() => setLoading(false))
  }, [open, userId])

  const isAdmin = role === "admin"

  function setLevel(key: string, level: Level) {
    setPerms((p) => ({ ...p, [key]: level }))
  }

  function setAll(level: Level) {
    const next: Record<string, Level> = {}
    for (const m of modules) next[m.key] = level
    setPerms(next)
  }

  async function save() {
    if (!userId) return
    setSaving(true)
    try {
      const payload = modules.map((m) => ({ moduleKey: m.key, level: perms[m.key] ?? "none" }))
      const r = await fetch(`/api/users/${userId}/permissions`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ permissions: payload }),
      })
      if (!r.ok) throw new Error()
      toast.success("İzinler kaydedildi", { description: "Kullanıcı bir sonraki girişinde değişiklikler geçerli olur." })
      onClose()
    } catch {
      toast.error("Kaydedilemedi")
    } finally { setSaving(false) }
  }

  // Modülleri grup grup listele
  const grouped: Record<string, ModuleDef[]> = {}
  for (const m of modules) {
    if (!grouped[m.group]) grouped[m.group] = []
    grouped[m.group].push(m)
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="!w-[520px] !max-w-[520px] p-0 flex flex-col gap-0">
        <SheetHeader className="px-5 py-4 border-b border-border/50">
          <SheetTitle className="text-[13px] font-semibold flex items-center gap-2">
            <Shield className="size-4" />
            Yetkilendirme — {userName}
          </SheetTitle>
          {isAdmin ? (
            <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
              <ShieldCheck className="size-3" />
              Admin rolündeki kullanıcı tüm modüllere otomatik olarak yazma yetkisine sahiptir.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-1">
              Her modül için erişim seviyesini seçin. Değişiklikler kullanıcının bir sonraki girişinde geçerli olur.
            </p>
          )}
        </SheetHeader>

        {!isAdmin && (
          <div className="px-5 py-2 border-b border-border/50 bg-muted/20 flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-1">Toplu:</span>
            <button onClick={() => setAll("write")}
              className="text-[10px] font-medium px-2 py-1 rounded-[4px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
              Tümüne Yaz
            </button>
            <button onClick={() => setAll("read")}
              className="text-[10px] font-medium px-2 py-1 rounded-[4px] bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
              Tümüne Oku
            </button>
            <button onClick={() => setAll("none")}
              className="text-[10px] font-medium px-2 py-1 rounded-[4px] bg-muted/60 text-muted-foreground hover:bg-muted transition-colors">
              Temizle
            </button>
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-3 space-y-3">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-[4px]" />)}
              </div>
            ) : (
              (["general", "services", "data", "admin", "dev"] as const).map((g) => (
                grouped[g]?.length ? (
                  <div key={g} className="rounded-[5px] border border-border/50 overflow-hidden">
                    <div className="px-3 py-1.5 bg-muted/30 border-b border-border/40">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {GROUP_LABELS[g]}
                      </span>
                    </div>
                    <div className="divide-y divide-border/40">
                      {grouped[g].map((m) => {
                        const lvl = perms[m.key] ?? "none"
                        return (
                          <div key={m.key} className="px-3 py-2 flex items-center justify-between gap-3">
                            <span className="text-[12px]">{m.label}</span>
                            <div className="flex gap-0.5 rounded-[5px] border border-border/60 bg-muted/20 p-0.5">
                              <LevelBtn active={lvl === "none"}  onClick={() => setLevel(m.key, "none")}  disabled={isAdmin}
                                icon={<Ban className="size-3" />}     label="Yok"   cls="text-muted-foreground" />
                              <LevelBtn active={lvl === "read"}  onClick={() => setLevel(m.key, "read")}  disabled={isAdmin}
                                icon={<Eye className="size-3" />}     label="Oku"   cls="text-blue-700 bg-blue-50" />
                              <LevelBtn active={lvl === "write"} onClick={() => setLevel(m.key, "write")} disabled={isAdmin}
                                icon={<Pencil className="size-3" />}  label="Yaz"   cls="text-emerald-700 bg-emerald-50" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null
              ))
            )}
          </div>
        </ScrollArea>

        <div className="px-5 py-3 border-t border-border/50 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="h-8 text-[12px] rounded-[5px]">İptal</Button>
          <Button onClick={save} disabled={saving || isAdmin || loading}
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
