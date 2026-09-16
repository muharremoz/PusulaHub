"use client"

import { useEffect, useMemo, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/combobox-select"
import { Checkbox, Field } from "@/components/shared/form"
import { Switch } from "@muharremoz/pusula-ui"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, Loader2, RefreshCw, Save, Search, Smartphone, X, Database, FileText, KeyRound } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { PARS_TIPLER, parsSifreUret, parsSifreGecerliMi, parsKullaniciAdiGecerliMi, parsRaporGrubu } from "@/lib/pars-katalog"
import type { ParsFirmaDurum, ParsFirmaKullanici } from "@/app/api/setup/pars/firma/route"

/**
 * Firmanın Pars yönetimi — firma detayı > Hizmetler > Pars satırı menüsü.
 *
 * Üç iş: kullanıcı adı/şifre/yetki değiştirme, kullanıcının raporlarını
 * düzenleme, firmaya veritabanı bağlama. Hepsi Ayar.mdb'ye canlı yazar.
 */

type Sekme = "kullanicilar" | "raporlar" | "datalar"

interface Props {
  open:         boolean
  onOpenChange: (open: boolean) => void
  firkod:       string
  firmaAdi:     string
  serviceId:    number | null
  /** Menüden hangi işle açıldıysa o sekme (kullanicilar | raporlar | datalar) */
  baslangicSekmesi?: string
  /** Firmanın SQL veritabanları — "veritabanı ekle" listesi */
  dbSecenekleri: { name: string; programCode: string | null }[]
  onChanged?:   () => void
}

