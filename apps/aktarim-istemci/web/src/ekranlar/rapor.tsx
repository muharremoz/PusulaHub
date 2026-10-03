import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Building2, CheckCircle2, Database, FileArchive, FileCode2, FolderOpen, FolderPlus, Image, Info, Loader2, Minimize2, Plus,
  ListChecks, RefreshCw, ScanSearch, Search, Server, Unplug, X, XCircle,
} from "lucide-react";
import { api, type Durum, type KesifRaporu, type Veritabani } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { boyutMetni, useDosyaSecici, type Secilen } from "./dosya-secici";
import { ResimKucultmeEkrani } from "./resim-kucult";
import { Ipucu, mb, ParlayanLogo } from "./ortak";

type P = { durum: Durum; setDurum: (d: Durum) => void };

const TUR_ETIKET: Record<Veritabani["tur"], string> = {
  firma: "Firma datası",
  transfer: "Transfer datası",
  diger: "Tanımsız",
  sirket: "Şirket tanımları",
};

const VT_SAYFA = 10;
/** Seçili filtre / program düğmesi: ana renk (mavi) dolgu. */
const FILTRE_ACIK = "data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";
const KLASOR_SAYFA = 10;
const GRUPLAR: Veritabani["tur"][] = ["firma", "transfer", "diger", "sirket"];

/**
 * Eski yıl datası mı: son cari hareketi (CarHrk.CariTrh) bu yıldan önce ve 60 günden eski.
 * 60 gün: Ocak-Şubat'ta güncel data hâlâ geçen yılın tarihini taşıyabilir. Tarih yoksa güncel sayılır.
 */
const ESKI_GUN = 60;
function eskiYilMi(v: Veritabani): boolean {
  if (!v.sonHareket) return false;
  const t = new Date(v.sonHareket);
  const simdi = new Date();
  return t.getFullYear() < simdi.getFullYear() && simdi.getTime() - t.getTime() > ESKI_GUN * 86400000;
}
const tarih = (s?: string | null) => (s ? new Date(s).toLocaleDateString("tr") : "—");

type ResimSecimi = { yol: string; secili: boolean; altKlasor: string };
type ProgramSecimi = { yol: string; secili: boolean; program: string };
/** Eski aktarımdaki (v1) alan: program seç, exe ve parametre dosyasını tek tek seç. */
type ProgramDosyasi = { id: number; program: string; exe: string | null; param: string | null };
type Katalog = NonNullable<Durum["oturum"]>["programlar"];

/** Varsayılan hedef alt klasör: en çok şirketin kullandığı kök ("" = Resimler\{firma}), diğerleri kendi adıyla. */
function resimVarsayilan(r: KesifRaporu): ResimSecimi[] {
  const sirali = [...r.resimKlasorleri].sort((a, b) => b.kullananlar.length - a.kullananlar.length);
  return sirali.map((k, i) => {
    const parca = k.yol.split(/[\\/]/).filter(Boolean);
    const son = parca[parca.length - 1] ?? "";
    const ad = /^resim(ler)?$/i.test(son) && parca.length > 1 ? parca[parca.length - 2] : son;
    return { yol: k.yol, secili: k.var && k.dosyaSayisi > 0, altKlasor: i === 0 ? "" : ad };
  });
}

/** Program klasörünü katalogdaki programa exe adından eşle — varsayılan SEÇİLİ DEĞİL (kullanıcı bilerek seçer). */
function programVarsayilan(r: KesifRaporu, katalog: Katalog): ProgramSecimi[] {
  return r.programKlasorleri.map((p) => {
    const eslesen = katalog.find((k) => k.exeName && p.exeler.some((e) => e.toLowerCase() === k.exeName!.toLowerCase()));
    return { yol: p.yol, secili: false, program: eslesen?.name ?? "" };
  });
}

const dosyaAdi = (yol: string) => yol.split(/[\\/]/).pop() ?? yol;
/** Bulunduğu klasör; kökteki dosyada "D:\\" (yalnız "D:" değil). */
const klasorAdi = (yol: string) => {
  const k = yol.split(/[\\/]/).slice(0, -1).join("\\");
  return /^[A-Za-z]:$/.test(k) ? k + "\\" : k;
};

type Onay = { baslik: string; mesaj: React.ReactNode; uygula: () => void };

