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
import { MetinFiltre, SecimFiltre, TarihFiltre, tarihUygun, type TarihFiltreDeger } from "@/components/shared/liste-filtreleri"
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
import { toast } from "sonner"
import {
  Activity, Ban, CheckCircle2, History, KeyRound, Laptop, LockOpen, Megaphone, MonitorPlay, MoreVertical, PlugZap,
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
function ayrintiMetni(o: ConnectOlay) {
  if (!o.ayrinti) return o.kaynak === "yonetici" ? "" : ""
  let j: unknown
  try { j = JSON.parse(o.ayrinti) } catch { return o.ayrinti }
  if (j == null || typeof j !== "object") return String(j)
  const v = j as Record<string, unknown>
  if (o.tur === "oturum_acildi") return [v.sunucu, v.ms != null ? `${v.ms} ms` : null, v.ikiAdim ? "2FA ile" : null].filter(Boolean).join(" · ")
  if (o.tur === "oturum_bitti" || o.tur === "oturum_hatasi")
    return [v.mesaj, v.sureDk != null ? `${v.sureDk} dk sürdü` : null, v.neden != null && v.neden !== -1 ? `kod ${v.neden}` : null].filter(Boolean).join(" · ")
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

  const ozet = useMemo(() => {
    const l = cihazlar ?? []
    const aktif = l.filter((c) => !c.iptal)
    return {
      toplam: aktif.length,
      cevrimici: aktif.filter((c) => canliDurum(c) !== "cevrimdisi").length,
      oturumda: aktif.filter((c) => canliDurum(c) === "oturumda").length,
      ikiAdim: aktif.filter((c) => c.totpAktif).length,
      eski: sonSurum ? aktif.filter((c) => surumKarsilastir(c.surum, sonSurum) < 0).length : 0,
      kilitli: aktif.filter((c) => ikiDurum(c) === "kilitli").length,
    }
  }, [cihazlar, sonSurum])

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

        {/* ── özet ── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi ikon={<Laptop />} ad="Kayıtlı cihaz" deger={ozet.toplam} yukleniyor={!cihazlar} />
          <Kpi ikon={<Wifi />} ad="Çevrimiçi" deger={ozet.cevrimici} ton="sky" yukleniyor={!cihazlar} />
          <Kpi ikon={<MonitorPlay />} ad="Şu an oturumda" deger={ozet.oturumda} ton="emerald" yukleniyor={!cihazlar} />
          <Kpi ikon={<ShieldCheck />} ad="2FA açık" deger={ozet.ikiAdim} yukleniyor={!cihazlar} />
          <Kpi ikon={<RefreshCw />} ad={sonSurum ? `Eski sürüm (son ${sonSurum})` : "Eski sürüm"} deger={ozet.eski} ton={ozet.eski ? "amber" : undefined} yukleniyor={!cihazlar} />
          <Kpi ikon={<ShieldOff />} ad="2FA kilitli" deger={ozet.kilitli} ton={ozet.kilitli ? "red" : undefined} yukleniyor={!cihazlar} />
        </div>

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
            <button
              type="button"
              title="İndirme bağlantısını kopyala"
              className="hover:bg-muted text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-[5px] border transition-colors"
              onClick={() =>
                void navigator.clipboard.writeText(UYGULAMA_INDIR)
                  .then(() => toast.success("İndirme bağlantısı kopyalandı", { description: UYGULAMA_INDIR }))
                  .catch(() => toast.error("Kopyalanamadı"))
              }
            >
              <Link2 className="size-3.5" />
            </button>
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

function Kpi({ ikon, ad, deger, ton, yukleniyor }: { ikon: React.ReactNode; ad: string; deger: number; ton?: "sky" | "emerald" | "amber" | "red"; yukleniyor: boolean }) {
  const renk = ton === "sky" ? "text-sky-600 dark:text-sky-400" : ton === "emerald" ? "text-emerald-600 dark:text-emerald-400"
    : ton === "amber" ? "text-amber-600 dark:text-amber-400" : ton === "red" ? "text-red-600 dark:text-red-400" : "text-foreground"
  return (
    <div className="flex flex-col gap-1 rounded-[8px] bg-card p-3" style={{ boxShadow: "var(--card-shadow)" }}>
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] [&_svg]:size-3.5">{ikon}{ad}</div>
      {yukleniyor ? <Skeleton className="h-8 w-12" /> : <div className={cn("text-2xl font-bold tabular-nums", renk)}>{deger}</div>}
    </div>
  )
}

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
    <span className={cn("text-[12px]", eski && "rounded-[5px] bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400")} title={eski ? `Yayındaki sürüm ${son}` : undefined}>
      {surum ?? "—"}
    </span>
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
function VpnRozeti({ c }: { c: ConnectCihazSatir }) {
  const v = c.durum?.vpn
  if (v == null) return <span className="text-muted-foreground">—</span>
  return v.bagli
    ? <span className="text-emerald-700 dark:text-emerald-400">Açık{v.ip && <span className="text-muted-foreground"> · {v.ip}</span>}</span>
    : <span className="text-amber-700 dark:text-amber-400">Kapalı</span>
}

function SayimRozeti({ c }: { c: ConnectCihazSatir }) {
  const d = sayimDurumu(c)
  if (d === "yok") return <span className="text-muted-foreground">—</span>
  const ton = d === "kurulu" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : d === "kuruluyor" ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
    : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
  const turler = [c.durum?.sayim && tekSayimDurumu(c.durum.sayim) !== "yok" ? "X" : null, c.durum?.sayimEski && tekSayimDurumu(c.durum.sayimEski) !== "yok" ? "Pusula" : null].filter(Boolean)
  return <span className={cn("inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", ton)} title={sayimAciklama(c)}>{SAYIM_ETIKET[d]}{turler.length ? ` · ${turler.join(" + ")}` : ""}</span>
}
function sayimAciklama(c: ConnectCihazSatir): string {
  const parca = [tekSayimAciklama("Pusula X", c.durum?.sayim), tekSayimAciklama("Pusula", c.durum?.sayimEski)].filter((x): x is string => !!x)
  return parca.length ? parca.join("\n") : "Sayım kurulu değil"
}
function tekSayimAciklama(ad: string, s: ConnectSayimDurum | null | undefined): string | null {
  if (!s) return null
  if (s.kuruluyor) return `${ad}: kurulum sürüyor`
  if (!s.kurulu) return s.hata ? `${ad}: kurulum başarısız — ${s.hata}` : null
  const p: string[] = [`${ad} ${s.surum ?? "?"}`]
  if (s.veritabani) p.push(`${s.veritabani}${s.formId ? ` (${FORM_AD[s.formId] ?? s.formId})` : ""}`)
  if (s.guncellemeBekliyor) p.push("SQL bilgisi değişti, kodla yenilenmeyi bekliyor")
  if (s.test) p.push(s.test.ok ? `test başarılı (${s.test.veritabani ?? 0} veritabanı)` : `test başarısız: ${s.test.hata ?? "?"}`)
  else p.push("henüz test edilmedi")
  return p.join(" · ")
}
const IKI_DURUMLAR: IkiDurum[] = ["acik", "kapali", "kilitli"]
const IKI_ETIKET: Record<IkiDurum, string> = { acik: "Açık", kapali: "Kapalı", kilitli: "Kilitli" }

type VpnDurumu = "acik" | "kapali" | "yok"
const VPN_DURUMLAR: VpnDurumu[] = ["acik", "kapali", "yok"]
const VPN_ETIKET: Record<VpnDurumu, string> = { acik: "Açık", kapali: "Kapalı", yok: "Bilinmiyor" }
const vpnDurumu = (c: ConnectCihazSatir): VpnDurumu => (c.durum?.vpn == null ? "yok" : c.durum.vpn.bagli ? "acik" : "kapali")
type SunucuDurumu = "erisiyor" | "erisemiyor" | "yok"
const SUNUCU_DURUMLAR: SunucuDurumu[] = ["erisiyor", "erisemiyor", "yok"]
const SUNUCU_ETIKET: Record<SunucuDurumu, string> = { erisiyor: "Erişiyor", erisemiyor: "Erişemiyor", yok: "Bilinmiyor" }
const sunucuDurumu = (c: ConnectCihazSatir): SunucuDurumu => (c.terminalErisim == null ? "yok" : c.terminalErisim ? "erisiyor" : "erisemiyor")

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

  const filtreli = useMemo(() => (cihazlar ?? []).filter((c) => {
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
  [cihazlar, firma, firmaAdi, kullanici, makine, durum, iki, surum, sayim, vpn, sunucu, sonGorulme])
  useEffect(() => setSayfa(1), [firma, firmaAdi, kullanici, makine, durum, iki, surum, sayim, vpn, sunucu, sonGorulme])
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
  // Firma başlığındaki sayılar sayfanın değil firmanın tamamı için (filtre uygulanmış)
  const firmaSayilari = useMemo(() => {
    const m = new Map<string, { toplam: number; cevrimici: number }>()
    for (const c of filtreli) {
      const v = m.get(c.firmaId) ?? { toplam: 0, cevrimici: 0 }
      v.toplam++
      if (canliDurum(c) !== "cevrimdisi") v.cevrimici++
      m.set(c.firmaId, v)
    }
    return m
  }, [filtreli])
  const SUTUN = 12

  return (
    <ListeKarti baslik="Cihazlar" ikon={<Laptop className="size-3.5" />} toplam={cihazlar?.length ?? 0} filtreli={filtreli.length}>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px] leading-[20px] font-medium">
          <ListeThead>
            <th className="px-3 py-1 text-left font-medium"><MetinFiltre label="Kod" value={firma} onChange={setFirma} /></th>
            <th className="px-3 py-1 text-left font-medium"><MetinFiltre label="Firma" value={firmaAdi} onChange={setFirmaAdi} /></th>
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
              const say = firmaSayilari.get(g.firmaId)
              return (
                <Fragment key={g.firmaId}>
                  {g.satirlar.map((c, i) => (
                    <tr
                      key={c.id}
                      className={cn("cursor-pointer text-[13px] hover:bg-muted/20", i === 0 ? "border-t border-t-border" : "border-t border-t-border/40")}
                      onClick={() => onSec(c.id)}
                    >
                      {/* Firma yalnız grubun ilk satırında — aynı firmanın diğer cihazları altında boş kalır (07.10.2026) */}
                      <td className="px-3 py-1 align-top font-semibold tabular-nums whitespace-nowrap">{i === 0 ? g.firmaId : ""}</td>
                      <td className="max-w-[260px] px-3 py-1 align-top">
                        {i === 0 && (
                          <span className="block truncate" title={g.firmaAdi}>
                            {g.firmaAdi}
                            {say && say.toplam > 1 && <span className="text-muted-foreground text-[12px]"> · {say.toplam}</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1 whitespace-nowrap"><DurumRozeti c={c} /></td>
                      <td className="px-3 py-1 whitespace-nowrap">{c.kullanici}</td>
                      <td className="px-3 py-1 whitespace-nowrap">{c.makine ?? "—"}</td>
                      <td className="px-3 py-1 whitespace-nowrap"><SurumRozeti surum={c.surum} son={sonSurum} /></td>
                      <td className="px-3 py-1 whitespace-nowrap"><IkiRozeti c={c} /></td>
                      <td className="px-3 py-1 whitespace-nowrap text-[12px]"><SayimRozeti c={c} /></td>
                      <td className="px-3 py-1 whitespace-nowrap text-[12px]"><VpnRozeti c={c} /></td>
                      <td className="px-3 py-1 whitespace-nowrap text-[12px]">
                        {c.terminalErisim == null ? <span className="text-muted-foreground">—</span>
                          : c.terminalErisim ? <span className="text-emerald-700 dark:text-emerald-400">Erişiyor{c.terminalMs != null && <span className="text-muted-foreground"> · {c.terminalMs} ms</span>}</span>
                          : <span className="text-amber-700 dark:text-amber-400">Erişemiyor</span>}
                      </td>
                      <td className="text-muted-foreground px-3 py-1 text-[12px] whitespace-nowrap" title={tarihMetni(c.sonGorulme)}>{onceMetni(c.sonGorulme ?? c.ilkGiris)}</td>
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

function OlayRozeti({ tur }: { tur: string }) {
  const o = OLAY[tur] ?? { ad: tur, ton: "notr" as Ton }
  return <span className={cn("inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", TON_SINIF[o.ton])}>{o.ad}</span>
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
                <td className="px-4 py-1.5 text-[12px] whitespace-nowrap tabular-nums" title={tarihMetni(o.zaman)}>{tarihMetni(o.zaman)}</td>
                <td className="px-4 py-1.5"><OlayRozeti tur={o.tur} /></td>
                <td className="px-4 py-1.5 text-[13px] whitespace-nowrap">
                  {o.firmaId ? <><span className="text-muted-foreground text-[12px]">{o.firmaId}</span> {firmaAdi.get(o.firmaId) ?? ""}</> : "—"}
                </td>
                <td className="px-4 py-1.5 text-[13px] whitespace-nowrap">{o.kullanici ?? "—"}</td>
                <td className="px-4 py-1.5 text-[13px] whitespace-nowrap">
                  {o.cihazId ? <button type="button" className="underline-offset-2 hover:underline" onClick={() => onCihaz(o.cihazId!)}>{o.makine ?? "—"}</button> : (o.makine ?? "—")}
                </td>
                <td className="text-muted-foreground max-w-[420px] truncate px-4 py-1.5 text-[12px]" title={ayrintiMetni(o)}>{ayrintiMetni(o) || "—"}</td>
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

function Bilgi({ ad, children }: { ad: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-muted-foreground text-[11px]">{ad}</span>
      <span className="truncate text-[13px] font-medium">{children}</span>
    </div>
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
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[960px]">
        {c && (
          <>
            <div className="flex items-center gap-3 border-b bg-[var(--section-bg)] p-4 pr-12">
              <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
                <PlugZap className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-[15px] font-semibold">{c.makine ?? "Cihaz"}</DialogTitle>
                <DialogDescription className="text-[12px]">{c.kullanici} · {c.firmaId} {c.firmaAdi}</DialogDescription>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <DurumRozeti c={c} />
                {c.oturumAcik && c.oturumBaslangic && <span className="text-muted-foreground text-[12px]">{onceMetni(c.oturumBaslangic).replace(" önce", "")}dır oturumda</span>}
                <span className="ml-auto"><CihazMenusu c={c} onIslem={onIslem} /></span>
              </div>

              <section className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[8px] border p-3">
                <Bilgi ad="Uygulama sürümü"><SurumRozeti surum={c.surum} son={sonSurum} /></Bilgi>
                <Bilgi ad="Windows">{c.durum?.os ?? "—"}</Bilgi>
                <Bilgi ad="FortiClient">{c.durum?.forti ?? "—"}</Bilgi>
                <Bilgi ad="VPN profili">
                  {c.durum?.vpnProfil == null ? "—" : c.durum.vpnProfil.dogru ? (c.durum.vpnProfil.kullaniciAdi ? "Hazır · kullanıcı adı tanımlı" : "Hazır · kullanıcı adı yok") : "Eksik"}
                  {c.durum?.vpnProfil?.sifre && (
                    <span className={c.durum.vpnProfil.sifre === "kayitli" ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400"}>
                      {" · "}{c.durum.vpnProfil.sifre === "kayitli" ? "şifre kayıtlı" : c.durum.vpnProfil.sifre === "isaretsiz" ? "şifre kaydedilmemiş" : "şifre kutusu henüz çıkmadı"}
                    </span>
                  )}
                </Bilgi>
                <Bilgi ad="VPN bağlantısı"><VpnRozeti c={c} /></Bilgi>
                <Bilgi ad="Sunucu">{c.rdp ?? "—"}</Bilgi>
                <Bilgi ad="Sunucuya erişim">
                  {c.terminalErisim == null ? "—" : c.terminalErisim ? `Erişiyor${c.terminalMs != null ? ` · ${c.terminalMs} ms` : ""}` : "Erişemiyor"}
                  {c.durum?.dnsYok && <span className="text-amber-700 dark:text-amber-400"> · DNS çözülemedi, IP ile</span>}
                </Bilgi>
                <Bilgi ad="Oturum şifresi">{c.durum?.sifreKayitli == null ? "—" : c.durum.sifreKayitli ? "Kayıtlı" : "Kayıtlı değil"}</Bilgi>
                <Bilgi ad="Sayım (Pusula X)">
                  <SayimRozeti c={c} />
                  {(c.durum?.sayim || c.durum?.sayimEski) && <span className="text-muted-foreground block text-[12px] whitespace-pre-line">{sayimAciklama(c)}</span>}
                </Bilgi>
                <Bilgi ad="Dış IP"><span>{c.ip ?? "—"}</span></Bilgi>
                <Bilgi ad="İlk kayıt">{tarihMetni(c.ilkGiris)}</Bilgi>
                <Bilgi ad="Son nabız">{c.sonNabiz ? `${onceMetni(c.sonNabiz)} (${tarihMetni(c.sonNabiz)})` : "Henüz yok (eski sürüm)"}</Bilgi>
              </section>

              <section className="rounded-[8px] border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-semibold">İki adımlı doğrulama</span>
                  <IkiRozeti c={c} />
                </div>
                <p className="text-muted-foreground text-[12px]">
                  {c.totpAktif ? "Her bağlanışta telefondaki doğrulama kodu soruluyor." : "Kullanıcı açmamış. Uygulamada Ayarlar > Güvenlik'ten açılır."}
                  {(c.totpHata ?? 0) > 0 && ` Son hatalı deneme sayısı: ${c.totpHata}.`}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.totpAktif && <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={() => onIslem(c, "2fa-sifirla")}><ShieldOff className="size-3.5" />2FA sıfırla</Button>}
                  {kilitli(c) && <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={() => onIslem(c, "kilit-kaldir")}><LockOpen className="size-3.5" />Kilidi kaldır</Button>}
                </div>
              </section>

              <section className="rounded-[8px] border p-3">
                <div className="mb-2 text-[12px] font-semibold">Uygulama ayarları</div>
                {!ay ? (
                  <p className="text-muted-foreground text-[12px]">Bu sürüm ayarlarını bildirmiyor.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(AYAR_AD).map(([k, ad]) => {
                      const v = (ay as Record<string, boolean | undefined>)[k]
                      if (v === undefined) return null
                      return (
                        <span key={k} className={cn("inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium", v ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground line-through")}>
                          {ad}
                        </span>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>

              <section className="flex min-h-0 min-w-0 flex-col self-start rounded-[8px] border">
                <div className="border-b px-3 py-2 text-[12px] font-semibold">Son olaylar</div>
                {olaylar.length === 0 ? (
                  <p className="text-muted-foreground px-3 py-4 text-center text-[12px]">Son 500 olay içinde bu cihaza ait kayıt yok.</p>
                ) : (
                  <ul className="divide-y">
                    {olaylar.slice(0, 50).map((o) => (
                      <li key={o.id} className="flex items-start gap-2 px-3 py-1.5">
                        <span className="text-muted-foreground w-[92px] shrink-0 pt-0.5 text-[11px] tabular-nums">{tarihMetni(o.zaman)}</span>
                        <OlayRozeti tur={o.tur} />
                        <span className="text-muted-foreground min-w-0 flex-1 truncate pt-0.5 text-[12px]" title={ayrintiMetni(o)}>{ayrintiMetni(o)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
