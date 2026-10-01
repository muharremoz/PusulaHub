import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Image, Loader2, Minimize2, Plus, ScanSearch, Settings2, Square, X, ZoomIn,
} from "lucide-react";
import { api, apiBlob, type KesifRaporu } from "@/api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { boyutMetni, useDosyaSecici } from "./dosya-secici";
import { Ipucu, mb } from "./ortak";

/**
 * Resim küçültme — aktarımdan ayrı araç. Akış: klasör seç → tara → örnekte önce/sonra karşılaştır → başlat.
 * Çözünürlük değişmez; JPEG aynı piksel boyutunda daha verimli kaydedilir (bkz. ResimKucultucu.cs).
 */

const ESIK_KB = 500;
const KALITELER = [
  { deger: 80, ad: "%80", aciklama: "En küçük dosya" },
  { deger: 85, ad: "%85", aciklama: "Önerilen — fark edilmez" },
  { deger: 90, ad: "%90", aciklama: "En temkinli" },
] as const;

type Tarama = {
  taramaNo: number;
  adet: number;
  bayt: number;
  eksik: boolean;
  klasorler: { kok: string; var: boolean; adet: number; bayt: number }[];
  ornekler: { yol: string; boyut: number }[];
};
type Ornek = { yol: string; orijinal: number; yeni: number | null; genislik: number; yukseklik: number; atlanir: boolean; neden: string | null };
type Calisma = {
  suruyor: boolean;
  bitti: boolean;
  durduruldu: boolean;
  toplam: number;
  islenen: number;
  kucultulen: number;
  atlanan: number;
  hataSayisi: number;
  hatalar: string[];
  onceBayt: number;
  sonraBayt: number;
  kalite: number;
  yedekKlasorleri: string[];
};

type Klasor = { yol: string; secili: boolean; adet?: number; mb?: number };

