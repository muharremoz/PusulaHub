"use client"

/**
 * Pusula Connect — denetim ve izleme merkezi.
 * Müşteri bilgisayarlarındaki Connect uygulamaları: canlı durum (nabız ~60 sn), sürüm, 2FA, VPN,
 * ayarlar ve olay kaydı. Buradan 2FA sıfırlanır, kilit kaldırılır, cihaz/kod iptal edilir.
 * Veri: services/pusula-connect (Hub yalnız arayüz; lib/connect-yonetim.ts).
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { PageContainer } from "@/components/layout/page-container"
import { ListeKarti, ListeThead, ListeBosSatir, ListeSayfalama } from "@/components/shared/liste-karti"
import { MetinFiltre, SecimFiltre, SayiAralikFiltre, TarihFiltre, tarihUygun, type SayiAralikDeger, type TarihFiltreDeger } from "@/components/shared/liste-filtreleri"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@muharremoz/pusula-ui"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@muharremoz/pusula-ui"
import { toast } from "sonner"
import {
  Activity, Ban, CheckCircle2, CircleMinus, Globe, History, ScanBarcode, Server, KeyRound, Laptop, LockOpen, Megaphone, MonitorPlay, MoreVertical, PlugZap,
  RefreshCw, Settings, ShieldCheck, ShieldOff, TriangleAlert, Wifi, Download, Link2,
} from "lucide-react"
import { DuyurularSekmesi } from "@/components/connect/duyurular-sekmesi"
import { AyarlarSekmesi } from "@/components/connect/ayarlar-sekmesi"
import type { ConnectCihazIslemi, ConnectCihazSatir, ConnectSayimDurum, ConnectKod, ConnectOlay } from "@/lib/connect-yonetim"

// ------------------------------------------------------------ yardımcılar

/** Müşteriye gönderilecek uygulama: servisteki güncel (imzalı) exe — yeni sürüm yayınlanınca bu adres de günceller */
const UYGULAMA_INDIR = "https://aktarim.pusulanet.net/connect/indir"

/** Servis zamanları SQLite datetime('now') = UTC "YYYY-MM-DD HH:MM:SS". */
const zaman = (s: string | null) => (s ? new Date(s.replace(" ", "T") + "Z") : null)
const tarihMetni = (s: string | null) =>
  zaman(s)?.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" }) ?? "—"
