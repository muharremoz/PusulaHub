"use client"

/**
 * Aktarım 2 — müşteri PC'sinde çalışan uygulamayla aktarım (docs/aktarim2/PLAN.md).
 * Eski web aktarımı (/aktarim) olduğu gibi duruyor; bu sayfa ondan bağımsız.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { PageContainer } from "@/components/layout/page-container"
import { ListeKarti, ListeAksiyonButonu, ListeThead, ListeBosSatir } from "@/components/shared/liste-karti"
import { Field } from "@/components/shared/form"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Combobox } from "@/components/ui/combobox"
import { firmaAra } from "@/lib/firma-arama"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@muharremoz/pusula-ui"
import { copyToClipboard } from "@/lib/clipboard"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { AlertTriangle, Ban, Copy, Database, Eye, FolderOpen, Image as ImageIcon, KeyRound, MonitorDown, MoreVertical, Plus, RotateCw, Server, Trash2, Download, Link2 } from "lucide-react"
import type { Aktarim2Detay, Aktarim2Durum, Aktarim2Kesif, Aktarim2Oturum } from "@/lib/aktarim2-proxy"

interface FirmaItem { firkod: string; firma: string; windowsServerId?: string | null }
interface ServerOption { id: string; name: string; ip: string }

const DURUM: Record<Aktarim2Durum, { etiket: string; sinif: string }> = {
  bekliyor:     { etiket: "Kod bekliyor",   sinif: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  bagli:        { etiket: "Bağlandı",       sinif: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  yukleniyor:   { etiket: "Yükleniyor",     sinif: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  yuklendi:     { etiket: "Yüklendi",       sinif: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  aktariliyor:  { etiket: "Aktarılıyor",    sinif: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  tamamlandi:   { etiket: "Tamamlandı",     sinif: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  hata:         { etiket: "Hata",           sinif: "bg-red-500/15 text-red-700 dark:text-red-400" },
  iptal:        { etiket: "İptal",          sinif: "bg-muted text-muted-foreground" },
  suresi_doldu: { etiket: "Süresi doldu",   sinif: "bg-muted text-muted-foreground" },
}

/** Sunuculara taşımada o anki adım */
const ASAMA: Record<string, string> = {
  veritabani: "Veritabanları → SQL sunucusu",
  eski: "Eski yıllar → Depo",
  resim: "Resimler → Depo",
  program: "Program dosyaları → terminal",
  ek: "Ek dosyalar → terminal",
}

/** Servis SQLite zamanı UTC ("YYYY-MM-DD HH:MM:SS"). */
const tarih = (s: string | null) => (s ? new Date(s.replace(" ", "T") + "Z") : null)
const zamanMetni = (s: string | null) => tarih(s)?.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) ?? "—"
const mb = (x: number) =>
  x >= 1024 ? `${(x / 1024).toLocaleString("tr", { maximumFractionDigits: 1 })} GB` : `${x.toLocaleString("tr", { maximumFractionDigits: 0 })} MB`

/** Aktarım 2 müşteri uygulaması (Pusula Aktarım exe) — servis /v2/indir güncel sürümü verir. */
const UYGULAMA_INDIR = "https://aktarim.pusulanet.net/v2/indir"