/** onGeri(degisti): bu ekranda en az bir resim küçültüldüyse true — rapor taraması yenilensin diye. */
export function ResimKucultmeEkrani({ rapor, onGeri }: { rapor: KesifRaporu | null; onGeri: (degisti: boolean) => void }) {
  const [klasorler, setKlasorler] = useState<Klasor[]>(() =>
    (rapor?.resimKlasorleri ?? [])
      .filter((k) => k.var)
      .map((k) => ({ yol: k.yol, secili: (k.buyukDosya ?? 0) > 0, adet: k.buyukDosya, mb: k.buyukMb })),
  );
  const [kalite, setKalite] = useState(85);
  const [yedekle, setYedekle] = useState(true);
  const [tarama, setTarama] = useState<Tarama | null>(null);
  const [taraniyor, setTaraniyor] = useState(false);
  const [ornekNo, setOrnekNo] = useState(0);
  const [ornek, setOrnek] = useState<Ornek | null>(null);
  const [gorseller, setGorseller] = useState<{ once: string; sonra: string } | null>(null);
  const [ornekYukleniyor, setOrnekYukleniyor] = useState(false);
  const [buyut, setBuyut] = useState(false);
  const [calisma, setCalisma] = useState<Calisma | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yedeksizOnay, setYedeksizOnay] = useState(false);
  const [dosyaSor, dosyaSecici] = useDosyaSecici();

  const seciliKlasorler = klasorler.filter((k) => k.secili).map((k) => k.yol);
  const degisti = useRef(false);
  if ((calisma?.kucultulen ?? 0) > 0) degisti.current = true;
  const suruyor = !!calisma?.suruyor;

  // Açılışta önceki/süren işin durumu
  useEffect(() => {
    void api<Calisma>("/resim/durum").then((d) => (d.suruyor || d.bitti ? setCalisma(d) : null)).catch(() => {});
  }, []);
  // Sürerken yokla
  useEffect(() => {
    if (!suruyor) return;
    const id = window.setInterval(() => void api<Calisma>("/resim/durum").then(setCalisma).catch(() => {}), 800);
    return () => window.clearInterval(id);
  }, [suruyor]);

  // Seçim / kalite değişince tarama ve örnek eskir
  useEffect(() => {
    setTarama(null);
  }, [seciliKlasorler.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const tara = async () => {
    setTaraniyor(true);
    setHata(null);
    try {
      const t = await api<Tarama>("/resim/tara", { klasorler: seciliKlasorler, esikKb: ESIK_KB });
      setTarama(t);
      setOrnekNo(0);
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setTaraniyor(false);
    }
  };

  // Örnek: meta + iki görüntü (orijinal / küçültülmüş). Önceki nesne adresleri bırakılır.
  const ornekYol = tarama?.ornekler[ornekNo]?.yol;
  const sonGorsel = useRef<{ once: string; sonra: string } | null>(null);
  useEffect(() => {
    if (!ornekYol) {
      setOrnek(null);
      return;
    }
    let iptal = false;
    setOrnekYukleniyor(true);
    void (async () => {
      try {
        const [m, once, sonra] = await Promise.all([
          api<Ornek>("/resim/ornek", { yol: ornekYol, kalite }),
          apiBlob("/resim/goruntu", { yol: ornekYol }),
          apiBlob("/resim/goruntu", { yol: ornekYol, kalite }),
        ]);
        if (iptal) {
          URL.revokeObjectURL(once);
          URL.revokeObjectURL(sonra);
          return;
        }
        if (sonGorsel.current) {
          URL.revokeObjectURL(sonGorsel.current.once);
          URL.revokeObjectURL(sonGorsel.current.sonra);
        }
        sonGorsel.current = { once, sonra };
        setOrnek(m);
        setGorseller({ once, sonra });
      } catch (e) {
        if (!iptal) setHata((e as Error).message);
      } finally {
        if (!iptal) setOrnekYukleniyor(false);
      }
    })();
    return () => {
      iptal = true;
    };
  }, [ornekYol, kalite]);

  const tahmin = useMemo(() => {
    if (!tarama || !ornek?.yeni || ornek.atlanir) return null;
    const oran = ornek.yeni / ornek.orijinal;
    return { sonra: tarama.bayt * oran, kazanc: tarama.bayt * (1 - oran), yuzde: Math.round((1 - oran) * 100) };
  }, [tarama, ornek]);

  const baslat = async () => {
    setHata(null);
    try {
      setCalisma(await api<Calisma>("/resim/baslat", { kalite, yedekle, taramaNo: tarama?.taramaNo ?? 0 }));
    } catch (e) {
      setHata((e as Error).message);
    }
  };

  const klasorEkle = async () => {
    const [s] = await dosyaSor({ baslik: "Resim klasörü", aciklama: "Küçültülecek resimlerin bulunduğu klasörü açın veya işaretleyin.", mod: "klasor" });
    if (!s || klasorler.some((k) => k.yol.toLowerCase() === s.yol.toLowerCase())) return;
    setKlasorler((l) => [...l, { yol: s.yol, secili: true }]);
  };

  return (
    <div className="min-h-svh bg-gradient-to-b from-violet-50 to-muted/40 to-60% pb-20 dark:from-violet-950/30">
      <header className="flex items-center gap-3 border-b bg-card px-6 py-3">
        <Button variant="ghost" size="icon" onClick={() => onGeri(degisti.current)} disabled={suruyor} aria-label="Geri">
          <ArrowLeft />
        </Button>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
          <Minimize2 className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-violet-600 dark:text-violet-400">Araç</div>
          <h1 className="truncate text-base font-semibold">Resim küçültme</h1>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:block">Çözünürlük değişmez · dosya adları aynı kalır · aktarımdan bağımsız</span>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        {hata && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">{hata}</span>
            <button type="button" onClick={() => setHata(null)} aria-label="Kapat"><X className="size-4" /></button>
          </div>
        )}

        {calisma && (calisma.suruyor || calisma.bitti) ? (
          <CalismaKarti c={calisma} onDurdur={() => void api<Calisma>("/resim/durdur", {}).then(setCalisma)} onYeni={() => { setCalisma(null); setTarama(null); }} />
        ) : (
          <>
            {/* 1) Klasörler */}
            <Kart
              ikon={<Image className="size-4" />}
              renk="bg-violet-500/15 text-violet-600 dark:text-violet-400"
              baslik="Klasörler"
              sag={<Button variant="outline" size="sm" onClick={() => void klasorEkle().catch((e) => setHata(e.message))}><Plus /> Klasör ekle</Button>}
            >
              {klasorler.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">Taramada resim klasörü bulunmadı. "Klasör ekle" ile seçin.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="text-[10px] uppercase tracking-wider">
                      <TableHead className="w-10 pl-4">
                        <Checkbox
                          checked={klasorler.every((k) => k.secili) ? true : klasorler.some((k) => k.secili) ? "indeterminate" : false}
                          onCheckedChange={(c) => setKlasorler((l) => l.map((k) => ({ ...k, secili: c === true })))}
                          aria-label="Tümünü seç"
                        />
                      </TableHead>
                      <TableHead className="px-4">Klasör</TableHead>
                      <TableHead className="px-4 text-right">{ESIK_KB} KB üzeri</TableHead>
                      <TableHead className="px-4 text-right">Boyutları</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {klasorler.map((k, i) => (
                      <TableRow key={k.yol} data-state={k.secili ? "selected" : undefined}>
                        <TableCell className="pl-4">
                          <Checkbox checked={k.secili} onCheckedChange={(c) => setKlasorler((l) => l.map((x, j) => (j === i ? { ...x, secili: c === true } : x)))} />
                        </TableCell>
                        <TableCell className="max-w-96 px-4 font-mono text-xs">
                          <Ipucu metin={k.yol}><div className="truncate">{k.yol}</div></Ipucu>
                        </TableCell>
                        <TableCell className="px-4 text-right tabular-nums">
                          {k.adet == null ? <span className="text-muted-foreground">tarayınca</span> : k.adet === 0 ? <span className="text-muted-foreground">—</span> : (
                            <span className="text-amber-600 dark:text-amber-400">{k.adet.toLocaleString("tr")}</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 text-right tabular-nums text-muted-foreground">{k.mb ? mb(k.mb) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Kart>

            {/* 2) Ayarlar */}
            <Kart ikon={<Settings2 className="size-4" />} renk="bg-slate-500/15 text-slate-600 dark:text-slate-300" baslik="Ayarlar">
              <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-sm font-medium">Kalite</div>
                  <ToggleGroup type="single" variant="outline" value={String(kalite)} onValueChange={(v) => v && setKalite(Number(v))}>
                    {KALITELER.map((k) => (
                      <ToggleGroupItem
                        key={k.deger}
                        value={String(k.deger)}
                        className="h-auto flex-col items-start gap-0 px-3 py-1.5 data-[state=on]:border-violet-600 data-[state=on]:bg-violet-600 data-[state=on]:text-white"
                      >
                        <span className="text-sm font-semibold">{k.ad}</span>
                        <span className="text-[11px] opacity-80">{k.aciklama}</span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Yalnız {ESIK_KB} KB üzeri JPEG'ler işlenir. En az %10 küçülmeyen dosyaya dokunulmaz.
                  </p>
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                  <Checkbox className="mt-0.5" checked={yedekle} onCheckedChange={(c) => setYedekle(c === true)} />
                  <span className="text-sm">
                    <span className="font-medium">Orijinalleri yedekle</span>
                    <span className="block text-xs text-muted-foreground">
                      Her klasörün yanına <span className="font-mono">…_orijinal</span> klasörü açılır, orijinaller oraya kopyalanır. Sorun olursa
                      geri alınır; diskte geçici olarak ek yer ister.
                    </span>
                  </span>
                </label>
              </div>
              <div className="flex items-center gap-3 border-t px-4 py-3">
                <span className="flex-1 text-xs text-muted-foreground">{seciliKlasorler.length} klasör seçili</span>
                <Button variant="outline" disabled={seciliKlasorler.length === 0 || taraniyor} onClick={() => void tara()}>
                  {taraniyor ? <Loader2 className="animate-spin" /> : <ScanSearch />} {tarama ? "Yeniden tara" : "Tara"}
                </Button>
              </div>
            </Kart>

            {/* 3) Önizleme ve sonuç tahmini */}
            {tarama && (
              <Kart
                ikon={<ZoomIn className="size-4" />}
                renk="bg-blue-500/15 text-blue-600 dark:text-blue-400"
                baslik="Önizleme"
                sag={
                  <span className="text-xs text-muted-foreground">
                    {tarama.adet.toLocaleString("tr")} resim · {boyutMetni(tarama.bayt)}
                    {tarama.eksik && " (tarama süre sınırında durdu)"}
                  </span>
                }
              >
                {tarama.adet === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">Seçili klasörlerde {ESIK_KB} KB üzeri JPEG yok — küçültülecek bir şey bulunmadı.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
                      <Button variant="outline" size="icon" className="size-8" disabled={ornekNo === 0} onClick={() => setOrnekNo((n) => n - 1)} aria-label="Önceki örnek">
                        <ChevronLeft />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={ornekNo >= tarama.ornekler.length - 1}
                        onClick={() => setOrnekNo((n) => n + 1)}
                        aria-label="Sonraki örnek"
                      >
                        <ChevronRight />
                      </Button>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                        Örnek {ornekNo + 1}/{tarama.ornekler.length} · {ornekYol}
                      </span>
                      <Toggle variant="outline" size="sm" pressed={buyut} onPressedChange={setBuyut} className="data-[state=on]:bg-blue-600 data-[state=on]:text-white">
                        <ZoomIn /> %100 boyut
                      </Toggle>
                    </div>
                    <Karsilastirma once={gorseller?.once} sonra={gorseller?.sonra} ornek={ornek} kalite={kalite} yukleniyor={ornekYukleniyor} buyut={buyut} />
                    {tahmin && (
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t bg-emerald-500/10 px-4 py-3 text-sm">
                        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                        <span>
                          Tahmini sonuç: <b>{boyutMetni(tarama.bayt)}</b> → <b>{boyutMetni(tahmin.sonra)}</b>
                        </span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          ≈ {boyutMetni(tahmin.kazanc)} kazanç (%{tahmin.yuzde})
                        </span>
                        <span className="text-xs text-muted-foreground">Örneğe göre tahmin; gerçek sonuç resme göre değişir.</span>
                      </div>
                    )}
                  </>
                )}
              </Kart>
            )}
          </>
        )}
      </main>

      {!calisma?.suruyor && !calisma?.bitti && (
        <footer className="fixed inset-x-0 bottom-0 border-t bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {tarama
                ? `${tarama.adet.toLocaleString("tr")} resim · kalite %${kalite} · ${yedekle ? "orijinaller yedeklenecek" : "yedeksiz"}`
                : "Önce klasörleri seçip tarayın."}
            </span>
            <Button
              className="bg-violet-600 text-white hover:bg-violet-700"
              disabled={!tarama || tarama.adet === 0}
              onClick={() => (yedekle ? void baslat() : setYedeksizOnay(true))}
            >
              <Minimize2 /> Küçültmeyi başlat
            </Button>
          </div>
        </footer>
      )}

      {dosyaSecici}

      <AlertDialog open={yedeksizOnay} onOpenChange={setYedeksizOnay}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Yedek almadan küçültülsün mü?</AlertDialogTitle>
            <AlertDialogDescription>
              Orijinal resimler yerinde değiştirilecek ve geri alınamayacak. Emin değilseniz "Orijinalleri yedekle" seçeneğini açın.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void baslat()}>
              Yedeksiz başlat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Önce / sonra yan yana. "%100 boyut" açıkken iki panel birlikte kayar (aynı bölgeye bakılır). */
function Karsilastirma({
  once, sonra, ornek, kalite, yukleniyor, buyut,
}: { once?: string; sonra?: string; ornek: Ornek | null; kalite: number; yukleniyor: boolean; buyut: boolean }) {
  const sol = useRef<HTMLDivElement>(null);
  const sag = useRef<HTMLDivElement>(null);
  const esle = (kaynak: HTMLDivElement | null, hedef: HTMLDivElement | null) => {
    if (!kaynak || !hedef) return;
    if (hedef.scrollTop !== kaynak.scrollTop) hedef.scrollTop = kaynak.scrollTop;
    if (hedef.scrollLeft !== kaynak.scrollLeft) hedef.scrollLeft = kaynak.scrollLeft;
  };
  const azalma = ornek?.yeni ? Math.round((1 - ornek.yeni / ornek.orijinal) * 100) : null;

  // Bileşen değil fonksiyon: her çizimde yeniden kurulmasın (kaydırma konumu korunur).
  const panel = ({ baslik, alt, src, r, diger, vurgu }: { baslik: string; alt: React.ReactNode; src?: string; r: React.RefObject<HTMLDivElement | null>; diger: React.RefObject<HTMLDivElement | null>; vurgu?: boolean }) => (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className={cn("text-sm font-medium", vurgu && "text-violet-700 dark:text-violet-400")}>{baslik}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{alt}</span>
      </div>
      <div
        ref={r}
        onScroll={() => esle(r.current, diger.current)}
        className={cn("relative h-80 rounded-md border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px]", buyut ? "overflow-auto" : "overflow-hidden")}
      >
        {yukleniyor || !src ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <img src={src} alt={baslik} className={buyut ? "max-w-none" : "h-full w-full object-contain"} draggable={false} />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 p-4 md:flex-row">
      {panel({ baslik: "Orijinal", alt: ornek ? `${boyutMetni(ornek.orijinal)} · ${ornek.genislik}×${ornek.yukseklik}` : "", src: once, r: sol, diger: sag })}
      {panel({
        baslik: `Küçültülmüş (%${kalite})`,
        vurgu: true,
        alt:
          ornek?.atlanir ? (
            <span className="text-amber-600 dark:text-amber-400">{ornek.neden ?? "yeterince küçülmüyor — dokunulmaz"}</span>
          ) : ornek?.yeni ? (
            <>
              {boyutMetni(ornek.yeni)} · {ornek.genislik}×{ornek.yukseklik}{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">−%{azalma}</span>
            </>
          ) : (
            ""
          ),
        src: sonra,
        r: sag,
        diger: sol,
      })}
    </div>
  );
}

function CalismaKarti({ c, onDurdur, onYeni }: { c: Calisma; onDurdur: () => void; onYeni: () => void }) {
  const yuzde = c.toplam ? Math.round((c.islenen / c.toplam) * 100) : 0;
  const kazanc = c.onceBayt - c.sonraBayt;
  return (
    <Kart
      ikon={c.suruyor ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
      renk={c.suruyor ? "bg-violet-500/15 text-violet-600 dark:text-violet-400" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"}
      baslik={c.suruyor ? "Küçültülüyor…" : c.durduruldu ? "Durduruldu" : "Tamamlandı"}
      sag={
        c.suruyor ? (
          <Button variant="outline" size="sm" onClick={onDurdur}><Square /> Durdur</Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onYeni}>Yeni küçültme</Button>
        )
      }
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="text-sm text-muted-foreground tabular-nums">
            {c.islenen.toLocaleString("tr")} / {c.toplam.toLocaleString("tr")} resim · kalite %{c.kalite}
          </div>
          <div className="text-2xl font-bold tabular-nums">{yuzde}%</div>
        </div>
        <Progress value={yuzde} className="[&>[data-slot=progress-indicator]]:bg-violet-600" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Sayac ad="Küçültülen" deger={c.kucultulen.toLocaleString("tr")} renk="text-emerald-600 dark:text-emerald-400" />
          <Sayac ad="Dokunulmayan" deger={c.atlanan.toLocaleString("tr")} />
          <Sayac ad="Hata" deger={c.hataSayisi.toLocaleString("tr")} renk={c.hataSayisi ? "text-destructive" : undefined} />
          <Sayac ad="Kazanılan" deger={boyutMetni(kazanc)} renk="text-emerald-600 dark:text-emerald-400" alt={c.onceBayt ? `${boyutMetni(c.onceBayt)} → ${boyutMetni(c.sonraBayt)}` : undefined} />
        </div>
        {c.yedekKlasorleri.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Orijinaller: {c.yedekKlasorleri.map((y) => <span key={y} className="mr-2 font-mono">{y}</span>)}
          </p>
        )}
        {c.hatalar.length > 0 && (
          <ul className="list-disc rounded-md bg-destructive/10 py-2 pr-3 pl-7 text-xs text-destructive">
            {c.hatalar.map((h) => <li key={h}>{h}</li>)}
          </ul>
        )}
      </div>
    </Kart>
  );
}

function Sayac({ ad, deger, renk, alt }: { ad: string; deger: string; renk?: string; alt?: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{ad}</div>
      <div className={cn("text-lg font-semibold tabular-nums", renk)}>{deger}</div>
      {alt && <div className="text-[11px] text-muted-foreground tabular-nums">{alt}</div>}
    </div>
  );
}

function Kart({ ikon, renk, baslik, sag, children }: { ikon: React.ReactNode; renk: string; baslik: string; sag?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-xs">
      <div className="flex min-h-12 items-center gap-2.5 border-b px-4 py-2">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", renk)}>{ikon}</span>
        <h2 className="text-sm font-semibold">{baslik}</h2>
        {sag && <div className="ml-auto">{sag}</div>}
      </div>
      {children}
    </section>
  );
}
