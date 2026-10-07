"use client"

/**
 * Pusula Connect — Duyurular sekmesi (Hub /connect).
 * Hub'dan müşterilerin Connect uygulamasına mesaj: tüm müşteriler, bir firma ya da firmadaki tek kullanıcı.
 * Uygulamada ana ekranın üstünde şerit + tepside Windows bildirimi olarak çıkar; "Okudum" Hub'a döner.
 * Veri: services/pusula-connect /admin/duyurular (lib/connect-yonetim.ts).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { ListeKarti, ListeThead, ListeBosSatir, ListeSayfalama, ListeAksiyonButonu } from "@/components/shared/liste-karti"
import { MetinFiltre, SecimFiltre } from "@/components/shared/liste-filtreleri"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Combobox } from "@/components/ui/combobox"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Field } from "@/components/shared/form"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@muharremoz/pusula-ui"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { AlertTriangle, Ban, Eye, Info, Megaphone, MoreVertical, OctagonAlert, Plus } from "lucide-react"
import type { ConnectCihazSatir, ConnectDuyuru, ConnectDuyuruOkuyan, ConnectDuyuruOnem } from "@/lib/connect-yonetim"

/** Servis zamanları SQLite datetime('now') = UTC "YYYY-MM-DD HH:MM:SS". */
const zaman = (s: string | null) => (s ? new Date(s.replace(" ", "T") + "Z") : null)
const tarihMetni = (s: string | null) =>
  zaman(s)?.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" }) ?? "—"

