import { useCallback, useEffect, useState } from "react";
import { ArrowUp, ChevronRight, File, Folder, FolderOpen, HardDrive, Monitor, RefreshCw } from "lucide-react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { mb } from "./ortak";

/**
 * Uygulama içi dosya / klasör seçici — Windows'un kendi penceresi yerine.
 * Veriyi exe'den alır (POST /dosya/listele); seçilen tam yolları döndürür.
 *
 *   const [sor, secici] = useDosyaSecici();
 *   const secilen = await sor({ baslik: "…", mod: "dosya", coklu: true, uzantilar: [".bak"] });  // [{ yol, boyut }]
 *   …
 *   return <>{…}{secici}</>;
 */

export type SeciciAyar = {
  baslik: string;
  aciklama?: string;
  mod: "dosya" | "klasor";
  coklu?: boolean;
  /** Yalnız bu uzantılar listelenir (".exe" gibi). Boş = hepsi. */
  uzantilar?: string[];
};

type Oge = { ad: string; yol: string; klasor: boolean; boyut?: number | null; tarih?: string | null; surucu?: boolean; bos?: number | null; toplam?: number | null };
type Liste = { yol: string; ust: string | null; hata: string | null; ogeler: Oge[]; hizli?: { ad: string; yol: string }[] };

/** Seçilen öğe — boyut yalnız dosyalarda (bayt), klasörde null. */
export type Secilen = { yol: string; boyut: number | null };

type Bekleyen = SeciciAyar & { coz: (s: Secilen[]) => void };

const SON_KLASOR = "aktarim.sonKlasor";

export function useDosyaSecici(): [(a: SeciciAyar) => Promise<Secilen[]>, React.ReactNode] {
  const [bekleyen, setBekleyen] = useState<Bekleyen | null>(null);
  const sor = useCallback((a: SeciciAyar) => new Promise<Secilen[]>((coz) => setBekleyen({ ...a, coz })), []);
  const kapat = (s: Secilen[]) => {
    bekleyen?.coz(s);
    setBekleyen(null);
  };
  return [sor, bekleyen ? <DosyaSecici key={bekleyen.baslik} ayar={bekleyen} onKapat={kapat} /> : null];
}

