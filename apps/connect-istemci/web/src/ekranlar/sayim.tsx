import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeftRight, CheckCircle2, Play, CircleAlert, Database, FolderOpen, Loader2, RefreshCw, ScanBarcode, Save, Trash2, Zap } from "lucide-react";
import { api, type Durum, type SayimDurum, type SayimSecim, type SayimTest, type SayimVeritabani } from "@/api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Bolum } from "./ayarlar";

/**
 * Sayım — Ayarlar > Sayım. Tek kart, en başta program seçimi; aynı anda yalnız biri kurulu olur
 * (istemci de zorlar: birini kurmak diğerinin bağlantı dosyasını kaldırır, dosyalar kalır):
 *   Pusula X: C:\Pusula\PusulaXSayım (RFID.xml'li kopya); veritabanını kullanıcı Pusula X giriş ekranında seçer.
 *   Eski program: C:\Pusula\PusulaSayimEski (Pusula.exe); TEK veritabanıyla açılır — veritabanı ve program
 *     (FORMID: 612 Perakende / 146 Toptan) burada seçilir, Server.xml'e yazılır; sonradan değiştirilebilir.
 * Anahtar açılınca paket indirilip kurulur, bağlantı dosyası firmanın SQL bilgisiyle (Hub) yazılır, masaüstüne
 * masaüstü kısayolu yok — sayım Connect'ten (bu kart ve sol panel) başlatılır. Kurulum arka planda sürer; ilerleme durum nabzından (Durum.sayim / sayimEski) gelir.
 */
type Tur = "pusulax" | "eski";

const TUR: Record<Tur, { baslik: string; program: string; dosya: string; aciklama: string }> = {
  pusulax: {
    baslik: "Pusula X sayımı",
    program: "Pusula X",
    dosya: "server.xml",
    aciklama: "Pusula X'in sayım kopyası bu bilgisayara kurulur; veritabanı giriş ekranında seçilir.",
  },
  eski: {
    baslik: "Pusula sayımı",
    program: "Pusula",
    dosya: "Server.xml",
    aciklama: "Pusula programının sayım kopyası; seçtiğiniz veritabanı ve programla açılır.",
  },
};

const FORMLAR = [
  { id: "612", ad: "Perakende" },
  { id: "146", ad: "Toptan" },
];
/** SQL hata metninde geçen kullanıcı adı ve sunucu adresi ekranda gösterilmez. */
function gizle(metin: string | null | undefined, t: { kullanici?: string | null; sunucu?: string | null }): string {
  let m = metin ?? "";
  const parcalar = [t.kullanici, t.sunucu, t.sunucu?.split(",")[0]].filter((x): x is string => !!x && x.length > 2);
  for (const p of parcalar) m = m.split(p).join("****");
  return m;
}