function onceMetni(s: string | null) {
  const d = zaman(s)
  if (!d) return "—"
  const sn = Math.max(0, (Date.now() - d.getTime()) / 1000)
  if (sn < 60) return "az önce"
  if (sn < 3600) return `${Math.floor(sn / 60)} dk önce`
  if (sn < 86400) return `${Math.floor(sn / 3600)} sa önce`
  if (sn < 30 * 86400) return `${Math.floor(sn / 86400)} gün önce`
  return tarihMetni(s)
}
function surumKarsilastir(a: string | null, b: string | null) {
  const pa = String(a ?? "0").split(".").map((x) => parseInt(x, 10) || 0)
  const pb = String(b ?? "0").split(".").map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

/** Nabız 3 dk içindeyse çevrimiçi (istemci ~60 sn'de bir gönderir). */
const CEVRIMICI_SN = 180
type CanliDurum = "oturumda" | "cevrimici" | "cevrimdisi" | "iptal"
function canliDurum(c: ConnectCihazSatir): CanliDurum {
  if (c.iptal) return "iptal"
  const n = zaman(c.sonNabiz)
  const canli = !!n && Date.now() - n.getTime() < CEVRIMICI_SN * 1000
  if (!canli) return "cevrimdisi"
  return c.oturumAcik ? "oturumda" : "cevrimici"
}
const DURUM_ETIKET: Record<CanliDurum, string> = { oturumda: "Oturumda", cevrimici: "Çevrimiçi", cevrimdisi: "Çevrimdışı", iptal: "İptal" }
const DURUM_NOKTA: Record<CanliDurum, string> = {
  oturumda: "bg-emerald-500 ring-4 ring-emerald-500/20",
  cevrimici: "bg-sky-500",
  cevrimdisi: "bg-muted-foreground/40",
  iptal: "bg-red-500",
}

type IkiDurum = "acik" | "kapali" | "kilitli"
const ikiDurum = (c: ConnectCihazSatir): IkiDurum =>
  c.totpKilit && (zaman(c.totpKilit)?.getTime() ?? 0) > Date.now() ? "kilitli" : c.totpAktif ? "acik" : "kapali"

const kilitli = (c: ConnectCihazSatir) => ikiDurum(c) === "kilitli" || (c.totpHata ?? 0) > 0

// ------------------------------------------------------------ olaylar

type Ton = "iyi" | "uyari" | "hata" | "notr"
const OLAY: Record<string, { ad: string; ton: Ton }> = {
  kayit: { ad: "Cihaz kaydedildi", ton: "iyi" },
  uygulama_acildi: { ad: "Uygulama açıldı", ton: "notr" },
  guncellendi: { ad: "Güncellendi", ton: "iyi" },
  oturum_acildi: { ad: "Oturum açıldı", ton: "iyi" },
  oturum_bitti: { ad: "Oturum kapandı", ton: "notr" },
  oturum_hatasi: { ad: "Oturum hatayla bitti", ton: "hata" },
  sifre_kaydedildi: { ad: "Şifre kaydedildi", ton: "notr" },
  sifre_silindi: { ad: "Şifre silindi", ton: "uyari" },
  sifre_gecersiz: { ad: "Kayıtlı şifre geçersiz", ton: "hata" },
  kayit_kaldirildi: { ad: "Kullanıcı kaydı kaldırdı", ton: "uyari" },
  ayar_degisti: { ad: "Ayar değişti", ton: "notr" },
  vpn_kuruldu: { ad: "VPN kuruldu", ton: "iyi" },
  vpn_kurulum_hatasi: { ad: "VPN kurulamadı", ton: "hata" },
  "2fa_acildi": { ad: "2FA açıldı", ton: "iyi" },
  "2fa_kapatildi": { ad: "2FA kapatıldı", ton: "uyari" },
  "2fa_hatali_kod": { ad: "Hatalı 2FA kodu", ton: "uyari" },
  "2fa_kilitlendi": { ad: "2FA kilitlendi", ton: "hata" },
  "2fa_sifirlandi": { ad: "2FA sıfırlandı (Pusula)", ton: "uyari" },
  "2fa_kilit_kaldirildi": { ad: "2FA kilidi kaldırıldı", ton: "notr" },
  cihaz_iptal: { ad: "Cihaz iptal edildi", ton: "hata" },
  cihaz_etkinlestirildi: { ad: "Cihaz yeniden açıldı", ton: "iyi" },
  kod_olusturuldu: { ad: "Kurulum kodu üretildi", ton: "notr" },
  kod_iptal: { ad: "Kurulum kodu iptal", ton: "uyari" },
  duyuru_yayinlandi: { ad: "Duyuru yayınlandı", ton: "notr" },
  profil_guncellendi: { ad: "Sunucu bilgisi güncellendi", ton: "notr" },
  sifre_iletildi: { ad: "Şifre Hub'dan iletildi", ton: "notr" },
  sifre_guncellendi: { ad: "Şifre Pusula'dan alındı", ton: "iyi" },
  sifre_gosterildi: { ad: "Şifre ekranda gösterildi", ton: "uyari" },
  vpn_baglan_tetiklendi: { ad: "VPN otomatik bağlantı tetiklendi", ton: "notr" },
  dns_cozulemedi: { ad: "Sunucu adı çözülemedi (IP ile bağlanıyor)", ton: "uyari" },
  token_yenilendi: { ad: "Cihaz tokenı yenilendi", ton: "notr" },
  duyuru_kaldirildi: { ad: "Duyuru kaldırıldı", ton: "notr" },
}
const TON_SINIF: Record<Ton, string> = {
  iyi: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  uyari: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  hata: "bg-red-500/15 text-red-700 dark:text-red-400",
  notr: "bg-muted text-muted-foreground",
}
const AYAR_AD: Record<string, string> = {
  tamEkran: "Tam ekran", yazici: "Yazıcılar", pano: "Pano", ses: "Ses", windowsIleBaslat: "Windows ile başlat",
  akilliKart: "Akıllı kartlar", portlar: "Bağlantı noktaları", konum: "Konum", kamera: "Kamera", aygitlar: "Tak ve Kullan", suruculer: "Sürücüler",
}

/** Olay ayrıntısı (JSON ya da düz metin) → okunur tek satır. */
/**
 * Uzak masaüstü (mstscax) kapanma nedeni — istemci "neden" olarak gönderir. "kod 1" diye görünüyordu (07.10.2026).
 * Bilinmeyen kod olduğu gibi "kod N" kalır.
 */
const RDP_NEDEN: Record<number, string> = {
  1: "kullanıcı kapattı",
  2: "sunucuda oturum kapatıldı",
  3: "sunucu bağlantıyı kesti",
  264: "bağlantı zaman aşımı",
  516: "sunucuya ulaşılamadı",
  772: "ağ bağlantısı koptu",
  1028: "ağ bağlantısı koptu",
  2055: "şifre hatalı",
  2567: "kullanıcı bulunamadı",
  2823: "şifre süresi dolmuş",
  3335: "hesap kilitli",
}
/**
 * Ayrıntıda "kod N" kalır; açıklaması üzerine gelince. Olaylarda YALNIZ kodlu satırda ipucu var (07.10.2026) —
 * diğerlerinde ipucu aynı metni tekrarlıyordu.
 */
function olayIpucu(o: ConnectOlay): string | null {
  if ((o.tur !== "oturum_bitti" && o.tur !== "oturum_hatasi") || !o.ayrinti) return null
  try {
    const n = (JSON.parse(o.ayrinti) as { neden?: unknown }).neden
    if (typeof n === "number" && n !== -1) return `Kod ${n}: ${RDP_NEDEN[n] ?? "açıklaması bilinmiyor"}`
  } catch { /* JSON değil */ }
  return null
}

function ayrintiMetni(o: ConnectOlay) {
  if (!o.ayrinti) return o.kaynak === "yonetici" ? "" : ""
  let j: unknown
  try { j = JSON.parse(o.ayrinti) } catch { return o.ayrinti }
  if (j == null || typeof j !== "object") return String(j)
  const v = j as Record<string, unknown>
  if (o.tur === "oturum_acildi") return [v.sunucu, v.ms != null ? `${v.ms} ms` : null, v.ikiAdim ? "2FA ile" : null].filter(Boolean).join(" · ")
  if (o.tur === "oturum_bitti" || o.tur === "oturum_hatasi")
    return [v.mesaj, v.sureDk != null ? `${v.sureDk} dk sürdü` : null, typeof v.neden === "number" && v.neden !== -1 ? `kod ${v.neden}` : null].filter(Boolean).join(" · ")
  if (o.tur === "ayar_degisti")
    return Object.entries(v).map(([k, d]) => `${AYAR_AD[k] ?? k}: ${d === true ? "açık" : d === false ? "kapalı" : String(d)}`).join(", ")
  return Object.entries(v).map(([k, d]) => `${k}: ${String(d)}`).join(", ")
}

// ------------------------------------------------------------ sayfa

export default function ConnectPage() {
  const [cihazlar, setCihazlar] = useState<ConnectCihazSatir[] | null>(null)
  const [sonSurum, setSonSurum] = useState<string | null>(null)
  const [olaylar, setOlaylar] = useState<ConnectOlay[] | null>(null)
  const [kodlar, setKodlar] = useState<ConnectKod[] | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [sekme, setSekme] = useState("cihazlar")
  const [secili, setSecili] = useState<string | null>(null)
  const [onay, setOnay] = useState<{ c: ConnectCihazSatir; islem: ConnectCihazIslemi } | null>(null)
  const [kodOnay, setKodOnay] = useState<ConnectKod | null>(null)
  const [yenileniyor, setYenileniyor] = useState(false)
  /** "Yenile" düğmesi: kendi verisini tutan sekmeler (duyurular) bunu izler */
  const [yenileSayac, setYenileSayac] = useState(0)

  const yukle = useCallback(async () => {
    setYenileniyor(true)
    try {
      const [rc, ro] = await Promise.all([
        fetch("/api/connect/cihazlar", { cache: "no-store" }),
        fetch("/api/connect/olaylar?limit=500", { cache: "no-store" }),
      ])
      const dc = await rc.json()
      const dol = await ro.json()
      if (!rc.ok) throw new Error(dc?.error ?? "Cihazlar alınamadı")
      if (!ro.ok) throw new Error(dol?.error ?? "Olaylar alınamadı")
      setCihazlar(dc.cihazlar ?? [])
      setSonSurum(dc.sonSurum ?? null)
      setOlaylar(Array.isArray(dol) ? dol : [])
      setHata(null)
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Hata")
    } finally {
      setYenileniyor(false)
    }
  }, [])

  const kodlariYukle = useCallback(async () => {
    try {
      const r = await fetch("/api/connect/kodlar", { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error ?? "Kodlar alınamadı")
      setKodlar(Array.isArray(d) ? d : [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kodlar alınamadı")
    }
  }, [])

  // İlk yükleme + 30 sn'de bir (nabız ~60 sn; daha sık sormanın anlamı yok)
  useEffect(() => {
    void yukle()
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void yukle() }, 30_000)
    return () => window.clearInterval(t)
  }, [yukle])
  useEffect(() => { if (sekme === "kodlar" && !kodlar) void kodlariYukle() }, [sekme, kodlar, kodlariYukle])

  const islemYap = async () => {
    if (!onay) return
    try {
      const r = await fetch(`/api/connect/cihazlar/${onay.c.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ islem: onay.islem }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`)
      toast.success(ISLEM[onay.islem].basari)
      setOnay(null)
      await yukle()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İşlem yapılamadı")
    }
  }

  const kodIptal = async () => {
    if (!kodOnay) return
    try {
      const r = await fetch(`/api/connect/kodlar/${kodOnay.id}`, { method: "POST" })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`)
      toast.success("Kurulum kodu iptal edildi", { description: "Bu kodla kaydolan cihazlar da bağlanamaz." })
      setKodOnay(null)
      await Promise.all([kodlariYukle(), yukle()])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İptal edilemedi")
    }
  }

  const seciliCihaz = cihazlar?.find((c) => c.id === secili) ?? null

  return (
    <PageContainer title="Pusula Connect" description="Müşteri bilgisayarlarındaki Connect uygulamalarının denetim ve izleme merkezi">
      <div className="flex flex-col gap-3 p-4">
        {hata && (
          <div className="flex items-center gap-2 rounded-[8px] bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-400">
            <TriangleAlert className="size-4 shrink-0" /> Veriler alınamadı: {hata}
          </div>
        )}


        <Tabs value={sekme} onValueChange={setSekme}>
          <div className="flex items-center justify-between gap-2">
            <TabsList className="h-8">
              <TabsTrigger value="cihazlar" className="h-7 gap-1.5 text-[12px]"><Laptop className="size-3.5" />Cihazlar</TabsTrigger>
              <TabsTrigger value="olaylar" className="h-7 gap-1.5 text-[12px]"><History className="size-3.5" />Olay kaydı</TabsTrigger>
              <TabsTrigger value="kodlar" className="h-7 gap-1.5 text-[12px]"><KeyRound className="size-3.5" />Kurulum kodları</TabsTrigger>
              <TabsTrigger value="duyurular" className="h-7 gap-1.5 text-[12px]"><Megaphone className="size-3.5" />Duyurular</TabsTrigger>
              <TabsTrigger value="ayarlar" className="h-7 gap-1.5 text-[12px]"><Settings className="size-3.5" />Ayarlar</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
            <a
              href={UYGULAMA_INDIR}
              className="hover:bg-muted text-foreground inline-flex h-8 items-center gap-1.5 rounded-[5px] border px-2.5 text-[12px] font-medium transition-colors"
            >
              <Download className="size-3.5" />Uygulamayı indir
            </a>
            <Ipucu icerik="İndirme bağlantısını kopyala"><button
              type="button"
              className="hover:bg-muted text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-[5px] border transition-colors"
              onClick={() =>
                void navigator.clipboard.writeText(UYGULAMA_INDIR)
                  .then(() => toast.success("İndirme bağlantısı kopyalandı", { description: UYGULAMA_INDIR }))
                  .catch(() => toast.error("Kopyalanamadı"))
              }
            >
              <Link2 className="size-3.5" />
            </button></Ipucu>
            <Button variant="ghost" size="sm" className="h-8 text-[12px]" disabled={yenileniyor} onClick={() => { void yukle(); if (kodlar) void kodlariYukle(); setYenileSayac((n) => n + 1) }}>
              <RefreshCw className={cn("size-3.5", yenileniyor && "animate-spin")} /> Yenile
            </Button>
            </div>
          </div>

          <TabsContent value="cihazlar" className="mt-3">
            <CihazListesi cihazlar={cihazlar} sonSurum={sonSurum} onSec={setSecili} onIslem={(c, islem) => setOnay({ c, islem })} />
          </TabsContent>
          <TabsContent value="olaylar" className="mt-3">
            <OlayListesi olaylar={olaylar} cihazlar={cihazlar} onCihaz={setSecili} />
          </TabsContent>
          <TabsContent value="kodlar" className="mt-3">
            <KodListesi kodlar={kodlar} onIptal={setKodOnay} />
          </TabsContent>
          <TabsContent value="duyurular" className="mt-3">
            <DuyurularSekmesi cihazlar={cihazlar} yenile={yenileSayac} />
          </TabsContent>
          <TabsContent value="ayarlar" className="mt-3">
            <AyarlarSekmesi />
          </TabsContent>
        </Tabs>
      </div>

      <CihazDetay
        cihaz={seciliCihaz}
        sonSurum={sonSurum}
        olaylar={(olaylar ?? []).filter((o) => o.cihazId === secili)}
        onKapat={() => setSecili(null)}
        onIslem={(c, islem) => setOnay({ c, islem })}
      />

      <AlertDialog open={!!onay} onOpenChange={(o) => !o && setOnay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{onay && ISLEM[onay.islem].baslik}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{onay?.c.makine ?? "Cihaz"}</span> · {onay?.c.kullanici} ({onay?.c.firmaAdi}).{" "}
              {onay && ISLEM[onay.islem].aciklama}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className={onay && ISLEM[onay.islem].yikici ? "bg-destructive text-white" : undefined}
              onClick={(e) => { e.preventDefault(); void islemYap() }}
            >
              {onay && ISLEM[onay.islem].dugme}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!kodOnay} onOpenChange={(o) => !o && setKodOnay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kurulum kodu iptal edilsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              {kodOnay?.kullanici} ({kodOnay?.firmaAdi}) için üretilen kod iptal edilir.
              {kodOnay?.durum === "kullanildi" && " Bu kodla kaydolan bilgisayar da artık bağlanamaz."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white" onClick={(e) => { e.preventDefault(); void kodIptal() }}>İptal et</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}

const ISLEM: Record<ConnectCihazIslemi, { baslik: string; aciklama: string; dugme: string; basari: string; yikici: boolean }> = {
  "2fa-sifirla": {
    baslik: "İki adımlı doğrulama sıfırlansın mı?",
    aciklama: "Doğrulama kodu artık sorulmaz; kullanıcı oturum şifresini yeniden girer ve isterse 2FA'yı yeni telefonla açar.",
    dugme: "2FA sıfırla", basari: "2FA sıfırlandı", yikici: true,
  },
  "kilit-kaldir": {
    baslik: "2FA kilidi kaldırılsın mı?",
    aciklama: "Çok hatalı kod nedeniyle konan bekleme kalkar, kullanıcı hemen tekrar deneyebilir.",
    dugme: "Kilidi kaldır", basari: "Kilit kaldırıldı", yikici: false,
  },
  iptal: {
    baslik: "Cihaz iptal edilsin mi?",
    aciklama: "Bu bilgisayar Pusula'ya bir daha bağlanamaz (açık oturum etkilenmez). Gerekirse geri açılabilir.",
    dugme: "İptal et", basari: "Cihaz iptal edildi", yikici: true,
  },
  etkinlestir: {
    baslik: "Cihaz yeniden açılsın mı?",
    aciklama: "İptal geri alınır; bilgisayar yeniden bağlanabilir.",
    dugme: "Yeniden aç", basari: "Cihaz yeniden açıldı", yikici: false,
  },
}

// ------------------------------------------------------------ parçalar

function DurumRozeti({ c }: { c: ConnectCihazSatir }) {
  const d = canliDurum(c)
  return (
    <span className="inline-flex items-center gap-2 text-[12px]">
      <span className={cn("size-2 shrink-0 rounded-full", DURUM_NOKTA[d])} />
      <span className={cn(d === "cevrimdisi" && "text-muted-foreground", d === "iptal" && "text-red-700 dark:text-red-400")}>{DURUM_ETIKET[d]}</span>
    </span>
  )
}

function IkiRozeti({ c }: { c: ConnectCihazSatir }) {
  const d = ikiDurum(c)
  if (d === "kilitli") return <span className="inline-flex rounded-[5px] bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400">Kilitli</span>
  if (d === "acik") return <span className="inline-flex items-center gap-1 rounded-[5px] bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"><ShieldCheck className="size-3" />Açık</span>
  return <span className="text-muted-foreground text-[12px]">Kapalı</span>
}

function SurumRozeti({ surum, son }: { surum: string | null; son: string | null }) {
  const eski = !!son && !!surum && surumKarsilastir(surum, son) < 0
  return (
    <Ipucu icerik={eski ? `Yayındaki sürüm ${son}` : undefined}><span className={cn("text-[12px]", eski && "rounded-[5px] bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400")}>
      {surum ?? "—"}
    </span></Ipucu>
  )
}

function CihazMenusu({ c, onIslem, onSec }: { c: ConnectCihazSatir; onIslem: (c: ConnectCihazSatir, i: ConnectCihazIslemi) => void; onSec?: (id: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" onClick={(e) => e.stopPropagation()} aria-label="İşlemler">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {onSec && <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => onSec(c.id)}><Activity className="size-3.5" />Ayrıntı ve olaylar</DropdownMenuItem>}
        {c.totpAktif && <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => onIslem(c, "2fa-sifirla")}><ShieldOff className="size-3.5" />2FA sıfırla</DropdownMenuItem>}
        {kilitli(c) && <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => onIslem(c, "kilit-kaldir")}><LockOpen className="size-3.5" />2FA kilidini kaldır</DropdownMenuItem>}
        {c.iptal ? (
          <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => onIslem(c, "etkinlestir")}><CheckCircle2 className="size-3.5" />Yeniden aç</DropdownMenuItem>
        ) : (
          <DropdownMenuItem className="gap-2 text-[12px] text-rose-600 focus:text-rose-600" onClick={() => onIslem(c, "iptal")}><Ban className="size-3.5" />Cihazı iptal et</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const DURUMLAR: CanliDurum[] = ["oturumda", "cevrimici", "cevrimdisi", "iptal"]

/* ── Sayım modu (Pusula X sayım kopyası) ── */
type SayimDurumu = "kurulu" | "sorunlu" | "kuruluyor" | "yok"
const SAYIM_DURUMLAR: SayimDurumu[] = ["kurulu", "sorunlu", "kuruluyor", "yok"]
const SAYIM_ETIKET: Record<SayimDurumu, string> = { kurulu: "Kurulu", sorunlu: "Sorunlu", kuruluyor: "Kuruluyor", yok: "Yok" }
/** Tek sayım kurulumunun durumu */
function tekSayimDurumu(s: ConnectSayimDurum | null | undefined): SayimDurumu {
  if (!s) return "yok"
  if (s.kuruluyor) return "kuruluyor"
  if (!s.kurulu) return s.hata ? "sorunlu" : "yok"
  if (s.guncellemeBekliyor || (s.test && !s.test.ok)) return "sorunlu"
  return "kurulu"
}
/** Cihazın genel sayım durumu: Pusula X ve eski programdan en dikkat isteyeni */
const SAYIM_ONCELIK: SayimDurumu[] = ["sorunlu", "kuruluyor", "kurulu", "yok"]
function sayimDurumu(c: ConnectCihazSatir): SayimDurumu {
  const a = tekSayimDurumu(c.durum?.sayim), b = tekSayimDurumu(c.durum?.sayimEski)
  return SAYIM_ONCELIK.find((d) => d === a || d === b) ?? "yok"
}
const FORM_AD: Record<string, string> = { "612": "Perakende", "146": "Toptan" }
/**
 * VPN tüneli (0.6.5+ nabızla gelir). "Çevrimiçi ama sunucuya erişemiyor" durumunda sebep çoğu zaman VPN'in
 * kapalı olması — kapalıysa sarı. Eski istemci göndermez → —.
 */
/** Cihaz çevrimdışıysa (iptal dahil) VPN/sunucu bilgisi ESKİ — son nabızdan kalma, "Kapalı/Erişemiyor" yanıltıyordu (07.10.2026). */
const canliMi = (c: ConnectCihazSatir) => { const d = canliDurum(c); return d === "oturumda" || d === "cevrimici" }

function VpnRozeti({ c }: { c: ConnectCihazSatir }) {
  const v = c.durum?.vpn
  if (v == null) return <span className="text-muted-foreground">—</span>
  if (!canliMi(c)) return <Ipucu icerik={`Cihaz çevrimdışı · son bilinen: ${v.bagli ? "Açık" : "Kapalı"}`}><span className="text-muted-foreground">—</span></Ipucu>
  return v.bagli
    // "Açık" yazılmaz: yeşil VPN IP'si yeterli (07.10.2026); IP yoksa "Açık"
    ? <Ipucu icerik={"VPN açık"}><span className="text-emerald-700 dark:text-emerald-400">{v.ip || "Açık"}</span></Ipucu>
    : <span className="text-amber-700 dark:text-amber-400">Kapalı</span>
}

function SayimRozeti({ c }: { c: ConnectCihazSatir }) {
  const d = sayimDurumu(c)
  if (d === "yok") return <span className="text-muted-foreground">—</span>
  const ton = d === "kurulu" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : d === "kuruluyor" ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
    : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
  const turler = [c.durum?.sayim && tekSayimDurumu(c.durum.sayim) !== "yok" ? "Pusula X" : null, c.durum?.sayimEski && tekSayimDurumu(c.durum.sayimEski) !== "yok" ? "Pusula VB" : null].filter(Boolean)
  // Kuruluysa yalnız program adı ("Kurulu" yazmaya gerek yok); sorun/kurulum sürüyorsa önce durum (07.10.2026)
  const metin = d === "kurulu" ? turler.join(" + ") : `${SAYIM_ETIKET[d]}${turler.length ? ` · ${turler.join(" + ")}` : ""}`
  return <Ipucu icerik={sayimAciklama(c)}><span className={cn("inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", ton)}>{metin || SAYIM_ETIKET[d]}</span></Ipucu>
}
function sayimAciklama(c: ConnectCihazSatir): string {
  const parca = [tekSayimAciklama("Pusula X", c.durum?.sayim), tekSayimAciklama("Pusula VB", c.durum?.sayimEski)].filter((x): x is string => !!x)
  return parca.length ? parca.join("\n") : "Sayım kurulu değil"
}
function tekSayimAciklama(ad: string, s: ConnectSayimDurum | null | undefined): string | null {
  if (!s) return null
  if (s.kuruluyor) return `${ad}: kurulum sürüyor`
  if (!s.kurulu) return s.hata ? `${ad}: kurulum başarısız — ${s.hata}` : null
  const p: string[] = [`${ad} ${s.surum ?? "?"}`]
  // Veritabanı adı gösterilmez (07.10.2026) — yalnız Perakende/Toptan
  if (s.formId) p.push(FORM_AD[s.formId] ?? s.formId)
  if (s.guncellemeBekliyor) p.push("SQL bilgisi değişti, kodla yenilenmeyi bekliyor")
  if (s.test) p.push(s.test.ok ? "test başarılı" : `test başarısız: ${s.test.hata ?? "?"}`)
  else p.push("henüz test edilmedi")
  return p.join(" · ")
}
const IKI_DURUMLAR: IkiDurum[] = ["acik", "kapali", "kilitli"]
const IKI_ETIKET: Record<IkiDurum, string> = { acik: "Açık", kapali: "Kapalı", kilitli: "Kilitli" }

type VpnDurumu = "acik" | "kapali" | "yok"
const VPN_DURUMLAR: VpnDurumu[] = ["acik", "kapali", "yok"]
const VPN_ETIKET: Record<VpnDurumu, string> = { acik: "Açık", kapali: "Kapalı", yok: "Bilinmiyor" }
const vpnDurumu = (c: ConnectCihazSatir): VpnDurumu => (c.durum?.vpn == null || !canliMi(c) ? "yok" : c.durum.vpn.bagli ? "acik" : "kapali")
type SunucuDurumu = "erisiyor" | "erisemiyor" | "yok"
const SUNUCU_DURUMLAR: SunucuDurumu[] = ["erisiyor", "erisemiyor", "yok"]
const SUNUCU_ETIKET: Record<SunucuDurumu, string> = { erisiyor: "Erişiyor", erisemiyor: "Erişemiyor", yok: "Bilinmiyor" }
const sunucuDurumu = (c: ConnectCihazSatir): SunucuDurumu => (c.terminalErisim == null || !canliMi(c) ? "yok" : c.terminalErisim ? "erisiyor" : "erisemiyor")

function CihazListesi({
  cihazlar, sonSurum, onSec, onIslem,
}: {
  cihazlar: ConnectCihazSatir[] | null
  sonSurum: string | null
  onSec: (id: string) => void
  onIslem: (c: ConnectCihazSatir, i: ConnectCihazIslemi) => void
}) {
  const [firma, setFirma] = useState("")
  const [firmaAdi, setFirmaAdi] = useState("")
  const [adet, setAdet] = useState<SayiAralikDeger>({})
  const [kullanici, setKullanici] = useState("")
  const [makine, setMakine] = useState("")
  const [vpn, setVpn] = useState<VpnDurumu[]>([])
  const [sunucu, setSunucu] = useState<SunucuDurumu[]>([])
  const [sonGorulme, setSonGorulme] = useState<TarihFiltreDeger>({ mode: "tum" })
  const [durum, setDurum] = useState<CanliDurum[]>([])
  const [iki, setIki] = useState<IkiDurum[]>([])
  const [surum, setSurum] = useState<string[]>([])
  const [sayim, setSayim] = useState<SayimDurumu[]>([])
  const [sayfa, setSayfa] = useState(1)

  const surumler = useMemo(() => [...new Set((cihazlar ?? []).map((c) => c.surum ?? "—"))].sort((a, b) => surumKarsilastir(b, a)), [cihazlar])

  const firmaAdetleri = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cihazlar ?? []) m.set(c.firmaId, (m.get(c.firmaId) ?? 0) + 1)
    return m
  }, [cihazlar])

  const filtreli = useMemo(() => (cihazlar ?? []).filter((c) => {
    const n = firmaAdetleri.get(c.firmaId) ?? 0
    if (adet.min != null && n < adet.min) return false
    if (adet.max != null && n > adet.max) return false
    if (firma && !c.firmaId.toLocaleLowerCase("tr").includes(firma.toLocaleLowerCase("tr"))) return false
    if (firmaAdi && !c.firmaAdi.toLocaleLowerCase("tr").includes(firmaAdi.toLocaleLowerCase("tr"))) return false
    if (kullanici && !c.kullanici.toLocaleLowerCase("tr").includes(kullanici.toLocaleLowerCase("tr"))) return false
    if (makine && !(c.makine ?? "").toLocaleLowerCase("tr").includes(makine.toLocaleLowerCase("tr"))) return false
    if (durum.length && !durum.includes(canliDurum(c))) return false
    if (iki.length && !iki.includes(ikiDurum(c))) return false
    if (surum.length && !surum.includes(c.surum ?? "—")) return false
    if (sayim.length && !sayim.includes(sayimDurumu(c))) return false
    if (vpn.length && !vpn.includes(vpnDurumu(c))) return false
    if (sunucu.length && !sunucu.includes(sunucuDurumu(c))) return false
    if (!tarihUygun(c.sonGorulme ?? c.ilkGiris, sonGorulme)) return false
    return true
  })
  // Firmaya göre gruplu (07.10.2026): firma koduna göre sıralanır, sayfadaki satırlar firma başlığı altında toplanır.
  // Bir firma sayfa sınırına denk gelirse başlığı sonraki sayfada tekrar çıkar.
    .sort((a, b) => a.firmaId.localeCompare(b.firmaId, "tr", { numeric: true }) || a.kullanici.localeCompare(b.kullanici, "tr", { numeric: true })),
  [cihazlar, firmaAdetleri, adet, firma, firmaAdi, kullanici, makine, durum, iki, surum, sayim, vpn, sunucu, sonGorulme])
  useEffect(() => setSayfa(1), [adet, firma, firmaAdi, kullanici, makine, durum, iki, surum, sayim, vpn, sunucu, sonGorulme])
  const gorunen = useMemo(() => filtreli.slice((sayfa - 1) * 50, sayfa * 50), [filtreli, sayfa])
  const gruplar = useMemo(() => {
    const m = new Map<string, { firmaId: string; firmaAdi: string; satirlar: ConnectCihazSatir[] }>()
    for (const c of gorunen) {
      const g = m.get(c.firmaId) ?? { firmaId: c.firmaId, firmaAdi: c.firmaAdi, satirlar: [] }
      g.satirlar.push(c)
      m.set(c.firmaId, g)
    }
    return [...m.values()]
  }, [gorunen])
  const SUTUN = 13

  return (
    <ListeKarti baslik="Cihazlar" ikon={<Laptop className="size-3.5" />} toplam={cihazlar?.length ?? 0} filtreli={filtreli.length}>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px] leading-[20px] font-medium">
          <ListeThead>
            <th className="px-3 py-1 text-left font-medium"><MetinFiltre label="Kod" value={firma} onChange={setFirma} /></th>
            <th className="px-3 py-1 text-left font-medium"><MetinFiltre label="Firma" value={firmaAdi} onChange={setFirmaAdi} /></th>
            <th className="px-3 py-1 text-left font-medium"><SayiAralikFiltre label="Kullanıcı" value={adet} onChange={setAdet} /></th>
            <th className="px-3 py-1 text-left font-medium"><SecimFiltre label="Durum" options={DURUMLAR} getLabel={(d) => DURUM_ETIKET[d]} selected={durum} onChange={setDurum} /></th>
            <th className="px-3 py-1 text-left font-medium"><MetinFiltre label="Kullanıcı" value={kullanici} onChange={setKullanici} /></th>
            <th className="px-3 py-1 text-left font-medium"><MetinFiltre label="Bilgisayar" value={makine} onChange={setMakine} /></th>
            <th className="px-3 py-1 text-left font-medium"><SecimFiltre label="Sürüm" options={surumler} getLabel={(s) => s} selected={surum} onChange={setSurum} /></th>
            <th className="px-3 py-1 text-left font-medium"><SecimFiltre label="2FA" options={IKI_DURUMLAR} getLabel={(d) => IKI_ETIKET[d]} selected={iki} onChange={setIki} /></th>
            <th className="px-3 py-1 text-left font-medium"><SecimFiltre label="Sayım" options={SAYIM_DURUMLAR} getLabel={(d) => SAYIM_ETIKET[d]} selected={sayim} onChange={setSayim} /></th>
            <th className="px-3 py-1 text-left font-medium"><SecimFiltre label="VPN" options={VPN_DURUMLAR} getLabel={(d) => VPN_ETIKET[d]} selected={vpn} onChange={setVpn} /></th>
            <th className="px-3 py-1 text-left font-medium"><SecimFiltre label="Sunucu" options={SUNUCU_DURUMLAR} getLabel={(d) => SUNUCU_ETIKET[d]} selected={sunucu} onChange={setSunucu} /></th>
            <th className="px-3 py-1 text-left font-medium"><TarihFiltre label="Son görülme" value={sonGorulme} onChange={setSonGorulme} /></th>
            <th className="px-3 py-1 text-right font-medium">İşlem</th>
          </ListeThead>
          <tbody>
            {!cihazlar ? (
              [0, 1, 2].map((i) => (
                <tr key={i}><td colSpan={SUTUN} className="px-3 py-1.5"><Skeleton className="h-5 w-full" /></td></tr>
              ))
            ) : gorunen.length === 0 ? (
              <ListeBosSatir
                sutunSayisi={SUTUN}
                toplam={cihazlar.length}
                bosMesaj="Henüz Connect kuran yok. Firma sayfasında kullanıcı menüsünden Connect 2 Kurulum Kodu üretip müşteriye gönderin."
              />
            ) : gruplar.map((g) => {
              return (
                <Fragment key={g.firmaId}>
                  {g.satirlar.map((c, i) => (
                    <tr
                      key={c.id}
                      className={cn("cursor-pointer text-[13px] hover:bg-muted/20", i === 0 ? "border-t border-t-border" : "border-t border-t-border/40")}
                      onClick={() => onSec(c.id)}
                    >
                      {/* BİRLEŞİK FİRMA HÜCRESİ (07.10.2026, kullanıcı kararı): kod + ad grubun tüm satırlarını kaplayan
                          tek hücrede (rowSpan), dikey ortalı — tekrar da boş satır görüntüsü de yok. Tıklanınca cihaz açmaz. */}
                      {i === 0 && (
                        <>
                          <td
                            rowSpan={g.satirlar.length}
                            className="cursor-default bg-[var(--section-bg)]/60 px-3 py-1 align-middle font-semibold tabular-nums whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {g.firmaId}
                          </td>
                          <td
                            rowSpan={g.satirlar.length}
                            className="max-w-[260px] cursor-default bg-[var(--section-bg)]/60 px-3 py-1 align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="block truncate">{g.firmaAdi}</span>
                          </td>
                          {/* Firmanın Connect kullanıcı (cihaz) sayısı — ayrı sütun (07.10.2026) */}
                          <td
                            rowSpan={g.satirlar.length}
                            className="cursor-default border-r bg-[var(--section-bg)]/60 px-3 py-1 text-center align-middle tabular-nums"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {firmaAdetleri.get(g.firmaId) ?? g.satirlar.length}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-1 whitespace-nowrap"><DurumRozeti c={c} /></td>
                      <td className="px-3 py-1 whitespace-nowrap">{c.kullanici}</td>
                      <td className="px-3 py-1 whitespace-nowrap">{c.makine ?? "—"}</td>
                      <td className="px-3 py-1 whitespace-nowrap"><SurumRozeti surum={c.surum} son={sonSurum} /></td>
                      <td className="px-3 py-1 whitespace-nowrap"><IkiRozeti c={c} /></td>
                      <td className="px-3 py-1 whitespace-nowrap text-[12px]"><SayimRozeti c={c} /></td>
                      <td className="px-3 py-1 whitespace-nowrap text-[12px]"><VpnRozeti c={c} /></td>
                      <td className="px-3 py-1 whitespace-nowrap text-[12px]">
                        {c.terminalErisim == null ? <span className="text-muted-foreground">—</span>
                          : !canliMi(c) ? <Ipucu icerik={`Cihaz çevrimdışı · son bilinen: ${c.terminalErisim ? "Erişiyor" : "Erişemiyor"}`}><span className="text-muted-foreground">—</span></Ipucu>
                          : c.terminalErisim ? (
                            // Yalnız ikon; gecikme üzerine gelince (07.10.2026)
                            <Ipucu icerik={c.terminalMs != null ? `${KALITE_AD[kalite(c.terminalMs)]} · ${c.terminalMs} ms` : "Erişiyor"}><span className="inline-flex items-center py-1">
                              <SinyalIkonu ms={c.terminalMs} />
                            </span></Ipucu>
                          )
                          : <span className="text-amber-700 dark:text-amber-400">Erişemiyor</span>}
                      </td>
                      <Ipucu icerik={tarihMetni(c.sonGorulme)}><td className="text-muted-foreground px-3 py-1 text-[12px] whitespace-nowrap">{onceMetni(c.sonGorulme ?? c.ilkGiris)}</td></Ipucu>
                      <td className="px-3 py-0.5 text-right" onClick={(e) => e.stopPropagation()}><CihazMenusu c={c} onIslem={onIslem} onSec={onSec} /></td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <ListeSayfalama sayfa={sayfa} onSayfaChange={setSayfa} toplam={filtreli.length} sayfaBoyu={50} />
    </ListeKarti>
  )
}

/**
 * Cihaz modalında son olaylar (07.10.2026): tablo + sayfalama, Zaman sütununda tarih filtresi, Olay'da tür,
 * Ayrıntı'da metin filtresi. Modal her açılışta yeniden kurulur — filtreler cihaz değişince sıfırlanır.
 */
function CihazOlaylari({ olaylar }: { olaylar: ConnectOlay[] }) {
  const [tarih, setTarih] = useState<TarihFiltreDeger>({ mode: "tum" })
  const [tur, setTur] = useState<string[]>([])
  const [ayrinti, setAyrinti] = useState("")
  const [sayfa, setSayfa] = useState(1)
  const turler = useMemo(() => [...new Set(olaylar.map((o) => o.tur))].sort((a, b) => (OLAY[a]?.ad ?? a).localeCompare(OLAY[b]?.ad ?? b, "tr")), [olaylar])
  const filtreli = useMemo(() => olaylar.filter((o) => {
    if (!tarihUygun(o.zaman, tarih)) return false
    if (tur.length && !tur.includes(o.tur)) return false
    if (ayrinti && !`${ayrintiMetni(o)} ${olayIpucu(o) ?? ""}`.toLocaleLowerCase("tr").includes(ayrinti.toLocaleLowerCase("tr"))) return false
    return true
  }), [olaylar, tarih, tur, ayrinti])
  useEffect(() => setSayfa(1), [tarih, tur, ayrinti])
  const BOY = 11
  const gorunen = filtreli.slice((sayfa - 1) * BOY, sayfa * BOY)

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[8px] border">
      <div className="flex items-center justify-between border-b bg-[var(--section-bg)] px-3 py-1.5">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Son olaylar</span>
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {filtreli.length === olaylar.length ? olaylar.length : `${filtreli.length} / ${olaylar.length}`}
        </span>
      </div>
      {/* Bölüm sütun boyuna uzar; sayfalama hep altta kalsın */}
      <div className="flex-1">
        <table className="w-full table-fixed text-[12px]">
          <colgroup>
            <col className="w-[120px]" />
            <col className="w-[160px]" />
            <col />
          </colgroup>
          <ListeThead>
            <th className="px-3 py-1 text-left font-medium"><TarihFiltre label="Zaman" value={tarih} onChange={setTarih} /></th>
            <th className="px-2 py-1 text-left font-medium"><SecimFiltre label="Olay" options={turler} getLabel={(t) => OLAY[t]?.ad ?? t} selected={tur} onChange={setTur} /></th>
            <th className="px-2 py-1 text-left font-medium"><MetinFiltre label="Ayrıntı" value={ayrinti} onChange={setAyrinti} /></th>
          </ListeThead>
          <tbody>
            {gorunen.length === 0 ? (
              <ListeBosSatir sutunSayisi={3} toplam={olaylar.length} bosMesaj="Son 500 olay içinde bu cihaza ait kayıt yok." />
            ) : gorunen.map((o) => (
              <tr key={o.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="text-muted-foreground px-3 py-1 tabular-nums whitespace-nowrap">{tarihMetni(o.zaman)}</td>
                <td className="px-2 py-1"><OlayRozeti tur={o.tur} /></td>
                <Ipucu icerik={olayIpucu(o)}><td className="text-muted-foreground truncate px-2 py-1">{ayrintiMetni(o)}</td></Ipucu>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ListeSayfalama sayfa={sayfa} onSayfaChange={setSayfa} toplam={filtreli.length} sayfaBoyu={BOY} />
    </section>
  )
}

function OlayRozeti({ tur }: { tur: string }) {
  const o = OLAY[tur] ?? { ad: tur, ton: "notr" as Ton }
  return <span className={cn("inline-block max-w-full truncate rounded-[5px] px-2 py-0.5 align-middle text-[11px] font-medium whitespace-nowrap", TON_SINIF[o.ton])}>{o.ad}</span>
}

function OlayListesi({ olaylar, cihazlar, onCihaz }: { olaylar: ConnectOlay[] | null; cihazlar: ConnectCihazSatir[] | null; onCihaz: (id: string) => void }) {
  const [tur, setTur] = useState<string[]>([])
  const [firma, setFirma] = useState("")
  const [kullanici, setKullanici] = useState("")
  const [sayfa, setSayfa] = useState(1)
  const turler = useMemo(() => [...new Set((olaylar ?? []).map((o) => o.tur))].sort((a, b) => (OLAY[a]?.ad ?? a).localeCompare(OLAY[b]?.ad ?? b, "tr")), [olaylar])
  const firmaAdi = useMemo(() => new Map((cihazlar ?? []).map((c) => [c.firmaId, c.firmaAdi])), [cihazlar])

  const filtreli = useMemo(() => (olaylar ?? []).filter((o) => {
    if (tur.length && !tur.includes(o.tur)) return false
    if (firma && !`${o.firmaId ?? ""} ${firmaAdi.get(o.firmaId ?? "") ?? ""}`.toLocaleLowerCase("tr").includes(firma.toLocaleLowerCase("tr"))) return false
    if (kullanici && !(o.kullanici ?? "").toLocaleLowerCase("tr").includes(kullanici.toLocaleLowerCase("tr"))) return false
    return true
  }), [olaylar, tur, firma, kullanici, firmaAdi])
  useEffect(() => setSayfa(1), [tur, firma, kullanici])
  const gorunen = filtreli.slice((sayfa - 1) * 50, sayfa * 50)

  return (
    <ListeKarti baslik="Olay kaydı (son 500)" ikon={<History className="size-3.5" />} toplam={olaylar?.length ?? 0} filtreli={filtreli.length}>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px] leading-[20px] font-medium">
          <ListeThead>
            <th className="px-4 py-1.5 text-left font-medium">Zaman</th>
            <th className="px-4 py-1.5 text-left font-medium"><SecimFiltre label="Olay" options={turler} getLabel={(t) => OLAY[t]?.ad ?? t} selected={tur} onChange={setTur} /></th>
            <th className="px-4 py-1.5 text-left font-medium"><MetinFiltre label="Firma" value={firma} onChange={setFirma} /></th>
            <th className="px-4 py-1.5 text-left font-medium"><MetinFiltre label="Kullanıcı" value={kullanici} onChange={setKullanici} /></th>
            <th className="px-4 py-1.5 text-left font-medium">Bilgisayar</th>
            <th className="px-4 py-1.5 text-left font-medium">Ayrıntı</th>
            <th className="px-4 py-1.5 text-left font-medium">Kaynak</th>
          </ListeThead>
          <tbody>
            {!olaylar ? (
              [0, 1, 2].map((i) => <tr key={i}><td colSpan={7} className="px-4 py-2"><Skeleton className="h-5 w-full" /></td></tr>)
            ) : gorunen.length === 0 ? (
              <ListeBosSatir sutunSayisi={7} toplam={olaylar.length} bosMesaj="Henüz olay yok. Uygulamalar açılıp bağlandıkça burada görünür." />
            ) : gorunen.map((o) => (
              <tr key={o.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-1.5 text-[12px] whitespace-nowrap tabular-nums">{tarihMetni(o.zaman)}</td>
                <td className="px-4 py-1.5"><OlayRozeti tur={o.tur} /></td>
                <td className="px-4 py-1.5 text-[13px] whitespace-nowrap">
                  {o.firmaId ? <><span className="text-muted-foreground text-[12px]">{o.firmaId}</span> {firmaAdi.get(o.firmaId) ?? ""}</> : "—"}
                </td>
                <td className="px-4 py-1.5 text-[13px] whitespace-nowrap">{o.kullanici ?? "—"}</td>
                <td className="px-4 py-1.5 text-[13px] whitespace-nowrap">
                  {o.cihazId ? <button type="button" className="underline-offset-2 hover:underline" onClick={() => onCihaz(o.cihazId!)}>{o.makine ?? "—"}</button> : (o.makine ?? "—")}
                </td>
                <Ipucu icerik={olayIpucu(o)}><td className="text-muted-foreground max-w-[420px] truncate px-4 py-1.5 text-[12px]">{ayrintiMetni(o) || "—"}</td></Ipucu>
                <td className="text-muted-foreground px-4 py-1.5 text-[12px] whitespace-nowrap">
                  {o.kaynak === "yonetici" ? "Pusula" : o.kaynak === "istemci" ? "Uygulama" : "Servis"}
                  {o.ip && <span> · {o.ip}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ListeSayfalama sayfa={sayfa} onSayfaChange={setSayfa} toplam={filtreli.length} sayfaBoyu={50} />
    </ListeKarti>
  )
}

const KOD_DURUM: Record<ConnectKod["durum"], { ad: string; sinif: string }> = {
  bekliyor: { ad: "Kullanılmadı", sinif: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  kullanildi: { ad: "Kullanıldı", sinif: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  iptal: { ad: "İptal", sinif: "bg-muted text-muted-foreground" },
}

function KodListesi({ kodlar, onIptal }: { kodlar: ConnectKod[] | null; onIptal: (k: ConnectKod) => void }) {
  const [firma, setFirma] = useState("")
  const [kullanici, setKullanici] = useState("")
  const [sayfa, setSayfa] = useState(1)
  const filtreli = useMemo(() => (kodlar ?? []).filter((k) => {
    if (firma && !`${k.firmaId} ${k.firmaAdi}`.toLocaleLowerCase("tr").includes(firma.toLocaleLowerCase("tr"))) return false
    if (kullanici && !k.kullanici.toLocaleLowerCase("tr").includes(kullanici.toLocaleLowerCase("tr"))) return false
    return true
  }), [kodlar, firma, kullanici])
  useEffect(() => setSayfa(1), [firma, kullanici])
  const gorunen = filtreli.slice((sayfa - 1) * 25, sayfa * 25)
  const suresiDoldu = (k: ConnectKod) => k.durum === "bekliyor" && (zaman(k.bitis)?.getTime() ?? 0) < Date.now()

  return (
    <ListeKarti baslik="Kurulum kodları" ikon={<KeyRound className="size-3.5" />} toplam={kodlar?.length ?? 0} filtreli={filtreli.length}>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px] leading-[20px] font-medium">
          <ListeThead>
            <th className="px-4 py-1.5 text-left font-medium"><MetinFiltre label="Firma" value={firma} onChange={setFirma} /></th>
            <th className="px-4 py-1.5 text-left font-medium"><MetinFiltre label="Kullanıcı" value={kullanici} onChange={setKullanici} /></th>
            <th className="px-4 py-1.5 text-left font-medium">Durum</th>
            <th className="px-4 py-1.5 text-left font-medium">Üreten</th>
            <th className="px-4 py-1.5 text-left font-medium">Üretildi</th>
            <th className="px-4 py-1.5 text-left font-medium">Son geçerlilik</th>
            <th className="px-4 py-1.5 text-right font-medium">İşlem</th>
          </ListeThead>
          <tbody>
            {!kodlar ? (
              [0, 1, 2].map((i) => <tr key={i}><td colSpan={7} className="px-4 py-2"><Skeleton className="h-5 w-full" /></td></tr>)
            ) : gorunen.length === 0 ? (
              <ListeBosSatir sutunSayisi={7} toplam={kodlar.length} bosMesaj="Henüz kurulum kodu üretilmedi. Firma sayfasında kullanıcı menüsünden üretilir." />
            ) : gorunen.map((k) => (
              <tr key={k.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-1.5 text-[13px] whitespace-nowrap"><span className="text-muted-foreground text-[12px]">{k.firmaId}</span> {k.firmaAdi}</td>
                <td className="px-4 py-1.5 text-[13px] whitespace-nowrap">{k.kullanici}</td>
                <td className="px-4 py-1.5 whitespace-nowrap">
                  {suresiDoldu(k)
                    ? <span className="bg-muted text-muted-foreground inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium">Süresi doldu</span>
                    : <span className={cn("inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium", KOD_DURUM[k.durum].sinif)}>{KOD_DURUM[k.durum].ad}</span>}
                </td>
                <td className="text-muted-foreground px-4 py-1.5 text-[12px] whitespace-nowrap">{k.olusturan ?? "—"}</td>
                <td className="px-4 py-1.5 text-[12px] whitespace-nowrap tabular-nums">{tarihMetni(k.olusturma)}</td>
                <td className="px-4 py-1.5 text-[12px] whitespace-nowrap tabular-nums">{k.durum === "bekliyor" ? tarihMetni(k.bitis) : "—"}</td>
                <td className="px-4 py-1.5 text-right">
                  {k.durum !== "iptal" && (
                    <Button variant="ghost" size="sm" className="h-7 text-[12px] text-rose-600 hover:text-rose-600" onClick={() => onIptal(k)}>İptal et</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ListeSayfalama sayfa={sayfa} onSayfaChange={setSayfa} toplam={filtreli.length} />
    </ListeKarti>
  )
}

/** Gecikmeden bağlantı kalitesi — Connect uygulamasındaki eşiklerle aynı: 4 mükemmel … 1 zayıf. */
const kalite = (ms: number) => (ms < 60 ? 4 : ms < 120 ? 3 : ms < 250 ? 2 : 1)
const KALITE_AD = ["", "Zayıf", "Orta", "İyi", "Mükemmel"]
function SinyalIkonu({ ms }: { ms: number | null }) {
  const q = ms == null ? 0 : kalite(ms)
  const renk = q >= 3 ? "bg-emerald-500" : q === 2 ? "bg-amber-500" : "bg-red-500"
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={cn("w-[3px] rounded-[1px]", i < q ? renk : "bg-border")} style={{ height: 5 + i * 2 }} />
      ))}
    </span>
  )
}

/** Oturum süresi, ekiyle: "42 dakikadır" / "3 saattir" / "3 saat 10 dakikadır" / "2 gündür". */
function sureMetni(s: string | null): string {
  const d = zaman(s)
  if (!d) return ""
  const dk = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000))
  if (dk < 1) return "Az önce"
  if (dk < 60) return `${dk} dakikadır`
  if (dk < 1440) return dk % 60 ? `${Math.floor(dk / 60)} saat ${dk % 60} dakikadır` : `${Math.floor(dk / 60)} saattir`
  return `${Math.floor(dk / 1440)} gündür`
}
const saatMetni = (s: string | null) => zaman(s)?.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }) ?? ""

/** Modalın üstündeki durum kartı (07.10.2026): renkli zemin + ikon, durum ve süresi tek bakışta. */
function DurumKarti({ c, menu }: { c: ConnectCihazSatir; menu: React.ReactNode }) {
  const d = canliDurum(c)
  const ton = {
    oturumda: { kutu: "border-emerald-500/30 bg-emerald-500/10", ikon: "bg-emerald-500 text-white", yazi: "text-emerald-800 dark:text-emerald-300" },
    cevrimici: { kutu: "border-sky-500/30 bg-sky-500/10", ikon: "bg-sky-500 text-white", yazi: "text-sky-800 dark:text-sky-300" },
    cevrimdisi: { kutu: "bg-muted/40", ikon: "bg-muted text-muted-foreground", yazi: "text-foreground" },
    iptal: { kutu: "border-red-500/30 bg-red-500/10", ikon: "bg-red-500 text-white", yazi: "text-red-800 dark:text-red-300" },
  }[d]
  const baslik = d === "oturumda" ? "Oturumda" : d === "cevrimici" ? "Çevrimiçi" : d === "iptal" ? "Kaydı iptal edildi" : "Çevrimdışı"
  const alt =
    d === "oturumda"
      ? c.oturumBaslangic ? `${sureMetni(c.oturumBaslangic)} Pusula'da · başlangıç ${saatMetni(c.oturumBaslangic)}` : "Pusula'da oturum açık"
      : d === "cevrimici"
        ? "Uygulama açık, oturum yok"
        : d === "iptal"
          ? "Bu cihaz Pusula'ya bağlanamaz; yeni kurulum kodu gerekir"
          : `Son görülme ${onceMetni(c.sonNabiz ?? c.sonGorulme ?? c.ilkGiris)}`
  return (
    <div className={cn("flex items-center gap-3 rounded-[8px] border p-3", ton.kutu)}>
      <span className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-[5px] [&_svg]:size-[18px]", ton.ikon)}>
        {d === "oturumda" ? <MonitorPlay /> : d === "cevrimici" ? <Wifi /> : d === "iptal" ? <Ban /> : <Laptop />}
        {d === "oturumda" && <span className="absolute -top-0.5 -right-0.5 size-2.5 animate-pulse rounded-full border-2 border-background bg-emerald-400" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("text-[14px] font-semibold", ton.yazi)}>{baslik}</div>
        <div className="text-muted-foreground truncate text-[12px]">{alt}</div>
      </div>
      {menu}
    </div>
  )
}

/**
 * shadcn (pusula-ui) ipucu — tarayıcının yerleşik `title` balonu yerine (07.10.2026, kullanıcı kuralı).
 * İçerik boşsa sarmaz; çocuk tek eleman olmalı (asChild).
 */
function Ipucu({ icerik, children }: { icerik: React.ReactNode; children: React.ReactElement }) {
  if (icerik == null || icerik === "" || icerik === false) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs text-[12px] whitespace-pre-line">{icerik}</TooltipContent>
    </Tooltip>
  )
}

/** Detay hücresi: solda küçük ikon kutusu, sağda etiket + değer. */
function Bilgi({ ad, ikon, title, children }: { ad: string; ikon?: React.ReactNode; title?: string; children: React.ReactNode }) {
  return (
    <Ipucu icerik={title}><div className="flex min-w-0 items-center gap-2.5">
      {ikon && (
        <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-[5px] [&_svg]:size-4">{ikon}</span>
      )}
      <div className="flex min-w-0 flex-col">
        <span className="text-muted-foreground text-[11px] leading-4">{ad}</span>
        <span className="truncate text-[13px] leading-5 font-medium">{children}</span>
      </div>
    </div></Ipucu>
  )
}

/** "Microsoft Windows 11 Home Single Language" → "Windows 11 Home" (tamamı ipucunda). */
function kisaWindows(os: string | null | undefined): string {
  if (!os) return "—"
  const m = /(Windows\s+(?:Server\s+)?\S+(?:\s+(?:Home|Pro|Enterprise|Education|Standard|Datacenter))?)/i.exec(os)
  return m ? m[1] : os
}

/** Detay bölümü: başlık + iki sütunlu hücre ızgarası. */
function DetayBolumu({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[8px] border">
      <div className="border-b bg-[var(--section-bg)] px-3 py-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{baslik}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-3">{children}</div>
    </section>
  )
}

function CihazDetay({
  cihaz: c, sonSurum, olaylar, onKapat, onIslem,
}: {
  cihaz: ConnectCihazSatir | null
  sonSurum: string | null
  olaylar: ConnectOlay[]
  onKapat: () => void
  onIslem: (c: ConnectCihazSatir, i: ConnectCihazIslemi) => void
}) {
  const ay = c?.durum?.ayarlar ?? null
  return (
    // MODAL (07.10.2026, kullanıcı kararı): yan panel yerine ortada geniş pencere — solda durum, sağda son olaylar
    <Dialog open={!!c} onOpenChange={(o) => !o && onKapat()}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1240px,94vw)]">
        {c && (
          <>
            <div className="flex items-center gap-3 border-b bg-[var(--section-bg)] p-4 pr-12">
              <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
                <PlugZap className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                {/* Kullanıcı adı başlıkta (07.10.2026) — bilgisayar adı ve firma altta */}
                <DialogTitle className="text-[15px] font-semibold">{c.kullanici}</DialogTitle>
                <DialogDescription className="text-[12px]">{c.makine ?? "Bilgisayar adı yok"} · {c.firmaId} {c.firmaAdi}</DialogDescription>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              <DurumKarti c={c} menu={<CihazMenusu c={c} onIslem={onIslem} />} />

              {/* İki bölüm (07.10.2026): bağlantı zinciri ve cihaz bilgisi ayrı; hücrelerde ikon */}
              <DetayBolumu baslik="Bağlantı">
                <Bilgi ad="VPN bağlantısı" ikon={<Wifi />}><VpnRozeti c={c} /></Bilgi>
                <Bilgi ad="Sunucuya erişim" ikon={<Activity />}>
                  {c.terminalErisim == null ? "—"
                    : !canliMi(c) ? <span className="text-muted-foreground">— (çevrimdışı)</span>
                    : c.terminalErisim ? (
                      <Ipucu icerik={c.terminalMs != null ? `${KALITE_AD[kalite(c.terminalMs)]} · ${c.terminalMs} ms` : "Erişiyor"}><span className="inline-flex items-center py-1">
                        <SinyalIkonu ms={c.terminalMs} />
                      </span></Ipucu>
                    )
                    : <span className="text-amber-700 dark:text-amber-400">Erişemiyor</span>}
                  {c.durum?.dnsYok && <span className="text-amber-700 dark:text-amber-400"> · DNS yok, IP ile</span>}
                </Bilgi>
                <Bilgi
                  ad="VPN profili"
                  ikon={<ShieldCheck />}
                  title={c.durum?.vpnProfil ? [c.durum.vpnProfil.kullaniciAdi ? "kullanıcı adı tanımlı" : "kullanıcı adı yok", c.durum.vpnProfil.sifre === "kayitli" ? "şifre kayıtlı" : "şifre kayıtlı değil"].join(" · ") : undefined}
                >
                  {c.durum?.vpnProfil == null ? "—" : c.durum.vpnProfil.dogru ? "Hazır" : <span className="text-amber-700 dark:text-amber-400">Eksik</span>}
                </Bilgi>
                <Bilgi ad="Sunucu" ikon={<Server />}>{c.rdp ?? "—"}</Bilgi>
                <Bilgi ad="Oturum şifresi" ikon={<KeyRound />}>
                  {c.durum?.sifreKayitli == null ? "—" : c.durum.sifreKayitli ? "Kayıtlı" : <span className="text-amber-700 dark:text-amber-400">Kayıtlı değil</span>}
                </Bilgi>
                <Bilgi ad="Dış IP" ikon={<Globe />}>{c.ip ?? "—"}</Bilgi>
              </DetayBolumu>

              <DetayBolumu baslik="Cihaz">
                <Bilgi ad="Uygulama sürümü" ikon={<PlugZap />}><SurumRozeti surum={c.surum} son={sonSurum} /></Bilgi>
                <Bilgi ad="Windows" ikon={<Laptop />} title={c.durum?.os ?? undefined}>{kisaWindows(c.durum?.os)}</Bilgi>
                <Bilgi ad="FortiClient" ikon={<ShieldCheck />}>{c.durum?.forti ?? "—"}</Bilgi>
                <Bilgi ad="Sayım" ikon={<ScanBarcode />} title={c.durum?.sayim || c.durum?.sayimEski ? sayimAciklama(c) : undefined}><SayimRozeti c={c} /></Bilgi>
                <Bilgi ad="İlk kayıt" ikon={<History />}>{tarihMetni(c.ilkGiris)}</Bilgi>
                <Bilgi ad="Son görülme" ikon={<RefreshCw />} title={c.sonNabiz ? tarihMetni(c.sonNabiz) : undefined}>
                  {c.sonNabiz ? onceMetni(c.sonNabiz) : c.sonGorulme ? onceMetni(c.sonGorulme) : "—"}
                </Bilgi>
              </DetayBolumu>


              {/* Güvenlik solda, ayarlar sağda (boy dengesi); Bağlantı/Cihaz bölümleriyle aynı görünümde (07.10.2026) */}
              <section className="overflow-hidden rounded-[8px] border">
                <div className="border-b bg-[var(--section-bg)] px-3 py-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Güvenlik</div>
                <div className="flex items-start gap-2.5 p-3">
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-[5px] [&_svg]:size-4",
                    c.totpAktif ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                    {c.totpAktif ? <ShieldCheck /> : <ShieldOff />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium">İki adımlı doğrulama</span>
                      <IkiRozeti c={c} />
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[12px]">
                      {c.totpAktif ? "Her bağlanışta telefondaki doğrulama kodu soruluyor." : "Kullanıcı açmamış. Uygulamada Ayarlar > Güvenlik'ten açılır."}
                      {(c.totpHata ?? 0) > 0 && ` Son hatalı deneme sayısı: ${c.totpHata}.`}
                    </p>
                    {(c.totpAktif || kilitli(c)) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {c.totpAktif && <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={() => onIslem(c, "2fa-sifirla")}><ShieldOff className="size-3.5" />2FA sıfırla</Button>}
                        {kilitli(c) && <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={() => onIslem(c, "kilit-kaldir")}><LockOpen className="size-3.5" />Kilidi kaldır</Button>}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* Sağ sütun: olaylar + ayarlar — sol sütunla boy dengelensin, ayarlar altta kaybolmasın (07.10.2026) */}
            <div className="flex min-w-0 flex-col gap-4">
              <CihazOlaylari olaylar={olaylar} />

              <section className="overflow-hidden rounded-[8px] border">
                <div className="border-b bg-[var(--section-bg)] px-3 py-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Yönlendirme ayarları</div>
                {!ay ? (
                  <p className="text-muted-foreground p-3 text-[12px]">Bu sürüm ayarlarını bildirmiyor.</p>
                ) : (
                  /* Üstü çizili rozetler yerine açık/kapalı işaretli liste */
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-3 sm:grid-cols-3">
                    {Object.entries(AYAR_AD).map(([k, ad]) => {
                      const v = (ay as Record<string, boolean | undefined>)[k]
                      if (v === undefined) return null
                      return (
                        <span key={k} className={cn("flex items-center gap-1.5 text-[12px]", v ? "text-foreground" : "text-muted-foreground")}>
                          {v
                            ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            : <CircleMinus className="size-3.5 shrink-0" />}
                          {ad}
                        </span>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