function DosyaSecici({ ayar, onKapat }: { ayar: SeciciAyar; onKapat: (s: Secilen[]) => void }) {
  const [kok, setKok] = useState<Liste | null>(null);
  const [liste, setListe] = useState<Liste | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yolMetni, setYolMetni] = useState("");
  const [secilen, setSecilen] = useState<Secilen[]>([]);
  const dosyaMod = ayar.mod === "dosya";

  const git = useCallback(
    async (yol: string) => {
      setYukleniyor(true);
      try {
        const l = await api<Liste>("/dosya/listele", { yol, dosyalar: dosyaMod, uzantilar: ayar.uzantilar ?? [] });
        setListe(l);
        setYolMetni(l.yol);
        if (!l.yol) setKok(l);
        else {
          try { localStorage.setItem(SON_KLASOR, l.yol); } catch { /* depolama kapalı */ }
        }
      } catch (e) {
        setListe({ yol, ust: null, hata: (e as Error).message, ogeler: [] });
      } finally {
        setYukleniyor(false);
      }
    },
    [dosyaMod, ayar.uzantilar],
  );

  useEffect(() => {
    // Kök (sürücüler + hızlı erişim) her zaman yüklenir; açılışta son kullanılan klasöre gidilir.
    void api<Liste>("/dosya/listele", { yol: "" }).then(setKok).catch(() => {});
    let son = "";
    try { son = localStorage.getItem(SON_KLASOR) ?? ""; } catch { /* depolama kapalı */ }
    void git(son);
  }, [git]);

  const tikla = (o: Oge) => {
    if (o.klasor && dosyaMod) return void git(o.yol);
    const yeni: Secilen = { yol: o.yol, boyut: o.klasor ? null : o.boyut ?? null };
    if (ayar.coklu) setSecilen((s) => (s.some((x) => x.yol === o.yol) ? s.filter((x) => x.yol !== o.yol) : [...s, yeni]));
    else setSecilen((s) => (s[0]?.yol === o.yol ? [] : [yeni]));
  };

  // Klasör modunda hiçbir alt klasör işaretli değilse "Seç" bulunulan klasörü seçer.
  const sonuc: Secilen[] = !dosyaMod && secilen.length === 0 && liste?.yol ? [{ yol: liste.yol, boyut: null }] : secilen;
  const seciliMi = (yol: string) => secilen.some((x) => x.yol === yol);
  const parcalar = (liste?.yol ?? "").split("\\").filter(Boolean);
  const dosyalar = liste?.ogeler.filter((o) => !o.klasor) ?? [];
  const hepsiSecili = ayar.coklu && dosyalar.length > 0 && dosyalar.every((o) => seciliMi(o.yol));

  return (
    <Dialog open onOpenChange={(o) => !o && onKapat([])}>
      <DialogContent className="flex h-[min(640px,85vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{ayar.baslik}</DialogTitle>
          <DialogDescription>
            {ayar.aciklama ??
              (dosyaMod
                ? `${ayar.coklu ? "Bir veya birden fazla dosya" : "Bir dosya"} seçin${ayar.uzantilar?.length ? ` (${ayar.uzantilar.join(", ")})` : ""}.`
                : "Bir klasörü açın veya işaretleyin.")}
          </DialogDescription>
        </DialogHeader>

        {/* Araç çubuğu: üst klasör, yol, yenile */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Button variant="outline" size="icon" className="size-8" disabled={liste?.ust == null || !liste.yol} onClick={() => void git(liste?.ust ?? "")} aria-label="Üst klasör">
            <ArrowUp />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden rounded-md border px-2 text-sm">
            <button type="button" className="shrink-0 rounded px-1 py-1 hover:bg-muted" onClick={() => void git("")}>
              <Monitor className="size-4 text-muted-foreground" />
            </button>
            {parcalar.map((p, i) => (
              <span key={i} className="flex min-w-0 items-center">
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                <button
                  type="button"
                  className="truncate rounded px-1 py-1 hover:bg-muted"
                  onClick={() => void git(parcalar.slice(0, i + 1).join("\\") + (i === 0 ? "\\" : ""))}
                >
                  {p}
                </button>
              </span>
            ))}
          </div>
          <Input
            value={yolMetni}
            onChange={(e) => setYolMetni(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void git(yolMetni)}
            placeholder="Yol yazıp Enter…"
            className="h-8 w-56 font-mono text-xs"
          />
          <Button variant="outline" size="icon" className="size-8" onClick={() => void git(liste?.yol ?? "")} aria-label="Yenile">
            <RefreshCw />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Sol: hızlı erişim + sürücüler */}
          <nav className="w-48 shrink-0 overflow-y-auto border-r p-2 text-sm">
            {kok?.hizli?.map((h) => (
              <YanOge key={h.yol} ikon={<FolderOpen />} ad={h.ad} aktif={liste?.yol === h.yol} onClick={() => void git(h.yol)} />
            ))}
            {!!kok?.hizli?.length && <div className="my-2 border-t" />}
            {kok?.ogeler.map((s) => (
              <YanOge
                key={s.yol}
                ikon={<HardDrive />}
                ad={s.ad}
                alt={s.bos != null ? `${mb(s.bos / 1048576)} boş` : undefined}
                aktif={!!liste?.yol && liste.yol.toLowerCase().startsWith(s.yol.toLowerCase())}
                onClick={() => void git(s.yol)}
              />
            ))}
          </nav>

          {/* Sağ: içerik */}
          <div className="min-w-0 flex-1 overflow-y-auto">
            {yukleniyor ? (
              <div className="flex flex-col gap-2 p-4">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
              </div>
            ) : (
              <>
                {liste?.hata && <p className="border-b bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">{liste.hata}</p>}
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="text-[10px] uppercase tracking-wider">
                      <TableHead className="w-10 pl-4">
                        {ayar.coklu && dosyalar.length > 0 && (
                          <Checkbox
                            checked={hepsiSecili ? true : dosyalar.some((o) => seciliMi(o.yol)) ? "indeterminate" : false}
                            onCheckedChange={(c) =>
                              setSecilen((s) =>
                                c === true
                                  ? [...s, ...dosyalar.filter((o) => !s.some((x) => x.yol === o.yol)).map((o) => ({ yol: o.yol, boyut: o.boyut ?? null }))]
                                  : s.filter((x) => !dosyalar.some((o) => o.yol === x.yol)),
                              )
                            }
                            aria-label="Tüm dosyaları seç"
                          />
                        )}
                      </TableHead>
                      <TableHead>Ad</TableHead>
                      <TableHead className="w-36">Değiştirilme</TableHead>
                      <TableHead className="w-24 pr-4 text-right">Boyut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liste?.ogeler.length === 0 && !liste.hata && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                          {dosyaMod ? "Bu klasörde uygun dosya yok." : "Alt klasör yok."}
                        </TableCell>
                      </TableRow>
                    )}
                    {liste?.ogeler.map((o) => {
                      const isaretli = seciliMi(o.yol);
                      const secilebilir = dosyaMod ? !o.klasor : true;
                      return (
                        <TableRow
                          key={o.yol}
                          data-state={isaretli ? "selected" : undefined}
                          className="cursor-pointer select-none"
                          onClick={() => tikla(o)}
                          onDoubleClick={() => {
                            if (o.klasor) void git(o.yol);
                            else if (!ayar.coklu) onKapat([{ yol: o.yol, boyut: o.boyut ?? null }]);
                          }}
                        >
                          <TableCell className="pl-4">
                            {secilebilir && (ayar.coklu || !o.klasor || !dosyaMod) && (
                              <Checkbox checked={isaretli} tabIndex={-1} className="pointer-events-none" aria-hidden />
                            )}
                          </TableCell>
                          <TableCell className="max-w-0">
                            <span className="flex min-w-0 items-center gap-2">
                              {o.surucu ? (
                                <HardDrive className="size-4 shrink-0 text-muted-foreground" />
                              ) : o.klasor ? (
                                <Folder className="size-4 shrink-0 fill-amber-400/30 text-amber-500" />
                              ) : (
                                <File className="size-4 shrink-0 text-muted-foreground" />
                              )}
                              <span className="truncate">{o.ad}</span>
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground tabular-nums">
                            {o.tarih ? new Date(o.tarih).toLocaleString("tr", { dateStyle: "short", timeStyle: "short" }) : ""}
                          </TableCell>
                          <TableCell className="pr-4 text-right text-xs text-muted-foreground tabular-nums">
                            {o.boyut != null ? boyutMetni(o.boyut) : o.toplam != null ? boyutMetni(o.toplam) : ""}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="m-0 flex-row items-center gap-3 rounded-none border-t bg-muted/40 px-5 py-4 sm:justify-between">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {sonuc.length === 0
              ? dosyaMod ? "Dosya seçilmedi — çift tıklayarak klasörlere girin." : "Bir klasör açın."
              : sonuc.length === 1
                ? <span className="font-mono text-foreground">{sonuc[0].yol}{sonuc[0].boyut != null && ` · ${boyutMetni(sonuc[0].boyut)}`}</span>
                : `${sonuc.length} dosya seçildi · ${boyutMetni(sonuc.reduce((t, x) => t + (x.boyut ?? 0), 0))}`}
          </span>
          <Button variant="outline" onClick={() => onKapat([])}>İptal</Button>
          <Button disabled={sonuc.length === 0} onClick={() => onKapat(sonuc)}>
            {dosyaMod ? "Seç" : "Bu klasörü seç"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function YanOge({ ikon, ad, alt, aktif, onClick }: { ikon: React.ReactNode; ad: string; alt?: string; aktif?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        aktif && "bg-muted font-medium",
      )}
    >
      {ikon}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{ad}</span>
        {alt && <span className="block truncate text-[11px] font-normal text-muted-foreground">{alt}</span>}
      </span>
    </button>
  );
}

export function boyutMetni(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toLocaleString("tr", { maximumFractionDigits: 0 })} KB`;
  return mb(b / 1048576);
}
