"use client"

import { useMemo, useState } from "react"
import { Switch } from "@muharremoz/pusula-ui"
import { Checkbox } from "@/components/shared/form"
import { Skeleton } from "@/components/ui/skeleton"
import { Combobox } from "@/components/ui/combobox"
import { AlertTriangle, ChevronDown, ChevronRight, Copy, Loader2, Plus, RefreshCw, Search, Smartphone, Trash2, Users, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  PARS_TIPLER, parsKullaniciAdiGecerliMi, parsRaporFirmayaOzelMi, parsSifreGecerliMi,
  type ParsKatalog, type ParsScript, type ParsWizardUser,
} from "@/lib/pars-katalog"

/**
 * Hizmetler adımı — Pars paneli. Pars hizmeti seçilince hizmet listesinin
 * altında açılır. Veritabanı bağlantısı sorulmaz; SQL adımında belirlenen
 * DB'ler kurulumda otomatik bağlanır.
 *
 * Pars'ta rapor/görev yetkisi KULLANICI BAŞINA (YasakliRapor.UID) — bu yüzden
 * panel iki bölmeli: solda kullanıcılar, sağda seçili kullanıcının raporları.
 * "Kopyala" başka bir kullanıcının seçimini buna alır; "Tümüne uygula" bu
 * kullanıcının seçimini herkese yazar (23.10.2026 — önceden tek liste herkese
 * aynı yazılıyordu).
 */

interface Props {
  katalog:        ParsKatalog | null
  loading:        boolean
  error:          string | null
  onRefresh:      () => void

  users:          ParsWizardUser[]
  onAddUser:      () => void
  onRemoveUser:   (id: number) => void
  /** Kullanıcı alanları ve rapor seçimi (`reportIds`) bu yoldan güncellenir */
  onUpdateUser:   (id: number, patch: Partial<ParsWizardUser>) => void
  onRegenerate:   (id: number) => void

