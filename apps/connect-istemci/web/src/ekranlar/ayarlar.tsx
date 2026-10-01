import { useState } from "react";
import {
  Cable, CheckCircle2, Clipboard, CreditCard, Download, FileText, HardDrive, KeyRound, Loader2, LogOut, MapPin, Maximize2, Power, Printer,
  RefreshCw, ShieldCheck, Usb, Video, Volume2, Zap,
} from "lucide-react";
import { api, type Durum } from "@/api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type AyarAdi =
  | "tamEkran" | "yazici" | "pano" | "ses" | "windowsIleBaslat" | "otomatikBaglan"
  | "akilliKart" | "portlar" | "konum" | "kamera" | "aygitlar" | "suruculer";

/**
 * Uygulama ayarları — orta panelde açılır. Değişiklik anında kaydedilir (Kaydet düğmesi yok).
 * Bağlantı ayarları bir sonraki "Pusula'ya bağlan"da geçerli olur.
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
  const degistir = async (ad: AyarAdi, deger: boolean) => {
    setYerel((y) => ({ ...y, [ad]: deger }));
    setHata(null);
    try {
      setDurum(await api<Durum>("/ayarlar", { [ad]: deger }));
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setYerel((y) => {
        const { [ad]: _, ...kalan } = y;
        return kalan;
      });
    }
  };

  const anahtar = (ad: AyarAdi) => (
    <Switch checked={yerel[ad] ?? !!ay?.[ad]} disabled={!ay} onCheckedChange={(v) => void degistir(ad, v)} />
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      {hata && (
        <Alert variant="destructive">
          <AlertDescription>{hata}</AlertDescription>
        </Alert>
      )}

      <Bolum baslik="Bağlantı" aciklama="Bir sonraki bağlanışta geçerli olur.">
        <Satir ikon={<Maximize2 />} ad="Tam ekran başlat" aciklama="Oturum açılınca doğrudan tam ekrana geçilir." kontrol={anahtar("tamEkran")} />
      </Bolum>

      <Bolum baslik="Yerel aygıtlar" aciklama="Bir sonraki bağlanışta geçerli olur.">
        <Satir ikon={<Printer />} ad="Yazıcılar" aciklama="Bu bilgisayarın yazıcıları oturumda kullanılabilir." kontrol={anahtar("yazici")} />
        <Satir ikon={<Clipboard />} ad="Pano (kopyala-yapıştır)" aciklama="Bu bilgisayarla oturum arasında kopyalayıp yapıştırın." kontrol={anahtar("pano")} />
        <Satir ikon={<Volume2 />} ad="Ses" aciklama="Oturumdaki sesler bu bilgisayarda çalınır." kontrol={anahtar("ses")} />
        <Satir ikon={<CreditCard />} ad="Akıllı kartlar" aciklama="E-imza, kart okuyucu." kontrol={anahtar("akilliKart")} />
        <Satir ikon={<Cable />} ad="Bağlantı noktaları" aciklama="Seri (COM) ve paralel (LPT) bağlantı noktaları." kontrol={anahtar("portlar")} />
        <Satir ikon={<MapPin />} ad="Konum" aciklama="Bu bilgisayarın konumu oturuma iletilir (Windows konum izni gerekir)." kontrol={anahtar("konum")} />
        <Satir ikon={<Video />} ad="Video yakalama cihazları" aciklama="Kamera." kontrol={anahtar("kamera")} />
        <Satir ikon={<Usb />} ad="Tak ve Kullan aygıtları" aciklama="Desteklenen diğer aygıtlar; sonradan takılanlar dahil." kontrol={anahtar("aygitlar")} />
        <Satir
          ikon={<HardDrive />}
          ad="Sürücüler"
          aciklama="Bu bilgisayarın diskleri oturumda görünür. Gerekmedikçe kapalı tutun: bağlantıyı yavaşlatabilir."
          kontrol={anahtar("suruculer")}
        />
      </Bolum>

      <Bolum baslik="Başlangıç">
        <Satir ikon={<Power />} ad="Windows açılınca başlat" aciklama="Bilgisayar açılınca Pusula Connect de açılır." kontrol={anahtar("windowsIleBaslat")} />
        <Satir
          ikon={<Zap />}
          ad="Açılınca otomatik bağlan"
          aciklama={ikiAktif ? "Sunucuya erişilince doğrulama kodu sorulur, sonra bağlanılır." : "Sunucuya erişilince Pusula'ya kendiliğinden bağlanılır."}
          kontrol={anahtar("otomatikBaglan")}
        />
      </Bolum>

      <Bolum baslik="Güvenlik ve cihaz">
        <Satir
          ikon={<ShieldCheck />}
          ad="İki adımlı doğrulama"
          aciklama={ikiAktif ? "Açık — her bağlanışta telefonunuzdaki kod sorulur." : "Bağlanırken telefonunuzdaki doğrulama uygulamasından kod da sorulsun."}
          kontrol={
            ikiAktif ? (
              <Button size="sm" variant="outline" onClick={onIkiKapat}>Kapat</Button>
            ) : (
              <Button size="sm" onClick={onIkiAc}>Aç</Button>
            )
          }
        />
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

      <Bolum baslik="Hakkında">
        <Satir
          ikon={durum.guncelleme.mevcut ? <Download /> : <CheckCircle2 />}
          ad={`Pusula Connect ${durum.surum}`}
          aciklama={durum.guncelleme.mevcut ? `Yeni sürüm var: ${durum.guncelleme.surum}` : denetlendi ? "Güncel sürümü kullanıyorsunuz." : "Güncellemeler açılışta denetlenir."}
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

function Bolum({ baslik, aciklama, children }: { baslik: string; aciklama?: string; children: React.ReactNode }) {
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
