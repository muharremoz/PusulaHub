import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Database, FileArchive, FolderOpen, FolderPlus, Image, Info, Loader2, Plus,
  RefreshCw, Search, Server, X, XCircle,
} from "lucide-react";
import { api, type Durum, type KesifRaporu, type Veritabani } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { mb } from "./ortak";

type P = { durum: Durum; setDurum: (d: Durum) => void };

const TUR_ETIKET: Record<Veritabani["tur"], string> = {
  firma: "Firma datası",
  transfer: "Transfer datası",
  diger: "Tanımsız",
  sirket: "Şirket tanımları",
};

const VT_SAYFA = 10;
const KLASOR_SAYFA = 10;
const GRUPLAR: Veritabani["tur"][] = ["firma", "transfer", "diger", "sirket"];

type ResimSecimi = { yol: string; secili: boolean; altKlasor: string };
type ProgramSecimi = { yol: string; secili: boolean; program: string };

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

/** Program klasörünü katalogdaki programa exe adından eşle. */
function programVarsayilan(r: KesifRaporu, katalog: Durum["oturum"] extends infer O ? (O extends { programlar: infer L } ? L : never) : never): ProgramSecimi[] {
  return r.programKlasorleri.map((p) => {
    const eslesen = katalog.find((k) => k.exeName && p.exeler.some((e) => e.toLowerCase() === k.exeName!.toLowerCase()));
    return { yol: p.yol, secili: !!eslesen, program: eslesen?.name ?? "" };
  });
}

