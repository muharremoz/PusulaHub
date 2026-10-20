"use client"

/**
 * Kur API — api.pusulanet.net (10.15.2.6, pm2 "kur-api") izleme + ayar sayfası.
 *
 * Üstte genel durum ve süreç; ortada kaynaklar (Harem/Ozan/AltınKaynak/TCMB/Pusula) ve yazıcılar
 * (PUSLICANCE SQL, FTP pusula.txt); altta uyarı/hata günlüğü. Her kartın "Ayarlar"ı bir sheet açar;
 * kaydedince kur-api .env'ini yedekleyip yazar ve kendini yeniden başlatır (~3 sn).
 * Veri /api/kur-api'den, 30 sn'de bir tazelenir.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { RefreshCw, RotateCcw, Settings2, Coins, ScrollText } from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Switch,
} from "@muharremoz/pusula-ui"
import { PageContainer } from "@/components/layout/page-container"
import { ListeKarti, ListeThead, ListeBosSatir } from "@/components/shared/liste-karti"
import { Field } from "@/components/shared/form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { KaynakDurumu, KurApiAyar, KurApiAyarlar, KurApiGunlukKaydi, KurApiSaglik } from "@/lib/kur-api"

// ------------------------------------------------------------ sabitler

type Yanit = {
  saglik: KurApiSaglik | null
  ayarlar: KurApiAyarlar | null
  gunluk: KurApiGunlukKaydi[] | null
  hatalar: { saglik: string | null; ayarlar: string | null; gunluk: string | null }
  zaman: string
}

const KAYNAKLAR = [
  { grup: "datshop", ad: "Harem", alt: "datshop socket · canlı", aralik: null },
  { grup: "ozankur", ad: "Ozan Kur", alt: "HTTP yoklama", aralik: "OZANKUR_POLL_INTERVAL_MS" },
  { grup: "altinkaynak", ad: "AltınKaynak", alt: "HTTP yoklama", aralik: "ALTINKAYNAK_POLL_INTERVAL_MS" },
  { grup: "tcmb", ad: "TCMB", alt: "today.xml", aralik: "TCMB_POLL_INTERVAL_MS" },
  { grup: "pusula", ad: "Pusula", alt: "pusula.txt", aralik: "PUSULA_POLL_INTERVAL_MS" },
] as const

const GRUP_ADI: Record<string, string> = {
  datshop: "Harem (datshop)", ozankur: "Ozan Kur", altinkaynak: "AltınKaynak", tcmb: "TCMB", pusula: "Pusula",
  sql: "SQL yazıcı", ftp: "FTP yazıcı",
}
const GRUP_ACIKLAMA: Record<string, string> = {
  datshop: "Harem kurlarının canlı socket bağlantısı.",
  ozankur: "Ozan Kur fiyatları, belirlenen aralıkla çekilir.",
  altinkaynak: "AltınKaynak altın ve döviz fiyatları.",
  tcmb: "TCMB günlük kurları.",
  pusula: "Pusula'nın yayımladığı pusula.txt.",
  sql: "Harem + Ozan + AltınKaynak → PUSLICANCE.dbo.SetRateList.",
  ftp: "Harem kurları → ftp /Kurlar/pusula.txt.",
}
const SQL_KAYNAK_ADI: Record<string, string> = { datshop: "Harem", ozankur: "Ozan", altinkaynak: "AltınKaynak" }

const TZ = "Europe/Istanbul"
const saat = (iso: string) => new Date(iso).toLocaleTimeString("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" })
const tarihSaat = (iso: string) => new Date(iso).toLocaleString("tr-TR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })

function once(iso: string | null | undefined, simdi: number): string {
  if (!iso) return "—"
  const sn = Math.max(0, Math.round((simdi - new Date(iso).getTime()) / 1000))
  if (sn < 60) return `${sn} sn önce`
  if (sn < 3600) return `${Math.floor(sn / 60)} dk önce`
  if (sn < 86400) return `${Math.floor(sn / 3600)} sa önce`
  return `${Math.floor(sn / 86400)} gün önce`
}

function sureMetni(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—"
  const sn = Math.round(ms / 1000)
  if (sn < 60) return `${sn} sn`
  if (sn % 3600 === 0) return `${sn / 3600} sa`
  if (sn % 60 === 0) return `${sn / 60} dk`
  return `${sn} sn`
}

function calismaSuresi(iso: string, simdi: number): string {
  const dk = Math.max(0, Math.floor((simdi - new Date(iso).getTime()) / 60000))
  if (dk < 60) return `${dk} dk`
  const sa = Math.floor(dk / 60)
  if (sa < 48) return `${sa} sa ${dk % 60} dk`
  return `${Math.floor(sa / 24)} gün ${sa % 24} sa`
}

/** Durum → rozet. Renk her zaman metinle birlikte. */
type Ton = "iyi" | "uyari" | "hata" | "kapali"
const TON_SINIF: Record<Ton, string> = {
  iyi: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  uyari: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  hata: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  kapali: "bg-muted text-muted-foreground",
}
const TON_NOKTA: Record<Ton, string> = { iyi: "bg-emerald-500", uyari: "bg-amber-500", hata: "bg-rose-500", kapali: "bg-muted-foreground/40" }

