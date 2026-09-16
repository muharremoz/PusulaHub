"use client"

import { useMemo, useState } from "react"
import { Switch } from "@muharremoz/pusula-ui"
import { Checkbox } from "@/components/shared/form"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Plus, RefreshCw, Search, Smartphone, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  PARS_TIPLER, parsKullaniciAdiGecerliMi, parsRaporFirmayaOzelMi, parsSifreGecerliMi,
  type ParsKatalog, type ParsScript, type ParsWizardUser,
} from "@/lib/pars-katalog"

/**
 * Hizmetler adımı — Pars paneli. Pars hizmeti seçilince hizmet listesinin
 * altında açılır: kullanıcı satırları + program tipine göre gruplanmış
 * rapor/görev seçimi. Veritabanı bağlantısı sorulmaz; SQL adımında
 * belirlenen DB'ler kurulumda otomatik bağlanır.
 */

interface Props {
  katalog:        ParsKatalog | null
  loading:        boolean
  error:          string | null
  onRefresh:      () => void

  users:          ParsWizardUser[]
  onAddUser:      () => void
  onRemoveUser:   (id: number) => void
  onUpdateUser:   (id: number, patch: Partial<ParsWizardUser>) => void
  onRegenerate:   (id: number) => void

  /** Seçili Pusula programlarının Pars tipleri (−1 Perakende, −2 Toptan …) */
  programTipleri: number[]
  selectedReportIds: number[]
  onSetReportIds: (ids: number[]) => void
}

interface Grup {
  key:     string
  baslik:  string
  aciklama?: string
  items:   ParsScript[]
  /** Seçili programın grubu — varsayılan açık */
  birincil: boolean
}

