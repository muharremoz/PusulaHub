import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, CircleAlert, Download, FileText, KeyRound, Loader2, Monitor, PlugZap, RefreshCw,
  Server, ShieldCheck, WifiOff, XCircle,
} from "lucide-react";
import { api, type Durum } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import pusulaLogo from "@/assets/pusula-logo.png";

type P = { durum: Durum; setDurum: (d: Durum) => void };

/** Ana ekran: bağlantının dört parçası (FortiClient, profil, sunucuya erişim, RDP şifresi) + Bağlan. */
export function AnaEkran({ durum, setDurum }: P) {
  const k = durum.kontroller;
  const kayit = durum.kayit!;
  const vpnHazir = k.forti.kurulu && k.profil.dogru;
  const [bekle, setBekle] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [vpnUyari, setVpnUyari] = useState(false);
  const [sifre, setSifre] = useState("");
  const [sifreFormu, setSifreFormu] = useState(false);

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

  const baglan = async () => {
    setVpnUyari(false);
    const tamam = await cagir("/baglan");
    if (!tamam && !k.terminal.erisim) setVpnUyari(true);
  };

  const sifreKaydet = async () => {
    if (await cagir("/rdp/sifre", { sifre }, "sifre")) {
      setSifre("");
      setSifreFormu(false);
    }
  };

  const vk = durum.vpnKurulum;
  const sifreGoster = !k.rdpSifre.kayitli || sifreFormu;

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="flex items-center gap-3 border-b bg-card px-5 py-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <PlugZap className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Pusula Connect · {kayit.firmaId}</div>
          <div className="truncate text-sm font-semibold">
            {kayit.firmaAdi} <span className="font-normal text-muted-foreground">· {kayit.kullanici}</span>
          </div>
        </div>
        {durum.guncelleme.mevcut ? (
          <Button size="sm" variant="outline" disabled={durum.guncelleme.suruyor} onClick={() => void cagir("/guncelle")}>
            {durum.guncelleme.suruyor ? <Loader2 className="animate-spin" /> : <Download />} Güncelle ({durum.guncelleme.surum})
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">v{durum.surum}</span>
        )}
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-5">
        {!durum.servisErisim && (
          <Alert>
            <WifiOff />
            <AlertDescription>Pusula sunucusuna şu an ulaşılamadı; kayıtlı ayarlarla çalışılıyor.</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Kart ikon={<ShieldCheck />} baslik="VPN programı" iyi={k.forti.kurulu} metin={k.forti.kurulu ? `FortiClient ${k.forti.surum ?? ""}` : "Kurulu değil"} />
          <Kart ikon={<ShieldCheck />} baslik="VPN ayarı" iyi={k.profil.dogru} metin={k.profil.dogru ? `"${kayit.profil.tunel}" hazır` : "Eksik"} />
          <Kart
            ikon={<Server />}
            baslik="Pusula sunucusu"
            iyi={k.terminal.erisim}
            uyari={!k.terminal.erisim}
            metin={k.terminal.erisim ? `Erişiliyor · ${k.terminal.ms} ms` : k.terminal.zaman ? "Erişilemiyor — VPN kapalı olabilir" : "Kontrol ediliyor…"}
          />
          <Kart ikon={<KeyRound />} baslik="Oturum şifresi" iyi={k.rdpSifre.kayitli} metin={k.rdpSifre.kayitli ? "Kayıtlı" : "Kayıtlı değil"} />
        </div>

        {(!vpnHazir || vk.suruyor || vk.durum?.hata) && (
          <Bolum baslik="VPN programını kur" ikon={<ShieldCheck />}>
            {vk.suruyor ? (
              <div className="flex flex-col gap-2">
                <div className="text-sm">{vk.durum?.mesaj ?? "Hazırlanıyor… (Windows izin isterse \"Evet\" deyin)"}</div>
                <Progress value={vk.durum?.yuzde ?? 0} />
              </div>
            ) : (
              <>
                {vk.durum?.hata && (
                  <Alert variant="destructive" className="mb-3">
                    <XCircle />
                    <AlertDescription>{vk.durum.hata}</AlertDescription>
                  </Alert>
                )}
                <p className="mb-3 text-sm text-muted-foreground">
                  FortiClient VPN kurulur ve Pusula bağlantısı ayarlanır. Windows yönetici izni isteyecek.
                </p>
                <Button disabled={!!bekle} onClick={() => void cagir("/vpn/kur")}>
                  {bekle === "/vpn/kur" ? <Loader2 className="animate-spin" /> : <ShieldCheck />} {vk.durum?.hata ? "Yeniden dene" : "Kur"}
                </Button>
              </>
            )}
          </Bolum>
        )}

        {sifreGoster && (
          <Bolum baslik={k.rdpSifre.kayitli ? "Oturum şifresini değiştir" : "Oturum şifresini kaydedin"} ikon={<KeyRound />}>
            <p className="mb-3 text-sm text-muted-foreground">
              <span className="font-mono">{kayit.kullanici}</span> kullanıcısının Pusula oturum şifresi. Yalnız bu bilgisayarın Windows
              kimlik kasasında saklanır; her bağlantıda tekrar sorulmaz.
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                value={sifre}
                placeholder="Şifre"
                onChange={(e) => setSifre(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sifre && void sifreKaydet()}
              />
              <Button disabled={!sifre || !!bekle} onClick={() => void sifreKaydet()}>
                {bekle === "sifre" ? <Loader2 className="animate-spin" /> : null} Kaydet
              </Button>
              {k.rdpSifre.kayitli && (
                <Button variant="ghost" onClick={() => setSifreFormu(false)}>Vazgeç</Button>
              )}
            </div>
          </Bolum>
        )}

        {hata && !vpnUyari && (
          <Alert variant="destructive">
            <XCircle />
            <AlertDescription>{hata}</AlertDescription>
          </Alert>
        )}

        {vpnUyari && (
          <Alert>
            <AlertTriangle />
            <AlertDescription className="flex flex-col gap-2">
              <span>
                Pusula sunucusuna ulaşılamıyor; önce VPN'e bağlanın. FortiClient'ta <b>{kayit.profil.tunel}</b> bağlantısını seçip kullanıcı
                adınızı (<span className="font-mono">{kayit.kullanici}</span>) ve şifrenizi girin, <b>Bağlan</b>'a basın. Bağlandıktan sonra
                buradan tekrar deneyin.
              </span>
              <span className="text-xs">İlk bağlantıda kullanıcı adını FortiClient'a siz yazarsınız; "şifreyi kaydet" seçeneği ikinci bağlantıda çıkar.</span>
              {k.forti.kurulu && (
                <Button size="sm" variant="outline" className="self-start" onClick={() => void cagir("/vpn/ac")}>
                  <ShieldCheck /> FortiClient'ı aç
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Button size="lg" className="h-14 text-base" disabled={!!bekle || !k.rdpSifre.kayitli} onClick={() => void baglan()}>
          {bekle === "/baglan" ? <Loader2 className="animate-spin" /> : <Monitor />} Pusula'ya bağlan
        </Button>
        {!k.rdpSifre.kayitli && <p className="-mt-2 text-center text-xs text-muted-foreground">Bağlanmak için önce oturum şifresini kaydedin.</p>}

        <div className="flex flex-wrap items-center justify-center gap-1 text-xs text-muted-foreground">
          <Button variant="ghost" size="sm" disabled={!!bekle} onClick={() => void cagir("/kontrol", {}, "kontrol")}>
            {bekle === "kontrol" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Yeniden kontrol et
          </Button>
          {k.rdpSifre.kayitli && !sifreFormu && (
            <Button variant="ghost" size="sm" onClick={() => setSifreFormu(true)}>
              <KeyRound /> Şifreyi değiştir
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void api("/gunluk/ac", {})}>
            <FileText /> Günlük
          </Button>
        </div>

        <img src={pusulaLogo} alt="Pusula Yazılım" className="mx-auto mt-2 h-6 w-auto select-none opacity-70" draggable={false} />
      </main>
    </div>
  );
}

function Kart({ ikon, baslik, metin, iyi, uyari }: { ikon: React.ReactNode; baslik: string; metin: string; iyi: boolean; uyari?: boolean }) {
  const renk = iyi ? "text-emerald-700 dark:text-emerald-400" : uyari ? "text-amber-700 dark:text-amber-400" : "text-destructive";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
        {ikon}
        {baslik}
      </div>
      <div className={`mt-1 flex items-center gap-1.5 text-sm font-medium ${renk} [&_svg]:size-4`}>
        {iyi ? <CheckCircle2 /> : <CircleAlert />}
        <span className="truncate">{metin}</span>
      </div>
    </div>
  );
}

function Bolum({ baslik, ikon, children }: { baslik: string; ikon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {ikon}
        {baslik}
      </h2>
      {children}
    </section>
  );
}
