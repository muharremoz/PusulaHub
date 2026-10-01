import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, CircleAlert, Download, FileText, KeyRound, Loader2, Monitor, PlugZap, RefreshCw,
  Laptop, Server, ShieldCheck, UserRound, WifiOff, XCircle,
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
    <div className="flex h-svh overflow-hidden bg-muted/40">
      {/* ── Sol: firma bilgileri ───────────────────────────── */}
      <aside className="flex w-72 shrink-0 flex-col border-r bg-card">
        <div className="flex items-center gap-2.5 border-b px-5 py-4">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PlugZap className="size-5" />
          </span>
          <div>
            <div className="text-sm font-semibold">Pusula Connect</div>
            <div className="text-xs text-muted-foreground">v{durum.surum}</div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          <div>
            <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Firma</div>
            <div className="mt-1 text-base leading-snug font-semibold">{kayit.firmaAdi}</div>
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">#{kayit.firmaId}</div>
          </div>
          <dl className="flex flex-col gap-3 text-sm">
            <SolSatir ikon={<UserRound />} ad="Kullanıcı" deger={<span className="font-mono">{kayit.kullanici}</span>} />
            <SolSatir ikon={<Laptop />} ad="Bu bilgisayar" deger={durum.makine} />
            <SolSatir ikon={<Server />} ad="Sunucu" deger={<span className="font-mono">{kayit.profil.rdp}</span>} />
            <SolSatir ikon={<ShieldCheck />} ad="VPN" deger={<span className="font-mono">{kayit.profil.tunel}</span>} />
          </dl>

          {durum.guncelleme.mevcut && (
            <Button size="sm" variant="outline" className="self-start" disabled={durum.guncelleme.suruyor} onClick={() => void cagir("/guncelle")}>
              {durum.guncelleme.suruyor ? <Loader2 className="animate-spin" /> : <Download />} Güncelle ({durum.guncelleme.surum})
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-1 border-t px-3 py-3">
          <Button variant="ghost" size="sm" className="justify-start" disabled={!!bekle} onClick={() => void cagir("/kontrol", {}, "kontrol")}>
            {bekle === "kontrol" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Yeniden kontrol et
          </Button>
          {k.rdpSifre.kayitli && !sifreFormu && (
            <Button variant="ghost" size="sm" className="justify-start" onClick={() => setSifreFormu(true)}>
              <KeyRound /> Şifreyi değiştir
            </Button>
          )}
          <Button variant="ghost" size="sm" className="justify-start" onClick={() => void api("/gunluk/ac", {})}>
            <FileText /> Günlük
          </Button>
          <img src={pusulaLogo} alt="Pusula Yazılım" className="mt-2 ml-2 h-5 w-auto self-start select-none opacity-70" draggable={false} />
        </div>
      </aside>

      {/* ── Orta: bağlantı durumu ──────────────────────────── */}
      <main className="flex min-w-0 flex-1 justify-center overflow-y-auto">
      <div className="flex w-full max-w-2xl flex-col gap-4 p-6">
        {!durum.servisErisim && (
          <Alert>
            <WifiOff />
            <AlertDescription>Pusula sunucusuna şu an ulaşılamadı; kayıtlı ayarlarla çalışılıyor.</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Kart ikon={<ShieldCheck />} baslik="VPN programı" iyi={k.forti.kurulu} metin={k.forti.kurulu ? `FortiClient ${k.forti.surum ?? ""}` : "Kurulu değil"} />
          <Kart
            ikon={<ShieldCheck />}
            baslik="VPN ayarı"
            iyi={k.profil.dogru && !!k.profil.kullaniciAdi}
            uyari={k.profil.dogru && !k.profil.kullaniciAdi}
            metin={!k.profil.dogru ? "Eksik" : k.profil.kullaniciAdi ? `"${kayit.profil.tunel}" hazır · kullanıcı adı tanımlı` : `"${kayit.profil.tunel}" hazır · kullanıcı adı yok`}
          />
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
          <Bolum baslik={vpnHazir ? "VPN ayarı güncelleniyor" : "VPN programını kur"} ikon={<ShieldCheck />}>
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

        {vpnHazir && !k.profil.kullaniciAdi && !vk.suruyor && (
          <Bolum baslik="Kullanıcı adını FortiClient'a tanımlayın" ikon={<ShieldCheck />}>
            <p className="mb-3 text-sm text-muted-foreground">
              FortiClient'ta <b>{kayit.profil.tunel}</b> bağlantısına kullanıcı adınız (<span className="font-mono">{kayit.kullanici}</span>)
              yazılır; bağlanırken yalnız şifrenizi girersiniz. Windows yönetici izni isteyecek.
            </p>
            <Button disabled={!!bekle} onClick={() => void cagir("/vpn/kur")}>
              {bekle === "/vpn/kur" ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Tanımla
            </Button>
          </Bolum>
        )}

        {vpnHazir && !k.terminal.erisim && !!k.terminal.zaman && !vk.suruyor && (
          <Bolum baslik="VPN'e bağlanın" ikon={<ShieldCheck />}>
            <ol className="mb-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm">
              <li>FortiClient'ı açın; <b>{kayit.profil.tunel}</b> bağlantısı seçili gelir.</li>
              <li>
                {k.profil.kullaniciAdi ? (
                  <>Kullanıcı adınız hazır (<span className="font-mono">{kayit.kullanici}</span>). Şifrenizi yazıp <b>Connect</b>'e basın.</>
                ) : (
                  <>Kullanıcı adı alanına <span className="font-mono font-semibold">{kayit.kullanici}</span> yazın, şifrenizi girip <b>Connect</b>'e basın.</>
                )}
              </li>
              <li className="text-muted-foreground">
                İlk bağlantıda şifre kaydetme seçeneği çıkmaz, bu normaldir. Sonraki bağlantıda <b>Save Password</b>'ü işaretlerseniz bir daha
                sorulmaz.
              </li>
            </ol>
            <Button size="sm" variant="outline" onClick={() => void cagir("/vpn/ac")}>
              <ShieldCheck /> FortiClient'ı aç
            </Button>
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
                Pusula sunucusuna ulaşılamıyor; önce VPN'e bağlanın. FortiClient'ta <b>{kayit.profil.tunel}</b> bağlantısında şifrenizi girip
                <b> Connect</b>'e basın, bağlandıktan sonra buradan tekrar deneyin.
              </span>
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

      </div>
      </main>

      {/* ── Sağ: görsel (ileride başka içerik gelecek) ─────── */}
      <aside className="relative hidden w-[380px] shrink-0 overflow-hidden border-l bg-gradient-to-br from-primary/5 via-card to-primary/10 xl:block">
        <BaglantiGorseli bagli={k.terminal.erisim} />
      </aside>
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
      <div className={`mt-1 flex items-start gap-1.5 text-sm font-medium ${renk} [&_svg]:size-4`}>
        {iyi ? <CheckCircle2 className="mt-0.5 shrink-0" /> : <CircleAlert className="mt-0.5 shrink-0" />}
        <span className="min-w-0 leading-snug">{metin}</span>
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
function BaglantiGorseli({ bagli }: { bagli: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      <svg viewBox="0 0 300 220" className="w-full max-w-[300px]" role="img" aria-label="Bilgisayardan Pusula sunucusuna güvenli bağlantı">
        {/* arka plan halkaları */}
        <g className="text-primary" fill="none" stroke="currentColor" strokeOpacity="0.08">
          <circle cx="150" cy="110" r="100" />
          <circle cx="150" cy="110" r="70" />
          <circle cx="150" cy="110" r="40" />
        </g>
        {/* bağlantı hattı */}
        <g className={bagli ? "text-emerald-500" : "text-muted-foreground"}>
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
          <path d="M0 -14 L11 -9 V0 C11 8 5 13 0 15 C-5 13 -11 8 -11 0 V-9 Z" className={bagli ? "fill-emerald-500/20 text-emerald-600" : "fill-primary/10 text-primary"} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
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
      <div>
        <div className="text-lg font-semibold">{bagli ? "Pusula'ya bağlantı hazır" : "Pusula'ya güvenli bağlantı"}</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {bagli ? "VPN açık, sunucuya erişiliyor." : "VPN ile şifreli tünel kurulur, programınız Pusula sunucusunda çalışır."}
        </p>
      </div>
    </div>
  );
}
