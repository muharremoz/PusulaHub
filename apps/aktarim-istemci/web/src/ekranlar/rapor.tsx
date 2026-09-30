import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Database, FileArchive, FolderOpen, FolderPlus, Image, Info, Loader2, Plus,
  RefreshCw, Server, X, XCircle,
} from "lucide-react";
import { api, type Durum, type KesifRaporu, type Veritabani } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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

  const gruplar: Veritabani["tur"][] = ["firma", "transfer", "diger", "sirket"];

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
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px] uppercase tracking-wider">
                    <TableHead className="w-10 pl-4" />
                    <TableHead className="px-4">Veritabanı</TableHead>
                    <TableHead className="px-4">Şirket</TableHead>
                    <TableHead className="px-4">Program</TableHead>
                    <TableHead className="px-4 text-right">Veri</TableHead>
                    <TableHead className="px-4">Son yedek</TableHead>
                    {hedef.depo && <TableHead className="px-4">Aktarım</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gruplar.flatMap((g) => {
                    const satirlar = r.veritabanlari.filter((v) => v.tur === g);
                    if (!satirlar.length) return [];
                    return [
                      <TableRow key={g} className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={7} className="px-4 py-1 text-xs font-medium text-muted-foreground">
                          {TUR_ETIKET[g]} · {satirlar.length}
                        </TableCell>
                      </TableRow>,
                      ...satirlar.map((v) => (
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
                              {secili.has(v.ad) && (
                                <ToggleGroup
                                  type="single"
                                  size="sm"
                                  variant="outline"
                                  value={eskiYil.has(v.ad) ? "eski" : "guncel"}
                                  onValueChange={(d) => d && setEskiYil((s) => setDegistir(s, v.ad, d === "eski"))}
                                >
                                  <ToggleGroupItem value="guncel" className="px-2 text-xs">Güncel</ToggleGroupItem>
                                  <ToggleGroupItem value="eski" className="px-2 text-xs">Eski yıl</ToggleGroupItem>
                                </ToggleGroup>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      )),
                    ];
                  })}
                </TableBody>
              </Table>
              {hedef.depo && (
                <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                  "Eski yıl" işaretlenenler kurulmaz, Pusula'da arşivde saklanır.
                </p>
              )}
            </Bolum>

            {hedef.depo && (
              <div className="grid gap-4 md:grid-cols-2">
                <Bolum ikon={<Image className="size-4" />} baslik="Resim klasörleri">
                  {resimler.length === 0 && <Bos>Şirket tanımlarında resim klasörü yok.</Bos>}
                  {resimler.map((s, i) => {
                    const k = r.resimKlasorleri.find((x) => x.yol === s.yol)!;
                    return (
                      <div key={s.yol} className="flex items-start gap-3 border-b px-4 py-2.5 last:border-b-0">
                        <Checkbox
                          className="mt-0.5"
                          checked={s.secili}
                          disabled={!k.var || k.dosyaSayisi === 0}
                          onCheckedChange={(c) => setResimler((l) => l.map((x, j) => (j === i ? { ...x, secili: c === true } : x)))}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-xs" title={s.yol}>{s.yol}</div>
                          <div className="text-xs text-muted-foreground">
                            {k.var ? `${k.dosyaSayisi.toLocaleString("tr")}${k.eksik ? "+" : ""} dosya · ${mb(k.boyutMb)}` : "Klasör bulunamadı"}
                          </div>
                          {s.secili && (
                            <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="shrink-0">Hedef: Resimler\{oturum?.firmaId}\</span>
                              <Input
                                value={s.altKlasor}
                                placeholder="(ana klasör)"
                                onChange={(e) => setResimler((l) => l.map((x, j) => (j === i ? { ...x, altKlasor: e.target.value } : x)))}
                                className="h-7 font-mono text-xs"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </Bolum>

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
                  {programlar.map((s, i) => {
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
