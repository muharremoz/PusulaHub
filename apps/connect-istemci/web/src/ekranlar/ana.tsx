import { useState } from "react";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, CircleAlert, Download, ExternalLink, FileText, KeyRound, Loader2, Monitor, PlugZap, RefreshCw,
  Hash, Laptop, LifeBuoy, Network, Server, ShieldCheck, UserRound, WifiOff, XCircle,
} from "lucide-react";
import { api, type Durum } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { Ripple } from "@/components/ui/ripple";
import { IkiAcPenceresi, KodPenceresi } from "./iki-adim";
import { ParlayanLogo } from "./ortak";

/** Destek formu (PusulaWeb-v2 /destek-talebi). ?firmaid=<firkod> ile firma adı, yetkili ve telefon CRM'den dolar. */
const TALEP_ADRESI = "https://talep.pusulanet.net";
const talepAdresi = (firmaId?: string) => (firmaId ? `${TALEP_ADRESI}/?firmaid=${encodeURIComponent(firmaId)}` : TALEP_ADRESI);

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
  // Yardım talebi orta panelde açılır (iframe); exe CSP'si yalnız bu adrese frame-src izni verir.
  const [talepAcik, setTalepAcik] = useState(false);
  // İki adımlı doğrulama: açma penceresi + kod sorma (bağlan / kapat / şifre kaydet)
  const ikiAktif = !!durum.ikiAdim?.aktif;
  const [ikiAc, setIkiAc] = useState(false);
  const [kodIstek, setKodIstek] = useState<null | "baglan" | "kapat" | "sifre">(null);

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
    if (ikiAktif) {
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
  const sifreGoster = !k.rdpSifre.kayitli;

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
            <SolSatir ikon={<Server />} ad="Sunucu" deger={<span className="font-medium">{kayit.profil.rdp}</span>} />
            <SolSatir ikon={<ShieldCheck />} ad="VPN" deger={<span className="font-medium">{kayit.profil.tunel}</span>} />
          </dl>

          {ikiAktif ? (
            <div className="flex items-center gap-2 rounded-lg border p-3">
              <ShieldCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">İki adımlı doğrulama</div>
                <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Açık</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setKodIstek("kapat")}>Kapat</Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setIkiAc(true)}>
              <ShieldCheck /> İki adımlı doğrulamayı aç
            </Button>
          )}

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
          <Button variant="ghost" size="sm" className="justify-start" onClick={() => void api("/gunluk/ac", {})}>
            <FileText /> Günlük
          </Button>
        </div>
        <div className="flex items-center gap-2.5 border-t px-5 py-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PlugZap className="size-4" />
          </span>
          <div>
            <div className="text-sm font-semibold">Pusula Connect</div>
            <div className="text-xs text-muted-foreground">v{durum.surum}</div>
          </div>
        </div>
      </aside>

      {/* ── Orta: bağlantı durumu ──────────────────────────── */}
      {talepAcik ? (
        <main className="flex min-w-0 flex-1 flex-col">
          <OrtaBaslik
            sol={
              <Button variant="ghost" size="icon" className="-ml-2" onClick={() => setTalepAcik(false)} aria-label="Bağlantı ekranına dön">
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
      <main className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 justify-center overflow-y-auto">
      <div className="my-auto flex w-full max-w-2xl flex-col gap-4 p-6">
        {!durum.servisErisim && (
          <Alert>
            <WifiOff />
            <AlertDescription>Pusula sunucusuna şu an ulaşılamadı; kayıtlı ayarlarla çalışılıyor.</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Kart
            ikon={<ShieldCheck />}
            baslik="VPN programı"
            durum={k.forti.kurulu ? "iyi" : "hata"}
            deger={k.forti.kurulu ? "FortiClient" : "Kurulu değil"}
            alt={k.forti.kurulu ? `Sürüm ${k.forti.surum ?? "—"}` : "Aşağıdaki Kur düğmesiyle kurulur"}
            aksiyon={
              k.forti.kurulu && (
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" disabled={bekle === "/vpn/ac"} onClick={() => void cagir("/vpn/ac")}>
                  {bekle === "/vpn/ac" ? <Loader2 className="animate-spin" /> : <ExternalLink />} VPN'i aç
                </Button>
              )
            }
          />
          <Kart
            ikon={<Network />}
            baslik="VPN ayarı"
            durum={!k.profil.dogru ? "hata" : k.profil.kullaniciAdi ? "iyi" : "uyari"}
            deger={!k.profil.dogru ? "Eksik" : k.profil.kullaniciAdi ? "Hazır" : "Kullanıcı adı yok"}
            alt={!k.profil.dogru ? "VPN bağlantısı tanımlı değil" : `${kayit.profil.tunel}${k.profil.kullaniciAdi ? " · kullanıcı adı tanımlı" : ""}`}
          />
          <Kart
            ikon={<Server />}
            baslik="Pusula sunucusu"
            durum={k.terminal.erisim ? (kalite(k.terminal.ms) >= 2 ? "iyi" : "uyari") : k.terminal.zaman ? "uyari" : "bekliyor"}
            deger={k.terminal.erisim ? "Erişiliyor" : k.terminal.zaman ? "Erişilemiyor" : "Kontrol ediliyor…"}
            alt={k.terminal.erisim ? <Sinyal ms={k.terminal.ms} /> : k.terminal.zaman ? "VPN kapalı olabilir" : "Bir saniye…"}
          />
          <Kart
            ikon={<KeyRound />}
            baslik="Oturum şifresi"
            durum={k.rdpSifre.kayitli ? "iyi" : "hata"}
            deger={k.rdpSifre.kayitli ? "Kayıtlı" : "Kayıtlı değil"}
            alt={!k.rdpSifre.kayitli ? "Aşağıdan kaydedin" : ikiAktif ? "Doğrulama koduyla korunuyor" : "Bu bilgisayarda şifreli saklanıyor"}
          />
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
              FortiClient'ta <b>{kayit.profil.tunel}</b> bağlantısına kullanıcı adınız (<span className="font-medium">{kayit.kullanici}</span>)
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
                  <>Kullanıcı adınız hazır (<span className="font-medium">{kayit.kullanici}</span>). Şifrenizi yazıp <b>Connect</b>'e basın.</>
                ) : (
                  <>Kullanıcı adı alanına <span className="font-semibold">{kayit.kullanici}</span> yazın, şifrenizi girip <b>Connect</b>'e basın.</>
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
          <Bolum baslik="Oturum şifresini kaydedin" ikon={<KeyRound />}>
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
                  <ShieldCheck /> FortiClient'ı aç
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        <RainbowButton size="lg" className="h-14 w-full rounded-lg text-base" disabled={!!bekle || !k.rdpSifre.kayitli} onClick={() => void baglan()}>
          {bekle === "/baglan" ? <Loader2 className="animate-spin" /> : <Monitor />} Pusula'ya bağlan
        </RainbowButton>
        {!k.rdpSifre.kayitli && <p className="-mt-2 text-center text-xs text-muted-foreground">Bağlanmak için önce oturum şifresini kaydedin.</p>}

        {/* Destek: talep sistemi varsayılan tarayıcıda açılır (pencere dış adresleri tarayıcıya yönlendirir). */}
        <div className="mt-2 flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <LifeBuoy className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Yardım mı gerekiyor?</div>
          </div>
          <Button variant="outline" onClick={() => setTalepAcik(true)}>
            <LifeBuoy /> Yardım talebi
          </Button>
        </div>

      </div>
      </div>
      </main>
      )}

      <IkiAcPenceresi acik={ikiAc} onKapat={() => setIkiAc(false)} setDurum={setDurum} kullanici={kayit.kullanici} />
      <KodPenceresi
        acik={kodIstek !== null}
        onKapat={() => setKodIstek(null)}
        baslik={kodIstek === "kapat" ? "İki adımlı doğrulamayı kapat" : kodIstek === "sifre" ? "Şifreyi kaydet" : "Doğrulama kodu"}
        aciklama="Telefonunuzdaki doğrulama uygulamasında görünen 6 haneli kodu girin."
        dugme={kodIstek === "kapat" ? "Kapat" : kodIstek === "sifre" ? "Kaydet" : "Bağlan"}
        onOnay={async (kod) => {
          if (kodIstek === "baglan") setDurum(await api<Durum>("/baglan", { kod }));
          else if (kodIstek === "kapat") setDurum(await api<Durum>("/iki/kapat", { kod }));
          else if (kodIstek === "sifre") {
            setDurum(await api<Durum>("/rdp/sifre", { sifre, kod }));
            setSifre("");
          }
        }}
      />

      {/* ── Sağ: görsel (ileride başka içerik gelecek) ─────── */}
      <aside className="relative hidden w-[380px] shrink-0 overflow-hidden border-l bg-gradient-to-br from-primary/5 via-card to-primary/10 xl:block">
        <BaglantiGorseli bagli={k.terminal.erisim} />
      </aside>
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
function Kart({ ikon, baslik, deger, alt, durum, aksiyon }: { ikon: React.ReactNode; baslik: string; deger: string; alt: React.ReactNode; durum: KartDurumu; aksiyon?: React.ReactNode }) {
  const r = KART_RENK[durum];
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 [&_svg]:size-5 ${r.kutu}`}>{ikon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{baslik}</span>
          <span className={`[&_svg]:size-4 ${r.rozet}`}>
            {durum === "iyi" ? <CheckCircle2 /> : durum === "bekliyor" ? <Loader2 className="animate-spin" /> : <CircleAlert />}
          </span>
        </div>
        <div className="truncate text-[15px] leading-tight font-semibold">{deger}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{alt}</div>
        {aksiyon && <div className="mt-2.5">{aksiyon}</div>}
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
      </div>
      <div className="relative">
        <div className="text-lg font-semibold">{bagli ? "Pusula'ya bağlantı hazır" : "Pusula'ya güvenli bağlantı"}</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {bagli ? "VPN açık, sunucuya erişiliyor." : "VPN ile şifreli tünel kurulur, programınız Pusula sunucusunda çalışır."}
        </p>
      </div>
    </div>
  );
}


/** Orta panelin üst şeridi — başlık ortada; solda/sağda isteğe bağlı düğmeler (yardım talebi görünümü). */
function OrtaBaslik({ sol, baslik, sag }: { sol?: React.ReactNode; baslik: string; sag?: React.ReactNode }) {
  return (
    <header className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b bg-card px-6">
      <div className="flex justify-start">{sol}</div>
      <h1 className="text-base font-semibold">{baslik}</h1>
      <div className="flex justify-end">{sag}</div>
    </header>
  );
}
