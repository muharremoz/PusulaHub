import { useState } from "react";
import {
  AlertTriangle, ArrowLeft, Printer, Check, CheckCircle2, CircleAlert, Copy, Download, ExternalLink, Eye, EyeOff, KeyRound, Loader2, Monitor,
  Hash, Laptop, LifeBuoy, Megaphone, Network, Rocket, Server, Settings, ShieldCheck, UserRound, WifiOff, XCircle,
} from "lucide-react";
import { api, type Durum } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { Ripple } from "@/components/ui/ripple";
import { vpnIpSabitMi } from "@/lib/utils";
import { FlickeringGrid } from "@/components/ui/flickering-grid";
import { YedekYanKarti } from "./yedekler";
import { SayimYanKarti } from "./sayim-karti";
import { AyarlarIcerik } from "./ayarlar";
import { DuyuruSeritleri, DuyurularIcerik, okunmamislar } from "./duyurular";
import { GuncellemePenceresi } from "./guncelleme";
import { IkiAcPenceresi, KodPenceresi } from "./iki-adim";
import uygulamaIkonu from "@/assets/uygulama-ikon.png";
import { OrtaBaslik, ParlayanLogo, talepAdresi } from "./ortak";

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
  // Orta panel: bağlantı (ana), yardım talebi (iframe; exe CSP'si yalnız bu adrese frame-src izni verir), ayarlar, duyurular
  const [orta, setOrta] = useState<"ana" | "talep" | "ayarlar" | "duyurular">("ana");
  const okunmamis = okunmamislar(durum).length;
  // İki adımlı doğrulama: açma penceresi + kod sorma (bağlan / kapat / şifre kaydet)
  const ikiAktif = !!durum.ikiAdim?.aktif;
  const [ikiAc, setIkiAc] = useState(false);
  const [kodIstek, setKodIstek] = useState<null | "baglan" | "kapat" | "sifre" | "goster">(null);
  // VPN şifresi = oturum şifresi; FortiClient'a otomatik yazılamadığı için ekranda gösterilir (60 sn)
  const [gosterilen, setGosterilen] = useState<string | null>(null);
  const sifreyiGoster = async (kod?: string) => {
    const r = await api<{ sifre: string }>("/sifre/goster", kod ? { kod } : {});
    setGosterilen(r.sifre);
    window.setTimeout(() => setGosterilen(null), 60_000);
  };
  const gosterTikla = async () => {
    if (ikiAktif) { setKodIstek("goster"); return; }
    setHata(null);
    try { await sifreyiGoster(); } catch (e) { setHata((e as Error).message); }
  };
  const sg = durum.sifreGuncelleme;

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
    // Kod yalnız gerekiyorsa: "bağlantıda kod sor" kapalı ve açılışta kod girildiyse doğrudan bağlanır.
    if (ikiAktif && durum.ikiAdim?.kodGerekli !== false) {
      setKodIstek("baglan");
      return;
    }
    const tamam = await cagir("/baglan");
    if (!tamam && !k.terminal.erisim) setVpnUyari(true);
  };

  const sifreKaydet = async () => {
    if (ikiAktif) {
      setKodIstek("sifre");
      return;
    }
    if (await cagir("/rdp/sifre", { sifre }, "sifre")) {
      setSifre("");
    }
  };

  const vk = durum.vpnKurulum;
  // İlk denetim (FortiClient, VPN ayarı, şifre, sunucu) bitene kadar değerler henüz okunmadı — "yok" sayılmaz;
  // kartlar "Kontrol ediliyor…" gösterir, Kur/şifre bölümleri açılmaz. Denetim tüm alanları birlikte yazar.
  const denetlendi = !!k.terminal.zaman;
  // Şifre Hub'dan alınırken elle giriş kutusu gösterilmez (kendiliğinden geliyor, 07.10.2026)
  const sifreGoster = denetlendi && !k.rdpSifre.kayitli && !k.rdpSifre.aliniyor;


  // Adım içerikleri — normal ekranda Bolum içinde, ilk kurulumda sihirbaz adımında aynı parça kullanılır.
  const vpnKurIcerik = (
    <>
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
          {k.forti.kurulu
            ? "FortiClient'taki Pusula bağlantısı eksik ya da Pusula'nın VPN sunucu bilgisi değişmiş; bağlantı ayarı yeniden yazılır. Windows yönetici izni isteyecek."
            : "FortiClient VPN kurulur ve Pusula bağlantısı ayarlanır. Windows yönetici izni isteyecek."}
        </p>
        <Button disabled={!!bekle} onClick={() => void cagir("/vpn/kur")}>
          {bekle === "/vpn/kur" ? <Loader2 className="animate-spin" /> : <ShieldCheck />} {vk.durum?.hata ? "Yeniden dene" : k.forti.kurulu ? "Güncelle" : "Kur"}
        </Button>
      </>
    )}
    </>
  );
  const tanimlaIcerik = (
    <>
    <p className="mb-3 text-sm text-muted-foreground">
      FortiClient'ta <b>{kayit.profil.tunel}</b> bağlantısına kullanıcı adınız (<span className="font-medium">{kayit.kullanici}</span>)
      yazılır; bağlanırken yalnız şifrenizi girersiniz. Windows yönetici izni isteyecek.
    </p>
    <Button disabled={!!bekle} onClick={() => void cagir("/vpn/kur")}>
      {bekle === "/vpn/kur" ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Tanımla
    </Button>
    </>
  );
  const vpnBaglanIcerik = (
    <>
    <ol className="mb-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm">
      <li>VPN uygulamasını (FortiClient) açın; <b>{kayit.profil.tunel}</b> bağlantısı seçili gelir.</li>
      <li>
        {k.profil.sifre === "kayitli" ? (
          <>Kullanıcı adınız ve şifreniz FortiClient'ta kayıtlı; yalnız <b>Connect</b>'e basın.</>
        ) : k.profil.kullaniciAdi ? (
          <>Kullanıcı adınız hazır (<span className="font-medium">{kayit.kullanici}</span>). Şifrenizi yazıp <b>Connect</b>'e basın.</>
        ) : (
          <>Kullanıcı adı alanına <span className="font-semibold">{kayit.kullanici}</span> yazın, şifrenizi girip <b>Connect</b>'e basın.</>
        )}
      </li>
      {k.rdpSifre.kayitli && k.profil.sifre !== "kayitli" && (
        <li className="list-none">
          <SifreGosterici gosterilen={gosterilen} onGoster={() => void gosterTikla()} onGizle={() => setGosterilen(null)} />
        </li>
      )}
      {k.profil.sifre === "isaretsiz" ? (
        <li className="font-medium text-amber-700 dark:text-amber-400">
          Bağlanırken <b>Save Password</b> kutusunu işaretleyin; şifre bir daha sorulmaz.
        </li>
      ) : k.profil.sifre !== "kayitli" ? (
        <li className="text-muted-foreground">
          İlk bağlantıda şifre kaydetme seçeneği çıkmaz, bu normaldir. Sonraki bağlantıda <b>Save Password</b>'ü işaretlerseniz bir daha
          sorulmaz.
        </li>
      ) : null}
    </ol>
    <Button size="sm" variant="outline" onClick={() => void cagir("/vpn/ac")}>
      <ShieldCheck /> VPN uygulamasını aç
    </Button>
    </>
  );
  const sifreIcerik = (
    <>
    <p className="mb-3 text-sm text-muted-foreground">
      <span className="font-medium">{kayit.kullanici}</span> kullanıcısının Pusula oturum şifresi. Yalnız bu bilgisayarın Windows
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
    </div>
    </>
  );

  // İLK KURULUM (07.10.2026, kullanıcı kararı): kurulum bir kez tamamlanana kadar orta panelde dört durum kartı +
  // dağınık bölümler yerine adım adım sihirbaz. Bitiş işaretini exe koyar (dört adım ilk kez hazır olduğunda),
  // kayıt kalkınca silinir — sonra VPN kapalı olsa da normal ekran görünür.
  const kurulumModu = denetlendi && !durum.kurulumTamam;

  return (
    <div className="flex h-svh overflow-hidden bg-muted/40">
      {/* ── Sol: firma bilgileri ───────────────────────────── */}
      <aside className="flex w-72 shrink-0 flex-col border-r bg-card">
        <div className="flex h-16 shrink-0 items-center justify-center border-b px-5">
          <ParlayanLogo />
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          <div>
            <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Firma</div>
            <div className="mt-1 text-base leading-snug font-semibold">{kayit.firmaAdi}</div>
          </div>
          <dl className="flex flex-col gap-3 text-sm">
            <SolSatir ikon={<Hash />} ad="Firma no" deger={kayit.firmaId} />
            <SolSatir ikon={<UserRound />} ad="Kullanıcı" deger={<span className="font-medium">{kayit.kullanici}</span>} />
            <SolSatir ikon={<Laptop />} ad="Bu bilgisayar" deger={durum.makine} />
            <SolSatir
              ikon={<Server />}
              ad="Sunucu"
              deger={
                <span className="font-medium">
                  {kayit.profil.rdp}
                  {k.terminal.dnsYok && kayit.profil.rdpIp && (
                    <span className="block text-xs font-normal text-amber-700 dark:text-amber-400" title="Bu bilgisayarın DNS'i sunucu adını çözemiyor; IP ile bağlanılıyor">
                      DNS çözülemedi · {kayit.profil.rdpIp}
                    </span>
                  )}
                </span>
              }
            />
            <SolSatir ikon={<ShieldCheck />} ad="VPN" deger={<span className="font-medium">{kayit.profil.tunel}</span>} />
            {durum.yazdirma?.kurulu && (
              <SolSatir
                ikon={<Printer />}
                ad="Yazdırma yardımcısı (Pusula X)"
                deger={
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <span className={"size-2 rounded-full " + (durum.yazdirma.calisiyor ? "bg-emerald-500" : "bg-amber-500")} />
                    {durum.yazdirma.calisiyor ? "Çalışıyor" : "Çalışmıyor"}
                    {durum.yazdirma.vpnIp && (
                      <span
                        className={"font-mono font-normal " + (vpnIpSabitMi(durum.yazdirma.vpnIp) ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400")}
                        title={vpnIpSabitMi(durum.yazdirma.vpnIp) ? undefined : "VPN adresi sabit değil — Pusula X yazdıramayabilir"}
                      >
                        · {durum.yazdirma.vpnIp}{vpnIpSabitMi(durum.yazdirma.vpnIp) ? "" : " (sabit değil)"}
                      </span>
                    )}
                    {durum.yazdirma.vpnIp && <KopyalaIkon metin={durum.yazdirma.vpnIp} etiket="VPN IP adresini kopyala" />}
                  </span>
                }
              />
            )}
            {durum.rfid?.kurulu && (
              <SolSatir
                ikon={<Printer />}
                ad="Yazdırma yardımcısı (Pusula)"
                deger={
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <span className={"size-2 rounded-full " + (durum.rfid.calisiyor ? "bg-emerald-500" : "bg-amber-500")} />
                    {durum.rfid.calisiyor ? "Çalışıyor" : "Çalışmıyor"}
                    {/* VPN IP'si yukarıda (Pusula X yardımcısı) gösteriliyorsa tekrar yazılmaz */}
                    {durum.rfid.vpnIp && !durum.yazdirma?.kurulu && (
                      <>
                        <span className="font-mono font-normal text-muted-foreground">· {durum.rfid.vpnIp}</span>
                        <KopyalaIkon metin={durum.rfid.vpnIp} etiket="VPN IP adresini kopyala" />
                      </>
                    )}
                  </span>
                }
              />
            )}
          </dl>

        </div>

        {/* Sayım + yedek kartları — kaydırılan firma bilgilerinin dışında, hep görünür (başlıksız) */}
        <div className="flex shrink-0 flex-col gap-2 px-3 pb-3">
          <SayimYanKarti durum={durum} setDurum={setDurum} />
          <YedekYanKarti durum={durum} />
        </div>

        <div className="flex flex-col gap-1 border-t px-3 py-3">
          <Button
            variant={orta === "duyurular" ? "secondary" : "ghost"}
            size="sm"
            className="justify-start"
            onClick={() => setOrta(orta === "duyurular" ? "ana" : "duyurular")}
          >
            <Megaphone /> Duyurular
            {okunmamis > 0 && (
              <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
                {okunmamis}
              </span>
            )}
          </Button>
          <Button
            variant={orta === "ayarlar" ? "secondary" : "ghost"}
            size="sm"
            className="justify-start"
            onClick={() => setOrta(orta === "ayarlar" ? "ana" : "ayarlar")}
          >
            <Settings /> Ayarlar
          </Button>
        </div>
        <div className="flex items-center gap-2.5 border-t px-5 py-3">
          <img src={uygulamaIkonu} alt="" className="size-8 shrink-0" draggable={false} />
          <div>
            <div className="text-sm font-semibold">Pusula Connect</div>
            <div className="text-xs text-muted-foreground">v{durum.surum}</div>
          </div>
        </div>
      </aside>

      {/* ── Orta: bağlantı durumu ──────────────────────────── */}
      {orta === "duyurular" ? (
        <main className="flex min-w-0 flex-1 flex-col">
          <OrtaBaslik
            sol={
              <Button variant="ghost" size="icon" className="-ml-2" onClick={() => setOrta("ana")} aria-label="Bağlantı ekranına dön">
                <ArrowLeft />
              </Button>
            }
            baslik="Duyurular"
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <DuyurularIcerik durum={durum} setDurum={setDurum} />
          </div>
        </main>
      ) : orta === "ayarlar" ? (
        <main className="flex min-w-0 flex-1 flex-col">
          <OrtaBaslik
            sol={
              <Button variant="ghost" size="icon" className="-ml-2" onClick={() => setOrta("ana")} aria-label="Bağlantı ekranına dön">
                <ArrowLeft />
              </Button>
            }
            baslik="Ayarlar"
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AyarlarIcerik
              durum={durum}
              setDurum={setDurum}
              ikiAktif={ikiAktif}
              onIkiAc={() => setIkiAc(true)}
              onIkiKapat={() => setKodIstek("kapat")}
            />
          </div>
        </main>
      ) : orta === "talep" ? (
        <main className="flex min-w-0 flex-1 flex-col">
          <OrtaBaslik
            sol={
              <Button variant="ghost" size="icon" className="-ml-2" onClick={() => setOrta("ana")} aria-label="Bağlantı ekranına dön">
                <ArrowLeft />
              </Button>
            }
            baslik="Yardım talebi"
            sag={
              <Button variant="ghost" size="sm" asChild>
                <a href={talepAdresi(kayit.firmaId)} target="_blank" rel="noreferrer">
                  <ExternalLink /> Tarayıcıda aç
                </a>
              </Button>
            }
          />
          <iframe src={talepAdresi(kayit.firmaId)} title="Yardım talebi" className="min-h-0 w-full flex-1 border-0 bg-white" />
        </main>
      ) : (
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Arka plan: Magic UI Flickering Grid — erişim varken yeşil, yokken gri; kenarlara doğru söner */}
      <FlickeringGrid
        aria-hidden
        className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]"
        squareSize={4}
        gridGap={6}
        flickerChance={0.12}
        maxOpacity={0.15}
        color={k.terminal.erisim ? "#10b981" : "#64748b"}
      />
      <div className="relative flex min-h-0 flex-1 justify-center overflow-y-auto">
      <div className="my-auto flex w-full max-w-2xl flex-col gap-4 p-6">
        <DuyuruSeritleri durum={durum} setDurum={setDurum} onTumu={() => setOrta("duyurular")} />

        {sg?.mesaj && !sg.ilk && (
          // Yalnız şifre DEĞİŞTİĞİNDE (dikkat çekmeli, amber). İlk kurulumda kart yok: şifre zaten Oturum şifresi kartında.
          <section className="flex items-start gap-3 rounded-xl border-2 border-amber-500/60 bg-card p-4 shadow-md ring-4 ring-amber-500/10">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-400">
              <KeyRound className="size-5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div>
                <div className="text-[15px] font-semibold">Şifreniz değişti</div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {sg.mesaj} <b className="text-foreground">VPN (FortiClient) şifreniz de aynıdır</b>; FortiClient şifre sorarsa yeni şifreyi oraya girin.
                </p>
              </div>
              <SifreGosterici gosterilen={gosterilen} onGoster={() => void gosterTikla()} onGizle={() => setGosterilen(null)} />
            </div>
          </section>
        )}

        {!durum.servisErisim && (
          <Alert>
            <WifiOff />
            <AlertDescription>Pusula sunucusuna şu an ulaşılamadı; kayıtlı ayarlarla çalışılıyor.</AlertDescription>
          </Alert>
        )}

        {durum.guncelleme.zorunlu && (
          <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300">
            <AlertTriangle />
            <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2 text-inherit">
              <span className="flex-1">Bu sürüm ({durum.surum}) artık desteklenmiyor. Sorun yaşamamak için güncelleyin.</span>
              {durum.guncelleme.mevcut && (
                <Button size="sm" variant="outline" disabled={durum.guncelleme.suruyor} onClick={() => void cagir("/guncelle")}>
                  <Download /> Güncelle
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {kurulumModu && (
          <IlkKurulum
            adimlar={[
              { baslik: "VPN programı", aciklama: "FortiClient kurulur, Pusula bağlantısı ayarlanır", tamam: vpnHazir, icerik: vpnKurIcerik },
              { baslik: "VPN kullanıcı adı", aciklama: `FortiClient'a ${kayit.kullanici} yazılır`, tamam: !!k.profil.kullaniciAdi, icerik: vk.suruyor || vk.durum?.hata ? vpnKurIcerik : tanimlaIcerik },
              {
                baslik: "Oturum şifresi",
                aciklama: k.rdpSifre.aliniyor ? "Pusula'dan otomatik alınıyor" : "Bu bilgisayarda şifreli saklanır",
                tamam: k.rdpSifre.kayitli,
                icerik: k.rdpSifre.aliniyor ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Şifreniz Pusula'dan alınıyor; elle girmeniz gerekmez.
                  </div>
                ) : sifreIcerik,
              },
              { baslik: "VPN'e bağlanın", aciklama: "FortiClient ile Pusula'ya güvenli bağlantı", tamam: k.terminal.erisim, icerik: vpnBaglanIcerik },
            ]}
          />
        )}

        {!kurulumModu && (
        <div className="grid grid-cols-2 gap-3">
          <Kart
            ikon={<ShieldCheck />}
            baslik="VPN programı"
            durum={!denetlendi ? "bekliyor" : k.forti.kurulu ? "iyi" : "hata"}
            deger={!denetlendi ? "Kontrol ediliyor…" : k.forti.kurulu ? "FortiClient" : "Kurulu değil"}
            alt={!denetlendi ? "Bir saniye…" : k.forti.kurulu ? `Sürüm ${k.forti.surum ?? "—"}` : "Aşağıdaki Kur düğmesiyle kurulur"}
            aksiyon={
              k.forti.kurulu && (
                <Button size="sm" variant="outline" className="ml-auto h-6 shrink-0 gap-1 px-2 text-xs [&_svg]:size-3" disabled={bekle === "/vpn/ac"} onClick={() => void cagir("/vpn/ac")}>
                  {bekle === "/vpn/ac" ? <Loader2 className="animate-spin" /> : <ExternalLink />} VPN'i aç
                </Button>
              )
            }
          />
          <Kart
            ikon={<Network />}
            baslik="VPN ayarı"
            durum={!denetlendi ? "bekliyor" : !k.profil.dogru ? "hata" : k.profil.kullaniciAdi ? "iyi" : "uyari"}
            deger={!denetlendi ? "Kontrol ediliyor…" : !k.profil.dogru ? "Eksik" : k.profil.kullaniciAdi ? "Hazır" : "Kullanıcı adı yok"}
            alt={!denetlendi ? "Bir saniye…" : !k.profil.dogru ? "VPN bağlantısı tanımlı değil" : `${kayit.profil.tunel}${k.profil.kullaniciAdi ? " · kullanıcı adı tanımlı" : ""}`}
          />
          <Kart
            ikon={<Server />}
            baslik="Pusula sunucusu"
            durum={k.terminal.erisim ? (kalite(k.terminal.ms) >= 2 ? "iyi" : "uyari") : k.terminal.zaman ? "uyari" : "bekliyor"}
            deger={k.terminal.erisim ? "Erişiliyor" : k.terminal.zaman ? "Erişilemiyor" : "Kontrol ediliyor…"}
            alt={k.terminal.erisim ? <Sinyal ms={k.terminal.ms} /> : k.terminal.zaman ? "VPN kapalı olabilir" : "Bir saniye…"}
            ortu={
              !k.terminal.erisim && k.terminal.zaman
                ? vpnHazir ? "VPN bağlantısı bekleniyor" : "VPN kurulumu ve bağlantısı bekleniyor"
                : undefined
            }
          />
          <Kart
            ikon={<KeyRound />}
            baslik="Oturum şifresi"
            durum={!denetlendi || (!k.rdpSifre.kayitli && k.rdpSifre.aliniyor) ? "bekliyor" : k.rdpSifre.kayitli ? "iyi" : "hata"}
            deger={!denetlendi ? "Kontrol ediliyor…" : k.rdpSifre.kayitli ? "Kayıtlı" : k.rdpSifre.aliniyor ? "Alınıyor…" : "Kayıtlı değil"}
            alt={!denetlendi ? "Bir saniye…" : !k.rdpSifre.kayitli ? (k.rdpSifre.aliniyor ? "Pusula'dan otomatik alınıyor" : "Aşağıdan kaydedin") : ikiAktif ? "Doğrulama koduyla korunuyor" : "Bu bilgisayarda şifreli saklanıyor"}
          />
        </div>
        )}

        {!kurulumModu && ((denetlendi && !vpnHazir) || vk.suruyor || vk.durum?.hata) && (
          <Bolum baslik={vk.suruyor ? "VPN ayarı güncelleniyor" : k.forti.kurulu ? "VPN ayarını güncelleyin" : "VPN programını kur"} ikon={<ShieldCheck />}>
            {vpnKurIcerik}
          </Bolum>
        )}

        {!kurulumModu && denetlendi && vpnHazir && !k.profil.kullaniciAdi && !vk.suruyor && (
          <Bolum baslik="Kullanıcı adını FortiClient'a tanımlayın" ikon={<ShieldCheck />}>
            {tanimlaIcerik}
          </Bolum>
        )}

        {/* Kullanıcı adı FortiClient'a tanımlanmadan bağlanma adımı gösterilmez — önce "Tanımla" kartı (07.10.2026) */}
        {!kurulumModu && vpnHazir && !!k.profil.kullaniciAdi && !k.terminal.erisim && !!k.terminal.zaman && !vk.suruyor && (
          <Bolum baslik="VPN'e bağlanın" ikon={<ShieldCheck />}>
            {vpnBaglanIcerik}
          </Bolum>
        )}

        {!kurulumModu && sifreGoster && (
          <Bolum baslik="Oturum şifresini kaydedin" ikon={<KeyRound />}>
            {sifreIcerik}
          </Bolum>
        )}

        {durum.oturum?.mesaj && !hata && (
          <Alert variant="destructive">
            <XCircle />
            <AlertDescription>{durum.oturum.mesaj}</AlertDescription>
          </Alert>
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
                Pusula sunucusuna ulaşılamıyor; önce VPN'e bağlanın. FortiClient'ta <b>{kayit.profil.tunel}</b> bağlantısında şifrenizi girip
                <b> Connect</b>'e basın, bağlandıktan sonra buradan tekrar deneyin.
              </span>
              {k.forti.kurulu && (
                <Button size="sm" variant="outline" className="self-start" onClick={() => void cagir("/vpn/ac")}>
                  <ShieldCheck /> VPN uygulamasını aç
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Pusula sunucusuna erişim yoksa (VPN bağlı değil) bağlanılamaz. Soluk pasif düğme yerine ne yapılacağını
            söyleyen, tam renkli ama tıklanmayan bir düğme (erişim ~10 sn'de bir denetlenir). */}
        {kurulumModu && !k.terminal.erisim ? null : !k.terminal.erisim ? (
          <Button
            size="lg"
            variant="outline"
            disabled
            className="h-14 w-full rounded-lg border-dashed text-base text-foreground disabled:opacity-100"
          >
            <WifiOff className="text-amber-600 dark:text-amber-400" />
            {k.terminal.zaman ? "Bağlanmak için önce VPN'e bağlanın." : "Pusula sunucusuna erişim denetleniyor…"}
          </Button>
        ) : (
          <>
            <RainbowButton
              size="lg"
              className="h-14 w-full rounded-lg text-base before:w-full"
              disabled={!!bekle || !k.rdpSifre.kayitli}
              onClick={() => void baglan()}
            >
              {bekle === "/baglan" ? <Loader2 className="animate-spin" /> : <Monitor />} Pusula'ya bağlan
            </RainbowButton>
            {!k.rdpSifre.kayitli && (
              <p className="-mt-2 text-center text-xs text-muted-foreground">
                {k.rdpSifre.aliniyor ? "Oturum şifresi Pusula'dan alınıyor…" : "Bağlanmak için önce oturum şifresini kaydedin."}
              </p>
            )}
          </>
        )}

        {/* Destek: talep sistemi varsayılan tarayıcıda açılır (pencere dış adresleri tarayıcıya yönlendirir). */}
        <div className="mt-2 flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <LifeBuoy className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Yardım mı gerekiyor?</div>
          </div>
          <Button variant="outline" onClick={() => setOrta("talep")}>
            <LifeBuoy /> Yardım talebi
          </Button>
        </div>

      </div>
      </div>
      </main>
      )}

      <GuncellemePenceresi durum={durum} setDurum={setDurum} />
      <IkiAcPenceresi acik={ikiAc} onKapat={() => setIkiAc(false)} setDurum={setDurum} kullanici={kayit.kullanici} />
      <KodPenceresi
        acik={kodIstek !== null}
        onKapat={() => setKodIstek(null)}
        baslik={kodIstek === "kapat" ? "İki adımlı doğrulamayı kapat" : kodIstek === "sifre" ? "Şifreyi kaydet" : kodIstek === "goster" ? "Şifreyi göster" : "Doğrulama kodu"}
        aciklama="Telefonunuzdaki doğrulama uygulamasında görünen 6 haneli kodu girin."
        dugme={kodIstek === "kapat" ? "Kapat" : kodIstek === "sifre" ? "Kaydet" : kodIstek === "goster" ? "Göster" : "Bağlan"}
        onOnay={async (kod) => {
          if (kodIstek === "baglan") setDurum(await api<Durum>("/baglan", { kod }));
          else if (kodIstek === "kapat") setDurum(await api<Durum>("/iki/kapat", { kod }));
          else if (kodIstek === "goster") await sifreyiGoster(kod);
          else if (kodIstek === "sifre") {
            setDurum(await api<Durum>("/rdp/sifre", { sifre, kod }));
            setSifre("");
          }
        }}
      />

      {/* ── Sağ: görsel (ileride başka içerik gelecek) ─────── */}
      <aside className="relative hidden w-[380px] shrink-0 overflow-hidden border-l bg-gradient-to-br from-primary/5 via-card to-primary/10 xl:block">
        <BaglantiGorseli bagli={k.terminal.erisim} kontrolEdildi={!!k.terminal.zaman} vpnHazir={vpnHazir} />
      </aside>
    </div>
  );
}

/** Oturum (= VPN) şifresini gösterme: düğme → şifre + kopyala + gizle. 60 sn sonra kendiliğinden gizlenir. */
function SifreGosterici({ gosterilen, onGoster, onGizle }: { gosterilen: string | null; onGoster: () => void; onGizle: () => void }) {
  const [kopyalandi, setKopyalandi] = useState(false);
  if (!gosterilen) {
    return (
      <Button size="sm" variant="outline" className="self-start" onClick={onGoster}>
        <Eye /> Şifreyi göster
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded-md border bg-card px-3 py-1.5 font-mono text-sm select-all">{gosterilen}</code>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void navigator.clipboard.writeText(gosterilen).then(() => { setKopyalandi(true); window.setTimeout(() => setKopyalandi(false), 1500); }).catch(() => {});
        }}
      >
        {kopyalandi ? <Check /> : <Copy />} {kopyalandi ? "Kopyalandı" : "Kopyala"}
      </Button>
      <Button size="sm" variant="ghost" onClick={onGizle}>
        <EyeOff /> Gizle
      </Button>
    </div>
  );
}

type KartDurumu = "iyi" | "uyari" | "hata" | "bekliyor";

const KART_RENK: Record<KartDurumu, { kutu: string; rozet: string }> = {
  iyi: { kutu: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400", rozet: "text-emerald-600 dark:text-emerald-400" },
  uyari: { kutu: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400", rozet: "text-amber-600 dark:text-amber-400" },
  hata: { kutu: "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400", rozet: "text-red-600 dark:text-red-400" },
  bekliyor: { kutu: "bg-muted text-muted-foreground ring-border", rozet: "text-muted-foreground" },
};

/** Durum kartı: solda renkli ikon kutusu, başlık + kısa değer + açıklama, sağ üstte durum işareti. */
function Kart({ ikon, baslik, deger, alt, durum, aksiyon, ortu }: { ikon: React.ReactNode; baslik: string; deger: string; alt: React.ReactNode; durum: KartDurumu; aksiyon?: React.ReactNode; ortu?: string }) {
  const r = KART_RENK[durum];
  return (
    <div className="relative flex items-start gap-3 overflow-hidden rounded-xl border bg-card p-4 shadow-xs">
      {/* Örtü: kart bu adımda anlamsızsa (ör. VPN yokken sunucu) üstüne yarı saydam bekleme katmanı */}
      {ortu && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-card/70 px-4 text-center text-sm font-medium text-muted-foreground backdrop-blur-[2px]">
          {/* Sabit simge: dönen simge "kuruluyor" gibi algılanıyordu */}
          <WifiOff className="size-4 shrink-0" />
          {ortu}
        </div>
      )}
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 [&_svg]:size-5 ${r.kutu}`}>{ikon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{baslik}</span>
          <span className={`[&_svg]:size-4 ${r.rozet}`}>
            {durum === "iyi" ? <CheckCircle2 /> : durum === "bekliyor" ? <Loader2 className="animate-spin" /> : <CircleAlert />}
          </span>
        </div>
        <div className="truncate text-[15px] leading-tight font-semibold">{deger}</div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">{alt}</span>
          {aksiyon}
        </div>
      </div>
    </div>
  );
}

/** Gecikmeden bağlantı kalitesi (şeritteki ile aynı eşikler): 4 mükemmel … 1 zayıf. */
function kalite(ms: number) {
  return ms < 60 ? 4 : ms < 120 ? 3 : ms < 250 ? 2 : 1;
}

function Sinyal({ ms }: { ms: number }) {
  const q = kalite(ms);
  const renk = q >= 3 ? "bg-emerald-500" : q === 2 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-1.5" title={`Gecikme: ${ms} ms`}>
      <span className="inline-flex items-end gap-[2px]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`w-[3px] rounded-[1px] ${i < q ? renk : "bg-border"}`} style={{ height: 5 + i * 2 }} />
        ))}
      </span>
      {q === 4 ? "Bağlantı mükemmel" : q === 3 ? "Bağlantı iyi" : q === 2 ? "Bağlantı orta" : "Bağlantı zayıf"}
    </span>
  );
}

type KurulumAdimi = { baslik: string; aciklama: string; tamam: boolean; icerik: React.ReactNode };

/**
 * İlk kurulum sihirbazı (07.10.2026) — orta panelde dikey adım listesi. Etkin adım = tamamlanmamış ilk adım;
 * yalnız onun içeriği açık, tamamlananlar yeşil onayla, sıradakiler soluk. Adımların durumu exe'nin denetiminden
 * gelir (ör. şifre Hub'dan kendiliğinden alınırsa o adım kendi kendine tamamlanır).
 */
function IlkKurulum({ adimlar }: { adimlar: KurulumAdimi[] }) {
  const tamamlanan = adimlar.filter((a) => a.tamam).length;
  const etkin = adimlar.findIndex((a) => !a.tamam);
  const bitti = etkin === -1;
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b bg-muted/30 px-5 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
          {bitti ? <CheckCircle2 className="size-5" /> : <Rocket className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">{bitti ? "Kurulum tamamlandı" : "İlk kurulum"}</div>
          <div className="text-xs text-muted-foreground">
            {bitti ? "Pusula'ya bağlanmaya hazırsınız." : "Pusula'ya bağlanmak için adımları sırayla tamamlayın."}
          </div>
        </div>
        <div className="flex w-28 shrink-0 flex-col items-end gap-1.5">
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {tamamlanan}/{adimlar.length} adım
          </span>
          <Progress value={(tamamlanan / adimlar.length) * 100} className="h-1.5" />
        </div>
      </div>
      <ol className="flex flex-col px-5 py-4">
        {adimlar.map((a, i) => {
          const acik = i === etkin;
          const son = i === adimlar.length - 1;
          return (
            <li key={a.baslik} className="relative flex gap-3.5">
              {/* Adımları birleştiren dikey çizgi */}
              {!son && (
                <span
                  aria-hidden
                  className={"absolute top-8 bottom-0 left-[13px] w-px " + (a.tamam ? "bg-emerald-500/50" : "bg-border")}
                />
              )}
              <span
                className={
                  "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold " +
                  (a.tamam
                    ? "bg-emerald-500 text-white"
                    : acik
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                      : "border bg-card text-muted-foreground")
                }
              >
                {a.tamam ? <Check className="size-4" /> : i + 1}
              </span>
              <div className={"min-w-0 flex-1 " + (son ? "" : "pb-5")}>
                <div className="flex min-h-7 flex-col justify-center">
                  <div className={"text-sm font-semibold " + (!a.tamam && !acik ? "text-muted-foreground" : "")}>{a.baslik}</div>
                  <div className="text-xs text-muted-foreground">{a.tamam ? "Tamamlandı" : a.aciklama}</div>
                </div>
                {acik && <div className="mt-3 rounded-lg border bg-background/60 p-4">{a.icerik}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
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

/** Yalnız ikon: tıklanınca metni panoya kopyalar, kısa süre onay işareti gösterir. */
function KopyalaIkon({ metin, etiket }: { metin: string; etiket: string }) {
  const [tamam, setTamam] = useState(false);
  return (
    <button
      type="button"
      title={tamam ? "Kopyalandı" : etiket}
      aria-label={etiket}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5"
      onClick={() => {
        void navigator.clipboard?.writeText(metin).then(() => {
          setTamam(true);
          window.setTimeout(() => setTamam(false), 1500);
        });
      }}
    >
      {tamam ? <Check className="text-emerald-600 dark:text-emerald-400" /> : <Copy />}
    </button>
  );
}

function SolSatir({ ikon, ad, deger }: { ikon: React.ReactNode; ad: string; deger: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
      {ikon}
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{ad}</dt>
        <dd className="truncate">{deger}</dd>
      </div>
    </div>
  );
}

/** Sağ panelin yer tutucu görseli: bilgisayar → güvenli tünel → Pusula sunucusu. */
function BaglantiGorseli({ bagli, kontrolEdildi, vpnHazir }: { bagli: boolean; kontrolEdildi: boolean; vpnHazir: boolean }) {
  const kopuk = !bagli && kontrolEdildi;
  return (
    <div className="flex h-svh flex-col items-center justify-center gap-6 p-8 text-center">
      {/* Ripple'ın merkezi = SVG'nin merkezi = VPN kalkanı (viewBox 300x220, kalkan 150,110) */}
      <div className="relative w-full max-w-[300px]">
        {/* Magic UI Ripple: bağlıyken yeşil (--foreground yerelde ezilir), merkezden dışa silinir */}
        <Ripple
          mainCircleSize={170}
          numCircles={7}
          className="inset-auto top-1/2 left-1/2 size-[760px] -translate-x-1/2 -translate-y-1/2 mask-[radial-gradient(circle,white_20%,transparent_60%)]"
          style={bagli ? ({ "--foreground": "oklch(0.696 0.17 162.48)" } as React.CSSProperties) : undefined}
        />
      <svg viewBox="0 0 300 220" className="relative w-full" role="img" aria-label="Bilgisayardan Pusula sunucusuna güvenli bağlantı">
        {/* bağlantı hattı */}
        <g className={bagli ? "text-emerald-500" : kopuk ? "text-amber-500" : "text-muted-foreground"}>
          <path d="M74 110 H228" stroke="currentColor" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 8" fill="none">
            {bagli && <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite" />}
          </path>
        </g>
        {/* bilgisayar */}
        <g className="text-foreground" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
          <rect x="22" y="82" width="48" height="34" rx="4" className="fill-card" />
          <path d="M14 124 H78 L72 132 H20 Z" className="fill-card" />
        </g>
        {/* kalkan (VPN) */}
        <g transform="translate(150 110)">
          <circle r="26" className="fill-card text-primary" stroke="currentColor" strokeWidth="2.5" />
          <path d="M0 -14 L11 -9 V0 C11 8 5 13 0 15 C-5 13 -11 8 -11 0 V-9 Z" className={bagli ? "fill-emerald-500/20 text-emerald-600" : kopuk ? "fill-amber-500/15 text-amber-600" : "fill-primary/10 text-primary"} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          {bagli && <path d="M-5 0 L-1 4 L6 -4" fill="none" className="text-emerald-600" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
        </g>
        {/* sunucu */}
        <g className="text-foreground" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="234" y="78" width="44" height="18" rx="3" className="fill-card" />
          <rect x="234" y="100" width="44" height="18" rx="3" className="fill-card" />
          <rect x="234" y="122" width="44" height="18" rx="3" className="fill-card" />
          <g className={bagli ? "text-emerald-500" : "text-muted-foreground"} fill="currentColor" stroke="none">
            <circle cx="268" cy="87" r="2.5" /><circle cx="268" cy="109" r="2.5" /><circle cx="268" cy="131" r="2.5" />
          </g>
        </g>
        <text x="46" y="160" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Bu bilgisayar</text>
        <text x="150" y="160" textAnchor="middle" className="fill-muted-foreground" fontSize="11">VPN</text>
        <text x="256" y="160" textAnchor="middle" className="fill-muted-foreground" fontSize="11">Pusula</text>
      </svg>
      </div>
      <div className="relative flex flex-col items-center">
        {!bagli && kontrolEdildi && (
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <span className="size-1.5 rounded-full bg-amber-500" /> Bağlantı yok
          </span>
        )}
        <div className="text-lg font-semibold">
          {bagli ? "Pusula'ya bağlantı hazır" : !kontrolEdildi ? "Bağlantı kontrol ediliyor…" : vpnHazir ? "VPN bağlı değil" : "VPN kurulumu bekleniyor"}
        </div>
        <p className="mt-1 max-w-[280px] text-sm text-muted-foreground">
          {bagli
            ? "VPN açık, sunucuya erişiliyor."
            : !kontrolEdildi
              ? "Pusula sunucusuna erişim deneniyor."
              : vpnHazir
                ? "Pusula sunucusuna ulaşılamıyor. VPN uygulamasını açıp Pusula bağlantısına bağlanın."
                : "Pusula sunucusuna ulaşmak için önce VPN programını kurun, ardından FortiClient ile bağlanın."}
        </p>
      </div>
    </div>
  );
}


/** Orta panelin üst şeridi — başlık ortada; solda/sağda isteğe bağlı düğmeler (yardım talebi görünümü). */