const ONEM: Record<ConnectDuyuruOnem, { ad: string; ikon: React.ReactNode; sinif: string }> = {
  bilgi: { ad: "Bilgi", ikon: <Info className="size-3" />, sinif: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  uyari: { ad: "Uyarı", ikon: <AlertTriangle className="size-3" />, sinif: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  kritik: { ad: "Önemli", ikon: <OctagonAlert className="size-3" />, sinif: "bg-red-500/15 text-red-700 dark:text-red-400" },
}
const ONEMLER: ConnectDuyuruOnem[] = ["bilgi", "uyari", "kritik"]

type YayinDurumu = "yayinda" | "suresi_doldu" | "kaldirildi"
const yayinDurumu = (d: ConnectDuyuru): YayinDurumu =>
  d.iptal ? "kaldirildi" : d.bitis && (zaman(d.bitis)?.getTime() ?? 0) < Date.now() ? "suresi_doldu" : "yayinda"
const YAYIN: Record<YayinDurumu, { ad: string; sinif: string }> = {
  yayinda: { ad: "Yayında", sinif: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  suresi_doldu: { ad: "Süresi doldu", sinif: "bg-muted text-muted-foreground" },
  kaldirildi: { ad: "Kaldırıldı", sinif: "bg-muted text-muted-foreground" },
}
const YAYIN_DURUMLARI: YayinDurumu[] = ["yayinda", "suresi_doldu", "kaldirildi"]

const hedefMetni = (d: Pick<ConnectDuyuru, "firmaId" | "firmaAdi" | "kullanici">) =>
  !d.firmaId ? "Tüm müşteriler" : `${d.firmaId} ${d.firmaAdi ?? ""}`.trim() + (d.kullanici ? ` · ${d.kullanici}` : "")

function OnemRozeti({ onem }: { onem: ConnectDuyuruOnem }) {
  const o = ONEM[onem] ?? ONEM.bilgi
  return <span className={cn("inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", o.sinif)}>{o.ikon}{o.ad}</span>
}

export function DuyurularSekmesi({ cihazlar, yenile = 0 }: { cihazlar: ConnectCihazSatir[] | null; yenile?: number }) {
  const [duyurular, setDuyurular] = useState<ConnectDuyuru[] | null>(null)
  const [yeniAcik, setYeniAcik] = useState(false)
  const [secili, setSecili] = useState<ConnectDuyuru | null>(null)
  const [kaldir, setKaldir] = useState<ConnectDuyuru | null>(null)

  const yukle = useCallback(async () => {
    try {
      const r = await fetch("/api/connect/duyurular", { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error ?? "Duyurular alınamadı")
      setDuyurular(Array.isArray(d) ? d : [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Duyurular alınamadı")
      setDuyurular((o) => o ?? [])
    }
  }, [])
  // İlk yükleme + 30 sn'de bir: okunma bilgisi istemcilerden nabızla (~60 sn) gelir
  useEffect(() => {
    void yukle()
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void yukle() }, 30_000)
    return () => window.clearInterval(t)
  }, [yukle])
  useEffect(() => { if (yenile) void yukle() }, [yenile, yukle])

  const kaldirOnayla = async () => {
    if (!kaldir) return
    try {
      const r = await fetch(`/api/connect/duyurular/${kaldir.id}`, { method: "POST" })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`)
      toast.success("Duyuru yayından kaldırıldı", { description: "Uygulamalarda bir dakika içinde kaybolur." })
      setKaldir(null)
      await yukle()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kaldırılamadı")
    }
  }

  return (
    <>
      <DuyuruListesi duyurular={duyurular} onYeni={() => setYeniAcik(true)} onSec={setSecili} onKaldir={setKaldir} />
      <YeniDuyuru acik={yeniAcik} cihazlar={cihazlar} onKapat={() => setYeniAcik(false)} onYayinlandi={() => { setYeniAcik(false); void yukle() }} />
      <DuyuruDetay duyuru={secili} onKapat={() => { setSecili(null); void yukle() }} onKaldir={(d) => { setSecili(null); setKaldir(d) }} />
      <AlertDialog open={!!kaldir} onOpenChange={(o) => !o && setKaldir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duyuru yayından kaldırılsın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{kaldir?.baslik}</span> müşterilerin uygulamasından kaldırılır. Okuma kaydı Hub&apos;da kalır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white" onClick={(e) => { e.preventDefault(); void kaldirOnayla() }}>Kaldır</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function DuyuruListesi({
  duyurular, onYeni, onSec, onKaldir,
}: {
  duyurular: ConnectDuyuru[] | null
  onYeni: () => void
  onSec: (d: ConnectDuyuru) => void
  onKaldir: (d: ConnectDuyuru) => void
}) {
  const [baslik, setBaslik] = useState("")
  const [hedef, setHedef] = useState("")
  const [onem, setOnem] = useState<ConnectDuyuruOnem[]>([])
  const [yayin, setYayin] = useState<YayinDurumu[]>([])
  const [sayfa, setSayfa] = useState(1)

  const filtreli = useMemo(() => (duyurular ?? []).filter((d) => {
    if (baslik && !`${d.baslik} ${d.metin}`.toLocaleLowerCase("tr").includes(baslik.toLocaleLowerCase("tr"))) return false
    if (hedef && !hedefMetni(d).toLocaleLowerCase("tr").includes(hedef.toLocaleLowerCase("tr"))) return false
    if (onem.length && !onem.includes(d.onem)) return false
    if (yayin.length && !yayin.includes(yayinDurumu(d))) return false
    return true
  }), [duyurular, baslik, hedef, onem, yayin])
  useEffect(() => setSayfa(1), [baslik, hedef, onem, yayin])
  const gorunen = filtreli.slice((sayfa - 1) * 25, sayfa * 25)

  return (
    <ListeKarti
      baslik="Duyurular"
      ikon={<Megaphone className="size-3.5" />}
      toplam={duyurular?.length ?? 0}
      filtreli={filtreli.length}
      aksiyon={<ListeAksiyonButonu onClick={onYeni}><Plus className="size-3.5" />Yeni duyuru</ListeAksiyonButonu>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[14px] leading-[20px] font-medium">
          <ListeThead>
            <th className="px-4 py-1.5 text-left font-medium"><MetinFiltre label="Duyuru" value={baslik} onChange={setBaslik} /></th>
            <th className="px-4 py-1.5 text-left font-medium"><SecimFiltre label="Önem" options={ONEMLER} getLabel={(o) => ONEM[o].ad} selected={onem} onChange={setOnem} /></th>
            <th className="px-4 py-1.5 text-left font-medium"><MetinFiltre label="Hedef" value={hedef} onChange={setHedef} /></th>
            <th className="px-4 py-1.5 text-left font-medium">Okunma</th>
            <th className="px-4 py-1.5 text-left font-medium"><SecimFiltre label="Durum" options={YAYIN_DURUMLARI} getLabel={(y) => YAYIN[y].ad} selected={yayin} onChange={setYayin} /></th>
            <th className="px-4 py-1.5 text-left font-medium">Yayınlandı</th>
            <th className="px-4 py-1.5 text-left font-medium">Bitiş</th>
            <th className="px-4 py-1.5 text-right font-medium">İşlem</th>
          </ListeThead>
          <tbody>
            {!duyurular ? (
              [0, 1, 2].map((i) => <tr key={i}><td colSpan={8} className="px-4 py-2"><Skeleton className="h-5 w-full" /></td></tr>)
            ) : gorunen.length === 0 ? (
              <ListeBosSatir sutunSayisi={8} toplam={duyurular.length} bosMesaj="Henüz duyuru yok. Bakım, kesinti ya da yenilikleri Yeni duyuru ile müşterilerin Connect uygulamasına gönderin." />
            ) : gorunen.map((d) => {
              const y = yayinDurumu(d)
              const oran = d.hedefCihaz ? Math.round((d.okuyan / d.hedefCihaz) * 100) : 0
              return (
                <tr key={d.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/20" onClick={() => onSec(d)}>
                  <td className="max-w-[360px] px-4 py-1.5">
                    <div className="truncate">{d.baslik}</div>
                    <div className="text-muted-foreground truncate text-[12px] font-normal">{d.metin}</div>
                  </td>
                  <td className="px-4 py-1.5"><OnemRozeti onem={d.onem} /></td>
                  <td className="px-4 py-1.5 text-[13px] whitespace-nowrap">{hedefMetni(d)}</td>
                  <td className="px-4 py-1.5 whitespace-nowrap">
                    {d.hedefCihaz === 0 ? <span className="text-muted-foreground text-[12px]">Cihaz yok</span> : (
                      <span className="inline-flex items-center gap-2 text-[12px] tabular-nums">
                        <span className="bg-muted relative h-1.5 w-16 overflow-hidden rounded-full">
                          <span className="bg-primary absolute inset-y-0 left-0" style={{ width: `${oran}%` }} />
                        </span>
                        {d.okuyan}/{d.hedefCihaz}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-1.5"><span className={cn("inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", YAYIN[y].sinif)}>{YAYIN[y].ad}</span></td>
                  <td className="px-4 py-1.5 text-[12px] whitespace-nowrap tabular-nums">
                    {tarihMetni(d.olusturma)}
                    {d.olusturan && <span className="text-muted-foreground"> · {d.olusturan}</span>}
                  </td>
                  <td className="text-muted-foreground px-4 py-1.5 text-[12px] whitespace-nowrap tabular-nums">{d.bitis ? tarihMetni(d.bitis) : "Süresiz"}</td>
                  <td className="px-4 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7" aria-label="İşlemler"><MoreVertical className="size-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => onSec(d)}><Eye className="size-3.5" />Kimler okudu</DropdownMenuItem>
                        {y === "yayinda" && (
                          <DropdownMenuItem className="gap-2 text-[12px] text-rose-600 focus:text-rose-600" onClick={() => onKaldir(d)}><Ban className="size-3.5" />Yayından kaldır</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ListeSayfalama sayfa={sayfa} onSayfaChange={setSayfa} toplam={filtreli.length} />
    </ListeKarti>
  )
}

const SURELER = [
  { gun: "1", ad: "1 gün" },
  { gun: "3", ad: "3 gün" },
  { gun: "7", ad: "7 gün" },
  { gun: "30", ad: "30 gün" },
  { gun: "0", ad: "Süresiz" },
] as const

type HedefTur = "hepsi" | "firma" | "kullanici"

function YeniDuyuru({
  acik, cihazlar, onKapat, onYayinlandi,
}: {
  acik: boolean
  cihazlar: ConnectCihazSatir[] | null
  onKapat: () => void
  onYayinlandi: () => void
}) {
  const [baslik, setBaslik] = useState("")
  const [metin, setMetin] = useState("")
  const [onem, setOnem] = useState<ConnectDuyuruOnem>("bilgi")
  const [hedefTur, setHedefTur] = useState<HedefTur>("hepsi")
  const [firmaId, setFirmaId] = useState("")
  const [kullanici, setKullanici] = useState("")
  const [gun, setGun] = useState("7")
  const [gonderiliyor, setGonderiliyor] = useState(false)

  useEffect(() => {
    if (!acik) return
    setBaslik(""); setMetin(""); setOnem("bilgi"); setHedefTur("hepsi"); setFirmaId(""); setKullanici(""); setGun("7")
  }, [acik])

  // Hedef seçenekleri: Connect kurulu (iptal edilmemiş) cihazı olan firmalar ve kullanıcılar
  const etkin = useMemo(() => (cihazlar ?? []).filter((c) => !c.iptal), [cihazlar])
  const firmalar = useMemo(() => {
    const m = new Map<string, { id: string; ad: string; cihaz: number }>()
    for (const c of etkin) {
      const f = m.get(c.firmaId) ?? { id: c.firmaId, ad: c.firmaAdi, cihaz: 0 }
      f.cihaz++
      m.set(c.firmaId, f)
    }
    return [...m.values()].sort((a, b) => a.ad.localeCompare(b.ad, "tr"))
  }, [etkin])
  const kullanicilar = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of etkin) if (c.firmaId === firmaId) m.set(c.kullanici, (m.get(c.kullanici) ?? 0) + 1)
    return [...m.entries()].map(([ad, cihaz]) => ({ ad, cihaz })).sort((a, b) => a.ad.localeCompare(b.ad, "tr"))
  }, [etkin, firmaId])

  const hedefCihaz = hedefTur === "hepsi" ? etkin.length
    : hedefTur === "firma" ? etkin.filter((c) => c.firmaId === firmaId).length
    : etkin.filter((c) => c.firmaId === firmaId && c.kullanici === kullanici).length
  const hedefTamam = hedefTur === "hepsi" || (hedefTur === "firma" ? !!firmaId : !!firmaId && !!kullanici)
  const gecerli = !!baslik.trim() && !!metin.trim() && hedefTamam

  const yayinla = async () => {
    if (!gecerli) return
    setGonderiliyor(true)
    try {
      const firma = firmalar.find((f) => f.id === firmaId)
      const r = await fetch("/api/connect/duyurular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baslik: baslik.trim(), metin: metin.trim(), onem,
          firmaId: hedefTur === "hepsi" ? null : firmaId,
          firmaAdi: hedefTur === "hepsi" ? null : firma?.ad ?? null,
          kullanici: hedefTur === "kullanici" ? kullanici : null,
          gunSayisi: Number(gun),
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`)
      toast.success("Duyuru yayınlandı", { description: `${hedefCihaz} cihaza bir dakika içinde ulaşır; kapalı olanlara açılınca.` })
      onYayinlandi()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Yayınlanamadı")
    } finally {
      setGonderiliyor(false)
    }
  }

  // MODAL (07.10.2026, kullanıcı kararı): cihaz detay modalıyla aynı kimlik — gri başlık şeridi + ikon kutusu,
  // başlıklı bölümler (İçerik / Hedef), alt şeritte düğmeler.
  return (
    <Dialog open={acik} onOpenChange={(o) => !o && onKapat()}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(980px,94vw)]">
        <div className="flex items-center gap-3 border-b bg-[var(--section-bg)] p-4 pr-12">
          <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
            <Megaphone className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[15px] font-semibold">Yeni duyuru</DialogTitle>
            <DialogDescription className="text-[12px]">Müşterilerin Connect uygulamasında şerit ve Windows bildirimi olarak görünür.</DialogDescription>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <ModalBolumu baslik="İçerik">
            <Field label="Başlık" required hint={`${baslik.length}/120`}>
              <Input value={baslik} maxLength={120} placeholder="Ör. Bu gece 02:00–03:00 arası bakım" onChange={(e) => setBaslik(e.target.value)} />
            </Field>
            <Field label="Metin" required>
              <Textarea rows={10} className="resize-none" value={metin} maxLength={4000} placeholder="Müşterinin ne yapması gerektiğini de yazın." onChange={(e) => setMetin(e.target.value)} />
            </Field>
          </ModalBolumu>
          <ModalBolumu baslik="Hedef ve süre">
            <Field label="Önem" hint={onem === "bilgi" ? "Yenilik, hatırlatma." : onem === "uyari" ? "Planlı bakım, kısa kesinti." : "Kesinti ya da hemen yapılması gereken bir şey."}>
              <ToggleGroup type="single" value={onem} onValueChange={(v) => v && setOnem(v as ConnectDuyuruOnem)} variant="outline" size="sm" className="justify-start">
                {ONEMLER.map((o) => (
                  <ToggleGroupItem key={o} value={o} className="h-8 gap-1.5 px-3 text-[12px]">{ONEM[o].ikon}{ONEM[o].ad}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field label="Kime" hint={hedefTamam ? `${hedefCihaz} kayıtlı cihaz` : undefined}>
              <ToggleGroup
                type="single"
                value={hedefTur}
                onValueChange={(v) => { if (!v) return; setHedefTur(v as HedefTur); if (v === "hepsi") { setFirmaId(""); setKullanici("") } }}
                variant="outline"
                size="sm"
                className="justify-start"
              >
                <ToggleGroupItem value="hepsi" className="h-8 px-3 text-[12px]">Tüm müşteriler</ToggleGroupItem>
                <ToggleGroupItem value="firma" className="h-8 px-3 text-[12px]">Bir firma</ToggleGroupItem>
                <ToggleGroupItem value="kullanici" className="h-8 px-3 text-[12px]">Bir kullanıcı</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            {hedefTur !== "hepsi" && (
              <Field label="Firma" required>
                <Combobox
                  items={firmalar}
                  getKey={(f) => f.id}
                  getLabel={(f) => `${f.id} ${f.ad}`}
                  renderItem={(f) => (
                    <span className="flex w-full items-center gap-2">
                      <span className="text-muted-foreground text-[12px]">{f.id}</span>
                      <span className="truncate">{f.ad}</span>
                      <span className="text-muted-foreground ml-auto text-[11px]">{f.cihaz} cihaz</span>
                    </span>
                  )}
                  value={firmaId}
                  onChange={(v) => { setFirmaId(v); setKullanici("") }}
                  placeholder="Firma seçin"
                  searchPlaceholder="Firma ara…"
                  emptyText="Connect kurulu firma yok"
                  loading={!cihazlar}
                />
              </Field>
            )}
            {hedefTur === "kullanici" && (
              <Field label="Kullanıcı" required>
                <Combobox
                  items={kullanicilar}
                  getKey={(k) => k.ad}
                  getLabel={(k) => k.ad}
                  renderItem={(k) => (
                    <span className="flex w-full items-center gap-2">
                      <span className="text-[13px]">{k.ad}</span>
                      <span className="text-muted-foreground ml-auto text-[11px]">{k.cihaz} cihaz</span>
                    </span>
                  )}
                  value={kullanici}
                  onChange={setKullanici}
                  placeholder={firmaId ? "Kullanıcı seçin" : "Önce firma seçin"}
                  searchPlaceholder="Kullanıcı ara…"
                  emptyText="Bu firmada Connect kullanan yok"
                  disabled={!firmaId}
                />
              </Field>
            )}
            <Field label="Yayında kalma süresi" hint="Süre bitince uygulamalardan kendiliğinden kalkar.">
              <ToggleGroup type="single" value={gun} onValueChange={(v) => v && setGun(v)} variant="outline" size="sm" className="justify-start">
                {SURELER.map((s) => <ToggleGroupItem key={s.gun} value={s.gun} className="h-8 px-3 text-[12px]">{s.ad}</ToggleGroupItem>)}
              </ToggleGroup>
            </Field>
          </ModalBolumu>
        </div>

        <div className="flex justify-end gap-2 border-t bg-[var(--section-bg)] px-4 py-3">
          <Button variant="outline" onClick={onKapat}>İptal</Button>
          <Button disabled={!gecerli || gonderiliyor} onClick={() => void yayinla()}>
            <Megaphone className="size-4" />{gonderiliyor ? "Yayınlanıyor…" : "Yayınla"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Modal bölümü — cihaz modalındaki "Bağlantı / Cihaz" bölümleriyle aynı görünüm. */
function ModalBolumu({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col overflow-hidden rounded-[8px] border">
      <div className="border-b bg-[var(--section-bg)] px-3 py-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{baslik}</div>
      <div className="flex flex-1 flex-col gap-3 p-3">{children}</div>
    </section>
  )
}

function DuyuruDetay({ duyuru: d, onKapat, onKaldir }: { duyuru: ConnectDuyuru | null; onKapat: () => void; onKaldir: (d: ConnectDuyuru) => void }) {
  const [okuyanlar, setOkuyanlar] = useState<ConnectDuyuruOkuyan[] | null>(null)
  useEffect(() => {
    if (!d) return
    setOkuyanlar(null)
    let iptal = false
    fetch(`/api/connect/duyurular/${d.id}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error ?? "Alınamadı"); return j as ConnectDuyuruOkuyan[] })
      .then((l) => { if (!iptal) setOkuyanlar(l) })
      .catch((e) => { if (!iptal) { setOkuyanlar([]); toast.error(e instanceof Error ? e.message : "Okuyanlar alınamadı") } })
    return () => { iptal = true }
  }, [d])

  const okuyan = okuyanlar?.filter((o) => o.okundu).length ?? 0
  return (
    <Sheet open={!!d} onOpenChange={(o) => !o && onKapat()}>
      <SheetContent className="!w-[560px] !max-w-[560px]">
        {d && (
          <>
            <SheetHeader>
              <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
                <Megaphone className="size-[18px]" />
              </span>
              <SheetTitle>{d.baslik}</SheetTitle>
              <SheetDescription>{hedefMetni(d)} · {tarihMetni(d.olusturma)}{d.olusturan ? ` · ${d.olusturan}` : ""}</SheetDescription>
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              <div className="flex flex-wrap items-center gap-2">
                <OnemRozeti onem={d.onem} />
                <span className={cn("inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium", YAYIN[yayinDurumu(d)].sinif)}>{YAYIN[yayinDurumu(d)].ad}</span>
                <span className="text-muted-foreground text-[12px]">
                  {d.iptal ? `${tarihMetni(d.iptalZaman)} kaldırıldı${d.iptalEden ? ` (${d.iptalEden})` : ""}` : d.bitis ? `Bitiş ${tarihMetni(d.bitis)}` : "Süresiz"}
                </span>
                {yayinDurumu(d) === "yayinda" && (
                  <Button size="sm" variant="outline" className="ml-auto h-7 text-[12px] text-rose-600 hover:text-rose-600" onClick={() => onKaldir(d)}>
                    <Ban className="size-3.5" />Yayından kaldır
                  </Button>
                )}
              </div>

              <p className="rounded-[8px] border p-3 text-[13px] whitespace-pre-line">{d.metin}</p>

              <section className="flex min-h-0 flex-col rounded-[8px] border">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-[12px] font-semibold">Hedefteki cihazlar</span>
                  {okuyanlar && <span className="text-muted-foreground text-[12px] tabular-nums">{okuyan}/{okuyanlar.length} okudu</span>}
                </div>
                {!okuyanlar ? (
                  <div className="flex flex-col gap-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
                ) : okuyanlar.length === 0 ? (
                  <p className="text-muted-foreground px-3 py-4 text-center text-[12px]">Hedefte kayıtlı Connect cihazı yok. Uygulamayı kuran olursa duyuruyu süresi içinde görür.</p>
                ) : (
                  <ul className="divide-y">
                    {okuyanlar.map((o) => (
                      <li key={o.cihazId} className="flex items-center gap-3 px-3 py-1.5 text-[13px]">
                        <span className={cn("size-2 shrink-0 rounded-full", o.okundu ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                        <span className="min-w-0 flex-1 truncate">
                          <span>{o.kullanici}</span>
                          <span className="text-muted-foreground"> · {o.makine ?? "—"}</span>
                          {!d.firmaId && <span className="text-muted-foreground"> · {o.firmaId} {o.firmaAdi}</span>}
                        </span>
                        <span className={cn("shrink-0 text-[12px] tabular-nums", o.okundu ? "" : "text-muted-foreground")}>{o.okundu ? tarihMetni(o.okundu) : "Okumadı"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