export default function Aktarim2Page() {
  const [items, setItems] = useState<Aktarim2Oturum[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [yeniAcik, setYeniAcik] = useState(false)
  const [kod, setKod] = useState<{ kod: string; firma: string } | null>(null)
  const [detayId, setDetayId] = useState<string | null>(null)
  const [silinecek, setSilinecek] = useState<Aktarim2Oturum | null>(null)

  const yukle = useCallback(async () => {
    try {
      const r = await fetch("/api/aktarim2", { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error ?? "Yüklenemedi")
      setItems(Array.isArray(d) ? d : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hata")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void yukle()
    const id = setInterval(yukle, 5000)
    return () => clearInterval(id)
  }, [yukle])

  async function islem(o: Aktarim2Oturum, tur: "iptal" | "yeniden" | "sil") {
    try {
      const r = await fetch(`/api/aktarim2/${o.id}`, tur === "sil"
        ? { method: "DELETE" }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ islem: tur }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "İşlem başarısız")
      toast.success(tur === "iptal" ? "Aktarım iptal edildi" : tur === "yeniden" ? "Taşıma yeniden başlatıldı" : "Aktarım silindi")
      void yukle()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hata")
    }
  }

  return (
    <PageContainer title="Aktarım 2" description="Müşteri bilgisayarında çalışan Pusula Aktarım uygulamasıyla veri taşıma">
      <ListeKarti
        baslik="Aktarımlar"
        ikon={<MonitorDown className="size-3.5" />}
        toplam={items.length}
        aksiyon={
          <div className="flex items-center gap-2">
            {/* Müşteriye gönderilecek uygulama: servisteki güncel exe (yeni sürüm yayınlanınca bu adres de günceller) */}
            <a
              href={UYGULAMA_INDIR}
              className="hover:bg-muted text-foreground inline-flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1 text-[12px] font-medium transition-colors"
            >
              <Download className="size-3.5" />Uygulamayı indir
            </a>
            <button
              type="button"
              title="İndirme bağlantısını kopyala"
              className="hover:bg-muted text-muted-foreground hover:text-foreground inline-flex size-[26px] items-center justify-center rounded-[5px] border transition-colors"
              onClick={() =>
                void navigator.clipboard.writeText(UYGULAMA_INDIR)
                  .then(() => toast.success("İndirme bağlantısı kopyalandı", { description: UYGULAMA_INDIR }))
                  .catch(() => toast.error("Kopyalanamadı"))
              }
            >
              <Link2 className="size-3.5" />
            </button>
            <ListeAksiyonButonu onClick={() => setYeniAcik(true)}><Plus className="size-3.5" />Yeni Aktarım</ListeAksiyonButonu>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] font-medium leading-[20px]">
            <ListeThead>
              <th className="px-4 py-1.5 text-left font-medium">Firma No</th>
              <th className="px-4 py-1.5 text-left font-medium">Firma</th>
              <th className="px-4 py-1.5 text-left font-medium">Durum</th>
              <th className="px-4 py-1.5 text-left font-medium">Bilgisayar</th>
              <th className="px-4 py-1.5 text-right font-medium">Yüklenen</th>
              <th className="px-4 py-1.5 text-left font-medium">Keşif</th>
              <th className="px-4 py-1.5 text-left font-medium">Oluşturma</th>
              <th className="px-4 py-1.5 text-left font-medium">Bitiş</th>
              <th className="px-4 py-1.5 text-right font-medium">İşlem</th>
            </ListeThead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="px-4 py-1.5"><Skeleton className="h-3 w-full rounded-[5px]" /></td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-[13px] text-red-600 dark:text-red-400">{error}</td></tr>
              ) : items.length === 0 ? (
                <ListeBosSatir sutunSayisi={9} toplam={0} bosMesaj="Henüz Aktarım 2 oturumu yok. “Yeni Aktarım” ile müşteriye kod üretin." />
              ) : (
                items.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-1.5 whitespace-nowrap tabular-nums">{o.firmaId}</td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      {o.firmaAdi}
                      {o.olusturan && <div className="text-muted-foreground text-[12px]">{o.olusturan}</div>}
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      <span className={cn("inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium", DURUM[o.durum]?.sinif)}>
                        {DURUM[o.durum]?.etiket ?? o.durum}
                        {o.durum === "aktariliyor" && ` · %${o.ilerleme}`}
                      </span>
                      {o.durum === "aktariliyor" && o.asama && <div className="text-muted-foreground text-[12px]">{ASAMA[o.asama] ?? o.asama}</div>}
                      {o.durum === "hata" && o.hata && <div className="text-[12px] text-red-600 dark:text-red-400 max-w-72 truncate" title={o.hata}>{o.hata}</div>}
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap text-[12px]">
                      {o.makine ? <><span className="font-mono">{o.makine}</span><span className="text-muted-foreground"> · v{o.istemciSurum}</span></> : "—"}
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap text-right text-[12px] tabular-nums">
                      {o.dosyaSayisi > 0 ? <>{o.dosyaSayisi} dosya<span className="text-muted-foreground"> · {mb(o.dosyaBoyutu / 1048576)}</span></> : "—"}
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap text-muted-foreground text-[12px]">{zamanMetni(o.kesifZamani)}</td>
                    <td className="px-4 py-1.5 whitespace-nowrap text-muted-foreground text-[12px] tabular-nums">{zamanMetni(o.olusturma)}</td>
                    <td className="px-4 py-1.5 whitespace-nowrap text-muted-foreground text-[12px] tabular-nums">{zamanMetni(o.bitis)}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="inline-flex size-7 items-center justify-center rounded-[5px] hover:bg-muted" aria-label="İşlemler">
                            <MoreVertical className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={4} className="w-44 text-[12px]">
                          <DropdownMenuItem className="gap-2" onClick={() => setDetayId(o.id)}>
                            <Eye className="size-3.5" />Keşif raporu
                          </DropdownMenuItem>
                          {o.durum === "hata" && (
                            <DropdownMenuItem className="gap-2" onClick={() => void islem(o, "yeniden")}>
                              <RotateCw className="size-3.5" />Taşımayı yeniden dene
                            </DropdownMenuItem>
                          )}
                          {!["iptal", "tamamlandi", "suresi_doldu", "aktariliyor"].includes(o.durum) && (
                            <DropdownMenuItem className="gap-2" onClick={() => void islem(o, "iptal")}>
                              <Ban className="size-3.5" />İptal et
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="gap-2 text-rose-600 focus:text-rose-600" onClick={() => setSilinecek(o)}>
                            <Trash2 className="size-3.5" />Sil
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ListeKarti>

      <YeniAktarimDialog
        open={yeniAcik}
        onOpenChange={setYeniAcik}
        onCreated={(k) => { setYeniAcik(false); setKod(k); void yukle() }}
      />

      <KodPenceresi kod={kod} onClose={() => setKod(null)} />

      <KesifDialog id={detayId} onClose={() => setDetayId(null)} />

      <AlertDialog open={!!silinecek} onOpenChange={(o) => !o && setSilinecek(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aktarımı sil</AlertDialogTitle>
            <AlertDialogDescription>
              {silinecek?.firmaAdi} için oturum ve keşif raporu silinecek. Müşterinin kodu da geçersiz olur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => { if (silinecek) void islem(silinecek, "sil"); setSilinecek(null) }}
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}

// ------------------------------------------------------------ yeni oturum

function YeniAktarimDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: (k: { kod: string; firma: string }) => void
}) {
  const [firmalar, setFirmalar] = useState<FirmaItem[]>([])
  const [sqlSunuculari, setSqlSunuculari] = useState<ServerOption[]>([])
  const [depoSunuculari, setDepoSunuculari] = useState<ServerOption[]>([])
  const [rdpSunuculari, setRdpSunuculari] = useState<ServerOption[]>([])
  const [firma, setFirma] = useState<FirmaItem | null>(null)
  const [arama, setArama] = useState("")
  const [sqlId, setSqlId] = useState("")
  const [depoId, setDepoId] = useState("")
  const [rdpId, setRdpId] = useState("")
  const [gun, setGun] = useState("14")
  const [notlar, setNotlar] = useState("")
  const [gonderiliyor, setGonderiliyor] = useState(false)

  useEffect(() => {
    if (!open) return
    setFirma(null); setArama(""); setSqlId(""); setDepoId(""); setRdpId(""); setGun("14"); setNotlar("")
    Promise.all([
      fetch("/api/firma/companies?all=true").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/setup/sql-servers").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/setup/depo-servers").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/setup/rdp-servers").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([f, s, d, r]) => {
      setFirmalar(Array.isArray(f) ? f : [])
      setSqlSunuculari(Array.isArray(s) ? s : [])
      setDepoSunuculari(Array.isArray(d) ? d : [])
      setRdpSunuculari(Array.isArray(r) ? r : [])
      // Sunucular bilerek önceden seçilmez: her aktarımda neyin taşınacağına kullanıcı karar verir
    })
  }, [open])

  const filtreli = useMemo(() => {
    const liste = firmaAra(firmalar, arama, (f) => f.firkod, (f) => f.firma)
    return firma && !liste.some((f) => f.firkod === firma.firkod) ? [firma, ...liste] : liste
  }, [firmalar, arama, firma])

  async function olustur() {
    if (!firma) return toast.error("Firma seçin")
    if (!sqlId && !depoId && !rdpId) return toast.error("En az bir sunucu seçin")
    setGonderiliyor(true)
    try {
      const r = await fetch("/api/aktarim2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmaId: firma.firkod, firmaAdi: firma.firma,
          sqlServerId: sqlId || null, depoServerId: depoId || null, rdpServerId: rdpId || null,
          gunSayisi: Number(gun) || 14, notlar: notlar.trim() || null,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error ?? "Oluşturulamadı")
      onCreated({ kod: d.kod, firma: firma.firma })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hata")
    } finally {
      setGonderiliyor(false)
    }
  }

  const sunucuSecimi = (deger: string, set: (v: string) => void, liste: ServerOption[], bos: string) => (
    <Combobox
      items={liste}
      getKey={(s) => s.id}
      getLabel={(s) => `${s.name} ${s.ip}`}
      value={deger}
      onChange={set}
      clearable
      placeholder={bos}
      searchPlaceholder="Sunucu ara..."
      contentClassName="min-w-80"
      renderValue={(s) => <span className="truncate">{s.name} <span className="font-mono text-muted-foreground">{s.ip}</span></span>}
      columns={[
        { baslik: "Sunucu", hucre: (s) => s.name },
        { baslik: "IP", hucre: (s) => <span className="font-mono text-muted-foreground">{s.ip}</span>, className: "w-28 shrink-0" },
      ]}
    />
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-[10px] p-0 sm:max-w-[520px]">
        <DialogHeader className="flex-row items-center gap-3 border-b bg-[var(--section-bg)] p-4 pr-12 text-left">
          <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
            <MonitorDown className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-[15px] font-semibold">Yeni Aktarım</DialogTitle>
            <DialogDescription className="text-[12px]">Müşteriye verilecek tek seferlik kod üretilir.</DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <Field label="Firma" required>
            <Combobox
              items={filtreli}
              getKey={(f) => f.firkod}
              getLabel={(f) => f.firma}
              value={firma?.firkod}
              onChange={(k) => {
                const f = firmalar.find((x) => x.firkod === k) ?? null
                setFirma(f)
                setRdpId(f?.windowsServerId ?? "")
              }}
              search={arama}
              onSearchChange={setArama}
              placeholder="Firma seç..."
              searchPlaceholder="Firma ara..."
              renderValue={(f) => <span className="truncate"><span className="font-mono text-muted-foreground">{f.firkod}</span> — {f.firma}</span>}
              columns={[
                { baslik: "Firma No", hucre: (f) => <span className="font-mono text-muted-foreground">{f.firkod}</span>, className: "w-16 shrink-0" },
                { baslik: "Firma Adı", hucre: (f) => f.firma },
              ]}
            />
          </Field>
          <Field label="SQL Sunucusu" hint="Veritabanı yedekleri bu sunucuya (D:\SQLData\<firma>\aktarim) gönderilir.">
            {sunucuSecimi(sqlId, setSqlId, sqlSunuculari, "Seçilmedi")}
          </Field>
          <Field label="Depo Sunucusu" hint="Resimler ve eski yıl dataları.">
            {sunucuSecimi(depoId, setDepoId, depoSunuculari, "Seçilmedi")}
          </Field>
          <Field label="Terminal Sunucusu" hint="Program ve ek dosyalar C:\MUSTERI\<firma>\Aktarim altına.">
            {sunucuSecimi(rdpId, setRdpId, rdpSunuculari, "Seçilmedi")}
          </Field>
          <Field label="Geçerlilik (gün)">
            <Input type="number" min={1} max={90} value={gun} onChange={(e) => setGun(e.target.value)} className="h-8 w-28" />
          </Field>
          <Field label="Not" hint="Müşteri uygulamada görür.">
            <Input value={notlar} onChange={(e) => setNotlar(e.target.value)} placeholder="Opsiyonel" className="h-8" />
          </Field>
        </div>

        <DialogFooter className="flex-row border-t p-4 sm:justify-stretch">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Vazgeç</Button>
          <Button className="flex-1" disabled={!firma || !(sqlId || depoId || rdpId) || gonderiliyor} onClick={() => void olustur()}>
            {gonderiliyor ? "Oluşturuluyor…" : "Kod üret"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------ kod penceresi

/** Müşteri uygulaması — aktarım servisinden indirilir (müşteri Hub kullanıcısı değil). */
const INDIRME_ADRESI = "https://aktarim.pusulanet.net/v2/indir"

function KodPenceresi({ kod, onClose }: { kod: { kod: string; firma: string } | null; onClose: () => void }) {
  const mesaj = kod
    ? `Verilerinizi Pusula sunucularına taşımak için:\n1) Uygulamayı indirin: ${INDIRME_ADRESI}\n` +
      `2) SQL Server'ın kurulu olduğu bilgisayarda çalıştırın.\n3) Aktarım kodunu girin: ${kod.kod}`
    : ""
  return (
    <AlertDialog open={!!kod} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2"><KeyRound className="size-4" />Aktarım kodu</AlertDialogTitle>
          <AlertDialogDescription>
            {kod?.firma} için kod hazır. Müşteri Pusula Aktarım uygulamasını açıp bu kodu girer.
            <strong> Kod yalnız şimdi görünür</strong>, sonra tekrar gösterilemez.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center justify-center gap-2 py-2">
          <span className="rounded-[5px] border bg-muted/40 px-4 py-2 font-mono text-2xl font-semibold tracking-[0.2em]">{kod?.kod}</span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Kopyala"
            onClick={async () => { if (kod && (await copyToClipboard(kod.kod))) toast.success("Kod kopyalandı") }}
          >
            <Copy className="size-4" />
          </Button>
        </div>
        <div className="rounded-[5px] border bg-[var(--section-bg)] px-3 py-2 text-[12px]">
          <div className="text-muted-foreground mb-1">Uygulama indirme adresi</div>
          <a href={INDIRME_ADRESI} className="font-mono underline underline-offset-2" target="_blank" rel="noreferrer">{INDIRME_ADRESI}</a>
        </div>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={async () => { if (await copyToClipboard(mesaj)) toast.success("Müşteri mesajı kopyalandı", { description: "İndirme adresi + kod" }) }}
          >
            <Copy className="size-4" />Müşteri mesajını kopyala
          </Button>
          <AlertDialogAction onClick={onClose}>Tamam</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ------------------------------------------------------------ keşif raporu

const TUR: Record<Aktarim2Kesif["veritabanlari"][number]["tur"], string> = {
  firma: "Firma datası", transfer: "Transfer datası", diger: "Tanımsız", sirket: "Şirket tanımları",
}

function KesifDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [detay, setDetay] = useState<Aktarim2Detay | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setDetay(null); setHata(null)
    fetch(`/api/aktarim2/${id}`, { cache: "no-store" })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d?.error ?? "Yüklenemedi"); setDetay(d) })
      .catch((e) => setHata(e instanceof Error ? e.message : "Hata"))
  }, [id])

  const k = detay?.kesif
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-[10px] p-0 sm:max-w-[960px]">
        <DialogHeader className="flex-row items-center gap-3 border-b bg-[var(--section-bg)] p-4 pr-12 text-left">
          <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
            <Database className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="truncate text-[15px] font-semibold">{detay ? `${detay.firmaId} — ${detay.firmaAdi}` : "Keşif raporu"}</DialogTitle>
            <DialogDescription className="text-[12px]">
            {detay?.kesifZamani ? `Müşteri bilgisayarı ${detay.makine} · ${zamanMetni(detay.kesifZamani)}` : "Müşteri uygulamasının gönderdiği tarama sonucu."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          {hata && <p className="text-[13px] text-red-600 dark:text-red-400">{hata}</p>}
          {!detay && !hata && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-[5px]" />)}
          {detay && !k && (
            <p className="text-muted-foreground py-10 text-center text-[13px]">
              Henüz keşif raporu yok. Müşteri uygulamayı açıp kodu girdiğinde rapor burada görünür.
            </p>
          )}
          {k && (
            <>
              {k.uyarilar.map((u, i) => (
                <div key={i} className="flex items-start gap-2 rounded-[5px] bg-amber-500/15 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{u}
                </div>
              ))}

              <Kutu ikon={<Server className="size-3.5" />} baslik="SQL Server">
                <div className="grid grid-cols-4 gap-3 px-3 py-2 text-[12px]">
                  <Bilgi l="Sunucu" v={k.sql.sunucu} mono />
                  <Bilgi l="Bilgisayar" v={k.sql.makineAdi + (k.sql.yerel ? "" : " (uzak)")} />
                  <Bilgi l="Sürüm" v={k.sql.surumu} />
                  <Bilgi l="Bağlantı" v={k.sql.kaynak === "windows" ? "Windows oturumu" : k.sql.kaynak} />
                </div>
              </Kutu>

              <Kutu ikon={<Database className="size-3.5" />} baslik="Veritabanları" sag={`${k.veritabanlari.length} · ${mb(k.veritabanlari.reduce((t, v) => t + v.veriMb, 0))}`}>
                <table className="w-full text-[13px]">
                  <ListeThead>
                    <th className="px-3 py-1.5 text-left font-medium">Veritabanı</th>
                    <th className="px-3 py-1.5 text-left font-medium">Tür</th>
                    <th className="px-3 py-1.5 text-left font-medium">Şirket</th>
                    <th className="px-3 py-1.5 text-left font-medium">KOD</th>
                    <th className="px-3 py-1.5 text-right font-medium">Veri</th>
                  </ListeThead>
                  <tbody>
                    {k.veritabanlari.map((v) => (
                      <tr key={v.ad} className="border-b last:border-b-0">
                        <td className="px-3 py-1 font-mono whitespace-nowrap">{v.ad}</td>
                        <td className="px-3 py-1 text-muted-foreground whitespace-nowrap">{TUR[v.tur]}{v.prgTur === "011" ? " · Toptan" : v.prgTur === "909" ? " · Perakende" : ""}</td>
                        <td className="px-3 py-1">{v.sirketAdlari.join(", ") || "—"}</td>
                        <td className="px-3 py-1 font-mono text-muted-foreground">{v.kod ?? "—"}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{mb(v.veriMb)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Kutu>

              <div className="grid grid-cols-2 gap-3">
                <Kutu ikon={<ImageIcon className="size-3.5" />} baslik="Resim klasörleri">
                  {k.resimKlasorleri.length === 0 && <p className="text-muted-foreground px-3 py-2 text-[12px]">—</p>}
                  {k.resimKlasorleri.map((r) => (
                    <div key={r.yol} className="border-b px-3 py-1.5 text-[12px] last:border-b-0">
                      <div className="truncate font-mono" title={r.yol}>{r.yol}</div>
                      <div className="text-muted-foreground">{r.var ? `${r.dosyaSayisi.toLocaleString("tr")}${r.eksik ? "+" : ""} dosya · ${mb(r.boyutMb)}` : "Bulunamadı"}</div>
                    </div>
                  ))}
                </Kutu>
                <Kutu ikon={<FolderOpen className="size-3.5" />} baslik="Program klasörleri">
                  {k.programKlasorleri.length === 0 && <p className="text-muted-foreground px-3 py-2 text-[12px]">—</p>}
                  {k.programKlasorleri.map((p) => (
                    <div key={p.yol} className="border-b px-3 py-1.5 text-[12px] last:border-b-0">
                      <div className="truncate font-mono" title={p.yol}>{p.yol}</div>
                      <div className="text-muted-foreground">{p.parametreler.map((x) => `${x.ad}${x.dataKodu ? ` (${x.dataKodu})` : ""}`).join(", ")}</div>
                    </div>
                  ))}
                </Kutu>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Kutu({ ikon, baslik, sag, children }: { ikon: React.ReactNode; baslik: string; sag?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[5px] border bg-card" style={{ boxShadow: "var(--card-shadow)" }}>
      <div className="flex items-center gap-1.5 border-b bg-[var(--section-bg)] px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
        {ikon}{baslik}{sag && <span className="ml-auto text-[11px] tabular-nums">{sag}</span>}
      </div>
      {children}
    </div>
  )
}

function Bilgi({ l, v, mono }: { l: string; v: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground text-[11px]">{l}</div>
      <div className={cn("truncate", mono && "font-mono")} title={v}>{v || "—"}</div>
    </div>
  )
}