function kaynakTonu(k: KaynakDurumu | undefined): { ton: Ton; metin: string } {
  if (!k) return { ton: "kapali", metin: "Bilinmiyor" }
  if (!k.enabled || k.state === "disabled") return { ton: "kapali", metin: "Kapalı" }
  if (k.status === "ok") return { ton: "iyi", metin: "Bağlı" }
  if (k.status === "degraded") return { ton: "uyari", metin: k.state === "connecting" ? "Bağlanıyor" : "Sorunlu" }
  return { ton: "hata", metin: "Hata" }
}

function yaziciTonu(w: { enabled: boolean; state: string; lastError: string | null } | null | undefined): { ton: Ton; metin: string } {
  if (!w || !w.enabled) return { ton: "kapali", metin: "Kapalı" }
  if (w.state === "connected" && !w.lastError) return { ton: "iyi", metin: "Yazıyor" }
  if (w.state === "connected") return { ton: "uyari", metin: "Son turda hata" }
  if (w.state === "connecting" || w.state === "idle") return { ton: "uyari", metin: "Bekliyor" }
  return { ton: "hata", metin: "Hata" }
}

function Rozet({ ton, children }: { ton: Ton; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-[5px] px-2 py-0.5 text-[11px] font-medium", TON_SINIF[ton])}>
    <span className={cn("size-1.5 rounded-full", TON_NOKTA[ton])} />{children}
  </span>
}

// ------------------------------------------------------------ sayfa

export default function KurApiSayfasi() {
  const { data: session } = useSession()
  const yazabilir = session?.user?.role === "admin" || session?.user?.permissions?.["kur-api"] === "write"

  const [veri, setVeri] = useState<Yanit | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [seviye, setSeviye] = useState<"warn" | "error" | "info">("warn")
  const [simdi, setSimdi] = useState(() => Date.now())
  const [acikGrup, setAcikGrup] = useState<string | null>(null)
  const [yenidenSor, setYenidenSor] = useState(false)
  const [bekliyor, setBekliyor] = useState(false)

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    try {
      const r = await fetch(`/api/kur-api?seviye=${seviye}`, { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "Veri alınamadı")
      setVeri(d as Yanit); setHata(null)
      return d as Yanit
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setYukleniyor(false); setSimdi(Date.now())
    }
  }, [seviye])

  useEffect(() => { void yukle() }, [yukle])
  useEffect(() => { const t = setInterval(() => void yukle(), 30_000); return () => clearInterval(t) }, [yukle])
  useEffect(() => { const t = setInterval(() => setSimdi(Date.now()), 5_000); return () => clearInterval(t) }, [])

  /** Yeniden başlatma sonrası: süreç başlangıcı değişene kadar (en çok ~30 sn) yokla. */
  const yenidenBaslamayiBekle = useCallback(async (eskiBaslangic: string | undefined) => {
    setBekliyor(true)
    try {
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const d = await yukle()
        if (d?.ayarlar && d.ayarlar.surec.baslangic !== eskiBaslangic && d.saglik) return true
      }
      return false
    } finally {
      setBekliyor(false)
    }
  }, [yukle])

  const ayarlar = veri?.ayarlar?.alanlar ?? []
  const ayar = useCallback((anahtar: string) => ayarlar.find((a) => a.anahtar === anahtar), [ayarlar])
  const bekleyenDegisiklik = useMemo(() => ayarlar.some((a) => a.tip !== "gizli" && a.ayarli && a.deger != null && String(a.etkin) !== a.deger), [ayarlar])

  async function yenidenBaslat() {
    setYenidenSor(false)
    const eski = veri?.ayarlar?.surec.baslangic
    const r = await fetch("/api/kur-api/restart", { method: "POST" })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { toast.error("Yeniden başlatılamadı", { description: d.error }); return }
    toast.success("kur-api yeniden başlatılıyor")
    const tamam = await yenidenBaslamayiBekle(eski)
    if (tamam) toast.success("kur-api yeniden başladı")
    else toast.error("kur-api 30 sn içinde geri gelmedi", { description: "Sayfayı yenileyin; düzelmezse sunucuda pm2 logs kur-api." })
  }

  const ilk = !veri && !hata
  const saglik = veri?.saglik
  const sql = saglik?.services.sqlWriter
  const ftp = saglik?.services.ftpWriter
  const genel: { ton: Ton; metin: string } = !saglik ? { ton: "hata", metin: "Ulaşılamıyor" }
    : saglik.status === "ok" ? { ton: "iyi", metin: "Sağlıklı" }
      : saglik.status === "degraded" ? { ton: "uyari", metin: "Kısmi sorun" } : { ton: "hata", metin: "Hata" }

  return (
    <PageContainer title="Kur API" description="api.pusulanet.net · kur kaynakları, SQL / FTP yazıcıları ve servis ayarları">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {veri && <span className="text-muted-foreground text-[12px]">Son kontrol {saat(veri.zaman)}</span>}
          {bekliyor && <span className="text-[12px] text-amber-700 dark:text-amber-400">Yeniden başlaması bekleniyor…</span>}
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[12px]" disabled={yukleniyor} onClick={() => void yukle()}>
              <RefreshCw className={cn("size-3.5", yukleniyor && "animate-spin")} /> Yenile
            </Button>
            {yazabilir && (
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12px]" disabled={bekliyor || !veri?.ayarlar} onClick={() => setYenidenSor(true)}>
                <RotateCcw className="size-3.5" /> Yeniden başlat
              </Button>
            )}
          </div>
        </div>

        {hata && <Uyari>{hata}</Uyari>}
        {veri?.hatalar.ayarlar && <Uyari>Ayarlar okunamadı: {veri.hatalar.ayarlar}</Uyari>}
        {bekleyenDegisiklik && !bekliyor && (
          <Uyari ton="uyari">.env'de çalışan süreçten farklı değerler var; geçmesi için kur-api'yi yeniden başlatın.</Uyari>
        )}

        {/* Veri hiç gelmediyse (oturum yok, Hub API düştü) kartlar yanıltıcı "kapalı" göstermesin */}
        {(veri || ilk) && <>
        {/* ── Özet ── */}
        <div className="rounded-[8px] bg-[var(--section-bg)] p-2">
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <Kutu baslik="Genel durum" yukleniyor={ilk}
              deger={<Rozet ton={genel.ton}>{genel.metin}</Rozet>}
              alt={saglik ? `${Object.values(saglik.services.upstream).filter((k) => k.status === "ok").length} / ${Object.values(saglik.services.upstream).filter((k) => k.enabled).length} kaynak bağlı` : veri?.hatalar.saglik ?? ""} />
            <Kutu baslik="Süreç" yukleniyor={ilk}
              deger={veri?.ayarlar ? <span className="text-2xl font-bold tabular-nums">{calismaSuresi(veri.ayarlar.surec.baslangic, simdi)}</span> : "—"}
              alt={veri?.ayarlar ? `Başlangıç ${tarihSaat(veri.ayarlar.surec.baslangic)} · ${veri.ayarlar.surec.bellekMb} MB` : ""} />
            <Kutu baslik="SQL yazıcı" yukleniyor={ilk}
              deger={<span className="flex items-center gap-2"><Rozet ton={yaziciTonu(sql).ton}>{yaziciTonu(sql).metin}</Rozet></span>}
              alt={sql?.enabled ? `Son yazma ${once(sql.lastWriteAt, simdi)} · ${sql.lastCount ?? 0} kayıt` : "Kapalı"} />
            <Kutu baslik="FTP yazıcı" yukleniyor={ilk}
              deger={<Rozet ton={yaziciTonu(ftp).ton}>{yaziciTonu(ftp).metin}</Rozet>}
              alt={ftp?.enabled ? `Son yükleme ${once(ftp.lastUploadAt, simdi)} · ${ftp.lastCount ?? 0} kur` : "Kapalı"} />
          </div>
        </div>

        {/* ── Kaynaklar ── */}
        <ListeKarti baslik="Kaynaklar" ikon={<Coins className="size-3.5" />} toplam={KAYNAKLAR.length}>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] leading-[20px] font-medium">
              <ListeThead>
                <th className="px-4 py-1.5 text-left font-medium">Kaynak</th>
                <th className="px-4 py-1.5 text-left font-medium">Durum</th>
                <th className="px-4 py-1.5 text-left font-medium">Son veri</th>
                <th className="px-4 py-1.5 text-left font-medium">Son fiyat değişimi</th>
                <th className="px-4 py-1.5 text-left font-medium">Aralık</th>
                <th className="px-4 py-1.5 text-left font-medium">Son hata</th>
                <th className="px-4 py-1.5 text-right font-medium">İşlem</th>
              </ListeThead>
              <tbody>
                {ilk ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-1.5"><Skeleton className="h-6 w-full" /></td></tr>
                )) : KAYNAKLAR.map((k) => {
                  const d = saglik?.services.upstream[k.grup]
                  const t = kaynakTonu(d)
                  const aralik = k.aralik ? ayar(k.aralik) : undefined
                  return (
                    <tr key={k.grup} className="hover:bg-muted/20">
                      <td className="px-4 py-1.5 whitespace-nowrap">
                        {k.ad}
                        <span className="text-muted-foreground ml-2 text-[12px] font-normal">{k.alt}</span>
                      </td>
                      <td className="px-4 py-1.5 whitespace-nowrap"><Rozet ton={t.ton}>{t.metin}</Rozet></td>
                      <td className="px-4 py-1.5 whitespace-nowrap tabular-nums" title={d?.lastUpdatedAt ? tarihSaat(d.lastUpdatedAt) : undefined}>{once(d?.lastUpdatedAt, simdi)}</td>
                      <td className="text-muted-foreground px-4 py-1.5 text-[12px] whitespace-nowrap tabular-nums" title={d?.lastChangedAt ? tarihSaat(d.lastChangedAt) : undefined}>{once(d?.lastChangedAt, simdi)}</td>
                      <td className="px-4 py-1.5 whitespace-nowrap tabular-nums">{k.aralik ? sureMetni(Number(aralik?.etkin)) : <span className="text-muted-foreground">canlı</span>}</td>
                      <td className="max-w-[320px] truncate px-4 py-1.5 text-[12px] text-rose-700 dark:text-rose-400" title={d?.lastError ?? undefined}>{d?.lastError ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">
                        <AyarButonu gorunur={!!veri?.ayarlar} onClick={() => setAcikGrup(k.grup)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </ListeKarti>

        {/* ── Yazıcılar ── */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <YaziciKarti baslik="SQL yazıcı" aciklama={`${sql?.database ?? "PUSLICANCE"} · dbo.SetRateList`} ton={yaziciTonu(sql)} yukleniyor={ilk}
            ayarAc={veri?.ayarlar ? () => setAcikGrup("sql") : undefined}
            satirlar={[
              ["Son yazma", sql?.lastWriteAt ? `${once(sql.lastWriteAt, simdi)} (${saat(sql.lastWriteAt)})` : "—"],
              ["Rate tablosundaki en yeni kayıt", sql?.rateTableLatestLocal ? sql.rateTableLatestLocal.replace("T", " ").slice(0, 19) : "—"],
              ["Son turda yazılan", sql?.lastCount != null ? `${sql.lastCount} kayıt` : "—"],
              ["Yazma aralığı / bayat sınırı", `${sureMetni(Number(ayar("RATE_SQL_INTERVAL_MS")?.etkin))} / ${sureMetni(Number(ayar("RATE_SQL_STALE_MS")?.etkin))}`],
              ...Object.entries(sql?.sources ?? {}).map(([k, s]) => [
                `${SQL_KAYNAK_ADI[k] ?? k} (RateId ${s.rateId})`,
                `${s.codes} kod · son veri ${once(s.lastDataAt, simdi)}`,
              ] as [string, string]),
            ]}
            hata={sql?.lastError ?? null} />
          <YaziciKarti baslik="FTP yazıcı" aciklama={ftp?.target ?? "pusula.txt"} ton={yaziciTonu(ftp)} yukleniyor={ilk}
            ayarAc={veri?.ayarlar ? () => setAcikGrup("ftp") : undefined}
            satirlar={[
              ["Son yükleme", ftp?.lastUploadAt ? `${once(ftp.lastUploadAt, simdi)} (${saat(ftp.lastUploadAt)})` : "—"],
              ["Son Harem verisi", once(ftp?.lastDataAt, simdi)],
              ["Dosyadaki kur", ftp?.lastCount != null ? `${ftp.lastCount}` : "—"],
              ["Yazma aralığı / bayat sınırı", `${sureMetni(Number(ayar("RATE_FTP_INTERVAL_MS")?.etkin))} / ${sureMetni(Number(ayar("RATE_FTP_STALE_MS")?.etkin))}`],
            ]}
            hata={ftp?.lastError ?? null} />
        </div>

        {/* ── Günlük ── */}
        <ListeKarti
          baslik="Günlük"
          ikon={<ScrollText className="size-3.5" />}
          toplam={veri?.gunluk?.length}
          aksiyon={
            <ToggleGroup type="single" value={seviye} onValueChange={(v) => v && setSeviye(v as typeof seviye)} variant="outline" size="sm">
              <ToggleGroupItem value="error" className="h-7 px-2.5 text-[12px]">Hata</ToggleGroupItem>
              <ToggleGroupItem value="warn" className="h-7 px-2.5 text-[12px]">Uyarı + hata</ToggleGroupItem>
              <ToggleGroupItem value="info" className="h-7 px-2.5 text-[12px]">Tümü</ToggleGroupItem>
            </ToggleGroup>
          }
        >
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-[14px] leading-[20px] font-medium">
              <ListeThead>
                <th className="px-4 py-1.5 text-left font-medium">Zaman</th>
                <th className="px-4 py-1.5 text-left font-medium">Seviye</th>
                <th className="px-4 py-1.5 text-left font-medium">Olay</th>
                <th className="px-4 py-1.5 text-left font-medium">Ayrıntı</th>
              </ListeThead>
              <tbody>
                {ilk ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}><td colSpan={4} className="px-4 py-1.5"><Skeleton className="h-6 w-full" /></td></tr>
                )) : veri?.hatalar.gunluk ? (
                  <tr><td colSpan={4} className="text-muted-foreground px-4 py-6 text-center text-[13px]">Günlük okunamadı: {veri.hatalar.gunluk}</td></tr>
                ) : (veri?.gunluk ?? []).length === 0 ? (
                  <ListeBosSatir sutunSayisi={4} toplam={0} bosMesaj="Bugün ve dün bu seviyede kayıt yok — servis sorunsuz çalışıyor." />
                ) : (veri?.gunluk ?? []).map((g, i) => (
                  <tr key={`${g.zaman}-${i}`} className="hover:bg-muted/20">
                    <td className="px-4 py-1.5 whitespace-nowrap tabular-nums">{tarihSaat(g.zaman)}</td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      <Rozet ton={g.seviye === "error" ? "hata" : g.seviye === "warn" ? "uyari" : "kapali"}>
                        {g.seviye === "error" ? "Hata" : g.seviye === "warn" ? "Uyarı" : "Bilgi"}
                      </Rozet>
                    </td>
                    <td className="text-muted-foreground px-4 py-1.5 text-[12px] whitespace-nowrap">{g.olay}</td>
                    <td className="px-4 py-1.5 text-[13px]">
                      {g.mesaj}
                      {g.hata && <span className="text-muted-foreground ml-1.5 text-[12px]">· {g.hata}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ListeKarti>
        </>}
      </div>

      <AyarSheet
        grup={acikGrup}
        alanlar={ayarlar.filter((a) => a.grup === acikGrup)}
        yazabilir={yazabilir}
        onClose={() => setAcikGrup(null)}
        onKaydedildi={async (yenidenBasliyor) => {
          setAcikGrup(null)
          if (!yenidenBasliyor) { void yukle(); return }
          const tamam = await yenidenBaslamayiBekle(veri?.ayarlar?.surec.baslangic)
          if (tamam) toast.success("kur-api yeni ayarlarla başladı")
          else toast.error("kur-api 30 sn içinde geri gelmedi", { description: "Ayar .env'e yazıldı; sunucuda pm2 logs kur-api ile bakın." })
        }}
      />

      <AlertDialog open={yenidenSor} onOpenChange={setYenidenSor}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>kur-api yeniden başlatılsın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              Fiyat API'si ve socket yayını 2–3 saniye kesilir; bağlı istemciler kendiliğinden yeniden bağlanır.
              .env'de bekleyen değişiklikler varsa bu sırada geçerli olur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white" onClick={() => void yenidenBaslat()}>Yeniden başlat</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}

// ------------------------------------------------------------ parçalar

function Uyari({ children, ton = "hata" }: { children: React.ReactNode; ton?: "hata" | "uyari" }) {
  return (
    <div className={cn(
      "rounded-[5px] border px-3 py-2 text-[12px]",
      ton === "hata" ? "border-red-500/25 bg-red-500/15 text-red-700 dark:text-red-400" : "border-amber-500/25 bg-amber-500/15 text-amber-700 dark:text-amber-400",
    )}>{children}</div>
  )
}

function Kutu({ baslik, deger, alt, yukleniyor }: { baslik: string; deger: React.ReactNode; alt: string; yukleniyor: boolean }) {
  return (
    <div className="bg-card rounded-[5px] p-3" style={{ boxShadow: "var(--card-shadow)" }}>
      <div className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">{baslik}</div>
      {yukleniyor ? <Skeleton className="mt-2 h-7 w-28" /> : <div className="mt-1 flex min-h-8 items-center">{deger}</div>}
      <div className="text-muted-foreground mt-1.5 min-h-4 truncate text-[11px] tabular-nums">{yukleniyor ? "" : alt}</div>
    </div>
  )
}

function AyarButonu({ gorunur, onClick }: { gorunur: boolean; onClick: () => void }) {
  if (!gorunur) return null
  return (
    <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[12px]" onClick={onClick}>
      <Settings2 className="size-3.5" /> Ayarlar
    </Button>
  )
}

function YaziciKarti({ baslik, aciklama, ton, satirlar, hata, yukleniyor, ayarAc }: {
  baslik: string; aciklama: string; ton: { ton: Ton; metin: string }
  satirlar: [string, string][]; hata: string | null; yukleniyor: boolean; ayarAc?: () => void
}) {
  return (
    <div className="rounded-[8px] bg-[var(--section-bg)] p-2">
      <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium">{baslik}</span>
            {!yukleniyor && <Rozet ton={ton.ton}>{ton.metin}</Rozet>}
          </div>
          <div className="text-muted-foreground truncate text-[12px]">{aciklama}</div>
        </div>
        {ayarAc && <AyarButonu gorunur onClick={ayarAc} />}
      </div>
      <div className="bg-card divide-y rounded-[5px]" style={{ boxShadow: "var(--card-shadow)" }}>
        {yukleniyor ? <div className="p-3"><Skeleton className="h-24 w-full" /></div> : satirlar.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-[13px]">
            <span className="text-muted-foreground">{k}</span>
            <span className="text-right font-medium tabular-nums">{v}</span>
          </div>
        ))}
        {hata && <div className="px-3 py-1.5 text-[12px] text-rose-700 dark:text-rose-400">Son hata: {hata}</div>}
      </div>
    </div>
  )
}

/** Bir grubun ayarları. Süreler saniye olarak düzenlenir, ms olarak yazılır. Gizli alan boşsa değişmez. */
function AyarSheet({ grup, alanlar, yazabilir, onClose, onKaydedildi }: {
  grup: string | null; alanlar: KurApiAyar[]; yazabilir: boolean
  onClose: () => void; onKaydedildi: (yenidenBasliyor: boolean) => void
}) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [hatalar, setHatalar] = useState<Record<string, string>>({})
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const ilkDeger = useCallback((a: KurApiAyar): string => {
    if (a.tip === "gizli") return ""
    const v = a.deger ?? (a.etkin == null ? "" : String(a.etkin))
    return a.tip === "sure" && v !== "" ? String(Number(v) / 1000) : v
  }, [])

  useEffect(() => {
    if (!grup) return
    setForm(Object.fromEntries(alanlar.map((a) => [a.anahtar, ilkDeger(a)])))
    setHatalar({})
    // yalnız sheet açıldığında doldur; 30 sn'lik tazeleme yazılanı ezmesin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grup])

  const degisiklikler = useMemo(() => {
    const d: Record<string, string> = {}
    for (const a of alanlar) {
      const v = (form[a.anahtar] ?? "").trim()
      if (a.tip === "gizli") { if (v) d[a.anahtar] = v; continue }
      if (v === ilkDeger(a)) continue
      d[a.anahtar] = a.tip === "sure" ? String(Math.round(Number(v.replace(",", ".")) * 1000)) : v
    }
    return d
  }, [alanlar, form, ilkDeger])
  const degisenSayisi = Object.keys(degisiklikler).length

  async function kaydet() {
    setKaydediliyor(true); setHatalar({})
    try {
      const r = await fetch("/api/kur-api/config", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ degisiklikler }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        if (d.hatalar) setHatalar(d.hatalar)
        toast.error("Ayarlar kaydedilmedi", { description: d.hatalar ? "Hatalı alanları düzeltin." : d.error })
        return
      }
      toast.success(d.degisen?.length ? "Ayarlar kaydedildi" : "Değişiklik yok", {
        description: d.yenidenBasliyor ? "kur-api yeni ayarlarla yeniden başlıyor." : undefined,
      })
      onKaydedildi(Boolean(d.yenidenBasliyor))
    } finally {
      setKaydediliyor(false)
    }
  }

  const sirali = [...alanlar].sort((a, b) => (a.tip === "bool" ? -1 : 0) - (b.tip === "bool" ? -1 : 0))

  return (
    <Sheet open={!!grup} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="!w-[520px] !max-w-[520px]">
        <SheetHeader>
          <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
            <Settings2 className="size-[18px]" />
          </span>
          <SheetTitle>{grup ? GRUP_ADI[grup] ?? grup : ""}</SheetTitle>
          <SheetDescription>{grup ? GRUP_ACIKLAMA[grup] : ""}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          {sirali.map((a) => {
            const v = form[a.anahtar] ?? ""
            const bekliyor = a.tip !== "gizli" && a.ayarli && a.deger != null && String(a.etkin) !== a.deger
            const ipucu = <>
              <span>{a.anahtar}</span>
              {a.tip === "sure" && a.min != null && a.max != null && ` · ${a.min / 1000}–${a.max / 1000} sn`}
              {a.tip !== "gizli" && !a.ayarli && " · .env'de yok, varsayılan kullanılıyor"}
              {bekliyor && <span className="text-amber-700 dark:text-amber-400"> · çalışan: {a.tip === "sure" ? sureMetni(Number(a.etkin)) : String(a.etkin)}</span>}
            </>
            const ek = hatalar[a.anahtar] ? <span className="text-rose-700 dark:text-rose-400">{hatalar[a.anahtar]}</span> : undefined
            if (a.tip === "bool") {
              return (
                <Field key={a.anahtar} label={a.etiket} hint={ipucu} ek={ek}>
                  <div className="flex h-8 items-center gap-2">
                    <Switch checked={v === "true"} disabled={!yazabilir} onCheckedChange={(c: boolean) => setForm((f) => ({ ...f, [a.anahtar]: c ? "true" : "false" }))} />
                    <span className="text-[13px]">{v === "true" ? "Açık" : "Kapalı"}</span>
                  </div>
                </Field>
              )
            }
            return (
              <Field key={a.anahtar} label={a.tip === "sure" ? `${a.etiket} (sn)` : a.etiket} hint={ipucu} ek={ek}>
                <Input
                  value={v}
                  disabled={!yazabilir}
                  type={a.tip === "gizli" ? "password" : a.tip === "sure" || a.tip === "port" ? "number" : "text"}
                  autoComplete={a.tip === "gizli" ? "new-password" : "off"}
                  placeholder={a.tip === "gizli" ? (a.ayarli ? "Ayarlı — değiştirmek için yenisini yazın" : "Tanımlı değil") : undefined}
                  onChange={(e) => setForm((f) => ({ ...f, [a.anahtar]: e.target.value }))}
                  className={cn(hatalar[a.anahtar] && "border-rose-500")}
                />
              </Field>
            )
          })}
          {yazabilir ? (
            <p className="text-muted-foreground text-[12px]">
              Kaydedince kur-api .env'ini yedekleyip yazar ve kendini yeniden başlatır; fiyat yayını 2–3 saniye kesilir.
            </p>
          ) : (
            <p className="text-muted-foreground text-[12px]">Bu ayarları değiştirmek için Kur API modülünde yazma yetkisi gerekir.</p>
          )}
        </div>

        <SheetFooter className="flex-row">
          <Button variant="outline" className="flex-1" onClick={onClose}>{yazabilir ? "İptal" : "Kapat"}</Button>
          {yazabilir && (
            <Button className="flex-1" disabled={kaydediliyor || degisenSayisi === 0} onClick={() => void kaydet()}>
              {kaydediliyor ? "Kaydediliyor…" : degisenSayisi ? `Kaydet ve yeniden başlat (${degisenSayisi})` : "Kaydet"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