/** Keşif sonucu + aktarılacakların seçimi. Alanlar sekmelerde. */
export function RaporEkrani({ durum, setDurum }: P) {
  const r = durum.kesif;
  const oturum = durum.oturum;
  // Tarama ana ekrandan: henüz yapılmadıysa ortada "Taramayı başlat", sürerken ilerleme (ayrı ekran yok)
  const taraniyor = durum.asama === "kesif";
  const taramaYok = !r && !taraniyor;
  const hedef = oturum?.hedefler ?? { sql: true, depo: true, rdp: true };
  const katalog: Katalog = oturum?.programlar ?? [];

  const [bekle, setBekle] = useState(false);
  const [secili, setSecili] = useState<Set<string>>(
    () => new Set((r?.veritabanlari ?? []).filter((v) => (v.tur === "firma" || v.tur === "transfer") && v.durum === "ONLINE").map((v) => v.ad)),
  );
  // Varsayılan: son cari hareketi eski yılda kalanlar "Eski yıl" (bkz. eskiYilMi).
  const [eskiYil, setEskiYil] = useState<Set<string>>(() => new Set((r?.veritabanlari ?? []).filter(eskiYilMi).map((v) => v.ad)));
  // "Yeniden tara" yeni rapor getirince varsayılanlar yeni tarihlere göre yeniden kurulur.
  useEffect(() => {
    setEskiYil(new Set((r?.veritabanlari ?? []).filter(eskiYilMi).map((v) => v.ad)));
  }, [r]);
  const [resimler, setResimler] = useState<ResimSecimi[]>(() => (r ? resimVarsayilan(r) : []));
  // Elle eklenen resim klasörleri (SQL'siz aktarım ya da şirket tanımında olmayan klasör)
  const [ekResimKlasorleri, setEkResimKlasorleri] = useState<KesifRaporu["resimKlasorleri"]>([]);
  const resimKlasorleri = useMemo(() => [...(r?.resimKlasorleri ?? []), ...ekResimKlasorleri], [r, ekResimKlasorleri]);
  const resimKlasoruEkle = async () => {
    const [{ yol } = { yol: "" }] = await dosyaSor({ baslik: "Resim klasörü", aciklama: "Resimlerin bulunduğu klasörü açın veya işaretleyin.", mod: "klasor" });
    if (!yol || resimKlasorleri.some((x) => x.yol.toLowerCase() === yol.toLowerCase())) return;
    const k = await api<KesifRaporu["resimKlasorleri"][number]>("/resim/klasor", { yol });
    setEkResimKlasorleri((l) => [...l, k]);
    const parca = yol.split(/[\\/]/).filter(Boolean);
    const son = parca[parca.length - 1] ?? "";
    const ad = /^resim(ler)?$/i.test(son) && parca.length > 1 ? parca[parca.length - 2] : son;
    // İlk resim klasörü ana klasöre (Resimler\{firma}), sonrakiler kendi adıyla
    setResimler((l) => [...l, { yol: k.yol, secili: k.var && k.dosyaSayisi > 0, altKlasor: l.length === 0 ? "" : ad }]);
  };
  const [programlar, setProgramlar] = useState<ProgramSecimi[]>(() => (r ? programVarsayilan(r, katalog) : []));
  const [programDosyalari, setProgramDosyalari] = useState<ProgramDosyasi[]>([]);
  const [eskiDosyalar, setEskiDosyalar] = useState<Secilen[]>([]);
  // boyut undefined = exe hesaplıyor (büyük klasörde birkaç saniye sürebilir).
  const [ekKlasorler, setEkKlasorler] = useState<{ yol: string; boyut?: number | null; dosyaSayisi?: number }[]>([]);
  const [veritabanlariAyir, setVeritabanlariAyir] = useState(false);
  const [basliyor, setBasliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [arama, setArama] = useState("");
  const [turFiltre, setTurFiltre] = useState<"hepsi" | Veritabani["tur"]>("hepsi");
  const [vtSayfa, setVtSayfa] = useState(1);
  const [resimSayfa, setResimSayfa] = useState(1);
  const [programSayfa, setProgramSayfa] = useState(1);
  const [onay, setOnay] = useState<Onay | null>(null);
  const [dosyaSor, dosyaSecici] = useDosyaSecici();
  // Resim küçültme aracı ayrı ekran; rapordaki seçimler bu bileşende kaldığı için geri dönünce kaybolmaz.
  const [kucultme, setKucultme] = useState(false);

  const toplamMb = useMemo(
    () => (r?.veritabanlari ?? []).filter((v) => secili.has(v.ad)).reduce((t, v) => t + v.veriMb, 0),
    [r, secili],
  );
  const resimSayisi = resimler.filter((x) => x.secili).length;
  const programSayisi = programlar.filter((x) => x.secili).length;
  const programDosyaSayisi = programDosyalari.filter((x) => x.exe || x.param).length;
  const bosSecim = secili.size + resimSayisi + programSayisi + programDosyaSayisi + eskiDosyalar.length + ekKlasorler.length === 0;
  const programEksik =
    programlar.some((x) => x.secili && !x.program) || programDosyalari.some((x) => (x.exe || x.param) && !x.program);

  const setDegistir = (s: Set<string>, ad: string, acik: boolean) => {
    const y = new Set(s);
    if (acik) y.add(ad);
    else y.delete(ad);
    return y;
  };

  const yenile = async () => {
    setBekle(true);
    try {
      setDurum(await api<Durum>("/kesif/yenile", {}));
    } finally {
      setBekle(false);
    }
  };

  const dosyaEkle = async () => {
    const yeni = await dosyaSor({
      baslik: "Eski yıl dosyaları",
      mod: "dosya",
      coklu: true,
      uzantilar: [".mdf", ".ldf", ".ndf", ".bak", ".zip", ".rar", ".7z"],
    });
    setEskiDosyalar((s) => [...s, ...yeni.filter((y) => !s.some((x) => x.yol === y.yol))]);
  };
  const klasorEkle = async () => {
    const [{ yol } = { yol: "" }] = await dosyaSor({ baslik: "Ek klasör", aciklama: "Göndermek istediğiniz klasörü açın veya işaretleyin.", mod: "klasor" });
    if (!yol || ekKlasorler.some((x) => x.yol === yol)) return;
    setEkKlasorler((s) => [...s, { yol }]);
    try {
      const b = await api<{ boyut: number; dosyaSayisi: number; eksik: boolean }>("/dosya/boyut", { yol });
      setEkKlasorler((s) => s.map((x) => (x.yol === yol ? { ...x, boyut: b.boyut, dosyaSayisi: b.dosyaSayisi } : x)));
    } catch {
      setEkKlasorler((s) => s.map((x) => (x.yol === yol ? { ...x, boyut: null } : x)));
    }
  };
  const programDosyasiSec = async (id: number, tur: "exe" | "param") => {
    const yollar = await dosyaSor(
      tur === "exe"
        ? { baslik: "Program dosyası", mod: "dosya", uzantilar: [".exe"] }
        : { baslik: "Parametre dosyası", mod: "dosya", uzantilar: [".txt"] },
    );
    if (!yollar[0]) return;
    setProgramDosyalari((l) => l.map((x) => (x.id === id ? { ...x, [tur]: yollar[0].yol } : x)));
  };
  const programDosyasiEkle = () =>
    setProgramDosyalari((l) => [...l, { id: Date.now(), program: katalog.length === 1 ? katalog[0].name : "", exe: null, param: null }]);

  const baslat = async () => {
    setBasliyor(true);
    setHata(null);
    try {
      setDurum(
        await api<Durum>("/aktarim/baslat", {
          veritabanlari: [...secili].map((ad) => ({ ad, eski: eskiYil.has(ad) })),
          resimler: resimler.filter((x) => x.secili).map((x) => ({ yol: x.yol, altKlasor: x.altKlasor })),
          eskiDosyalar: eskiDosyalar.map((x) => x.yol),
          programlar: programlar.filter((x) => x.secili).map((x) => ({ yol: x.yol, program: x.program })),
          programDosyalari: programDosyalari.filter((x) => x.exe || x.param).map((x) => ({ program: x.program, exe: x.exe, param: x.param })),
          ekKlasorler: ekKlasorler.map((x) => x.yol),
          veritabanlariAyir: veritabanlariAyir && secili.size > 0,
        }),
      );
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBasliyor(false);
    }
  };

  // Filtre (ad / şirket / kod + tür) → tür sırasına diz → sayfala.
  // Virgülle birden çok terim: herhangi biri tutan satır listelenir ("6572, 65723, 6574").
  // Kod birebir eşleşir (6572 yazınca 65723 gelmesin); ad ve şirket içinde aranır.
  const filtreli = useMemo(() => {
    const terimler = arama.split(",").map((x) => x.trim().toLocaleLowerCase("tr")).filter(Boolean);
    const tutar = (v: Veritabani, q: string) =>
      (v.kod ?? "").trim().toLocaleLowerCase("tr") === q ||
      v.ad.toLocaleLowerCase("tr").includes(q) ||
      v.sirketAdlari.some((x) => x.toLocaleLowerCase("tr").includes(q));
    const l = (r?.veritabanlari ?? []).filter((v) => {
      if (turFiltre !== "hepsi" && v.tur !== turFiltre) return false;
      if (terimler.length && !terimler.some((q) => tutar(v, q))) return false;
      return true;
    });
    return GRUPLAR.flatMap((g) => l.filter((v) => v.tur === g));
  }, [r, arama, turFiltre]);
  const vtSayfaSayisi = Math.max(1, Math.ceil(filtreli.length / VT_SAYFA));
  const vtSayfaGecerli = Math.min(vtSayfa, vtSayfaSayisi);
  const sayfadakiler = filtreli.slice((vtSayfaGecerli - 1) * VT_SAYFA, vtSayfaGecerli * VT_SAYFA);
  const secilebilir = filtreli.filter((v) => v.durum === "ONLINE");
  const filtreliSeciliSayisi = secilebilir.filter((v) => secili.has(v.ad)).length;
  const hepsiSecili = secilebilir.length > 0 && filtreliSeciliSayisi === secilebilir.length;
  const tumunuSec = (acik: boolean) =>
    setSecili((s) => {
      const y = new Set(s);
      for (const v of secilebilir) {
        if (acik) y.add(v.ad);
        else y.delete(v.ad);
      }
      return y;
    });

  /** Tek satır Güncel / Eski yıl. Eski yıl datası (tarihe göre) "Güncel" yapılırsa önce sorulur. */
  const satirAktarimi = (v: Veritabani, d: "guncel" | "eski") => {
    const uygula = () => {
      setSecili((s) => setDegistir(s, v.ad, true));
      setEskiYil((s) => setDegistir(s, v.ad, d === "eski"));
    };
    if (d === "guncel" && eskiYilMi(v)) {
      setOnay({
        baslik: "Eski yıl datası güncel olarak aktarılsın mı?",
        mesaj: (
          <>
            <span className="font-mono">{v.ad}</span> veritabanının son cari hareketi <b>{tarih(v.sonHareket)}</b>. Güncel olarak
            işaretlerseniz Pusula'da kurulacak veriler arasına girer.
          </>
        ),
        uygula,
      });
    } else uygula();
  };

  // Toplu: filtreye uyan ve seçili olanların hepsi güncel / eski yıl. Aralarında eski yıl datası varsa "Güncel" sorulur.
  const topluEskiYil = (eski: boolean) => {
    const hedefler = secilebilir.filter((v) => secili.has(v.ad));
    const uygula = () =>
      setEskiYil((s) => {
        const y = new Set(s);
        for (const v of hedefler) {
          if (eski) y.add(v.ad);
          else y.delete(v.ad);
        }
        return y;
      });
    const eskiler = hedefler.filter(eskiYilMi);
    if (!eski && eskiler.length > 0) {
      setOnay({
        baslik: "Eski yıl dataları güncel olarak aktarılsın mı?",
        mesaj: (
          <>
            Seçilenlerden <b>{eskiler.length}</b> veritabanının son cari hareketi eski yılda
            ({eskiler.slice(0, 5).map((v) => v.ad).join(", ")}{eskiler.length > 5 ? "…" : ""}). Hepsi güncel olarak işaretlenecek.
          </>
        ),
        uygula,
      });
    } else uygula();
  };
  const eskiSayisi = [...eskiYil].filter((ad) => secili.has(ad)).length;

  const resimSayfaSayisi = Math.max(1, Math.ceil(resimler.length / KLASOR_SAYFA));
  const resimSayfaGecerli = Math.min(resimSayfa, resimSayfaSayisi);
  const resimBas = (resimSayfaGecerli - 1) * KLASOR_SAYFA;
  const programSayfaSayisi = Math.max(1, Math.ceil(programlar.length / KLASOR_SAYFA));
  const programSayfaGecerli = Math.min(programSayfa, programSayfaSayisi);
  const programBas = (programSayfaGecerli - 1) * KLASOR_SAYFA;
  const resimSecilebilir = (yol: string) => {
    const k = resimKlasorleri.find((x) => x.yol === yol);
    return !!k && k.var && k.dosyaSayisi > 0;
  };
  const resimHepsiSecili = resimler.filter((x) => resimSecilebilir(x.yol)).every((x) => x.secili);
  // v1'deki gibi: seçili resim klasörlerinde 500 KB üzeri dosya → sıkıştırma önerisi.
  const buyukResim = resimler
    .filter((x) => x.secili)
    .map((x) => resimKlasorleri.find((k) => k.yol === x.yol))
    .reduce((t, k) => ({ adet: t.adet + (k?.buyukDosya ?? 0), mb: t.mb + (k?.buyukMb ?? 0) }), { adet: 0, mb: 0 });
  const programHepsiSecili = programlar.length > 0 && programlar.every((x) => x.secili);

  const programSecici = (deger: string, onDeger: (v: string) => void) =>
    katalog.length === 0 ? (
      <span className="text-xs text-muted-foreground">Katalog boş</span>
    ) : (
      <ToggleGroup type="single" size="sm" variant="outline" className="flex-wrap justify-start" value={deger} onValueChange={(v) => v && onDeger(v)}>
        {katalog.map((k) => (
          <ToggleGroupItem key={k.name} value={k.name} className={"px-2 text-xs " + FILTRE_ACIK}>{k.name}</ToggleGroupItem>
        ))}
      </ToggleGroup>
    );

  if (kucultme)
    return (
      <ResimKucultmeEkrani
        rapor={r}
        onGeri={(degisti) => {
          setKucultme(false);
          // Küçültülen klasörlerin boyutları değişti → tarama yenilensin.
          if (degisti) void yenile();
        }}
      />
    );

  return (
    <div className="flex h-svh bg-muted/40">
      {/* Sol panel: firma, SQL Server, Pusula'nın notu, rapor durumu ve eylemler (eskiden üst şeritteydi) */}
      <aside className="flex w-72 shrink-0 flex-col border-r bg-card">
        {/* Connect'in sol paneliyle aynı: 64 px sabit alan, ortalı parlayan logo */}
        <div className="flex h-16 shrink-0 items-center justify-center border-b px-5">
          <ParlayanLogo />
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              <Building2 className="size-3.5" /> Firma
            </div>
            <dl className="flex flex-col gap-2 text-sm">
              <PanelBilgi ad="Firma no" deger={oturum?.firmaId ?? "—"} />
              <PanelBilgi ad="Firma adı" deger={oturum?.firmaAdi ?? "—"} sar />
            </dl>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              <Server className="size-3.5" /> SQL Server
            </div>
            {durum.sql || r?.sql ? (
              <dl className="flex flex-col gap-2 text-sm">
                <PanelBilgi ad="Sunucu" deger={r?.sql?.sunucu ?? durum.sql?.sunucu ?? "—"} mono />
                {r?.sql && <PanelBilgi ad="Bilgisayar" deger={r.sql.makineAdi + (r.sql.yerel ? "" : " (uzak)")} />}
                {r?.sql && <PanelBilgi ad="Bağlantı" deger={r.sql.kaynak === "windows" ? "Windows oturumu" : r.sql.kaynak} />}
              </dl>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <span className="flex items-start gap-2 text-muted-foreground">
                  <Unplug className="mt-0.5 size-4 shrink-0" /> Bağlanılmadı — yalnız resim, program ve dosya aktarılır.
                </span>
                <Button variant="outline" size="sm" className="self-start" disabled={bekle || taraniyor} onClick={() => void api<Durum>("/sql/giris", {}).then(setDurum).catch((e) => setHata((e as Error).message))}>
                  <Database /> SQL Server'a bağlan
                </Button>
              </div>
            )}
          </div>


          {durum.kesifGonderildi && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 shrink-0" /> Rapor Pusula'ya iletildi
            </div>
          )}

          {/* Not: panelin altına sabit (eylem düğmelerinin hemen üstü) */}
          {oturum?.notlar && (
            <div className="mt-auto flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                <Info className="size-3.5" /> Not
              </div>
              <p className="rounded-lg bg-muted px-3 py-2.5 text-sm">{oturum.notlar}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t px-5 py-4">
          {r && (
            <Button variant="outline" className="justify-start" disabled={bekle || taraniyor} onClick={() => void yenile()}>
              {bekle || taraniyor ? <Loader2 className="animate-spin" /> : <RefreshCw />} {taraniyor ? "Taranıyor…" : "Yeniden tara"}
            </Button>
          )}
          <Button variant="outline" className="justify-start" onClick={() => setKucultme(true)}>
            <Minimize2 /> Resim küçült
          </Button>
        </div>
      </aside>

      {/* Sağ sütun: içerik kayar, aktarım çubuğu altta sabit */}
      <div className="flex min-w-0 flex-1 flex-col">
      <main className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        {durum.kesifHatasi && (
          <Alert variant="destructive">
            <XCircle />
            <AlertDescription>{durum.kesifHatasi}</AlertDescription>
          </Alert>
        )}
        {r?.uyarilar.map((u, i) => (
          <Alert key={i}>
            <AlertTriangle />
            <AlertDescription>{u}</AlertDescription>
          </Alert>
        ))}

        {(taramaYok || taraniyor) && (
          <TaramaKarti
            durum={durum}
            taraniyor={taraniyor}
            bekle={bekle}
            onTara={() => void yenile()}
            onSql={() => void api<Durum>("/sql/giris", {}).then(setDurum).catch((e) => setHata((e as Error).message))}
          />
        )}

        {r && !taraniyor && (
          <>

            <Tabs defaultValue={r.sql ? "vt" : hedef.depo ? "resim" : "program"} className="gap-3">
              <TabsList className="p-1 group-data-horizontal/tabs:h-11">
                {r.sql && <TabsTrigger value="vt" className={"px-4 text-sm [&_svg]:size-4 " + RENK.blue.sekme}><Database /> Veritabanları</TabsTrigger>}
                {hedef.depo && <TabsTrigger value="resim" className={"px-4 text-sm [&_svg]:size-4 " + RENK.violet.sekme}><Image /> Resimler</TabsTrigger>}
                {hedef.depo && <TabsTrigger value="eski" className={"px-4 text-sm [&_svg]:size-4 " + RENK.amber.sekme}><FileArchive /> Eski yıl dosyaları</TabsTrigger>}
                {hedef.rdp && <TabsTrigger value="program" className={"px-4 text-sm [&_svg]:size-4 " + RENK.emerald.sekme}><FolderOpen /> Programlar</TabsTrigger>}
                {hedef.rdp && <TabsTrigger value="ek" className={"px-4 text-sm [&_svg]:size-4 " + RENK.cyan.sekme}><FolderPlus /> Ek klasörler</TabsTrigger>}
              </TabsList>

              {/* ── Veritabanları ───────────────────────────────────── */}
              {r.sql && (
              <TabsContent value="vt">
                <Bolum
                  ikon={<Database className="size-4" />}
                  renk="blue"
                  baslik="Veritabanları"
                  sag={`${r.veritabanlari.length} veritabanı · ${mb(r.veritabanlari.reduce((t, v) => t + v.veriMb, 0))}`}
                >
                  <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
                    <div className="relative min-w-48 flex-1">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={arama}
                        onChange={(e) => {
                          setArama(e.target.value);
                          setVtSayfa(1);
                        }}
                        placeholder="Veritabanı, şirket ya da kod ara… (virgülle birden çok)"
                        className="h-8 pl-8 text-sm"
                      />
                    </div>
                    <ToggleGroup
                      type="single"
                      size="sm"
                      variant="outline"
                      value={turFiltre}
                      onValueChange={(v) => {
                        if (!v) return;
                        setTurFiltre(v as typeof turFiltre);
                        setVtSayfa(1);
                      }}
                    >
                      <ToggleGroupItem value="hepsi" className={"px-2 text-xs " + FILTRE_ACIK}>Tümü</ToggleGroupItem>
                      {GRUPLAR.filter((g) => r.veritabanlari.some((v) => v.tur === g)).map((g) => (
                        <ToggleGroupItem key={g} value={g} className={"px-2 text-xs " + FILTRE_ACIK}>{TUR_ETIKET[g]}</ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="text-[10px] uppercase tracking-wider">
                        <TableHead className="w-10 pl-4">
                          <Ipucu metin="Listelenenlerin (filtreye uyan) tümünü seç / kaldır">
                            <Checkbox
                              checked={hepsiSecili ? true : filtreliSeciliSayisi > 0 ? "indeterminate" : false}
                              disabled={secilebilir.length === 0}
                              onCheckedChange={(c) => tumunuSec(c === true)}
                              aria-label="Listelenenlerin tümünü seç"
                            />
                          </Ipucu>
                        </TableHead>
                        <TableHead className="px-4">Veritabanı</TableHead>
                        <TableHead className="px-4">Şirket</TableHead>
                        <TableHead className="px-4">Kod</TableHead>
                        <TableHead className="px-4">Program</TableHead>
                        <TableHead className="px-4 text-right">Veri</TableHead>
                        <TableHead className="px-4">Son hareket</TableHead>
                        <TableHead className="px-4">Son yedek</TableHead>
                        {hedef.depo && <TableHead className="px-4">Aktarım</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtreli.length === 0 && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={9} className="px-4 py-6 text-center text-sm text-muted-foreground">
                            Aramaya uyan veritabanı yok.
                          </TableCell>
                        </TableRow>
                      )}
                      {sayfadakiler.map((v) => (
                        <TableRow key={v.ad} data-state={secili.has(v.ad) ? "selected" : undefined}>
                          <TableCell className="pl-4">
                            <Checkbox
                              checked={secili.has(v.ad)}
                              disabled={v.durum !== "ONLINE"}
                              onCheckedChange={(c) => setSecili((s) => setDegistir(s, v.ad, c === true))}
                              aria-label={v.ad + " aktarılsın"}
                            />
                          </TableCell>
                          <TableCell className="px-4 font-mono">
                            {v.ad}
                            {v.durum !== "ONLINE" && <Badge variant="outline" className="ml-2">{v.durum}</Badge>}
                          </TableCell>
                          <TableCell className="px-4">{v.sirketAdlari.join(", ") || "—"}</TableCell>
                          <TableCell className="px-4 font-mono tabular-nums">{v.kod ?? "—"}</TableCell>
                          <TableCell className="px-4">
                            {v.prgTur === "909" ? (
                              <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">Perakende</span>
                            ) : v.prgTur === "011" ? (
                              <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">Toptan</span>
                            ) : (
                              <span className="text-muted-foreground">{v.prgTur ?? "—"}</span>
                            )}
                          </TableCell>
                          <TableCell className="px-4 text-right tabular-nums">{mb(v.veriMb)}</TableCell>
                          <TableCell className={"px-4 tabular-nums " + (eskiYilMi(v) ? "text-foreground" : "text-muted-foreground")}>
                            <Ipucu metin={v.sonHareket ? "Son cari hareket (CarHrk)" + (eskiYilMi(v) ? " — eski yıl datası" : "") : "CarHrk tablosu yok veya okunamadı"}>
                              <span>{tarih(v.sonHareket)}</span>
                            </Ipucu>
                          </TableCell>
                          <TableCell className="px-4 text-muted-foreground">{tarih(v.sonYedek)}</TableCell>
                          {hedef.depo && (
                            <TableCell className="px-4">
                              {/* Her zaman görünür; seçili değilse soluk. Birine basmak satırı da seçer. */}
                              <ToggleGroup
                                type="single"
                                size="sm"
                                variant="outline"
                                disabled={v.durum !== "ONLINE"}
                                className={secili.has(v.ad) ? "" : "opacity-50 hover:opacity-100"}
                                value={secili.has(v.ad) ? (eskiYil.has(v.ad) ? "eski" : "guncel") : ""}
                                onValueChange={(d) => d && satirAktarimi(v, d as "guncel" | "eski")}
                              >
                                <ToggleGroupItem value="guncel" className="px-2 text-xs data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Güncel</ToggleGroupItem>
                                <ToggleGroupItem value="eski" className="px-2 text-xs data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Eski yıl</ToggleGroupItem>
                              </ToggleGroup>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Sayfalama
                    sayfa={vtSayfaGecerli}
                    sayfaSayisi={vtSayfaSayisi}
                    onSayfa={setVtSayfa}
                    bilgi={`${(vtSayfaGecerli - 1) * VT_SAYFA + 1}–${Math.min(vtSayfaGecerli * VT_SAYFA, filtreli.length)} / ${filtreli.length} · ${secili.size} seçili`}
                  />
                  {hedef.depo && (
                    <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
                      <span className="min-w-0 flex-1">
                        "Eski yıl" işaretlenenler kurulmaz, Pusula'da arşivde saklanır.
                        {eskiSayisi > 0 && <span className="ml-1 font-medium text-foreground">{eskiSayisi} eski yıl seçili.</span>}
                      </span>
                      <span>Seçilenleri ({filtreliSeciliSayisi}):</span>
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={filtreliSeciliSayisi === 0} onClick={() => topluEskiYil(false)}>
                        Güncel yap
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={filtreliSeciliSayisi === 0} onClick={() => topluEskiYil(true)}>
                        Eski yıl yap
                      </Button>
                    </div>
                  )}
                  <label className="flex cursor-pointer items-start gap-3 border-t px-4 py-3 text-sm">
                    <Checkbox className="mt-0.5" checked={veritabanlariAyir} onCheckedChange={(c) => setVeritabanlariAyir(c === true)} />
                    <span>
                      <span className="font-medium">Aktarım bitince veritabanlarını bu SQL Server'dan ayır (detach)</span>
                      <span className="block text-xs text-muted-foreground">
                        Pusula aktarımı tamamladıktan sonra aktarılan veritabanları ayrılır; programınız artık bu verilere bağlanamaz.
                        Veri dosyaları (.mdf/.ldf) silinmez, gerekirse yeniden bağlanabilir.
                      </span>
                    </span>
                  </label>
                </Bolum>
              </TabsContent>
              )}

              {/* ── Resimler ───────────────────────────────────────── */}
              {hedef.depo && (
                <TabsContent value="resim">
                  <Bolum
                    ikon={<Image className="size-4" />}
                    renk="violet"
                    baslik="Resim klasörleri"
                    sag={`${resimler.length} klasör · ${resimSayisi} seçili`}
                    aksiyon={<Button variant="outline" size="sm" onClick={() => void resimKlasoruEkle().catch((e) => setHata(e.message))}><Plus /> Klasör ekle</Button>}
                  >
                    {buyukResim.adet > 0 && (
                      <div className="flex items-start gap-2 border-b bg-muted px-4 py-2.5 text-sm text-foreground">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span>
                          <b>{buyukResim.adet.toLocaleString("tr")}</b> adet resim 500 KB'tan büyük (toplam {mb(buyukResim.mb)}). Yükleme öncesi
                          <b> Resim küçült</b> aracıyla sıkıştırmanızı öneririz — yükleme süresi azalır, depolama tasarrufu sağlanır. Küçültülmüş
                          yüksek çözünürlüklü resimler 500 KB üzerinde kalabilir; bu normaldir.
                        </span>
                      </div>
                    )}
                    {resimler.length === 0 ? (
                      <Bos>{r.sql ? "Şirket tanımlarında resim klasörü yok. Başka bir klasör varsa ekleyin." : "Aktarılacak resim klasörünü ekleyin."}</Bos>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="text-[10px] uppercase tracking-wider">
                            <TableHead className="w-10 pl-4">
                              <Checkbox
                                checked={resimHepsiSecili ? true : resimSayisi > 0 ? "indeterminate" : false}
                                onCheckedChange={(c) => setResimler((l) => l.map((x) => (resimSecilebilir(x.yol) ? { ...x, secili: c === true } : x)))}
                                aria-label="Tüm resim klasörlerini seç"
                              />
                            </TableHead>
                            <TableHead className="px-4">Klasör</TableHead>
                            <TableHead className="px-4">Kullanan şirketler</TableHead>
                            <TableHead className="px-4 text-right">Dosya</TableHead>
                            <TableHead className="px-4 text-right">Boyut</TableHead>
                            <TableHead className="px-4 text-right">500 KB üzeri</TableHead>
                            <TableHead className="px-4">{`Hedef: Resimler\\${oturum?.firmaId ?? ""}\\`}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resimler.slice(resimBas, resimBas + KLASOR_SAYFA).map((s, si) => {
                            const i = resimBas + si;
                            const k = resimKlasorleri.find((x) => x.yol === s.yol)!;
                            return (
                              <TableRow key={s.yol} data-state={s.secili ? "selected" : undefined}>
                                <TableCell className="pl-4">
                                  <Checkbox
                                    checked={s.secili}
                                    disabled={!k.var || k.dosyaSayisi === 0}
                                    onCheckedChange={(c) => setResimler((l) => l.map((x, j) => (j === i ? { ...x, secili: c === true } : x)))}
                                    aria-label={s.yol + " aktarılsın"}
                                  />
                                </TableCell>
                                <TableCell className="max-w-72 px-4 font-mono text-xs">
                                  <Ipucu metin={s.yol}><div className="truncate">{s.yol}</div></Ipucu>
                                </TableCell>
                                <TableCell className="max-w-56 px-4 text-muted-foreground">
                                  <Ipucu
                                    metin={
                                      k.kullananlar.length > 1 ? (
                                        <div className="flex flex-col gap-0.5 break-normal">
                                          {k.kullananlar.map((ad) => <span key={ad}>{ad}</span>)}
                                        </div>
                                      ) : undefined
                                    }
                                  >
                                    <div className="truncate">
                                      {k.kullananlar.length === 0 ? "—" : k.kullananlar.length === 1 ? k.kullananlar[0] : `${k.kullananlar[0]} +${k.kullananlar.length - 1}`}
                                    </div>
                                  </Ipucu>
                                </TableCell>
                                <TableCell className="px-4 text-right tabular-nums">
                                  {k.var ? `${k.dosyaSayisi.toLocaleString("tr")}${k.eksik ? "+" : ""}` : <span className="text-destructive">Bulunamadı</span>}
                                </TableCell>
                                <TableCell className="px-4 text-right tabular-nums">{k.var ? mb(k.boyutMb) : "—"}</TableCell>
                                <TableCell className="px-4 text-right tabular-nums">
                                  {k.buyukDosya ? (
                                    <Ipucu metin={`${k.buyukDosya.toLocaleString("tr")} dosya 500 KB'tan büyük, toplam ${mb(k.buyukMb ?? 0)}`}>
                                      <span className="inline-flex items-center gap-1 text-foreground">
                                        <AlertTriangle className="size-3.5" />
                                        {k.buyukDosya.toLocaleString("tr")}
                                      </span>
                                    </Ipucu>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="w-48 px-4 py-1">
                                  {s.secili ? (
                                    <Input
                                      value={s.altKlasor}
                                      placeholder="(ana klasör)"
                                      onChange={(e) => setResimler((l) => l.map((x, j) => (j === i ? { ...x, altKlasor: e.target.value } : x)))}
                                      className="h-7 font-mono text-xs"
                                    />
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                    <Sayfalama sayfa={resimSayfaGecerli} sayfaSayisi={resimSayfaSayisi} onSayfa={setResimSayfa} bilgi={`${resimBas + 1}–${Math.min(resimBas + KLASOR_SAYFA, resimler.length)} / ${resimler.length}`} />
                  </Bolum>
                </TabsContent>
              )}

              {/* ── Eski yıl dosyaları ─────────────────────────────── */}
              {hedef.depo && (
                <TabsContent value="eski">
                  <Bolum
                    ikon={<FileArchive className="size-4" />}
                    renk="amber"
                    baslik="Eski yıl dosyaları"
                    aksiyon={<Button variant="outline" size="sm" onClick={() => void dosyaEkle().catch((e) => setHata(e.message))}><Plus /> Dosya ekle</Button>}
                  >
                    {eskiDosyalar.length === 0 ? (
                      <Bos>SQL'e bağlı olmayan eski yıl dataları (.mdf, .bak, .zip…) varsa ekleyin.</Bos>
                    ) : (
                      <YolTablosu
                        basliklar={["Dosya", "Klasör"]}
                        yollar={eskiDosyalar.map((x) => x.yol)}
                        boyutlar={Object.fromEntries(eskiDosyalar.map((x) => [x.yol, x.boyut]))}
                        ad={dosyaAdi}
                        onSil={(y) => setEskiDosyalar((s) => s.filter((x) => x.yol !== y))}
                      />
                    )}
                  </Bolum>
                </TabsContent>
              )}

              {/* ── Programlar ─────────────────────────────────────── */}
              {hedef.rdp && (
                <TabsContent value="program" className="flex flex-col gap-4">
                  <Bolum ikon={<FolderOpen className="size-4" />} renk="emerald" baslik="Program klasörleri" sag={`${programlar.length} klasör · ${programSayisi} seçili`}>
                    {programlar.length === 0 ? (
                      <Bos>Pusula program klasörü bulunamadı.</Bos>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="text-[10px] uppercase tracking-wider">
                            <TableHead className="w-10 pl-4">
                              <Checkbox
                                checked={programHepsiSecili ? true : programSayisi > 0 ? "indeterminate" : false}
                                onCheckedChange={(c) => setProgramlar((l) => l.map((x) => ({ ...x, secili: c === true })))}
                                aria-label="Tüm program klasörlerini seç"
                              />
                            </TableHead>
                            <TableHead className="px-4">Klasör</TableHead>
                            <TableHead className="px-4">Program dosyası</TableHead>
                            <TableHead className="px-4">Parametre (DATA KODU)</TableHead>
                            <TableHead className="px-4">Program</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {programlar.slice(programBas, programBas + KLASOR_SAYFA).map((s, si) => {
                            const i = programBas + si;
                            const p = r.programKlasorleri.find((x) => x.yol === s.yol)!;
                            return (
                              <TableRow key={s.yol} data-state={s.secili ? "selected" : undefined}>
                                <TableCell className="pl-4">
                                  <Checkbox
                                    checked={s.secili}
                                    onCheckedChange={(c) => setProgramlar((l) => l.map((x, j) => (j === i ? { ...x, secili: c === true } : x)))}
                                    aria-label={s.yol + " aktarılsın"}
                                  />
                                </TableCell>
                                <TableCell className="max-w-64 px-4 font-mono text-xs">
                                  <Ipucu metin={s.yol}><div className="truncate">{s.yol}</div></Ipucu>
                                </TableCell>
                                <TableCell className="max-w-40 px-4 font-mono text-xs text-muted-foreground">
                                  <div className="truncate">{p.exeler.join(", ") || "—"}</div>
                                </TableCell>
                                <TableCell className="max-w-48 px-4 text-xs text-muted-foreground">
                                  <div className="truncate">{p.parametreler.map((x) => `${x.ad}${x.dataKodu ? ` (${x.dataKodu})` : ""}`).join(", ")}</div>
                                </TableCell>
                                <TableCell className="px-4 py-1">
                                  {s.secili ? (
                                    programSecici(s.program, (v) => setProgramlar((l) => l.map((x, j) => (j === i ? { ...x, program: v } : x))))
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                    <Sayfalama sayfa={programSayfaGecerli} sayfaSayisi={programSayfaSayisi} onSayfa={setProgramSayfa} bilgi={`${programlar.length} klasör`} />
                  </Bolum>

                  <Bolum
                    ikon={<FileCode2 className="size-4" />}
                    renk="teal"
                    baslik="Program dosyaları"
                    aksiyon={<Button variant="outline" size="sm" onClick={programDosyasiEkle}><Plus /> Program ekle</Button>}
                  >
                    {programDosyalari.length === 0 ? (
                      <Bos>Program klasörü bulunamadıysa ya da farklı bir exe / parametre göndermek istiyorsanız buradan tek tek seçin.</Bos>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="text-[10px] uppercase tracking-wider">
                            <TableHead className="px-4">Program</TableHead>
                            <TableHead className="px-4">Program dosyası (.exe)</TableHead>
                            <TableHead className="px-4">Parametre (.txt)</TableHead>
                            <TableHead className="w-10 pr-4" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {programDosyalari.map((d) => (
                            <TableRow key={d.id}>
                              <TableCell className="px-4 py-1.5">
                                {programSecici(d.program, (v) => setProgramDosyalari((l) => l.map((x) => (x.id === d.id ? { ...x, program: v } : x))))}
                              </TableCell>
                              {(["exe", "param"] as const).map((tur) => (
                                <TableCell key={tur} className="max-w-56 px-4 py-1.5">
                                  {d[tur] ? (
                                    <Ipucu metin={d[tur]!}>
                                      <button
                                        type="button"
                                        className="block max-w-full truncate font-mono text-xs underline-offset-2 hover:underline"
                                        onClick={() => void programDosyasiSec(d.id, tur).catch((e) => setHata(e.message))}
                                      >
                                        {dosyaAdi(d[tur]!)}
                                      </button>
                                    </Ipucu>
                                  ) : (
                                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void programDosyasiSec(d.id, tur).catch((e) => setHata(e.message))}>
                                      Seç…
                                    </Button>
                                  )}
                                </TableCell>
                              ))}
                              <TableCell className="pr-4">
                                <Button variant="ghost" size="icon" className="size-7" aria-label="Kaldır" onClick={() => setProgramDosyalari((l) => l.filter((x) => x.id !== d.id))}>
                                  <X />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                      Dosyalar terminal sunucusunda <span className="font-mono">{`MUSTERI\\${oturum?.firmaId ?? ""}\\Aktarim\\<program>`}</span> klasörüne gider;
                      parametre dosyasındaki DATA KODU Pusula tarafında güncellenir.
                    </p>
                  </Bolum>
                </TabsContent>
              )}

              {/* ── Ek klasörler ───────────────────────────────────── */}
              {hedef.rdp && (
                <TabsContent value="ek">
                  <Bolum
                    ikon={<FolderPlus className="size-4" />}
                    renk="cyan"
                    baslik="Ek klasörler"
                    aksiyon={<Button variant="outline" size="sm" onClick={() => void klasorEkle().catch((e) => setHata(e.message))}><Plus /> Klasör ekle</Button>}
                  >
                    {ekKlasorler.length === 0 ? (
                      <Bos>Raporlar, şablonlar gibi göndermek istediğiniz klasörler varsa ekleyin.</Bos>
                    ) : (
                      <YolTablosu
                        basliklar={["Klasör", "Konum"]}
                        yollar={ekKlasorler.map((x) => x.yol)}
                        boyutlar={Object.fromEntries(ekKlasorler.map((x) => [x.yol, x.boyut]))}
                        adetler={Object.fromEntries(ekKlasorler.map((x) => [x.yol, x.dosyaSayisi]))}
                        ad={dosyaAdi}
                        onSil={(y) => setEkKlasorler((s) => s.filter((x) => x.yol !== y))}
                      />
                    )}
                  </Bolum>
                </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </div>
      </main>

      </div>

      {/* Sağ panel: seçilenlerin özeti + Aktarımı başlat (eskiden alttaki çubuktaydı) */}
      <aside className="flex w-80 shrink-0 flex-col border-l bg-card">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b px-5">
          <ListChecks className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Özet</h2>
        </div>

        {r && !taraniyor ? (
          <>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
              {/* Özet tablosu: tür / adet / boyut; veritabanlarının altında seçilenler tek tek */}
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-8 px-3 text-[10px] font-medium tracking-wider uppercase">Tür</TableHead>
                      <TableHead className="h-8 px-2 text-right text-[10px] font-medium tracking-wider uppercase">Adet</TableHead>
                      <TableHead className="h-8 px-3 text-right text-[10px] font-medium tracking-wider uppercase">Boyut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <OzetSatiri ikon={<Database />} ad="Veritabanları" sayi={secili.size} boyut={secili.size > 0 ? mb(toplamMb) : undefined} />
                    {(r.veritabanlari ?? []).filter((v) => secili.has(v.ad)).map((v) => (
                      <TableRow key={v.ad} className="hover:bg-transparent">
                        <TableCell className="max-w-0 py-1 pr-1 pl-9 text-xs" colSpan={2}>
                          <span className="block truncate font-mono" title={v.ad}>
                            {v.ad}
                            {eskiYil.has(v.ad) && <span className="ml-1.5 font-sans text-muted-foreground">eski yıl</span>}
                          </span>
                        </TableCell>
                        <TableCell className="py-1 px-3 text-right text-xs tabular-nums text-muted-foreground">{mb(v.veriMb)}</TableCell>
                      </TableRow>
                    ))}
                    <OzetSatiri ikon={<Image />} ad="Resim klasörleri" sayi={resimSayisi} />
                    <OzetSatiri ikon={<FileCode2 />} ad="Programlar" sayi={programSayisi + programDosyaSayisi} />
                    <OzetSatiri ikon={<FileArchive />} ad="Eski yıl dosyaları" sayi={eskiDosyalar.length} />
                    <OzetSatiri ikon={<FolderPlus />} ad="Ek klasörler" sayi={ekKlasorler.length} />
                  </TableBody>
                </Table>
              </div>
              {veritabanlariAyir && secili.size > 0 && (
                <p className="px-1 text-xs text-muted-foreground">Veritabanları aktarımdan sonra bu SQL Server'dan ayrılacak.</p>
              )}

              <div className="flex items-baseline justify-between px-1">
                <span className="text-sm text-muted-foreground">Toplam veritabanı</span>
                <span className="text-xl font-semibold tabular-nums">{mb(toplamMb)}</span>
              </div>

              {programEksik && (
                <Alert>
                  <AlertTriangle />
                  <AlertDescription>Seçili programlardan bazılarının Pusula karşılığı seçilmedi.</AlertDescription>
                </Alert>
              )}
              {hata && (
                <Alert variant="destructive">
                  <XCircle />
                  <AlertDescription>{hata}</AlertDescription>
                </Alert>
              )}
            </div>

            <div className="border-t px-5 py-4">
              <Button size="lg" className="w-full" disabled={basliyor || bosSecim || programEksik} onClick={() => void baslat()}>
                {basliyor ? <Loader2 className="animate-spin" /> : null} Aktarımı başlat <ArrowRight />
              </Button>
              {bosSecim && <p className="mt-2 text-center text-xs text-muted-foreground">Aktarılacak en az bir şey seçin.</p>}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {taraniyor ? "Tarama sürüyor…" : "Tarama bitince seçimleriniz burada özetlenir."}
          </div>
        )}
      </aside>

      {dosyaSecici}

      <AlertDialog open={!!onay} onOpenChange={(o) => !o && setOnay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{onay?.baslik}</AlertDialogTitle>
            <AlertDialogDescription>{onay?.mesaj}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onay?.uygula();
                setOnay(null);
              }}
            >
              Evet, güncel olarak aktar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Bölüm / sekme renkleri — her alan kendi tonunda (koyu temada bir ton açık). */
const RENK = {
  slate: { rozet: "bg-slate-500/15 text-slate-600 dark:text-slate-300", sekme: "data-[state=active]:[&_svg]:text-slate-600" },
  blue: { rozet: "bg-muted text-foreground", sekme: "" },
  violet: { rozet: "bg-muted text-foreground", sekme: "" },
  amber: { rozet: "bg-muted text-foreground", sekme: "" },
  emerald: { rozet: "bg-muted text-foreground", sekme: "" },
  teal: { rozet: "bg-muted text-foreground", sekme: "" },
  cyan: { rozet: "bg-muted text-foreground", sekme: "" },
} as const;
type Renk = keyof typeof RENK;

function Bolum({
  ikon, baslik, sag, aksiyon, renk = "slate", children,
}: { ikon: React.ReactNode; baslik: string; sag?: string; aksiyon?: React.ReactNode; renk?: Renk; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-xs">
      <div className="flex min-h-12 items-center gap-2.5 border-b px-4 py-2">
        <span className={"flex size-7 shrink-0 items-center justify-center rounded-md " + RENK[renk].rozet}>{ikon}</span>
        <h2 className="text-sm font-semibold">{baslik}</h2>
        {sag && <span className="ml-auto text-xs text-muted-foreground">{sag}</span>}
        {aksiyon && <div className="ml-auto">{aksiyon}</div>}
      </div>
      {children}
    </section>
  );
}

/** Eski yıl dosyaları / ek klasörler: ad + bulunduğu yer + kaldır. */
function YolTablosu({
  basliklar, yollar, boyutlar, adetler, ad, onSil,
}: {
  basliklar: [string, string];
  yollar: string[];
  /** undefined = hesaplanıyor, null = bilinmiyor */
  boyutlar?: Record<string, number | null | undefined>;
  /** Klasörlerde dosya sayısı (ipucu) */
  adetler?: Record<string, number | undefined>;
  ad: (y: string) => string;
  onSil: (y: string) => void;
}) {
  const toplam = boyutlar ? Object.values(boyutlar).reduce<number>((t, b) => t + (b ?? 0), 0) : 0;
  return (
    <Table>
      <TableHeader>
        <TableRow className="text-[10px] uppercase tracking-wider">
          <TableHead className="px-4">{basliklar[0]}</TableHead>
          <TableHead className="px-4">{basliklar[1]}</TableHead>
          {boyutlar && <TableHead className="px-4 text-right">Boyut</TableHead>}
          <TableHead className="w-10 pr-4" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {yollar.map((y) => (
          <TableRow key={y}>
            <TableCell className="px-4 font-mono text-xs font-medium">{ad(y)}</TableCell>
            <TableCell className="max-w-96 px-4 font-mono text-xs text-muted-foreground">
              <Ipucu metin={y}><div className="truncate">{klasorAdi(y) || "—"}</div></Ipucu>
            </TableCell>
            {boyutlar && (
              <TableCell className="px-4 text-right tabular-nums">
                {boyutlar[y] === undefined ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> hesaplanıyor</span>
                ) : boyutlar[y] === null ? (
                  "—"
                ) : (
                  <Ipucu metin={adetler?.[y] != null ? `${adetler[y]!.toLocaleString("tr")} dosya` : undefined}>
                    <span>{boyutMetni(boyutlar[y]!)}</span>
                  </Ipucu>
                )}
              </TableCell>
            )}
            <TableCell className="pr-4">
              <Button variant="ghost" size="icon" className="size-7" onClick={() => onSil(y)} aria-label="Kaldır">
                <X />
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {boyutlar && yollar.length > 1 && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={2} className="px-4 text-xs text-muted-foreground">{yollar.length} {adetler ? "klasör" : "dosya"}</TableCell>
            <TableCell className="px-4 text-right text-xs font-medium tabular-nums">{boyutMetni(toplam)}</TableCell>
            <TableCell />
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

/** Tek sayfaya sığıyorsa hiç görünmez. İlk, son ve aktifin komşuları; arada "…". */
function Sayfalama({ sayfa, sayfaSayisi, onSayfa, bilgi }: { sayfa: number; sayfaSayisi: number; onSayfa: (s: number) => void; bilgi?: string }) {
  if (sayfaSayisi <= 1) return null;
  const goster = [...new Set([1, sayfa - 1, sayfa, sayfa + 1, sayfaSayisi])].filter((x) => x >= 1 && x <= sayfaSayisi).sort((a, b) => a - b);
  const git = (s: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    onSayfa(Math.min(sayfaSayisi, Math.max(1, s)));
  };
  const pasif = "pointer-events-none opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2">
      {bilgi && <span className="text-xs text-muted-foreground tabular-nums">{bilgi}</span>}
      <Pagination className="mx-0 ml-auto w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" onClick={git(sayfa - 1)} aria-disabled={sayfa === 1} className={sayfa === 1 ? pasif : ""} />
          </PaginationItem>
          {goster.flatMap((s, i) => [
            ...(i > 0 && s - goster[i - 1] > 1 ? [<PaginationItem key={"e" + s}><PaginationEllipsis /></PaginationItem>] : []),
            <PaginationItem key={s}>
              <PaginationLink href="#" isActive={s === sayfa} onClick={git(s)} className="tabular-nums">{s}</PaginationLink>
            </PaginationItem>,
          ])}
          <PaginationItem>
            <PaginationNext href="#" onClick={git(sayfa + 1)} aria-disabled={sayfa === sayfaSayisi} className={sayfa === sayfaSayisi ? pasif : ""} />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}


const Bos = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-3 text-sm text-muted-foreground">{children}</p>;

/**
 * Ana ekranın ortasındaki tarama kartı: henüz tarama yoksa SQL durumu + "Taramayı başlat";
 * tarama sürerken aynı kartta ilerleme. (Eskiden ayrı "tarama" ekranı vardı.)
 */
function TaramaKarti({ durum, taraniyor, bekle, onTara, onSql }: {
  durum: Durum; taraniyor: boolean; bekle: boolean; onTara: () => void; onSql: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-xl border bg-card px-6 py-10 text-center shadow-xs">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-foreground">
        {taraniyor ? <Loader2 className="size-6 animate-spin" /> : <ScanSearch className="size-6" />}
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="text-lg font-semibold">{taraniyor ? "Verileriniz taranıyor" : "Bu bilgisayarı tarayın"}</h2>
        <p className="text-sm text-muted-foreground">
          {taraniyor
            ? durum.ilerleme ?? "Hazırlanıyor…"
            : "Tarama veritabanlarını, resim ve program klasörlerini bulur. Birkaç dakika sürebilir; Pusula programını kullanmanız engellenmez."}
        </p>
      </div>

      <div className="flex w-full max-w-md items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-left">
        <Database className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 text-sm">
          {durum.sql ? (
            <>
              <div className="font-medium">SQL Server bağlı</div>
              <div className="truncate font-mono text-xs text-muted-foreground">{durum.sql.sunucu}</div>
            </>
          ) : (
            <>
              <div className="font-medium">SQL olmadan</div>
              <div className="text-xs text-muted-foreground">Yalnız resim, program ve dosyalar taranır.</div>
            </>
          )}
        </div>
        {!taraniyor && (
          <Button variant="ghost" size="sm" disabled={bekle} onClick={onSql}>
            {durum.sql ? "Değiştir" : "Bağlan"}
          </Button>
        )}
      </div>

      {!taraniyor && (
        <Button size="lg" className="w-full max-w-md" disabled={bekle} onClick={onTara}>
          {bekle ? <Loader2 className="animate-spin" /> : <ScanSearch />} Taramayı başlat
        </Button>
      )}
    </div>
  );
}

/** Sol paneldeki ad/değer satırı. */
function PanelBilgi({ ad, deger, mono, sar }: { ad: string; deger: string; mono?: boolean; sar?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{ad}</dt>
      <dd className={(sar ? "font-medium leading-snug break-words " : "truncate ") + (mono ? "font-mono" : "")} title={deger}>{deger}</dd>
    </div>
  );
}

/** Sağ paneldeki özet tablosunun kategori satırı: ikon + tür, adet (0 ise soluk "—"), boyut. */
function OzetSatiri({ ikon, ad, sayi, boyut }: { ikon: React.ReactNode; ad: string; sayi: number; boyut?: string }) {
  const bos = sayi === 0;
  return (
    <TableRow className={"hover:bg-transparent " + (bos ? "text-muted-foreground" : "")}>
      <TableCell className="px-3 py-2">
        <span className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:shrink-0">{ikon}{ad}</span>
      </TableCell>
      <TableCell className={"px-2 py-2 text-right tabular-nums " + (bos ? "" : "font-semibold")}>{bos ? "—" : sayi}</TableCell>
      <TableCell className="px-3 py-2 text-right tabular-nums">{boyut ?? (bos ? "" : "—")}</TableCell>
    </TableRow>
  );
}
