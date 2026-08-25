"use client"

/**
 * Yetkilendirme — PusulaCRM'in settings/permissions ekranının Hub karşılığı.
 *
 * Düzen CRM ile aynı: SOLDA kişi listesi (arama + yetki sayısı), SAĞDA seçili
 * kişinin yetkileri. Sağ tarafta sırasıyla başlık şeridi (ad, sayaç, kişiden
 * kopyala, kaydet) ve gruplu yetki listesi — iki sütun, grup başında ad,
 * n/m sayacı ve "Tümünü aç".
 *
 * Yetki CRM'deki gibi AÇIK/KAPALI. Hub'ın DB'si üç seviye tutabiliyor
 * (none/read/write) ama arayüzde ayrım yapılmıyor: anahtar açıkken "write"
 * yazılır — yazma uçları `requirePermission(modul, "write")` istiyor, "read"
 * verilseydi modül görünür ama hiçbir işlem yapılamazdı.
 *
 * Eskiden "read" verilmiş modüller olduğu gibi korunur: anahtar açık görünür
 * ve DOKUNULMADIĞI sürece kaydederken "read" kalır — kimsenin yetkisi sessizce
 * yükseltilmez. Kapatılıp tekrar açılırsa "write" olur.
 *
 * CRM'de hazır paketler `permission_packages` tablosundan gelir; Hub'da öyle
 * bir tablo yok, o blok yerine başlıkta toplu aç/temizle var.
 *
 * Kullanıcı OLUŞTURMA burada yok: kimlik ve uygulama erişimi CRM'de
 * (docs/YENI-SISTEM.md). Bu ekran yalnız `user_permissions` düzenler.
 */

import { useState, useEffect, useMemo, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight, Copy, Search, ShieldAlert } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger, Switch } from "@muharremoz/pusula-ui"
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { APP_REGISTRY } from "@/lib/apps-registry"
import type { AppUser } from "@/app/api/users/route"

type Level = "none" | "read" | "write"
interface ModuleDef { key: string; label: string; group: string }

/** Modül gruplarının ekrandaki başlıkları — MODULES.group ile eşleşir. */
const GRUP_BASLIK: Record<string, string> = {
  general:  "Günlük iş",
  services: "Servisler",
  data:     "Veri",
  admin:    "Yönetim & sistem",
  dev:      "Geliştirici",
}
const GRUP_SIRA = ["general", "services", "data", "admin", "dev"]

const roleLabel = (r: string) => (r === "admin" ? "Süper Admin" : "Kullanıcı")