export function StepServicesPars({
  katalog, loading, error, onRefresh,
  users, onAddUser, onRemoveUser, onUpdateUser, onRegenerate,
  programTipleri, selectedReportIds, onSetReportIds,
}: Props) {
  const [arama, setArama] = useState("")
  const [acik, setAcik]   = useState<Record<string, boolean>>({})

  const mevcutAdlar = useMemo(
    () => new Set((katalog?.users ?? []).map((u) => u.adi.trim().toLocaleLowerCase("tr-TR"))),
    [katalog],
  )
  const secili = useMemo(() => new Set(selectedReportIds), [selectedReportIds])

  /* ── Rapor grupları ── */
  const gruplar = useMemo<Grup[]>(() => {
    if (!katalog) return []
    const tipAdlari = new Map<number, string>(katalog.dtipler.map((d) => [d.tid, d.ad]))
    for (const [k, v] of Object.entries(PARS_TIPLER)) if (!tipAdlari.has(Number(k))) tipAdlari.set(Number(k), v)
    const tanimli = new Set(tipAdlari.keys())
    const secilenTipler = new Set(programTipleri)

    const out: Grup[] = []
    for (const tip of programTipleri) {
      out.push({
        key: `tip_${tip}`, birincil: true,
        baslik: `${tipAdlari.get(tip) ?? tip} raporları`,
        aciklama: "Seçilen programın raporları — mobilde görünenler ve firmaya özel olmayanlar varsayılan seçili",
        items: katalog.scripts.filter((s) => s.tipId === tip),
      })
    }
    const digerTipler = [...tanimli].filter((t) => !secilenTipler.has(t) && t !== 0)
    const diger = katalog.scripts.filter((s) => s.tipId !== null && digerTipler.includes(s.tipId))
    if (diger.length) {
      out.push({
        key: "diger", birincil: false,
        baslik: "Diğer programların raporları",
        aciklama: "Firmada kurulmayan programlara ait — normalde kapalı kalır",
        items: diger,
      })
    }
    const belirsiz = katalog.scripts.filter((s) => s.tipId === null || s.tipId === 0 || !tanimli.has(s.tipId))
    if (belirsiz.length) {
      out.push({
        key: "belirsiz", birincil: false,
        baslik: "Programı belirsiz / görevler",
        aciklama: "Tip tanımı olmayan kayıtlar ve zamanlayıcı görevleri (KUR GUNCELLE, bildirimler…)",
        items: belirsiz,
      })
    }
    return out
  }, [katalog, programTipleri])

  const aramaKucuk = arama.trim().toLocaleLowerCase("tr-TR")
  const filtrele = (items: ParsScript[]) =>
    aramaKucuk ? items.filter((s) => s.ad.toLocaleLowerCase("tr-TR").includes(aramaKucuk) || String(s.id) === aramaKucuk) : items

  const grupAcikMi = (g: Grup) => {
    if (aramaKucuk) return true
    if (g.key in acik) return acik[g.key]
    return g.birincil
  }

  const toggleRapor = (id: number) =>
    onSetReportIds(secili.has(id) ? selectedReportIds.filter((x) => x !== id) : [...selectedReportIds, id])

  const grupTumu = (g: Grup, sec: boolean) => {
    const ids = filtrele(g.items).map((s) => s.id)
    onSetReportIds(sec
      ? [...new Set([...selectedReportIds, ...ids])]
      : selectedReportIds.filter((x) => !ids.includes(x)))
  }

  /* ── Kullanıcı doğrulama ── */
  const adSayisi = new Map<string, number>()
  for (const u of users) {
    const k = u.username.trim().toLocaleLowerCase("tr-TR")
    if (k) adSayisi.set(k, (adSayisi.get(k) ?? 0) + 1)
  }
  const kullaniciHatasi = (u: ParsWizardUser): string | null => {
    const ad = u.username.trim()
    if (!ad) return null
    if (!parsKullaniciAdiGecerliMi(ad)) return "Boşluk ve tırnak olmadan 2–40 karakter"
    const k = ad.toLocaleLowerCase("tr-TR")
    if ((adSayisi.get(k) ?? 0) > 1) return "Listede iki kez yazılmış"
    if (mevcutAdlar.has(k)) return "Bu kullanıcı Pars'ta zaten var"
    return null
  }

  return (
    <div className="rounded-[5px] border border-border/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border">
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
          <Smartphone className="size-3" />
          Pars — Mobil Raporlama
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          title="Ayar.mdb'yi yeniden oku"
        >
          {loading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          Yenile
        </button>
      </div>

      <div className="p-3 space-y-4">
        {/* ── Kullanıcılar ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold">Pars Kullanıcıları</p>
            <button
              type="button"
              onClick={onAddUser}
              className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors"
            >
              <Plus className="size-3" />
              Kullanıcı Ekle
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mb-2">
            Kullanıcı adı, firmanın Pusula datasındaki kullanıcı adıyla <span className="font-semibold text-foreground">birebir aynı</span> olmalı.
            Şifre 6 karakter, telefonda kolay yazılır; istersen değiştir.
          </p>

          {users.length === 0 ? (
            <div className="rounded-[5px] border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
              Henüz kullanıcı yok — &quot;Kullanıcı Ekle&quot; ile başla.
            </div>
          ) : (
            <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40">
              <div className="grid grid-cols-[1fr_140px_90px_28px_28px] gap-2 items-center px-3 py-1.5 bg-muted/10 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <span>Kullanıcı adı</span><span>Şifre</span><span>Yetki</span><span /><span />
              </div>
              {users.map((u) => {
                const hata = kullaniciHatasi(u)
                const sifreHata = u.password && !parsSifreGecerliMi(u.password)
                return (
                  <div key={u.id} className="px-3 py-2">
                    <div className="grid grid-cols-[1fr_140px_90px_28px_28px] gap-2 items-center">
                      <input
                        type="text"
                        value={u.username}
                        onChange={(e) => onUpdateUser(u.id, { username: e.target.value })}
                        placeholder="datadaki kullanıcı adı"
                        spellCheck={false}
                        className={cn(
                          "h-8 px-2.5 text-[12px] font-mono rounded-[5px] border bg-background outline-none transition-colors focus:border-foreground/60",
                          hata ? "border-red-400" : "border-border",
                        )}
                      />
                      <input
                        type="text"
                        value={u.password}
                        onChange={(e) => onUpdateUser(u.id, { password: e.target.value })}
                        maxLength={6}
                        spellCheck={false}
                        className={cn(
                          "h-8 px-2.5 text-[12px] font-mono tracking-wider rounded-[5px] border bg-background outline-none transition-colors focus:border-foreground/60",
                          sifreHata ? "border-red-400" : "border-border",
                        )}
                      />
                      <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none">
                        <Switch checked={u.admin} onCheckedChange={(v) => onUpdateUser(u.id, { admin: !!v })} />
                        <span className={u.admin ? "font-medium" : "text-muted-foreground"}>{u.admin ? "Admin" : "Kullanıcı"}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => onRegenerate(u.id)}
                        title="Yeni şifre üret"
                        className="h-7 flex items-center justify-center rounded-[5px] border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <RefreshCw className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveUser(u.id)}
                        title="Satırı kaldır"
                        className="h-7 flex items-center justify-center rounded-[5px] text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    {(hata || sifreHata) && (
                      <p className="mt-1 text-[10px] text-red-500">
                        {hata ?? "Şifre 6 karakter harf/rakam olmalı"}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Raporlar ── */}
        <div>
          <div className="flex items-center justify-between mb-2 gap-3">
            <p className="text-[11px] font-semibold shrink-0">
              Raporlar / Görevler
              {katalog && (
                <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                  <span className="font-semibold text-foreground">{selectedReportIds.length}</span> / {katalog.scripts.length} seçili
                </span>
              )}
            </p>
            <div className="relative w-64">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={arama}
                onChange={(e) => setArama(e.target.value)}
                placeholder="Rapor ara…"
                className="w-full h-7 pl-6 pr-6 text-[11px] rounded-[5px] border border-border bg-background outline-none focus:border-foreground/60 transition-colors"
              />
              {arama && (
                <button type="button" onClick={() => setArama("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>

          {loading && !katalog && (
            <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <Skeleton className="size-4 rounded-[4px]" />
                  <Skeleton className="h-3 flex-1 rounded-[5px]" />
                  <Skeleton className="h-3 w-16 rounded-[5px]" />
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-500/25 bg-red-500/15 text-[11px] text-red-600 dark:text-red-400">
              <AlertTriangle className="size-3.5 shrink-0" />
              {error}
            </div>
          )}

          {katalog && programTipleri.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 mb-2 rounded-[5px] border border-amber-500/25 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" />
              Pusula programı seçilmedi — hangi raporların varsayılan açılacağı programa göre belirlenir. Yukarıdan bir program seç ya da raporları elle işaretle.
            </div>
          )}

          {katalog && (
            <div className="space-y-2">
              {gruplar.map((g) => {
                const items = filtrele(g.items)
                const seciliSayi = g.items.filter((s) => secili.has(s.id)).length
                const acikMi = grupAcikMi(g)
                const hepsiSecili = items.length > 0 && items.every((s) => secili.has(s.id))
                if (aramaKucuk && items.length === 0) return null
                return (
                  <div key={g.key} className="rounded-[5px] border border-border/50 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border">
                      <button
                        type="button"
                        onClick={() => setAcik((p) => ({ ...p, [g.key]: !acikMi }))}
                        className="flex items-center gap-1.5 text-left flex-1 min-w-0"
                      >
                        {acikMi ? <ChevronDown className="size-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />}
                        <span className="text-[11px] font-medium truncate">{g.baslik}</span>
                        <span className={cn(
                          "text-[10px] tabular-nums px-1.5 py-0.5 rounded-[5px] shrink-0",
                          seciliSayi > 0 ? "bg-primary text-primary-foreground font-semibold" : "bg-muted text-muted-foreground",
                        )}>
                          {seciliSayi}/{g.items.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => grupTumu(g, !hepsiSecili)}
                        className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        {hepsiSecili ? "Tümünü Kaldır" : "Tümünü Seç"}
                      </button>
                    </div>
                    {acikMi && (
                      <>
                        {g.aciklama && (
                          <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border/40">{g.aciklama}</p>
                        )}
                        <div className="divide-y divide-border/40 max-h-72 overflow-y-auto">
                          {items.map((s) => {
                            const isSel = secili.has(s.id)
                            const ozel = parsRaporFirmayaOzelMi(s.ad)
                            return (
                              <label
                                key={s.id}
                                className={cn(
                                  "flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors",
                                  isSel ? "bg-foreground/[0.03]" : "hover:bg-muted/20",
                                )}
                              >
                                <Checkbox checked={isSel} onCheckedChange={() => toggleRapor(s.id)} />
                                <span className={cn("text-[11px] flex-1 min-w-0 truncate", isSel ? "text-foreground font-medium" : "text-muted-foreground")}>
                                  {s.ad}
                                </span>
                                <span className="flex items-center gap-1 shrink-0">
                                  {!s.mobil && <Rozet>mobil değil</Rozet>}
                                  {s.musteri && <Rozet>müşteri</Rozet>}
                                  {ozel && <Rozet tone="amber">firmaya özel</Rozet>}
                                  <span className="text-[10px] font-mono text-muted-foreground/60 w-8 text-right">{s.id}</span>
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Rozet({ children, tone }: { children: React.ReactNode; tone?: "amber" }) {
  return (
    <span className={cn(
      "inline-flex rounded-[5px] px-1.5 py-0.5 text-[9px] font-medium",
      tone === "amber" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground",
    )}>
      {children}
    </span>
  )
}
