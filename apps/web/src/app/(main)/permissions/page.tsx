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
 * Hazır paketler `hub.permission_packages` tablosundan gelir ve bu ekrandan
 * yönetilir. Paket bir ROL DEĞİL: uygulandığında modül kümesi KOPYALANIR,
 * bağ kurulmaz — paket sonradan değişirse eski kişiler etkilenmez.
 *
 * Kullanıcı OLUŞTURMA burada yok: kimlik ve uygulama erişimi CRM'de
 * (docs/YENI-SISTEM.md). Bu ekran yalnız `user_permissions` düzenler.
 */

import { useState, useEffect, useMemo, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, ChevronRight, Copy, Pencil, Plus, Search, ShieldAlert, Trash2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger, Switch } from "@muharremoz/pusula-ui"
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { APP_REGISTRY } from "@/lib/apps-registry"
import type { AppUser } from "@/app/api/users/route"

type Level = "none" | "read" | "write"
interface ModuleDef { key: string; label: string; group: string }
interface Paket {
  id: string; appId: string; name: string
  description: string | null; modules: string[]; sortOrder: number
}

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
  const [paketler,  setPaketler]  = useState<Paket[]>([])
  const [paketDuzenle, setPaketDuzenle] = useState<Paket | "yeni" | null>(null)

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

  const paketleriYukle = useCallback(async (uygulama: string) => {
    try {
      const r = await fetch(`/api/permission-packages?appId=${uygulama}`)
      if (r.ok) setPaketler(await r.json())
    } catch { /* paket olmadan da ekran çalışır */ }
  }, [])

  useEffect(() => { paketleriYukle(appId) }, [appId, paketleriYukle])

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

  /** Paketi uygula — küme KOPYALANIR, bağ kurulmaz. Kaydet'e basılana kadar yazılmaz. */
  function paketUygula(pk: Paket) {
    const kume = new Set(pk.modules)
    const next: Record<string, Level> = {}
    for (const m of mods) next[m.key] = kume.has(m.key) ? "write" : "none"
    setPerms(next)
    toast.success(`"${pk.name}" uygulandı`, { description: "Kaydet'e basana kadar yazılmaz." })
  }

  async function paketSil(id: string) {
    try {
      const r = await fetch(`/api/permission-packages?id=${id}`, { method: "DELETE" })
      if (!r.ok) { toast.error("Paket silinemedi"); return }
      toast.success("Paket silindi")
      setPaketDuzenle(null)
      paketleriYukle(appId)
    } catch { toast.error("Paket silinemedi") }
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
            {/* Hazır paketler */}
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-muted-foreground/70 text-[10px] font-medium tracking-wider uppercase">
                Hazır paketler
              </span>
              <button
                onClick={() => setPaketDuzenle("yeni")}
                title="Ekrandaki yetkilerle yeni paket oluştur"
                className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-[11px] transition-colors"
              >
                <Plus className="size-3" />
                Yeni paket
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {paketler.map((pk) => {
                // Paket "seçili" sayılır: açık modüller kümesi paketle birebir aynıysa.
                const acikKume = mods.filter((m) => seviye(m.key) !== "none").map((m) => m.key)
                const pkKume = pk.modules.filter((k) => mods.some((m) => m.key === k))
                const seciliPaket =
                  acikKume.length === pkKume.length && acikKume.every((k) => pkKume.includes(k))
                return (
                  <div
                    key={pk.id}
                    className={cn(
                      "group bg-muted/25 hover:bg-muted/50 relative rounded-[8px] border transition-colors",
                      seciliPaket ? "border-primary ring-primary/40 ring-1" : "border-border",
                    )}
                  >
                    <button onClick={() => paketUygula(pk)} className="w-full p-2.5 text-left">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[12.5px] font-semibold">{pk.name}</span>
                        {seciliPaket && <Check className="text-primary size-3.5" />}
                      </span>
                      <p className="text-muted-foreground mt-0.5 pr-5 text-[11px] leading-snug">
                        {pk.description ?? "—"}
                      </p>
                      <p className="text-muted-foreground/70 mt-1.5 text-[10.5px] tabular-nums">
                        {pkKume.length} modül
                      </p>
                    </button>
                    {/* Düzenleme kartın üstünde ama sessiz: paket seçmek asıl eylem. */}
                    <button
                      onClick={() => setPaketDuzenle(pk)}
                      title="Paketi düzenle"
                      className="text-muted-foreground/50 hover:text-foreground absolute right-1.5 top-1.5 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                )
              })}
              {paketler.length === 0 && (
                <p className="text-muted-foreground/70 col-span-full text-[11.5px]">
                  Henüz paket yok — “Yeni paket” ile ekrandaki yetkilerden oluştur.
                </p>
              )}
            </div>

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

      {paketDuzenle && (
        <PaketDialog
          paket={paketDuzenle === "yeni" ? null : paketDuzenle}
          appId={appId}
          mods={mods}
          /* Yeni paket ekrandaki açık yetkilerle başlar — CRM'deki gibi. */
          baslangic={mods.filter((m) => seviye(m.key) !== "none").map((m) => m.key)}
          onClose={() => setPaketDuzenle(null)}
          onSaved={() => { setPaketDuzenle(null); paketleriYukle(appId) }}
          onDelete={paketSil}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Paket ekle / düzenle
   ══════════════════════════════════════════════════════════════ */

function PaketDialog({
  paket, appId, mods, baslangic, onClose, onSaved, onDelete,
}: {
  paket: Paket | null
  appId: string
  mods: ModuleDef[]
  baslangic: string[]
  onClose: () => void
  onSaved: () => void
  onDelete: (id: string) => void
}) {
  const [ad,       setAd]       = useState(paket?.name ?? "")
  const [aciklama, setAciklama] = useState(paket?.description ?? "")
  const [secili,   setSecili]   = useState<string[]>(paket ? paket.modules : baslangic)
  const [saving,   setSaving]   = useState(false)

  async function kaydet() {
    if (!ad.trim()) { toast.error("Paket adı zorunludur"); return }
    setSaving(true)
    try {
      const r = await fetch("/api/permission-packages", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          id: paket?.id, appId, name: ad.trim(),
          description: aciklama, modules: secili,
          sortOrder: paket?.sortOrder ?? 100,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error("Kaydedilemedi", { description: d?.error }); return }
      toast.success(paket ? "Paket güncellendi" : "Paket oluşturuldu")
      onSaved()
    } catch {
      toast.error("Kaydedilemedi")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose() }}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="border-border/50 border-b px-5 py-3.5">
          <DialogTitle className="text-[13px]">
            {paket ? "Paketi Düzenle" : "Yeni Paket"}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-1">
            <Label className="text-foreground/80 text-[12px] font-medium">Ad</Label>
            <Input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="ör. Destek" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-foreground/80 text-[12px] font-medium">Açıklama</Label>
            <Input
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
              placeholder="Bu paket kimler için?"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-foreground/80 text-[12px] font-medium">
              Modüller <span className="text-muted-foreground tabular-nums">({secili.length}/{mods.length})</span>
            </Label>
            <div className="border-border/60 divide-border/60 max-h-56 divide-y overflow-y-auto rounded-[5px] border">
              {mods.map((m) => {
                const on = secili.includes(m.key)
                return (
                  <div key={m.key} className="hover:bg-muted/30 flex items-center gap-2 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{m.label}</span>
                    <Switch
                      checked={on}
                      onCheckedChange={(v) =>
                        setSecili((c) => (v ? [...c, m.key] : c.filter((x) => x !== m.key)))
                      }
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="border-border/50 flex items-center gap-2 border-t px-5 py-3">
          {paket && (
            <button
              onClick={() => onDelete(paket.id)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-rose-600 transition-colors hover:text-rose-700 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              Sil
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={onClose} disabled={saving}>
              İptal
            </Button>
            <Button size="sm" className="h-8 text-[12px]" onClick={kaydet} disabled={saving}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
