import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Loader2, Pause, Play, Plus, WifiOff, XCircle } from "lucide-react";
import { api, type Durum, type IsOgesi } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AktarimAdimlari } from "./aktarim-adimlari";
import { mb } from "./ortak";

type P = { durum: Durum; setDurum: (d: Durum) => void };

/** Öğe türü etiketi — rapor ekranındaki sekme renkleriyle aynı. */
const TUR: Record<string, { ad: string; renk: string }> = {
  veritabani: { ad: "Veritabanı", renk: "bg-muted text-foreground" },
  eski: { ad: "Eski yıl", renk: "bg-muted text-foreground" },
  resim: { ad: "Resim", renk: "bg-muted text-foreground" },
  program: { ad: "Program", renk: "bg-muted text-foreground" },
  ek: { ad: "Ek dosya", renk: "bg-muted text-foreground" },
};

const ADIM: Record<IsOgesi["durum"], string> = {
  bekliyor: "Sırada",
  yedekleniyor: "Yedekleniyor",
  paketleniyor: "Paketleniyor",
  hazirlaniyor: "Doğrulanıyor",
  yukleniyor: "Yükleniyor",
  tamam: "Tamamlandı",
  hata: "Hata",
};

const bayt = (b: number) => mb(b / 1048576);

/** Öğenin tek parça ilerlemesi (0–1): aşama değişince çubuk başa dönmesin. */
function ogeIlerlemesi(o: IsOgesi): number {
  if (o.durum === "tamam") return 1;
  if (o.durum === "yukleniyor") return 0.4 + 0.6 * (o.yuzde / 100);
  if (o.durum === "hazirlaniyor") return 0.35;
  if (o.durum === "yedekleniyor" || o.durum === "paketleniyor") return 0.3 * (o.yuzde / 100);
  return 0;
}

