import { useState } from "react";
import {
  Cable, CheckCircle2, Clipboard, Download, FileText, HardDrive, KeyRound, Loader2, LockKeyhole, LogOut, Maximize2, Monitor, Power, Printer,
  RefreshCw, ShieldCheck, Usb, Video, Volume2,
} from "lucide-react";
import { api, type Durum } from "@/api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ESKI_PROGRAMLAR, YaziciAjaniBolumu } from "./yazici-ajani";

type AyarAdi =
  | "tamEkran" | "yazici" | "pano" | "ses" | "windowsIleBaslat"
  | "portlar" | "kamera" | "aygitlar" | "suruculer" | "ikiAcilis" | "ikiBaglanti";

type Sekme = "baglanti" | "yazdirma" | "guvenlik" | "uygulama";
const SEKME_DEPO = "connect-ayar-sekme";
const SEKMELER: Sekme[] = ["baglanti", "yazdirma", "guvenlik", "uygulama"];

/**
 * Uygulama ayarları — orta panelde, dört sekmede. Değişiklik anında kaydedilir (Kaydet düğmesi yok).
 * Bağlantı ayarları bir sonraki "Pusula'ya bağlan"da geçerli olur. Son açık sekme bu bilgisayarda hatırlanır.
 */
export function AyarlarIcerik({
  durum, setDurum, ikiAktif, onIkiAc, onIkiKapat,
}: {
  durum: Durum;
  setDurum: (d: Durum) => void;
  ikiAktif: boolean;
  onIkiAc: () => void;
  onIkiKapat: () => void;
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

  // İki adımlı doğrulama seçenekleri: en az biri açık kalır — biri kapatılınca diğeri kapalıysa kendiliğinden açılır.
  const ikiDeger = (ad: "ikiAcilis" | "ikiBaglanti") => yerel[ad] ?? (ad === "ikiBaglanti" ? ay?.ikiBaglanti ?? true : !!ay?.ikiAcilis);
  const ikiAnahtar = (ad: "ikiAcilis" | "ikiBaglanti") => {
    const digerAd = ad === "ikiAcilis" ? "ikiBaglanti" : "ikiAcilis";
    return (
      <Switch
        checked={ikiDeger(ad)}
        disabled={!ay}
        onCheckedChange={(v) => void degistirCok(!v && !ikiDeger(digerAd) ? { [ad]: false, [digerAd]: true } : { [ad]: v })}
      />
    );
  };

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
        <TabsList className="w-full">
          <TabsTrigger value="baglanti" className="flex-1"><Monitor /> Bağlantı</TabsTrigger>
          <TabsTrigger value="yazdirma" className="flex-1"><Printer /> Yazdırma</TabsTrigger>
          <TabsTrigger value="guvenlik" className="flex-1"><ShieldCheck /> Güvenlik</TabsTrigger>
          <TabsTrigger value="uygulama" className="flex-1"><Power /> Uygulama</TabsTrigger>
        </TabsList>

        <TabsContent value="baglanti" className="flex flex-col gap-4">
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

        <TabsContent value="yazdirma" className="flex flex-col gap-4">
          <YaziciAjaniBolumu />
          <YaziciAjaniBolumu tur={ESKI_PROGRAMLAR} />
        </TabsContent>

        <TabsContent value="guvenlik" className="flex flex-col gap-4">
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

        <TabsContent value="uygulama" className="flex flex-col gap-4">
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
