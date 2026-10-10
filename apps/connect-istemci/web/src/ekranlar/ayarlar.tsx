import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Cable, CheckCircle2, Clipboard, Download, FileText, HardDrive, KeyRound, Loader2, LockKeyhole, LogOut, Maximize2, Monitor, Power, Printer,
  RefreshCw, ScanBarcode, ShieldCheck, Usb, Video, Volume2,
} from "lucide-react";
import { api, type Durum } from "@/api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { YazdirmaBolumu } from "./yazdirma";
import { SayimBolumu } from "./sayim";

type AyarAdi =
  | "tamEkran" | "yazici" | "pano" | "ses" | "windowsIleBaslat"
  | "portlar" | "kamera" | "aygitlar" | "suruculer" | "ikiAcilis" | "ikiBaglanti" | "sifreAcilis" | "sifreBaglanti";

type Sekme = "baglanti" | "yazdirma" | "sayim" | "guvenlik" | "uygulama";
const SEKME_DEPO = "connect-ayar-sekme";
const SEKMELER: Sekme[] = ["baglanti", "yazdirma", "sayim", "guvenlik", "uygulama"];

/**
 * Uygulama ayarları — orta panelde, dört sekmede. Değişiklik anında kaydedilir (Kaydet düğmesi yok).
 * Bağlantı ayarları bir sonraki "Pusula'ya bağlan"da geçerli olur. Son açık sekme bu bilgisayarda hatırlanır.
 */