export default function PermissionsPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [users,   setUsers]   = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [ara,     setAra]     = useState("")
  const [seciliId, setSeciliId] = useState<string | null>(null)

  useEffect(() => {
    if (session === undefined) return
    if (session?.user?.role !== "admin") { router.replace("/dashboard"); return }
    ;(async () => {
      setLoading(true)
      try {
        const r = await fetch("/api/users")
        if (r.ok) setUsers(await r.json())
      } catch {
        toast.error("Kullanıcılar yüklenemedi")
      } finally {
        setLoading(false)
      }
    })()
  }, [session])

  const liste = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase("tr-TR")
    const s = [...users].sort((a, b) =>
      (a.fullName ?? a.username).localeCompare(b.fullName ?? b.username, "tr"))
    if (!q) return s
    return s.filter((u) =>
      (u.fullName ?? u.username).toLocaleLowerCase("tr-TR").includes(q) ||
      u.username.toLocaleLowerCase("tr-TR").includes(q) ||
      (u.email ?? "").toLocaleLowerCase("tr-TR").includes(q))
  }, [users, ara])

  const kisi = seciliId ? users.find((u) => u.id === seciliId) ?? null : null

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="bg-[var(--section-bg)] flex min-h-0 flex-1 flex-col rounded-[8px] p-2">
        <div className="border-border flex min-h-0 flex-1 overflow-hidden rounded-t-[10px] border-t bg-card shadow-[0_-2px_6px_-4px_rgba(15,31,27,0.10)]">

          {/* ── SOL: kişi listesi ── */}
          <div className="border-border/60 flex w-64 shrink-0 flex-col border-r">
            <div className="border-border/60 border-b p-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
                <input
                  value={ara}
                  onChange={(e) => setAra(e.target.value)}
                  placeholder="Personel ara..."
                  className="border-input focus:border-primary/50 focus:ring-primary/20 h-8 w-full rounded-[5px] border bg-card pl-8 pr-2 text-[12px] outline-none transition-colors focus:ring-2"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="space-y-1.5 p-2">
                  {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-[5px]" />)}
                </div>
              ) : liste.length === 0 ? (
                <p className="text-muted-foreground p-3 text-[12px]">Sonuç yok.</p>
              ) : liste.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSeciliId(u.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                    seciliId === u.id ? "bg-muted/70" : "hover:bg-muted/40",
                  )}
                >
                  <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                    {(u.fullName ?? u.username).slice(0, 2).toLocaleUpperCase("tr-TR")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">{u.fullName ?? u.username}</span>
                    <span className="text-muted-foreground block truncate text-[11px]">{roleLabel(u.role)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── SAĞ: seçili kişinin yetkileri ── */}
          {!kisi ? (
            <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2">
              <ShieldAlert className="size-8 opacity-40" />
              <span className="text-[13px]">Soldan bir personel seç</span>
            </div>
          ) : (
            <YetkiPaneli key={kisi.id} kisi={kisi} tumKisiler={users} />
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Sağ panel — seçili kişinin modül izinleri
   ══════════════════════════════════════════════════════════════ */

function YetkiPaneli({ kisi, tumKisiler }: { kisi: AppUser; tumKisiler: AppUser[] }) {
  const [appId,     setAppId]     = useState("hub")
  const [mods,      setMods]      = useState<ModuleDef[]>([])
  const [perms,     setPerms]     = useState<Record<string, Level>>({})
  const [kayitli,   setKayitli]   = useState<Record<string, Level>>({})
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [detayAcik, setDetayAcik] = useState(true)
  const [kopyaAcik, setKopyaAcik] = useState(false)

  /** Kişinin erişebildiği uygulamalar — izin yalnız bunlar için anlamlı. */
  const apps = useMemo(() => {
    const ids = (kisi.allowedApps ?? []).map((g) => (typeof g === "string" ? g : g.id))
    const bulunan = APP_REGISTRY.filter((a) => ids.includes(a.id))
    return bulunan.length > 0 ? bulunan : APP_REGISTRY.filter((a) => a.id === "hub")
  }, [kisi])

  useEffect(() => { setAppId(apps[0]?.id ?? "hub") }, [apps])

  const yukle = useCallback(async (hedefId: string, uygulama: string) => {
    setLoading(true)
    try {
      const [m, d] = await Promise.all([
        fetch(`/api/permissions/modules?appId=${uygulama}`).then((r) => r.json()),
        fetch(`/api/users/${hedefId}/permissions?appId=${uygulama}`).then((r) => r.json()),
      ]) as [ModuleDef[], { permissions?: { moduleKey: string; level: Level }[] }]
      const map: Record<string, Level> = {}
      for (const p of d.permissions ?? []) map[p.moduleKey] = p.level
      setMods(Array.isArray(m) ? m : [])
      setPerms(map)
      setKayitli(map)
    } catch {
      toast.error("Modül izinleri yüklenemedi")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { yukle(kisi.id, appId) }, [kisi.id, appId, yukle])

  const seviye = (k: string): Level => perms[k] ?? "none"
  const aktifSayi = mods.filter((m) => seviye(m.key) !== "none").length
  const degisti = useMemo(
    () => mods.some((m) => (perms[m.key] ?? "none") !== (kayitli[m.key] ?? "none")),
    [mods, perms, kayitli],
  )

  /** MODULES.group sırasına göre öbekle — 16 satırı düz dizmek okunmuyor. */
  const gruplar = useMemo(() => {
    const g = new Map<string, ModuleDef[]>()
    for (const m of mods) {
      const k = m.group || "other"
      if (!g.has(k)) g.set(k, [])
      g.get(k)!.push(m)
    }
    return [...g.entries()].sort(
      (a, b) => (GRUP_SIRA.indexOf(a[0]) + 99) % 99 - (GRUP_SIRA.indexOf(b[0]) + 99) % 99,
    )
  }, [mods])

  function hepsineUygula(lvl: Level) {
    const next: Record<string, Level> = {}
    for (const m of mods) next[m.key] = lvl
    setPerms(next)
  }

  function grubaUygula(grup: ModuleDef[], lvl: Level) {
    setPerms((p) => {
      const next = { ...p }
      for (const m of grup) next[m.key] = lvl
      return next
    })
  }

  /** Başka kişinin izinlerini kopyala — set KOPYALANIR, bağ kurulmaz. */
  async function kisidenKopyala(kaynakId: string) {
    setKopyaAcik(false)
    try {
      const d = await fetch(`/api/users/${kaynakId}/permissions?appId=${appId}`).then((r) => r.json())
      const map: Record<string, Level> = {}
      for (const p of (d.permissions ?? []) as { moduleKey: string; level: Level }[]) map[p.moduleKey] = p.level
      setPerms(map)
      toast.success("Yetkiler kopyalandı", { description: "Kaydet'e basana kadar uygulanmaz." })
    } catch {
      toast.error("Kopyalanamadı")
    }
  }

  async function kaydet() {
    setSaving(true)
    try {
      const payload = mods.map((m) => ({ moduleKey: m.key, level: perms[m.key] ?? "none" }))
      const r = await fetch(`/api/users/${kisi.id}/permissions`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ appId, permissions: payload }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        toast.error("Kaydedilemedi", { description: d?.error })
        return
      }
      setKayitli({ ...perms })
      toast.success("Yetkiler kaydedildi", { description: kisi.fullName ?? kisi.username })
    } catch {
      toast.error("Kaydedilemedi")
    } finally {
      setSaving(false)
    }
  }

  const adminMi = kisi.role === "admin"

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* ── Başlık + araçlar ── */}
      <div className="border-border/60 flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
        <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold">
          {(kisi.fullName ?? kisi.username).slice(0, 2).toLocaleUpperCase("tr-TR")}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{kisi.fullName ?? kisi.username}</div>
          <div className="text-muted-foreground truncate text-[11px]">
            {roleLabel(kisi.role)} · <span className="tabular-nums">{aktifSayi} / {mods.length}</span> modül
          </div>
        </div>

        {adminMi && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10.5px] text-amber-600 dark:text-amber-400">
            süper admin — tüm modüllere yazma
          </span>
        )}
        {degisti && !adminMi && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10.5px] text-amber-600 dark:text-amber-400">
            kaydedilmemiş değişiklik
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {apps.length > 1 && (
            <div className="border-border/60 flex items-center gap-0.5 rounded-[5px] border p-0.5">
              {apps.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAppId(a.id)}
                  className={cn(
                    "rounded-[4px] px-2 py-0.5 text-[11px] font-medium transition-colors",
                    appId === a.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}

          {/* Kopyala — proje kuralı: dropdown daima arama içerir. */}
          <Popover open={kopyaAcik} onOpenChange={setKopyaAcik}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={adminMi}
                className="border-input bg-card hover:bg-muted/40 flex h-8 items-center gap-1.5 rounded-[5px] border px-2.5 text-[12px] transition-colors disabled:opacity-50"
              >
                <Copy className="size-3.5" />
                Kişiden kopyala
                <ChevronDown className="size-3.5 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[240px] bg-card p-0">
              <Command className="bg-card">
                <CommandInput placeholder="Personel ara…" className="text-[13px] h-8" />
                <CommandList>
                  <CommandEmpty className="text-muted-foreground py-4 text-center text-[12px]">
                    Personel bulunamadı.
                  </CommandEmpty>
                  <CommandGroup>
                    {tumKisiler
                      .filter((u) => u.id !== kisi.id && u.role !== "admin")
                      .sort((a, b) => (a.fullName ?? a.username).localeCompare(b.fullName ?? b.username, "tr"))
                      .map((u) => (
                        <CommandItem
                          key={u.id}
                          value={`${u.fullName ?? u.username} ${u.email ?? ""}`}
                          onSelect={() => kisidenKopyala(u.id)}
                          className="text-[13px]"
                        >
                          {u.fullName ?? u.username}
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <button
            type="button"
            onClick={() => hepsineUygula("write")}
            disabled={adminMi}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-[5px] px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50"
          >
            Tümünü aç
          </button>
          <button
            type="button"
            onClick={() => hepsineUygula("none")}
            disabled={adminMi}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-[5px] px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50"
          >
            Temizle
          </button>

          <Button
            size="sm"
            className="h-8 text-[12px]"
            onClick={kaydet}
            disabled={saving || loading || adminMi || !degisti}
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </div>

      {/* ── Gövde ── */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {adminMi ? (
          <p className="text-muted-foreground py-10 text-center text-[13px]">
            Süper admin tüm modüllere yazma yetkisiyle erişir; ayrıca izin verilmez.
          </p>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-[5px]" />)}
          </div>
        ) : (
          <>
            {/* Tek tek düzenleme — katlı */}
            <button
              onClick={() => setDetayAcik((a) => !a)}
              className="border-border hover:bg-muted/40 mt-3 flex w-full items-center gap-2 rounded-[8px] border px-2.5 py-2 text-[12px] transition-colors"
            >
              <ChevronRight className={cn("size-3.5 transition-transform", detayAcik && "rotate-90")} />
              Yetkileri tek tek düzenle
              <span className="text-muted-foreground/70 text-[11px]">({mods.length} modül, gruplu)</span>
            </button>

            {detayAcik && (
              <div className="mt-3 grid gap-x-6 gap-y-4 md:grid-cols-2">
                {gruplar.map(([grupKey, grupMods]) => {
                  const acikSayi = grupMods.filter((m) => seviye(m.key) !== "none").length
                  const hepsiAcik = acikSayi === grupMods.length
                  return (
                    <div key={grupKey}>
                      <div className="border-border mb-1 flex items-center gap-2 border-b pb-1">
                        <span className="text-muted-foreground/70 text-[10px] font-medium tracking-wider uppercase">
                          {GRUP_BASLIK[grupKey] ?? grupKey}
                        </span>
                        <span className="text-muted-foreground/70 text-[10px] tabular-nums">
                          {acikSayi}/{grupMods.length}
                        </span>
                        <button
                          onClick={() => grubaUygula(grupMods, hepsiAcik ? "none" : "write")}
                          className="text-muted-foreground hover:text-foreground ml-auto text-[10.5px] transition-colors"
                        >
                          {hepsiAcik ? "Tümünü kapat" : "Tümünü aç"}
                        </button>
                      </div>
                      {grupMods.map((m) => {
                        const lvl = seviye(m.key)
                        const satirDegisti = lvl !== (kayitli[m.key] ?? "none")
                        return (
                          <div
                            key={m.key}
                            className="hover:bg-muted/40 flex items-center gap-2 rounded px-1 py-[3px] transition-colors"
                          >
                            <span className={cn(
                              "min-w-0 flex-1 truncate text-[12.5px]",
                              lvl === "none" && "text-muted-foreground",
                            )}>
                              {m.label}
                              {satirDegisti && <span className="text-amber-500"> •</span>}
                            </span>
                            {/* Açarken "write": yazma uçları read'i kabul etmiyor.
                                Dokunulmamış "read" kayıtları olduğu gibi kalır. */}
                            <Switch
                              checked={lvl !== "none"}
                              onCheckedChange={(acik) =>
                                setPerms((p) => ({ ...p, [m.key]: acik ? "write" : "none" }))
                              }
                            />
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