/** Bilgi tablosunda değerin yanındaki küçük düğme (Değiştir) */
function SatirDugmesi({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <Button size="sm" variant="outline" className="h-6 shrink-0 gap-1 px-2 text-xs [&_svg]:size-3" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

const formAd = (id: string | null | undefined) => FORMLAR.find((f) => f.id === id)?.ad ?? id ?? "—";

const kuruluMu = (s: SayimDurum | undefined) => !!s && (s.kurulu || s.kuruluyor);

export function SayimBolumu({ durum, setDurum }: { durum: Durum; setDurum: (d: Durum) => void }) {
  // Kurulu (ya da kurulmakta) olan program; yoksa kullanıcının seçimi
  const aktif: Tur | null = kuruluMu(durum.sayim) ? "pusulax" : kuruluMu(durum.sayimEski) ? "eski" : null;
  const [secilen, setSecilen] = useState<Tur>(aktif ?? "pusulax");
  useEffect(() => {
    if (aktif) setSecilen(aktif);
  }, [aktif]);
  const tur = aktif ?? secilen;

  const secici = aktif ? null : (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      <Label className="text-xs">Sayım hangi programla yapılacak?</Label>
      <ToggleGroup type="single" variant="outline" value={secilen} onValueChange={(v) => v && setSecilen(v as Tur)} className="w-full">
        <ToggleGroupItem value="pusulax" className="flex-1">Pusula X</ToggleGroupItem>
        <ToggleGroupItem value="eski" className="flex-1">Pusula</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );

  return (
    <SayimKarti
      key={tur}
      tur={tur}
      s={tur === "eski" ? durum.sayimEski : durum.sayim}
      durum={durum}
      setDurum={setDurum}
      secici={secici}
      onProgramDegistir={() => setSecilen(tur === "eski" ? "pusulax" : "eski")}
    />
  );
}

function SayimKarti({ tur, s, durum, setDurum, secici, onProgramDegistir }: {
  tur: Tur; s: SayimDurum | undefined; durum: Durum; setDurum: (d: Durum) => void;
  /** Program seçimi (yalnız hiçbiri kurulu değilken) */
  secici: ReactNode;
  /** Kurulu program kaldırıldı, diğerine geçilecek */
  onProgramDegistir: () => void;
}) {
  const t = TUR[tur];
  const eski = tur === "eski";
  const ikiAktif = !!durum.ikiAdim?.aktif;
  const [kod, setKod] = useState("");
  const [kodIcin, setKodIcin] = useState<null | "kur" | "guncelle">(null);
  const [bekle, setBekle] = useState<null | "kur" | "guncelle" | "test" | "kaldir" | "liste" | "baslat">(null);
  const [hata, setHata] = useState<string | null>(null);
  const [kaldirOnay, setKaldirOnay] = useState(false);
  const [degistirOnay, setDegistirOnay] = useState(false);
  const [test, setTest] = useState<SayimTest | null>(s?.test ?? null);

  // Eski program: veritabanı + program seçimi
  const [secimAcik, setSecimAcik] = useState(false);   // kurulum öncesi ya da "Değiştir" ile açılan seçim alanı
  const [vtListe, setVtListe] = useState<SayimVeritabani[] | null>(null);
  const [vt, setVt] = useState<string>(s?.secim?.veritabani ?? "");
  const [form, setForm] = useState<string>(s?.secim?.formId ?? "");

  useEffect(() => {
    if (s?.test) setTest(s.test);
  }, [s?.test]);
  useEffect(() => {
    if (s?.secim) {
      setVt(s.secim.veritabani);
      setForm(s.secim.formId);
    }
  }, [s?.secim?.veritabani, s?.secim?.formId]);

  // Kurulum sürerken durum sık yenilensin (ana nabız 5 sn; ilerleme çubuğu akıcı olsun)
  useEffect(() => {
    if (!s?.kuruluyor) return;
    const id = window.setInterval(() => {
      api<Durum>("/durum").then(setDurum).catch(() => {});
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.kuruluyor]);

  const listeyiGetir = async () => {
    setBekle("liste");
    setHata(null);
    try {
      const r = await api<{ liste: SayimVeritabani[] }>("/sayim/veritabanlari", {});
      setVtListe(r.liste);
      // Tek veritabanıysa ve seçim yoksa otomatik seç; Toptan kayıtlıysa program da ona göre önerilir
      if (r.liste.length === 1 && !vt) {
        setVt(r.liste[0].veritabani);
        if (!form) setForm(r.liste[0].prgTur === "011" ? "146" : "612");
      }
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(null);
    }
  };

  const secimNesnesi = (): SayimSecim | null => {
    if (!eski) return null;
    const v = vtListe?.find((x) => x.veritabani === vt);
    return { veritabani: vt, ad: v?.ad ?? s?.secim?.ad ?? vt, formId: form };
  };

  const calistir = async (ne: "kur" | "guncelle", k?: string) => {
    if (ikiAktif && !k) {
      setKodIcin(ne);
      return;
    }
    setBekle(ne);
    setHata(null);
    try {
      setDurum(await api<Durum>(ne === "kur" ? "/sayim/kur" : "/sayim/guncelle", { tur, kod: k ?? null, secim: secimAcik || ne === "kur" ? secimNesnesi() : null }));
      setKodIcin(null);
      setKod("");
      setSecimAcik(false);
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(null);
    }
  };

  const testEt = async () => {
    setBekle("test");
    setHata(null);
    try {
      setTest(await api<SayimTest>("/sayim/test", { tur }));
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(null);
    }
  };

  const kaldir = async (klasor: boolean) => {
    setBekle("kaldir");
    setHata(null);
    try {
      await api("/sayim/kaldir", { tur, klasor });
      setTest(null);
      setDurum(await api<Durum>("/durum"));
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(null);
      setKaldirOnay(false);
    }
  };

  const baslat = async () => {
    setBekle("baslat");
    setHata(null);
    try {
      await api("/sayim/baslat", { tur });
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      // Program kendi penceresinde açılır; düğme kısa süre meşgul görünsün (çift tıklamada iki kopya açılmasın)
      window.setTimeout(() => setBekle(null), 2500);
    }
  };

  // Programı değiştir: bu kurulum kapatılır (dosyalar kalır), seçim diğer programa geçer
  const programDegistir = async () => {
    setBekle("kaldir");
    setHata(null);
    try {
      await api("/sayim/kaldir", { tur, klasor: false });
      setDurum(await api<Durum>("/durum"));
      onProgramDegistir();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(null);
      setDegistirOnay(false);
    }
  };

  // Anahtar: Pusula X hemen kurar; eski program önce veritabanı/program seçimini açar
  const anahtar = (v: boolean) => {
    if (!v) return setKaldirOnay(true);
    if (!eski) return void calistir("kur");
    setSecimAcik(true);
    if (!vtListe) void listeyiGetir();
  };

  const acik = !!s && (s.kurulu || s.kuruluyor);
  const il = s?.ilerleme;
  const sonHata = il?.bitti && il.hata ? il.hata : null;
  const secimTam = !!vt && !!form;

  return (
    <>
      <Bolum baslik="Sayım" aciklama="Bu bilgisayarda, terminale bağlanmadan">
        {secici}
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4"><ScanBarcode /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{acik ? `${t.baslik} kurulu` : "Sayım kullanılacak"}</div>
            <div className="text-xs text-muted-foreground">
              {t.aciklama} Sayım buradan ve ana ekranın sol panelinden başlatılır.
            </div>
          </div>
          <Switch
            checked={acik || (secimAcik && !s?.kurulu)}
            disabled={!s || bekle !== null || s.kuruluyor}
            onCheckedChange={anahtar}
          />
        </div>

        {(hata || sonHata) && (
          <div className="px-4 py-3">
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{hata ?? sonHata}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Eski program: veritabanı + program seçimi (kurulum öncesi ya da Değiştir) */}
        {eski && secimAcik && !s?.kuruluyor && (
          <div className="flex flex-col gap-3 px-4 py-3">
            <div className="grid grid-cols-[1fr_160px] gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Veritabanı</Label>
                <Select value={vt} onValueChange={setVt} disabled={!vtListe}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={bekle === "liste" ? "Yükleniyor…" : vtListe?.length === 0 ? "Veritabanı bulunamadı" : "Seçin"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(vtListe ?? []).map((v) => (
                      <SelectItem key={v.veritabani} value={v.veritabani}>
                        <span className="flex w-full items-center justify-between gap-3">
                          <span>{v.ad}</span>
                          <span className="text-xs text-muted-foreground">{v.veritabani}{v.program ? ` · ${v.program}` : ""}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Program</Label>
                <Select value={form} onValueChange={setForm}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Seçin" /></SelectTrigger>
                  <SelectContent>
                    {FORMLAR.map((f) => <SelectItem key={f.id} value={f.id}>{f.ad}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {s?.kurulu ? (
                <Button size="sm" disabled={!secimTam || bekle !== null} onClick={() => void calistir("guncelle")}>
                  {bekle === "guncelle" ? <Loader2 className="animate-spin" /> : <Save />} Kaydet
                </Button>
              ) : (
                <Button size="sm" disabled={!secimTam || bekle !== null} onClick={() => void calistir("kur")}>
                  {bekle === "kur" ? <Loader2 className="animate-spin" /> : <ScanBarcode />} Kur
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => void listeyiGetir()} disabled={bekle !== null}>
                {bekle === "liste" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Listeyi yenile
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setSecimAcik(false); setVt(s?.secim?.veritabani ?? ""); setForm(s?.secim?.formId ?? ""); }}>Vazgeç</Button>
            </div>
          </div>
        )}

        {s?.guncellemeBekliyor && !kodIcin && (
          <div className="px-4 py-3">
            <Alert>
              <CircleAlert />
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>SQL bağlantı bilgisi Pusula'da değişti. İki adımlı doğrulama açık olduğu için kodla yenilenmesi gerekiyor.</span>
                <Button size="sm" onClick={() => void calistir("guncelle")}>Bilgiyi yenile</Button>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {kodIcin && (
          <div className="flex flex-wrap items-end gap-2 px-4 py-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Doğrulama kodu</Label>
              <Input value={kod} onChange={(e) => setKod(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="000000" className="w-32 tracking-widest" autoFocus />
            </div>
            <Button size="sm" disabled={kod.length !== 6 || bekle !== null} onClick={() => void calistir(kodIcin, kod)}>
              {bekle ? <Loader2 className="animate-spin" /> : null} Devam
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setKodIcin(null); setKod(""); }}>Vazgeç</Button>
            <div className="basis-full text-xs text-muted-foreground">SQL bağlantı bilgisi Pusula'dan alınacak; iki adımlı doğrulama açık olduğu için kod gerekli.</div>
          </div>
        )}

        {s?.kuruluyor && il && (
          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" /> {il.mesaj ?? "Kuruluyor…"}</span>
              <span className="tabular-nums text-muted-foreground">
                {il.hiz > 0 && `${(il.hiz / 1048576).toFixed(1)} MB/sn · `}%{il.yuzde}
              </span>
            </div>
            <Progress value={il.yuzde} />
          </div>
        )}

        {s?.kurulu && !s.kuruluyor && (
          <>
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-xs">
              <span className="text-muted-foreground">Klasör</span>
              <span className="truncate" title={s.klasor}>{s.klasor}</span>
              <span className="self-center text-muted-foreground">Sayım programı</span>
              <span className="flex items-center gap-2">
                <span className="truncate">
                  {t.program} {s.surum ?? ""}{s.paketSurum && s.surum && !s.surum.startsWith(s.paketSurum) ? ` (paket ${s.paketSurum})` : ""}
                </span>
                <SatirDugmesi onClick={() => setDegistirOnay(true)} disabled={bekle !== null}>
                  <ArrowLeftRight /> Değiştir
                </SatirDugmesi>
              </span>
              {eski && (
                <>
                  <span className="self-center text-muted-foreground">Veritabanı</span>
                  <span className="flex items-center gap-2">
                    <span className="truncate">{s.secim ? `${s.secim.ad}${s.secim.ad !== s.secim.veritabani ? ` (${s.secim.veritabani})` : ""}` : "—"}</span>
                    {!secimAcik && (
                      <SatirDugmesi onClick={() => { setSecimAcik(true); if (!vtListe) void listeyiGetir(); }} disabled={bekle !== null}>
                        <Database /> Değiştir
                      </SatirDugmesi>
                    )}
                  </span>
                  <span className="text-muted-foreground">Program</span>
                  <span>{formAd(s.secim?.formId)}</span>
                </>
              )}
              {/* SQL adresi ve kullanıcı adı ekranda gösterilmez */}
              <span className="text-muted-foreground">SQL sunucusu</span>
              <span>{s.sunucu ? "****" : "—"}</span>
              <span className="text-muted-foreground">SQL kullanıcısı</span>
              <span>{s.kullanici ? "****" : "—"}</span>
              <span className="text-muted-foreground">Resim adresi</span>
              <span className="truncate" title={s.resimYolu ?? ""}>{s.resimYolu ?? "— (veritabanındaki yol)"}</span>
              <span className="text-muted-foreground">Son bilgi güncellemesi</span>
              <span>{s.sonGuncelleme ? new Date(s.sonGuncelleme).toLocaleString("tr-TR") : s.kurulum ? new Date(s.kurulum).toLocaleString("tr-TR") : "—"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <Button size="sm" onClick={() => void baslat()} disabled={bekle !== null}>
                {bekle === "baslat" ? <Loader2 className="animate-spin" /> : <Play />} Sayımı başlat
              </Button>
              <Button size="sm" variant="outline" onClick={() => void testEt()} disabled={bekle !== null}>
                {bekle === "test" ? <Loader2 className="animate-spin" /> : <Zap />} Bağlantıyı test et
              </Button>
              <Button size="sm" variant="outline" onClick={() => void calistir("guncelle")} disabled={bekle !== null} title={`SQL bilgisini Pusula'dan yeniden al, ${t.dosya}'i yenile`}>
                {bekle === "guncelle" && !secimAcik ? <Loader2 className="animate-spin" /> : <RefreshCw />} Bilgiyi yenile
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void api("/sayim/klasor", { tur }).catch((e) => setHata((e as Error).message))} title="Klasörü aç">
                <FolderOpen /> Klasör
              </Button>
            </div>
          </>
        )}
      </Bolum>

      {s?.kurulu && test && (
        <Bolum baslik={`SQL bağlantı testi — ${t.program}`} aciklama={new Date(test.zaman).toLocaleString("tr-TR")}>
          <div className="flex items-start gap-3 px-4 py-3">
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4 ${test.ok ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-destructive/15 text-destructive"}`}>
              {test.ok ? <CheckCircle2 /> : <CircleAlert />}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              {test.ok ? (
                <>
                  <div className="font-medium">Bağlandı <span className="text-xs font-normal text-muted-foreground">· {test.sureMs} ms{test.sqlSurum ? ` · SQL ${test.sqlSurum}` : ""}</span></div>
                </>
              ) : (
                <>
                  <div className="font-medium">Bağlanamadı</div>
                  <div className="mt-1 text-xs break-words text-destructive">{gizle(test.hata, test)}</div>
                </>
              )}
            </div>
          </div>
          {test.ok && (
            <div className="px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Database className="size-3.5" />
                {eski ? "Program bu veritabanıyla açılacak" : `${test.veritabanlari?.length ?? 0} veritabanı`}
              </div>
              {test.veritabanlari && test.veritabanlari.length > 0 ? (
                <ul className="divide-y rounded-lg border text-sm">
                  {test.veritabanlari.map((v, i) => (
                    <li key={i} className="px-3 py-1.5">{v.ad}</li>
                  ))}
                </ul>
              ) : (
                <Alert>
                  <CircleAlert />
                  <AlertDescription>
                    Bağlantı kuruldu ama bu firma için veritabanı görünmüyor. {t.program} giriş ekranı da boş gelir — Pusula'ya bildirin.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </Bolum>
      )}

      <AlertDialog open={degistirOnay} onOpenChange={(o) => !o && setDegistirOnay(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sayım programı değiştirilsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Aynı anda tek sayım programı kullanılır. {t.baslik} kapatılır: bağlantı bilgisi ({t.dosya}) silinir,
              dosyaları diskte kalır. Ardından {tur === "eski" ? "Pusula X" : "Pusula"} sayımını kurabilirsiniz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction disabled={bekle !== null} onClick={(e) => { e.preventDefault(); void programDegistir(); }}>
              {bekle === "kaldir" ? <Loader2 className="animate-spin" /> : <ArrowLeftRight />} Değiştir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={kaldirOnay} onOpenChange={(o) => !o && setKaldirOnay(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.baslik} kapatılsın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              Bağlantı bilgisi ({t.dosya}) silinir.
              Program kopyası ({s?.klasor}) diskte kalabilir — yeniden açınca indirme gerekmez — ya da tamamen silinebilir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <Button variant="outline" disabled={bekle !== null} onClick={() => void kaldir(false)}>Kapat, dosyalar kalsın</Button>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" disabled={bekle !== null} onClick={(e) => { e.preventDefault(); void kaldir(true); }}>
              {bekle === "kaldir" ? <Loader2 className="animate-spin" /> : <Trash2 />} Kapat ve sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