export function AyarlarIcerik({
  durum, setDurum, ikiAktif, onIkiAc, onIkiKapat, uygSifreAktif, onUygAc, onUygDegistir, onUygKapat,
}: {
  durum: Durum;
  setDurum: (d: Durum) => void;
  ikiAktif: boolean;
  onIkiAc: () => void;
  onIkiKapat: () => void;
  /** Uygulama şifresi (0.7.0) */
  uygSifreAktif: boolean;
  onUygAc: () => void;
  onUygDegistir: () => void;
  onUygKapat: () => void;
}) {
  const ay = durum.ayarlar;
  const [bekle, setBekle] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [onay, setOnay] = useState<null | "sifre" | "cihaz">(null);
  const [denetlendi, setDenetlendi] = useState(false);
  const [sekme, setSekme] = useState<Sekme>(() => {
    try {
      const s = localStorage.getItem(SEKME_DEPO) as Sekme | null;
      return s && SEKMELER.includes(s) ? s : "baglanti";
    } catch {
      return "baglanti";
    }
  });
  const sekmeDegistir = (s: string) => {
    setSekme(s as Sekme);
    try {
      localStorage.setItem(SEKME_DEPO, s);
    } catch {
      /* depolama kapalı */
    }
  };

  const cagir = async (yol: string, govde: unknown = {}, ad = yol) => {
    setBekle(ad);
    setHata(null);
    try {
      setDurum(await api<Durum>(yol, govde));
      return true;
    } catch (e) {
      setHata((e as Error).message);
      return false;
    } finally {
      setBekle(null);
    }
  };

  // Anahtar tıklanınca hemen döner (kayıt arkada); kilitlenmez — "engel" imleci çıkmasın.
  // Kayıt başarısız olursa sunucudaki değere geri döner.
  const [yerel, setYerel] = useState<Partial<Record<AyarAdi, boolean>>>({});
  // Birden çok ayar tek istekte (iki adımlı doğrulama seçenekleri birlikte değişebilir).
  const degistirCok = async (degerler: Partial<Record<AyarAdi, boolean>>) => {
    setYerel((y) => ({ ...y, ...degerler }));
    setHata(null);
    try {
      setDurum(await api<Durum>("/ayarlar", degerler));
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setYerel((y) => {
        const kalan = { ...y };
        for (const k of Object.keys(degerler)) delete kalan[k as AyarAdi];
        return kalan;
      });
    }
  };
  const degistir = (ad: AyarAdi, deger: boolean) => degistirCok({ [ad]: deger });

  // İki adımlı doğrulama / uygulama şifresi seçenekleri: çiftin en az biri açık kalır — biri kapatılınca diğeri
  // kapalıysa kendiliğinden açılır. "...Baglanti" varsayılan açık, "...Acilis" varsayılan kapalı.
  type Cift = "ikiAcilis" | "ikiBaglanti" | "sifreAcilis" | "sifreBaglanti";
  const ciftDeger = (ad: Cift) => yerel[ad] ?? (ad.endsWith("Baglanti") ? ay?.[ad] ?? true : !!ay?.[ad]);
  const ciftAnahtar = (ad: Cift, digerAd: Cift) => (
    <Switch
      checked={ciftDeger(ad)}
      disabled={!ay}
      onCheckedChange={(v) => void degistirCok(!v && !ciftDeger(digerAd) ? { [ad]: false, [digerAd]: true } : { [ad]: v })}
    />
  );
  const ikiAnahtar = (ad: "ikiAcilis" | "ikiBaglanti") => ciftAnahtar(ad, ad === "ikiAcilis" ? "ikiBaglanti" : "ikiAcilis");
  const sifreAnahtar = (ad: "sifreAcilis" | "sifreBaglanti") => ciftAnahtar(ad, ad === "sifreAcilis" ? "sifreBaglanti" : "sifreAcilis");

  const anahtar = (ad: AyarAdi) => (
    <Switch checked={yerel[ad] ?? !!ay?.[ad]} disabled={!ay} onCheckedChange={(v) => void degistir(ad, v)} />
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      {hata && (
        <Alert variant="destructive">
          <AlertDescription>{hata}</AlertDescription>
        </Alert>
      )}

      <Tabs value={sekme} onValueChange={sekmeDegistir} className="gap-4">
        <KayanSekmeler sekme={sekme}>
          <TabsTrigger value="baglanti" className={SEKME_TETIK}><Monitor /> Bağlantı</TabsTrigger>
          <TabsTrigger value="yazdirma" className={SEKME_TETIK}><Printer /> Yazdırma</TabsTrigger>
          <TabsTrigger value="sayim" className={SEKME_TETIK}><ScanBarcode /> Sayım</TabsTrigger>
          <TabsTrigger value="guvenlik" className={SEKME_TETIK}><ShieldCheck /> Güvenlik</TabsTrigger>
          <TabsTrigger value="uygulama" className={SEKME_TETIK}><Power /> Uygulama</TabsTrigger>
        </KayanSekmeler>

        <TabsContent value="baglanti" className={SEKME_ICERIK}>
          <Bolum baslik="Oturum" aciklama="Bir sonraki bağlanışta geçerli olur.">
            <Satir ikon={<Maximize2 />} ad="Tam ekran başlat" aciklama="Oturum açılınca doğrudan tam ekrana geçilir." kontrol={anahtar("tamEkran")} />
          </Bolum>
          <Bolum baslik="Yerel aygıtlar" aciklama="Bir sonraki bağlanışta geçerli olur.">
            <Satir ikon={<Printer />} ad="Yazıcılar" aciklama="Bu bilgisayarın yazıcıları oturumda kullanılabilir." kontrol={anahtar("yazici")} />
            <Satir ikon={<Clipboard />} ad="Pano (kopyala-yapıştır)" aciklama="Bu bilgisayarla oturum arasında kopyalayıp yapıştırın." kontrol={anahtar("pano")} />
            <Satir ikon={<Volume2 />} ad="Ses" aciklama="Oturumdaki sesler bu bilgisayarda çalınır." kontrol={anahtar("ses")} />
            <Satir ikon={<Cable />} ad="Bağlantı noktaları" aciklama="Seri (COM) ve paralel (LPT) bağlantı noktaları." kontrol={anahtar("portlar")} />
            <Satir ikon={<Video />} ad="Video yakalama cihazları" aciklama="Kamera." kontrol={anahtar("kamera")} />
            <Satir ikon={<Usb />} ad="Tak ve Kullan aygıtları" aciklama="Desteklenen diğer aygıtlar; sonradan takılanlar dahil." kontrol={anahtar("aygitlar")} />
            <Satir
              ikon={<HardDrive />}
              ad="Sürücüler"
              aciklama="Bu bilgisayarın diskleri oturumda görünür. Gerekmedikçe kapalı tutun: bağlantıyı yavaşlatabilir."
              kontrol={anahtar("suruculer")}
            />
          </Bolum>
        </TabsContent>

        <TabsContent value="yazdirma" className={SEKME_ICERIK}>
          <YazdirmaBolumu durum={durum} setDurum={setDurum} />
        </TabsContent>

        <TabsContent value="sayim" className={SEKME_ICERIK}>
          <SayimBolumu durum={durum} setDurum={setDurum} />
        </TabsContent>

        <TabsContent value="guvenlik" className={SEKME_ICERIK}>
          <Bolum baslik="Uygulama şifresi">
            <Satir
              ikon={<KeyRound />}
              ad="Uygulama şifresi"
              aciklama={uygSifreAktif ? "Açık — Pusula Connect'e özel, sizin belirlediğiniz şifre sorulur." : "Pusula Connect'e özel bir şifre belirleyin; açılışta ya da bağlanırken sorulsun."}
              kontrol={
                uygSifreAktif ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={onUygDegistir}>Değiştir</Button>
                    <Button size="sm" variant="outline" onClick={onUygKapat}>Kapat</Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={onUygAc}>Aç</Button>
                )
              }
            />
            {uygSifreAktif && (
              <>
                <Satir
                  ikon={<LockKeyhole />}
                  ad="Uygulama açılışında şifre sor"
                  aciklama="Pusula Connect her açıldığında önce uygulama şifresi istenir."
                  kontrol={sifreAnahtar("sifreAcilis")}
                />
                <Satir
                  ikon={<Monitor />}
                  ad="Pusula bağlantısında şifre sor"
                  aciklama={
                    ciftDeger("sifreBaglanti")
                      ? "Her \"Pusula'ya bağlan\"da uygulama şifresi istenir."
                      : "Açılışta şifre girildiyse bağlanırken tekrar sorulmaz."
                  }
                  kontrol={sifreAnahtar("sifreBaglanti")}
                />
              </>
            )}
          </Bolum>
          <Bolum baslik="İki adımlı doğrulama">
            <Satir
              ikon={<ShieldCheck />}
              ad="İki adımlı doğrulama"
              aciklama={ikiAktif ? "Açık — telefonunuzdaki doğrulama uygulamasının kodu sorulur." : "Bağlanırken telefonunuzdaki doğrulama uygulamasından kod da sorulsun."}
              kontrol={
                ikiAktif ? (
                  <Button size="sm" variant="outline" onClick={onIkiKapat}>Kapat</Button>
                ) : (
                  <Button size="sm" onClick={onIkiAc}>Aç</Button>
                )
              }
            />
            {ikiAktif && (
              <>
                <Satir
                  ikon={<LockKeyhole />}
                  ad="Uygulama açılışında kod sor"
                  aciklama="Pusula Connect her açıldığında önce doğrulama kodu istenir."
                  kontrol={ikiAnahtar("ikiAcilis")}
                />
                <Satir
                  ikon={<Monitor />}
                  ad="Pusula bağlantısında kod sor"
                  aciklama={
                    (yerel.ikiBaglanti ?? ay?.ikiBaglanti ?? true)
                      ? "Her \"Pusula'ya bağlan\"da doğrulama kodu istenir."
                      : "Açılışta kod girildiyse bağlanırken tekrar sorulmaz."
                  }
                  kontrol={ikiAnahtar("ikiBaglanti")}
                />
              </>
            )}
          </Bolum>
          <Bolum baslik="Bu cihaz">
            <Satir
              ikon={<KeyRound />}
              ad="Kayıtlı oturum şifresi"
              aciklama={durum.kontroller.rdpSifre.kayitli ? "Bu bilgisayardan silinir; bir sonraki bağlanışta yeniden girersiniz." : "Kayıtlı şifre yok."}
              kontrol={
                <Button size="sm" variant="outline" disabled={!durum.kontroller.rdpSifre.kayitli || !!bekle} onClick={() => setOnay("sifre")}>
                  Sil
                </Button>
              }
            />
            <Satir
              ikon={<LogOut />}
              ad="Bu cihazın kaydını kaldır"
              aciklama="Uygulama bu bilgisayarda yeni bir kurulum kodu ister."
              kontrol={
                <Button size="sm" variant="outline" className="text-red-600 hover:text-red-600 dark:text-red-400" disabled={!!bekle} onClick={() => setOnay("cihaz")}>
                  Kaldır
                </Button>
              }
            />
          </Bolum>
        </TabsContent>

        <TabsContent value="uygulama" className={SEKME_ICERIK}>
          <Bolum baslik="Başlangıç">
            <Satir ikon={<Power />} ad="Windows açılınca başlat" aciklama="Bilgisayar açılınca Pusula Connect de açılır." kontrol={anahtar("windowsIleBaslat")} />
          </Bolum>
          <Bolum baslik="Hakkında">
            <Satir
              ikon={durum.guncelleme.mevcut ? <Download /> : <CheckCircle2 />}
              ad={`Pusula Connect ${durum.surum}`}
              aciklama={durum.guncelleme.mevcut ? `Yeni sürüm var: ${durum.guncelleme.surum}` : denetlendi ? "Güncel sürümü kullanıyorsunuz." : "Güncellemeler açılışta ve açıkken denetlenir."}
              kontrol={
                durum.guncelleme.mevcut ? (
                  <Button size="sm" disabled={durum.guncelleme.suruyor} onClick={() => void cagir("/guncelle")}>
                    {durum.guncelleme.suruyor ? <Loader2 className="animate-spin" /> : <Download />} Güncelle
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bekle === "denetle"}
                    onClick={async () => { if (await cagir("/guncelleme/denetle", {}, "denetle")) setDenetlendi(true); }}
                  >
                    {bekle === "denetle" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Denetle
                  </Button>
                )
              }
            />
            <Satir
              ikon={<RefreshCw />}
              ad="Bağlantıyı yeniden kontrol et"
              aciklama="VPN, sunucu ve şifre durumu yeniden denetlenir."
              kontrol={
                <Button size="sm" variant="outline" disabled={bekle === "kontrol"} onClick={() => void cagir("/kontrol", {}, "kontrol")}>
                  {bekle === "kontrol" ? <Loader2 className="animate-spin" /> : null} Kontrol et
                </Button>
              }
            />
            <Satir
              ikon={<FileText />}
              ad="Günlük"
              aciklama="Destek için uygulama kayıtları (Not Defteri'nde açılır)."
              kontrol={<Button size="sm" variant="outline" onClick={() => void api("/gunluk/ac", {})}>Aç</Button>}
            />
          </Bolum>
        </TabsContent>
      </Tabs>

      <AlertDialog open={onay !== null} onOpenChange={(o) => !o && setOnay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{onay === "cihaz" ? "Bu cihazın kaydı kaldırılsın mı?" : "Kayıtlı şifre silinsin mi?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {onay === "cihaz"
                ? "Pusula Connect bu bilgisayarda yeniden kurulum kodu ister. Kayıtlı şifre de silinir. Yeni kodu Pusula'dan alabilirsiniz."
                : "Bir sonraki bağlanışta oturum şifrenizi yeniden girmeniz gerekir."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void (onay === "cihaz" ? cagir("/kayit/sil") : cagir("/rdp/sifre/sil"))}
            >
              {onay === "cihaz" ? "Kaydı kaldır" : "Şifreyi sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Sekme tetiği: etkin arka planı kayan göstergeden gelir (kendi arka planı saydam). */
const SEKME_TETIK =
  "relative z-10 flex-1 transition-colors duration-200 data-active:bg-transparent data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-transparent";
/** Sekme içeriği: açılışta yumuşak giriş (Radix etkin olmayan içeriği kaldırır; her geçişte yeniden oynar). */
const SEKME_ICERIK = "flex flex-col gap-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out";

/**
 * TabsList + etkin sekmenin altında kayan arka plan. Konum etkin tetiğin DOM ölçüsünden alınır
 * (pencere boyutu değişince de yeniden ölçülür); ilk ölçümde geçiş yapılmaz, yerinde başlar.
 */
function KayanSekmeler({ sekme, children }: { sekme: string; children: React.ReactNode }) {
  const liste = useRef<HTMLDivElement>(null);
  const [kutu, setKutu] = useState<{ left: number; width: number } | null>(null);
  const ilk = useRef(true);
  useLayoutEffect(() => {
    const olc = () => {
      const el = liste.current?.querySelector<HTMLElement>('[data-slot="tabs-trigger"][data-state="active"]');
      if (el) setKutu({ left: el.offsetLeft, width: el.offsetWidth });
    };
    olc();
    window.addEventListener("resize", olc);
    return () => window.removeEventListener("resize", olc);
  }, [sekme]);
  useEffect(() => {
    if (kutu) ilk.current = false;
  }, [kutu]);
  return (
    <TabsList ref={liste} className="relative w-full">
      {kutu && (
        <span
          aria-hidden
          className={
            "absolute top-[3px] bottom-[3px] rounded-md bg-background shadow-sm dark:border dark:border-input dark:bg-input/30 " +
            (ilk.current ? "" : "transition-[left,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]")
          }
          style={{ left: kutu.left, width: kutu.width }}
        />
      )}
      {children}
    </TabsList>
  );
}

/** Ayar bölümü: başlık + satırlar. Sekmeler arasında gezinme Tabs ile; bölümler hep açık. */
export function Bolum({ baslik, aciklama, children }: { baslik: string; aciklama?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold">{baslik}</h2>
        {aciklama && <span className="text-xs text-muted-foreground">{aciklama}</span>}
      </div>
      <div className="divide-y rounded-xl border bg-card shadow-xs">{children}</div>
    </section>
  );
}

function Satir({ ikon, ad, aciklama, kontrol }: { ikon: React.ReactNode; ad: string; aciklama: string; kontrol: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">{ikon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{ad}</div>
        <div className="text-xs text-muted-foreground">{aciklama}</div>
      </div>
      <div className="shrink-0">{kontrol}</div>
    </div>
  );
}