/** Aktarım ilerlemesi — veritabanı başına yedek → doğrulama → yükleme. */
export function AktarimEkrani({ durum, setDurum }: P) {
  const a = durum.aktarim!;
  const [bekle, setBekle] = useState(false);
  const tamam = a.ogeler.filter((o) => o.durum === "tamam").length;
  const hatali = a.ogeler.filter((o) => o.durum === "hata").length;
  // Genel ilerleme: her öğe eşit ağırlık değil, veri boyutuna göre.
  const toplam = a.ogeler.reduce((t, o) => t + Math.max(1, o.veriMb), 0);
  const ilerleme = a.ogeler.reduce((t, o) => t + Math.max(1, o.veriMb) * ogeIlerlemesi(o), 0);
  // Genel yüzde geri gitmez: paketlerin boyutu paketleme bitince belli olur, toplam büyüyünce yüzde düşüyordu.
  const enYuksek = useRef(0);
  const hesap = Math.round((ilerleme / toplam) * 100);
  if (hesap > enYuksek.current || a.bitti) enYuksek.current = a.bitti ? 100 : hesap;
  const genel = enYuksek.current;

  // Her şey bittiğinde (yükleme + yerleştirme + seçildiyse ayırma) bir kez "Aktarım tamamlandı" penceresi
  const hepsiBitti =
    a.sunucu?.durum === "tamamlandi" &&
    (!a.veritabanlariAyir || (durum.ayirma?.durum === "bitti" && !durum.ayirma.hatalar.length));
  const [tamamPenceresi, setTamamPenceresi] = useState(false);
  const gosterildi = useRef(false);
  useEffect(() => {
    if (!hepsiBitti || gosterildi.current) return;
    gosterildi.current = true;
    const anahtar = "aktarim.tamamGosterildi." + (durum.oturum?.id ?? "");
    try {
      if (sessionStorage.getItem(anahtar)) return;
      sessionStorage.setItem(anahtar, "1");
    } catch {
      /* depolama kapalı: yine göster */
    }
    setTamamPenceresi(true);
  }, [hepsiBitti, durum.oturum?.id]);
  const toplamBoyut = a.ogeler.reduce((t, o) => t + (o.boyut > 0 ? o.boyut : o.veriMb * 1048576), 0);

  const [yeniOnay, setYeniOnay] = useState(false);
  const cagir = async (yol: string) => {
    setBekle(true);
    try {
      setDurum(await api<Durum>(yol, {}));
    } finally {
      setBekle(false);
    }
  };

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="flex items-center gap-3 border-b bg-card px-6 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Aktarım · {durum.oturum?.firmaId}</div>
          <h1 className="truncate text-base font-semibold">{durum.oturum?.firmaAdi}</h1>
        </div>
        {a.bitti && a.yeniAktarimOlur && (
          <Button size="sm" disabled={bekle} onClick={() => setYeniOnay(true)}>
            <Plus /> Yeni aktarım başlat
          </Button>
        )}
        {!a.bitti &&
          (a.suruyor ? (
            <Button variant="outline" size="sm" disabled={bekle} onClick={() => void cagir("/aktarim/duraklat")}>
              <Pause /> Duraklat
            </Button>
          ) : (
            <Button size="sm" disabled={bekle} onClick={() => void cagir("/aktarim/devam")}>
              <Play /> {hatali ? "Yeniden dene" : "Devam et"}
            </Button>
          ))}
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
        <section className="rounded-lg border bg-card p-5">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <div className="text-sm font-medium">
                {a.bitti ? "Tüm veriler Pusula'ya ulaştı" : a.suruyor ? "Aktarım sürüyor" : "Aktarım duraklatıldı"}
              </div>
              <div className="text-xs text-muted-foreground">
                {tamam} / {a.ogeler.length} öğe yüklendi{hatali ? ` · ${hatali} hatalı` : ""}
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums">{genel}%</div>
          </div>
          <Progress value={genel} />
          {a.bitti && !a.yeniAktarimOlur && (
            <p className="mt-3 text-xs text-muted-foreground">
              {a.veritabanlariAyir
                ? "Pusula dosyaları sunuculara taşıyınca veritabanları ayrılacak; sonra yeni aktarım başlatabilirsiniz."
                : "Pusula'ya bildiriliyor…"}
            </p>
          )}
          {!a.bitti && (
            <p className="mt-3 text-xs text-muted-foreground">
              Uygulamayı kapatırsanız aktarım duraklar; yeniden açtığınızda kaldığı yerden devam eder. SQL Server çalışmaya devam edebilir,
              programı kullanmanız engellenmez.
            </p>
          )}
        </section>

        {a.bilgi && (
          <Alert>
            <WifiOff />
            <AlertDescription>{a.bilgi}</AlertDescription>
          </Alert>
        )}
        {durum.mesaj && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>{durum.mesaj}</AlertDescription>
          </Alert>
        )}
        {/* Adımlar ve öğeler yan yana (dar pencerede alt alta) */}
        <div className="grid items-start gap-4 lg:grid-cols-2">
        <AktarimAdimlari d={durum} />

        <section className="min-w-0 overflow-hidden rounded-lg border bg-card shadow-xs">
          <Table className="table-fixed text-[13px]">
            <TableHeader>
              <TableRow className="text-[10px] uppercase tracking-wider hover:bg-transparent">
                <TableHead className="h-8 w-9 pl-3" />
                <TableHead className="h-8 px-2">Öğe</TableHead>
                <TableHead className="h-8 w-24 px-2">Tür</TableHead>
                <TableHead className="h-8 w-20 px-2 text-right">Boyut</TableHead>
                <TableHead className="h-8 w-36 pr-3 pl-2">Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.ogeler.map((o) => {
                const tur = TUR[o.hedef ?? o.tur] ?? TUR[o.tur];
                const suren = o.durum === "yedekleniyor" || o.durum === "paketleniyor" || o.durum === "hazirlaniyor" || o.durum === "yukleniyor";
                return (
                  <TableRow key={o.ad}>
                    <TableCell className="py-1.5 pl-3"><Simge d={o.durum} suruyor={a.suruyor} /></TableCell>
                    <TableCell className="px-2 py-1.5">
                      <div className="truncate" title={o.ad}>{o.ad}</div>
                      {o.hata && <div className="mt-0.5 text-xs whitespace-normal text-destructive">{o.hata}</div>}
                    </TableCell>
                    <TableCell className="truncate px-2 py-1.5 text-muted-foreground">{tur?.ad ?? "—"}</TableCell>
                    <TableCell className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {o.boyut > 0 ? bayt(o.boyut) : o.veriMb > 0 ? mb(o.veriMb) : "—"}
                    </TableCell>
                    <TableCell className="py-1.5 pr-3 pl-2">
                      <div
                        className={"truncate " + (o.durum === "tamam" ? "text-emerald-600 dark:text-emerald-400" : o.durum === "hata" ? "text-destructive" : "text-muted-foreground")}
                        title={o.durum === "yukleniyor" && o.boyut > 0 ? `${bayt(o.gonderilen)} / ${bayt(o.boyut)}` : undefined}
                      >
                        {ADIM[o.durum]}
                        {suren && ` · %${o.yuzde}`}
                      </div>
                      {suren && <Progress value={Math.round(ogeIlerlemesi(o) * 100)} className="mt-1 h-1.5" />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
        </div>
      </main>

      <Dialog open={tamamPenceresi} onOpenChange={setTamamPenceresi}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="items-center text-center">
            <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-8" />
            </span>
            <DialogTitle className="text-xl">Aktarım tamamlandı</DialogTitle>
            <DialogDescription>
              Verileriniz Pusula sunucularına yerleştirildi{a.veritabanlariAyir ? " ve veritabanları bu bilgisayardan ayrıldı" : ""}.
              Bu pencereyi ve uygulamayı kapatabilirsiniz.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-4 text-center">
            <div>
              <div className="text-2xl font-semibold tabular-nums">{a.ogeler.filter((o) => o.durum === "tamam").length}</div>
              <div className="text-xs text-muted-foreground">öğe aktarıldı</div>
            </div>
            <div>
              <div className="text-2xl font-semibold tabular-nums">{bayt(toplamBoyut)}</div>
              <div className="text-xs text-muted-foreground">toplam</div>
            </div>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button className="min-w-32" onClick={() => setTamamPenceresi(false)}>Tamam</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={yeniOnay} onOpenChange={setYeniOnay}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Yeni aktarım başlatılsın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu aktarımın yüklemesi tamamlandı; Pusula sunuculara taşımayı kendisi bitirir. Yeni aktarım için Pusula'dan aldığınız
              yeni aktarım kodunu gireceksiniz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={() => void cagir("/aktarim/yeni")}>Yeni kod gir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Simge({ d, suruyor }: { d: IsOgesi["durum"]; suruyor: boolean }) {
  if (d === "tamam") return <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />;
  if (d === "hata") return <XCircle className="size-4 shrink-0 text-destructive" />;
  if (d === "bekliyor" || !suruyor) return <Circle className="size-4 shrink-0 text-muted-foreground" />;
  return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />;
}