/** Keşif sonucu + aktarılacakların seçimi. */
export function RaporEkrani({ durum, setDurum }: P) {
  const r = durum.kesif;
  const oturum = durum.oturum;
  const hedef = oturum?.hedefler ?? { sql: true, depo: true, rdp: true };
  const katalog = oturum?.programlar ?? [];

  const [bekle, setBekle] = useState(false);
  const [secili, setSecili] = useState<Set<string>>(
    () => new Set((r?.veritabanlari ?? []).filter((v) => (v.tur === "firma" || v.tur === "transfer") && v.durum === "ONLINE").map((v) => v.ad)),
  );
  const [eskiYil, setEskiYil] = useState<Set<string>>(() => new Set());
  const [resimler, setResimler] = useState<ResimSecimi[]>(() => (r ? resimVarsayilan(r) : []));
  const [programlar, setProgramlar] = useState<ProgramSecimi[]>(() => (r ? programVarsayilan(r, katalog) : []));
  const [eskiDosyalar, setEskiDosyalar] = useState<string[]>([]);
  const [ekKlasorler, setEkKlasorler] = useState<string[]>([]);
  const [basliyor, setBasliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [arama, setArama] = useState("");
  const [turFiltre, setTurFiltre] = useState<"hepsi" | Veritabani["tur"]>("hepsi");
  const [vtSayfa, setVtSayfa] = useState(1);
  const [resimSayfa, setResimSayfa] = useState(1);
  const [programSayfa, setProgramSayfa] = useState(1);

  const toplamMb = useMemo(
    () => (r?.veritabanlari ?? []).filter((v) => secili.has(v.ad)).reduce((t, v) => t + v.veriMb, 0),
    [r, secili],
  );
  const resimSayisi = resimler.filter((x) => x.secili).length;
  const programSayisi = programlar.filter((x) => x.secili).length;
  const bosSecim = secili.size + resimSayisi + programSayisi + eskiDosyalar.length + ekKlasorler.length === 0;

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
    const { yollar } = await api<{ yollar: string[] }>("/sec/dosyalar", {});
    setEskiDosyalar((s) => [...s, ...yollar.filter((y) => !s.includes(y))]);
  };
  const klasorEkle = async () => {
    const { yol } = await api<{ yol: string | null }>("/sec/klasor", { aciklama: "Ek dosyaların bulunduğu klasörü seçin" });
    if (yol) setEkKlasorler((s) => (s.includes(yol) ? s : [...s, yol]));
  };

  const baslat = async () => {
    setBasliyor(true);
    setHata(null);
    try {
      setDurum(
        await api<Durum>("/aktarim/baslat", {
          veritabanlari: [...secili].map((ad) => ({ ad, eski: eskiYil.has(ad) })),
          resimler: resimler.filter((x) => x.secili).map((x) => ({ yol: x.yol, altKlasor: x.altKlasor })),
          eskiDosyalar,
          programlar: programlar.filter((x) => x.secili).map((x) => ({ yol: x.yol, program: x.program })),
          ekKlasorler,
        }),
      );
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBasliyor(false);
    }
  };

  // Filtre (ad / şirket + tür) → grup sırasına diz → sayfala. Grup başlığı, sayfada o grubun ilk satırından önce.
  const filtreli = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    const l = (r?.veritabanlari ?? []).filter((v) => {
      if (turFiltre !== "hepsi" && v.tur !== turFiltre) return false;
      if (q && !v.ad.toLocaleLowerCase("tr").includes(q) && !v.sirketAdlari.some((x) => x.toLocaleLowerCase("tr").includes(q))) return false;
      return true;
    });
    return GRUPLAR.flatMap((g) => l.filter((v) => v.tur === g));
  }, [r, arama, turFiltre]);
  const grupSayisi = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of filtreli) m.set(v.tur, (m.get(v.tur) ?? 0) + 1);
    return m;
  }, [filtreli]);
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

  // Toplu: filtreye uyan ve seçili olanların hepsi güncel / eski yıl.
  const topluEskiYil = (eski: boolean) =>
    setEskiYil((s) => {
      const y = new Set(s);
      for (const v of secilebilir) {
        if (!secili.has(v.ad)) continue;
        if (eski) y.add(v.ad);
        else y.delete(v.ad);
      }
      return y;
    });
  const eskiSayisi = [...eskiYil].filter((ad) => secili.has(ad)).length;

  const resimSayfaSayisi = Math.max(1, Math.ceil(resimler.length / KLASOR_SAYFA));
  const resimSayfaGecerli = Math.min(resimSayfa, resimSayfaSayisi);
  const resimBas = (resimSayfaGecerli - 1) * KLASOR_SAYFA;
  const programSayfaSayisi = Math.max(1, Math.ceil(programlar.length / KLASOR_SAYFA));
  const programSayfaGecerli = Math.min(programSayfa, programSayfaSayisi);
  const programBas = (programSayfaGecerli - 1) * KLASOR_SAYFA;
  const resimSecilebilir = (yol: string) => {
    const k = r?.resimKlasorleri.find((x) => x.yol === yol);
    return !!k && k.var && k.dosyaSayisi > 0;
  };
  const resimHepsiSecili = resimler.filter((x) => resimSecilebilir(x.yol)).every((x) => x.secili);

  return (
    <div className="min-h-svh bg-muted/40 pb-20">
      <header className="flex items-center gap-3 border-b bg-card px-6 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Aktarım · {oturum?.firmaId}</div>
          <h1 className="truncate text-base font-semibold">{oturum?.firmaAdi}</h1>
        </div>
        {durum.kesifGonderildi ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" /> Rapor Pusula'ya iletildi
          </span>
        ) : null}
        <Button variant="outline" size="sm" disabled={bekle} onClick={() => void yenile()}>
          {bekle ? <Loader2 className="animate-spin" /> : <RefreshCw />} Yeniden tara
        </Button>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        {oturum?.notlar && (
          <Alert>
            <Info />
            <AlertDescription>
              <span className="font-medium text-foreground">Pusula'nın notu:</span> {oturum.notlar}
            </AlertDescription>
          </Alert>
        )}
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

        {r && (
          <>
            <Bolum ikon={<Server className="size-4" />} baslik="SQL Server">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-4 py-3 text-sm sm:grid-cols-4">
                <Bilgi l="Sunucu" v={r.sql.sunucu} mono />
                <Bilgi l="Bilgisayar" v={r.sql.makineAdi + (r.sql.yerel ? "" : " (uzak)")} />
                <Bilgi l="Sürüm" v={r.sql.surumu} />
                <Bilgi l="Bağlantı" v={r.sql.kaynak === "windows" ? "Windows oturumu" : r.sql.kaynak} />
              </div>
            </Bolum>

            <Bolum
              ikon={<Database className="size-4" />}
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
                    placeholder="Veritabanı veya şirket ara…"
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
                  <ToggleGroupItem value="hepsi" className="px-2 text-xs">Tümü</ToggleGroupItem>
                  {GRUPLAR.filter((g) => r.veritabanlari.some((v) => v.tur === g)).map((g) => (
                    <ToggleGroupItem key={g} value={g} className="px-2 text-xs">{TUR_ETIKET[g]}</ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px] uppercase tracking-wider">
                    <TableHead className="w-10 pl-4">
                      <Checkbox
                        checked={hepsiSecili ? true : filtreliSeciliSayisi > 0 ? "indeterminate" : false}
                        disabled={secilebilir.length === 0}
                        onCheckedChange={(c) => tumunuSec(c === true)}
                        aria-label="Listelenenlerin tümünü seç"
                        title="Listelenenlerin (filtreye uyan) tümünü seç / kaldır"
                      />
                    </TableHead>
                    <TableHead className="px-4">Veritabanı</TableHead>
                    <TableHead className="px-4">Şirket</TableHead>
                    <TableHead className="px-4">Program</TableHead>
                    <TableHead className="px-4 text-right">Veri</TableHead>
                    <TableHead className="px-4">Son yedek</TableHead>
                    {hedef.depo && <TableHead className="px-4">Aktarım</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtreli.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                        Aramaya uyan veritabanı yok.
                      </TableCell>
                    </TableRow>
                  )}
                  {sayfadakiler.flatMap((v, i) => {
                    const baslik = i === 0 || sayfadakiler[i - 1].tur !== v.tur;
                    return [
                      ...(baslik
                        ? [
                            <TableRow key={"g-" + v.tur} className="bg-muted/40 hover:bg-muted/40">
                              <TableCell colSpan={7} className="px-4 py-1 text-xs font-medium text-muted-foreground">
                                {TUR_ETIKET[v.tur]} · {grupSayisi.get(v.tur)}
                              </TableCell>
                            </TableRow>,
                          ]
                        : []),
                      (
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
                          <TableCell className="px-4 text-muted-foreground">{v.prgTur === "909" ? "Perakende" : v.prgTur === "011" ? "Toptan" : v.prgTur ?? "—"}</TableCell>
                          <TableCell className="px-4 text-right tabular-nums">{mb(v.veriMb)}</TableCell>
                          <TableCell className="px-4 text-muted-foreground">{v.sonYedek ? new Date(v.sonYedek).toLocaleDateString("tr") : "—"}</TableCell>
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
                                onValueChange={(d) => {
                                  if (!d) return;
                                  setSecili((s) => setDegistir(s, v.ad, true));
                                  setEskiYil((s) => setDegistir(s, v.ad, d === "eski"));
                                }}
                              >
                                <ToggleGroupItem value="guncel" className="px-2 text-xs data-[state=on]:border-emerald-600 data-[state=on]:bg-emerald-600 data-[state=on]:text-white">Güncel</ToggleGroupItem>
                                <ToggleGroupItem value="eski" className="px-2 text-xs data-[state=on]:border-amber-500 data-[state=on]:bg-amber-500 data-[state=on]:text-white">Eski yıl</ToggleGroupItem>
                              </ToggleGroup>
                            </TableCell>
                          )}
                        </TableRow>
                      ),
                    ];
                  })}
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
            </Bolum>

            {hedef.depo && (
              <Bolum ikon={<Image className="size-4" />} baslik="Resim klasörleri" sag={`${resimler.length} klasör · ${resimSayisi} seçili`}>
                {resimler.length === 0 ? (
                  <Bos>Şirket tanımlarında resim klasörü yok.</Bos>
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
                        <TableHead className="px-4">{`Hedef: Resimler\\${oturum?.firmaId ?? ""}\\`}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resimler.slice(resimBas, resimBas + KLASOR_SAYFA).map((s, si) => {
                        const i = resimBas + si;
                        const k = r.resimKlasorleri.find((x) => x.yol === s.yol)!;
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
                            <TableCell className="max-w-72 truncate px-4 font-mono text-xs" title={s.yol}>{s.yol}</TableCell>
                            <TableCell className="max-w-56 truncate px-4 text-muted-foreground" title={k.kullananlar.join(", ")}>
                              {k.kullananlar.length === 0 ? "—" : k.kullananlar.length <= 2 ? k.kullananlar.join(", ") : `${k.kullananlar[0]} +${k.kullananlar.length - 1}`}
                            </TableCell>
                            <TableCell className="px-4 text-right tabular-nums">
                              {k.var ? `${k.dosyaSayisi.toLocaleString("tr")}${k.eksik ? "+" : ""}` : <span className="text-destructive">Bulunamadı</span>}
                            </TableCell>
                            <TableCell className="px-4 text-right tabular-nums">{k.var ? mb(k.boyutMb) : "—"}</TableCell>
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
            )}

            {hedef.depo && (
              <div className="grid gap-4">
                <Bolum
                  ikon={<FileArchive className="size-4" />}
                  baslik="Eski yıl dosyaları"
                  aksiyon={<Button variant="outline" size="sm" onClick={() => void dosyaEkle().catch((e) => setHata(e.message))}><Plus /> Dosya ekle</Button>}
                >
                  {eskiDosyalar.length === 0 && <Bos>SQL'e bağlı olmayan eski yıl dataları (.mdf, .bak, .zip…) varsa ekleyin.</Bos>}
                  {eskiDosyalar.map((y) => (
                    <SatirSil key={y} metin={y} onSil={() => setEskiDosyalar((s) => s.filter((x) => x !== y))} />
                  ))}
                </Bolum>
              </div>
            )}

            {hedef.rdp && (
              <div className="grid gap-4 md:grid-cols-2">
                <Bolum ikon={<FolderOpen className="size-4" />} baslik="Program klasörleri">
                  {programlar.length === 0 && <Bos>Pusula program klasörü bulunamadı.</Bos>}
                  {programlar.slice(programBas, programBas + KLASOR_SAYFA).map((s, si) => {
                    const i = programBas + si;
                    const p = r.programKlasorleri.find((x) => x.yol === s.yol)!;
                    return (
                      <div key={s.yol} className="flex items-start gap-3 border-b px-4 py-2.5 last:border-b-0">
                        <Checkbox
                          className="mt-0.5"
                          checked={s.secili}
                          onCheckedChange={(c) => setProgramlar((l) => l.map((x, j) => (j === i ? { ...x, secili: c === true } : x)))}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-xs" title={s.yol}>{s.yol}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {p.parametreler.map((x) => `${x.ad}${x.dataKodu ? ` (${x.dataKodu})` : ""}`).join(", ")}
                          </div>
                          {s.secili && katalog.length > 0 && (
                            <ToggleGroup
                              type="single"
                              size="sm"
                              variant="outline"
                              className="mt-1.5 flex-wrap justify-start"
                              value={s.program}
                              onValueChange={(v) => v && setProgramlar((l) => l.map((x, j) => (j === i ? { ...x, program: v } : x)))}
                            >
                              {katalog.map((k) => (
                                <ToggleGroupItem key={k.name} value={k.name} className="px-2 text-xs">{k.name}</ToggleGroupItem>
                              ))}
                            </ToggleGroup>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <Sayfalama sayfa={programSayfaGecerli} sayfaSayisi={programSayfaSayisi} onSayfa={setProgramSayfa} bilgi={`${programlar.length} klasör · ${programSayisi} seçili`} />
                </Bolum>

                <Bolum
                  ikon={<FolderPlus className="size-4" />}
                  baslik="Ek klasörler"
                  aksiyon={<Button variant="outline" size="sm" onClick={() => void klasorEkle().catch((e) => setHata(e.message))}><Plus /> Klasör ekle</Button>}
                >
                  {ekKlasorler.length === 0 && <Bos>Raporlar, şablonlar gibi göndermek istediğiniz klasörler varsa ekleyin.</Bos>}
                  {ekKlasorler.map((y) => (
                    <SatirSil key={y} metin={y} onSil={() => setEkKlasorler((s) => s.filter((x) => x !== y))} />
                  ))}
                </Bolum>
              </div>
            )}
          </>
        )}
      </main>

      {r && (
        <footer className="fixed inset-x-0 bottom-0 border-t bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
            <div className="min-w-0 flex-1 truncate text-sm">
              {hata ? (
                <span className="text-destructive">{hata}</span>
              ) : (
                <>
                  <span className="font-medium">{secili.size} veritabanı</span>
                  <span className="text-muted-foreground">
                    {" "}· {mb(toplamMb)}
                    {eskiSayisi > 0 && ` (${eskiSayisi} eski yıl)`}
                    {resimSayisi > 0 && ` · ${resimSayisi} resim klasörü`}
                    {eskiDosyalar.length > 0 && ` · ${eskiDosyalar.length} eski yıl dosyası`}
                    {programSayisi > 0 && ` · ${programSayisi} program`}
                    {ekKlasorler.length > 0 && ` · ${ekKlasorler.length} ek klasör`}
                  </span>
                </>
              )}
            </div>
            <Button
              disabled={basliyor || bosSecim || programlar.some((x) => x.secili && !x.program)}
              onClick={() => void baslat()}
            >
              {basliyor ? <Loader2 className="animate-spin" /> : null} Aktarımı başlat <ArrowRight />
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

function Bolum({ ikon, baslik, sag, aksiyon, children }: { ikon: React.ReactNode; baslik: string; sag?: string; aksiyon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex min-h-11 items-center gap-2 border-b px-4 py-2">
        <span className="text-muted-foreground">{ikon}</span>
        <h2 className="text-sm font-semibold">{baslik}</h2>
        {sag && <span className="ml-auto text-xs text-muted-foreground">{sag}</span>}
        {aksiyon && <div className="ml-auto">{aksiyon}</div>}
      </div>
      {children}
    </section>
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

function Bilgi({ l, v, mono }: { l: string; v: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{l}</div>
      <div className={`truncate ${mono ? "font-mono" : ""}`} title={v}>{v || "—"}</div>
    </div>
  );
}

function SatirSil({ metin, onSil }: { metin: string; onSil: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b px-4 py-2 last:border-b-0">
      <span className="min-w-0 flex-1 truncate font-mono text-xs" title={metin}>{metin}</span>
      <Button variant="ghost" size="icon" className="size-7" onClick={onSil} aria-label="Kaldır">
        <X />
      </Button>
    </div>
  );
}

const Bos = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-3 text-sm text-muted-foreground">{children}</p>;