export function ParsYonetimSheet({ open, onOpenChange, firkod, firmaAdi, serviceId, baslangicSekmesi, dbSecenekleri, onChanged }: Props) {
  const [sekme, setSekme]     = useState<Sekme>("kullanicilar")
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [durum, setDurum]     = useState<ParsFirmaDurum | null>(null)
  const [busy, setBusy]       = useState<string | null>(null)

  /* Kullanıcı düzenleme taslakları: parsUserId → { ad, sifre, admin } */
  const [taslak, setTaslak] = useState<Record<number, { ad: string; sifre: string; admin: boolean }>>({})
  /* Rapor sekmesi */
  const [seciliKullanici, setSeciliKullanici] = useState<number | null>(null)
  const [raporSecim, setRaporSecim] = useState<number[]>([])
  const [raporArama, setRaporArama] = useState("")
  /* Data sekmesi */
  const [yeniData, setYeniData] = useState("")
  const [yeniTip, setYeniTip]   = useState("")

  const yukle = () => {
    if (!serviceId) return
    setLoading(true); setError(null)
    fetch(`/api/setup/pars/firma?firkod=${encodeURIComponent(firkod)}&serviceId=${serviceId}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok || d?.error) throw new Error(d?.error ?? "Pars bilgileri alınamadı")
        const veri = d as ParsFirmaDurum
        setDurum(veri)
        setTaslak(Object.fromEntries(veri.kullanicilar.map((u) => [u.parsUserId, { ad: u.username, sifre: u.password ?? "", admin: u.tipi === 1 }])))
        setSeciliKullanici((p) => p ?? veri.kullanicilar[0]?.parsUserId ?? null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open || !serviceId) return
    const acilis = (["kullanicilar", "raporlar", "datalar"] as const).find((s) => s === baslangicSekmesi) ?? "kullanicilar"
    setSekme(acilis); setYeniData(""); setYeniTip(""); setRaporArama("")
    yukle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, serviceId, firkod])

  // Rapor sekmesinde kullanıcı değişince o kullanıcının izinlileri yüklenir
  useEffect(() => {
    if (!durum || seciliKullanici == null) return
    const u = durum.kullanicilar.find((x) => x.parsUserId === seciliKullanici)
    setRaporSecim(u?.izinliRaporlar ?? [])
  }, [durum, seciliKullanici])

  const istek = async (govde: Record<string, unknown>, anahtar: string, basarili: string) => {
    if (!serviceId) return
    setBusy(anahtar)
    try {
      const r = await fetch("/api/setup/pars/firma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firkod, serviceId, ...govde }),
      })
      const d = await r.json()
      if (!r.ok || d?.error) throw new Error(d?.error ?? "İşlem başarısız")
      toast.success(basarili)
      onChanged?.()
      yukle()
      return d
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const kullaniciKaydet = (u: ParsFirmaKullanici) => {
    const t = taslak[u.parsUserId]
    if (!t) return
    const degisenAd    = t.ad.trim() !== u.username ? t.ad.trim() : ""
    const degisenSifre = t.sifre.trim() && t.sifre.trim() !== (u.password ?? "") ? t.sifre.trim() : ""
    const degisenTip   = (t.admin ? 1 : 0) !== u.tipi ? (t.admin ? 1 : 0) : undefined
    if (!degisenAd && !degisenSifre && degisenTip === undefined) { toast.info("Değişiklik yok"); return }
    void istek(
      { islem: "kullanici", parsUserId: u.parsUserId, yeniAd: degisenAd, yeniSifre: degisenSifre, tipi: degisenTip },
      `k-${u.parsUserId}`, "Kullanıcı güncellendi",
    )
  }

  /* ── Rapor listesi: kullanıcının kendi program tipleri önce ── */
  const firmaTipleri = useMemo(
    () => [...new Set((durum?.datalar ?? []).map((d) => d.tipId).filter((t): t is number => t !== null))],
    [durum],
  )
  const tipAdi = (t: number | null) =>
    t === null ? "—" : (durum?.dtipler.find((d) => d.tid === t)?.ad ?? PARS_TIPLER[t] ?? String(t))

  const raporListesi = useMemo(() => {
    if (!durum) return []
    const q = raporArama.trim().toLocaleLowerCase("tr-TR")
    const tanimli = new Set(durum.dtipler.map((d) => d.tid))
    return durum.scripts
      .filter((s) => !q || s.ad.toLocaleLowerCase("tr-TR").includes(q) || String(s.id) === q)
      .map((s) => ({ ...s, firmanin: s.tipId !== null && firmaTipleri.includes(s.tipId), grup: parsRaporGrubu(s, tanimli) }))
      .sort((a, b) => (Number(b.firmanin) - Number(a.firmanin)) || a.ad.localeCompare(b.ad, "tr"))
  }, [durum, raporArama, firmaTipleri])

  const dbEkleGecerli = !!yeniData && !!yeniTip && !(durum?.datalar ?? []).some((d) => d.data === yeniData)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!w-[820px] !max-w-[820px]">
        <SheetHeader>
          <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
            <Smartphone className="size-[18px]" />
          </span>
          <SheetTitle>Pars Yönetimi — {firkod}</SheetTitle>
          <SheetDescription>
            {firmaAdi}
            {durum?.baglanti?.adres && <> · <span className="font-mono">{durum.baglanti.adres}</span></>}
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-1 border-b border-border/50 px-4">
          {([
            { k: "kullanicilar", ad: "Kullanıcılar", ikon: <KeyRound className="size-3" />, n: durum?.kullanicilar.length },
            { k: "raporlar",     ad: "Raporlar",     ikon: <FileText className="size-3" />, n: undefined },
            { k: "datalar",      ad: "Veritabanları", ikon: <Database className="size-3" />, n: durum?.datalar.length },
          ] as const).map((t) => (
            <button
              key={t.k}
              onClick={() => setSekme(t.k)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 -mb-px transition-colors",
                sekme === t.k ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.ikon}{t.ad}
              {t.n != null && <span className="text-[9px] bg-muted rounded-full px-1.5">{t.n}</span>}
            </button>
          ))}
          <button
            onClick={yukle}
            disabled={loading}
            className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            {loading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}Yenile
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-500/25 bg-red-500/15 text-[11px] text-red-600 dark:text-red-400">
              <AlertTriangle className="size-3.5 shrink-0" />{error}
            </div>
          )}
          {loading && !durum && (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-[5px]" />)}</div>
          )}

          {/* ── Kullanıcılar ── */}
          {durum && sekme === "kullanicilar" && (
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="grid grid-cols-[1fr_140px_110px_84px] gap-2 px-3 py-1.5 bg-muted/20 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <span>Kullanıcı adı</span><span>Şifre</span><span>Yetki</span><span />
              </div>
              <div className="divide-y divide-border/40">
                {durum.kullanicilar.map((u) => {
                  const t = taslak[u.parsUserId] ?? { ad: u.username, sifre: u.password ?? "", admin: u.tipi === 1 }
                  const adHata = t.ad.trim() && !parsKullaniciAdiGecerliMi(t.ad.trim())
                  const sfHata = t.sifre.trim() && !parsSifreGecerliMi(t.sifre.trim())
                  const degisti = t.ad.trim() !== u.username || (t.sifre.trim() && t.sifre.trim() !== (u.password ?? "")) || (t.admin ? 1 : 0) !== u.tipi
                  return (
                    <div key={u.parsUserId} className="px-3 py-2">
                      <div className="grid grid-cols-[1fr_140px_110px_84px] gap-2 items-center">
                        <Input
                          value={t.ad}
                          onChange={(e) => setTaslak((p) => ({ ...p, [u.parsUserId]: { ...t, ad: e.target.value } }))}
                          className={cn("h-8 text-[12px] font-mono", adHata && "border-red-400")}
                        />
                        <div className="flex items-center gap-1">
                          <Input
                            value={t.sifre}
                            maxLength={6}
                            placeholder={u.password ? "" : "okunamadı"}
                            onChange={(e) => setTaslak((p) => ({ ...p, [u.parsUserId]: { ...t, sifre: e.target.value } }))}
                            className={cn("h-8 text-[12px] font-mono tracking-wider", sfHata && "border-red-400")}
                          />
                          <button
                            type="button"
                            title="Yeni şifre üret"
                            onClick={() => setTaslak((p) => ({ ...p, [u.parsUserId]: { ...t, sifre: parsSifreUret() } }))}
                            className="h-8 px-1.5 rounded-[5px] border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <RefreshCw className="size-3" />
                          </button>
                        </div>
                        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none">
                          <Switch checked={t.admin} onCheckedChange={(v) => setTaslak((p) => ({ ...p, [u.parsUserId]: { ...t, admin: !!v } }))} />
                          <span className={t.admin ? "font-medium" : "text-muted-foreground"}>{t.admin ? "Admin" : "Kullanıcı"}</span>
                        </label>
                        <button
                          type="button"
                          disabled={!degisti || !!adHata || !!sfHata || busy === `k-${u.parsUserId}`}
                          onClick={() => kullaniciKaydet(u)}
                          className="h-8 flex items-center justify-center gap-1 rounded-[5px] bg-primary text-primary-foreground text-[11px] font-medium disabled:opacity-30 disabled:pointer-events-none"
                        >
                          {busy === `k-${u.parsUserId}` ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}Kaydet
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        #{u.parsUserId} · {u.izinliRaporlar.length} rapor · {u.datalar.length ? u.datalar.join(", ") : "veritabanı yok"}
                        {(adHata || sfHata) && <span className="ml-2 text-red-500">{adHata ? "ad geçersiz" : "şifre 6 karakter harf/rakam olmalı"}</span>}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Raporlar ── */}
          {durum && sekme === "raporlar" && (
            <>
              <div className="flex items-center gap-2">
                <Select value={seciliKullanici != null ? String(seciliKullanici) : ""} onValueChange={(v) => setSeciliKullanici(Number(v))}>
                  <SelectTrigger className="h-8 text-[12px] rounded-[5px] w-56"><SelectValue placeholder="Kullanıcı seç…" /></SelectTrigger>
                  <SelectContent>
                    {durum.kullanicilar.map((u) => (
                      <SelectItem key={u.parsUserId} value={String(u.parsUserId)} className="text-[12px]">
                        {u.username} <span className="text-muted-foreground">({u.izinliRaporlar.length})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
                  <input
                    value={raporArama}
                    onChange={(e) => setRaporArama(e.target.value)}
                    placeholder="Rapor ara…"
                    className="w-full h-8 pl-6 pr-6 text-[11px] rounded-[5px] border border-border bg-background outline-none focus:border-foreground/60"
                  />
                  {raporArama && (
                    <button type="button" onClick={() => setRaporArama("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="size-3" />
                    </button>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0"><span className="font-semibold text-foreground">{raporSecim.length}</span> seçili</span>
              </div>

              <div className="rounded-[5px] border border-border/50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20 border-b border-border">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Firmanın programları önce ({firmaTipleri.map(tipAdi).join(", ") || "tip yok"})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const ids = raporListesi.filter((s) => s.firmanin && s.mobil).map((s) => s.id)
                      setRaporSecim((p) => [...new Set([...p, ...ids])])
                    }}
                    className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    Firmanın mobil raporlarını seç
                  </button>
                </div>
                <div className="divide-y divide-border/40 max-h-[340px] overflow-y-auto">
                  {raporListesi.map((s) => {
                    const sec = raporSecim.includes(s.id)
                    return (
                      <label key={s.id} className={cn("flex items-center gap-2.5 px-3 py-1.5 cursor-pointer", sec && "bg-foreground/[0.03]")}>
                        <Checkbox
                          checked={sec}
                          onCheckedChange={() => setRaporSecim((p) => p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id])}
                        />
                        <span className={cn("text-[11px] flex-1 min-w-0 truncate", sec ? "font-medium" : "text-muted-foreground")}>{s.ad}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{tipAdi(s.tipId)}</span>
                        {!s.mobil && <span className="text-[9px] rounded-[5px] bg-muted px-1.5 py-0.5 text-muted-foreground shrink-0">mobil değil</span>}
                        <span className="text-[10px] font-mono text-muted-foreground/60 w-8 text-right shrink-0">{s.id}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <button
                type="button"
                disabled={seciliKullanici == null || busy === "rapor"}
                onClick={() => istek({ islem: "raporlar", parsUserId: seciliKullanici, izinliRaporlar: raporSecim }, "rapor", "Rapor yetkileri güncellendi")}
                className="flex items-center justify-center gap-1.5 h-8 rounded-[5px] bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-40"
              >
                {busy === "rapor" ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Rapor Yetkilerini Kaydet
              </button>
            </>
          )}

          {/* ── Veritabanları ── */}
          {durum && sekme === "datalar" && (
            <>
              <div className="rounded-[5px] border border-border/50 overflow-hidden">
                <div className="px-3 py-1.5 bg-muted/20 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Pars&apos;a bağlı veritabanları
                </div>
                <div className="divide-y divide-border/40">
                  {durum.datalar.length === 0 ? (
                    <p className="px-3 py-3 text-[11px] text-muted-foreground">Bağlı veritabanı yok — kullanıcı rapor göremez.</p>
                  ) : durum.datalar.map((d) => (
                    <div key={d.data} className="flex items-center justify-between px-3 py-2">
                      <span className="text-[12px] font-mono">{d.data}</span>
                      <span className="text-[11px] text-muted-foreground">{tipAdi(d.tipId)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[5px] border border-border/50 overflow-hidden">
                <div className="px-3 py-1.5 bg-muted/20 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Veritabanı ekle
                </div>
                <div className="p-3 space-y-3">
                  <Field label="Firmanın veritabanı" hint="Yalnız bu firmanın kullanıcılarına açılır, diğer firmalara yasaklanır.">
                    <Select value={yeniData} onValueChange={setYeniData}>
                      <SelectTrigger className="h-8 text-[12px] rounded-[5px]"><SelectValue placeholder="Veritabanı seç…" /></SelectTrigger>
                      <SelectContent>
                        {dbSecenekleri.map((db) => (
                          <SelectItem key={db.name} value={db.name} className="text-[12px]">{db.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Program tipi">
                    <Select value={yeniTip} onValueChange={setYeniTip}>
                      <SelectTrigger className="h-8 text-[12px] rounded-[5px]"><SelectValue placeholder="Tip seç…" /></SelectTrigger>
                      <SelectContent>
                        {(durum.dtipler.length ? durum.dtipler : Object.entries(PARS_TIPLER).map(([tid, ad]) => ({ tid: Number(tid), ad })))
                          .map((t) => <SelectItem key={t.tid} value={String(t.tid)} className="text-[12px]">{t.ad}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <button
                    type="button"
                    disabled={!dbEkleGecerli || busy === "data"}
                    onClick={() => istek({ islem: "data-ekle", data: yeniData, tipId: Number(yeniTip) }, "data", "Veritabanı Pars'a bağlandı")}
                    className="w-full flex items-center justify-center gap-1.5 h-8 rounded-[5px] bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-40"
                  >
                    {busy === "data" ? <Loader2 className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
                    Veritabanını Bağla
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <SheetFooter className="flex-row">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex-1 text-[11px] font-medium py-2 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
          >
            Kapat
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