  /** Seçili Pusula programlarının Pars tipleri (−1 Perakende, −2 Toptan …) */
  programTipleri: number[]
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
  programTipleri,
}: Props) {
  const [arama, setArama] = useState("")
  const [acik, setAcik]   = useState<Record<string, boolean>>({})
  const [seciliId, setSeciliId] = useState<number | null>(null)

  /*  Seçili kullanıcı: silinmişse ya da hiç seçilmemişse ilk satır. */
  const aktif = users.find((u) => u.id === seciliId) ?? users[0] ?? null
  const reportIds = useMemo(() => aktif?.reportIds ?? [], [aktif])

  const mevcutAdlar = useMemo(
    () => new Set((katalog?.users ?? []).map((u) => u.adi.trim().toLocaleLowerCase("tr-TR"))),
    [katalog],
  )
  const secili = useMemo(() => new Set(reportIds), [reportIds])
  const setRaporlar = (ids: number[]) => { if (aktif) onUpdateUser(aktif.id, { reportIds: ids }) }

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
        aciklama: "Seçilen programın raporları — hangileri açılacaksa işaretle; firmaya özel olanlar rozetle gösterilir",
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
    setRaporlar(secili.has(id) ? reportIds.filter((x) => x !== id) : [...reportIds, id])

  const grupTumu = (g: Grup, sec: boolean) => {
    const ids = filtrele(g.items).map((s) => s.id)
    setRaporlar(sec ? [...new Set([...reportIds, ...ids])] : reportIds.filter((x) => !ids.includes(x)))
  }

  const kopyala = (kaynakId: string) => {
    const k = users.find((u) => String(u.id) === kaynakId)
    if (k && aktif) onUpdateUser(aktif.id, { reportIds: [...k.reportIds] })
  }
  const tumuneUygula = () => {
    if (!aktif) return
    for (const u of users) if (u.id !== aktif.id) onUpdateUser(u.id, { reportIds: [...aktif.reportIds] })
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
  const adi = (u: ParsWizardUser) => u.username.trim() || "Adsız kullanıcı"
  const digerleri = users.filter((u) => u.id !== aktif?.id)

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

      <div className="p-3 space-y-3">
        <p className="text-[10px] text-muted-foreground">
          Kullanıcı adı, firmanın Pusula datasındaki kullanıcı adıyla <span className="font-semibold text-foreground">birebir aynı</span> olmalı.
          Şifre 6 karakter, telefonda kolay yazılır. Rapor yetkisi <span className="font-semibold text-foreground">kullanıcı başına</span> verilir —
          soldan kullanıcıyı seç, sağdan raporlarını işaretle.
        </p>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-500/25 bg-red-500/15 text-[11px] text-red-600 dark:text-red-400">
            <AlertTriangle className="size-3.5 shrink-0" />
            {error}
          </div>
        )}

        {katalog && programTipleri.length === 0 && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-amber-500/25 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3.5 shrink-0" />
            Pusula programı seçilmedi — hangi raporların öne çıkacağı programa göre belirlenir. Yukarıdan bir program seç ya da raporları elle işaretle.
          </div>
        )}

        <div className="grid grid-cols-[230px_1fr] gap-3 items-start">
          {/* ── Sol: kullanıcılar ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold">
                Kullanıcılar <span className="text-muted-foreground font-normal">· {users.length}</span>
              </p>
              <button
                type="button"
                onClick={onAddUser}
                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors"
              >
                <Plus className="size-3" />
                Ekle
              </button>
            </div>

            {users.length === 0 ? (
              <div className="rounded-[5px] border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                Henüz kullanıcı yok — &quot;Ekle&quot; ile başla.
              </div>
            ) : (
              users.map((u) => {
                const hata = kullaniciHatasi(u)
                const sifreHata = u.password && !parsSifreGecerliMi(u.password)
                const seciliMi = u.id === aktif?.id
                return (
                  <div
                    key={u.id}
                    onClick={() => setSeciliId(u.id)}
                    className={cn(
                      "rounded-[5px] border p-2 space-y-1.5 cursor-pointer transition-colors",
                      seciliMi ? "border-foreground/50 bg-foreground/[0.03] ring-1 ring-foreground/10" : "border-border/60 hover:bg-muted/20",
                    )}
                  >
                    <input
                      type="text"
                      value={u.username}
                      onChange={(e) => onUpdateUser(u.id, { username: e.target.value })}
                      onFocus={() => setSeciliId(u.id)}
                      placeholder="datadaki kullanıcı adı"
                      spellCheck={false}
                      className={cn(
                        "w-full h-7 px-2 text-[12px] rounded-[5px] border bg-background outline-none transition-colors focus:border-foreground/60",
                        hata ? "border-red-400" : "border-border",
                      )}
                    />
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={u.password}
                        onChange={(e) => onUpdateUser(u.id, { password: e.target.value })}
                        onFocus={() => setSeciliId(u.id)}
                        maxLength={6}
                        spellCheck={false}
                        title="Şifre"
                        className={cn(
                          "w-[74px] h-7 px-2 text-[12px] tracking-wider rounded-[5px] border bg-background outline-none transition-colors focus:border-foreground/60",
                          sifreHata ? "border-red-400" : "border-border",
                        )}
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRegenerate(u.id) }}
                        title="Yeni şifre üret"
                        className="size-7 shrink-0 flex items-center justify-center rounded-[5px] border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <RefreshCw className="size-3" />
                      </button>
                      <label className="ml-auto flex items-center gap-1 text-[10px] cursor-pointer select-none" onClick={(e) => e.stopPropagation()}>
                        <Switch checked={u.admin} onCheckedChange={(v) => onUpdateUser(u.id, { admin: !!v })} />
                        <span className={u.admin ? "font-medium" : "text-muted-foreground"}>{u.admin ? "Admin" : "Kull."}</span>
                      </label>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRemoveUser(u.id) }}
                        title="Kullanıcıyı kaldır"
                        className="size-7 shrink-0 flex items-center justify-center rounded-[5px] text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "inline-flex rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                        u.reportIds.length === 0 ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-muted text-muted-foreground",
                      )}>
                        {u.reportIds.length === 0 ? "rapor seçilmedi" : `${u.reportIds.length} rapor`}
                      </span>
                      {seciliMi && <ChevronRight className="size-3.5 text-muted-foreground" />}
                    </div>
                    {(hata || sifreHata) && (
                      <p className="text-[10px] text-red-500">{hata ?? "Şifre 6 karakter harf/rakam olmalı"}</p>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* ── Sağ: seçili kullanıcının raporları ── */}
          <div className="min-w-0 space-y-2">
            {!aktif ? (
              <div className="rounded-[5px] border border-dashed border-border px-3 py-8 text-center text-[11px] text-muted-foreground">
                Rapor seçmek için önce bir kullanıcı ekle.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold min-w-0 truncate">
                    {adi(aktif)} — raporlar
                    {katalog && (
                      <span className={cn("ml-2 text-[10px] font-normal", reportIds.length === 0 ? "text-red-500" : "text-muted-foreground")}>
                        <span className={cn("font-semibold", reportIds.length === 0 ? "" : "text-foreground")}>{reportIds.length}</span> / {katalog.scripts.length} seçili
                      </span>
                    )}
                  </p>
                  {digerleri.length > 0 && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Combobox
                        items={digerleri}
                        getKey={(u) => String(u.id)}
                        getLabel={(u) => adi(u)}
                        onChange={kopyala}
                        align="end"
                        searchPlaceholder="Kullanıcı ara…"
                        renderItem={(u) => (
                          <span className="flex w-full items-center justify-between gap-2">
                            <span className="truncate">{adi(u)}</span>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{u.reportIds.length} rapor</span>
                          </span>
                        )}
                        trigger={
                          <button
                            type="button"
                            title="Başka bir kullanıcının rapor yetkilerini bu kullanıcıya kopyala"
                            className="flex items-center gap-1 h-7 px-2 text-[10px] font-medium rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors"
                          >
                            <Copy className="size-3" />
                            Kopyala
                          </button>
                        }
                      />
                      <button
                        type="button"
                        onClick={tumuneUygula}
                        title="Bu kullanıcının rapor seçimini diğer tüm kullanıcılara uygula"
                        className="flex items-center gap-1 h-7 px-2 text-[10px] font-medium rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors"
                      >
                        <Users className="size-3" />
                        Tümüne uygula
                      </button>
                    </div>
                  )}
                </div>

                <div className="relative">
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
                                        <span className="text-[10px] text-muted-foreground/60 w-8 text-right tabular-nums">{s.id}</span>
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
              </>
            )}
          </div>
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
