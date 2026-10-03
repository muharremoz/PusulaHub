import { useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Loader2, Pause, Play, Plus, WifiOff, XCircle } from "lucide-react";
import { api, type Durum, type IsOgesi } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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

/** Aktarım ilerlemesi — veritabanı başına yedek → doğrulama → yükleme. */
export function AktarimEkrani({ durum, setDurum }: P) {
  const a = durum.aktarim!;
  const [bekle, setBekle] = useState(false);
  const tamam = a.ogeler.filter((o) => o.durum === "tamam").length;
  const hatali = a.ogeler.filter((o) => o.durum === "hata").length;
  // Genel ilerleme: her öğe eşit ağırlık değil, veri boyutuna göre.
  const toplam = a.ogeler.reduce((t, o) => t + Math.max(1, o.veriMb), 0);
  const ilerleme = a.ogeler.reduce((t, o) => {
    const agirlik = Math.max(1, o.veriMb);
    if (o.durum === "tamam") return t + agirlik;
    if (o.durum === "yukleniyor") return t + agirlik * (0.4 + 0.6 * (o.yuzde / 100));
    if (o.durum === "hazirlaniyor") return t + agirlik * 0.35;
    if (o.durum === "yedekleniyor") return t + agirlik * 0.3 * (o.yuzde / 100);
    return t;
  }, 0);
  const genel = Math.round((ilerleme / toplam) * 100);

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

      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
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
        <AktarimAdimlari d={durum} />

        <section className="overflow-hidden rounded-lg border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px] uppercase tracking-wider">
                <TableHead className="w-10 pl-4" />
                <TableHead>Öğe</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead className="text-right">Boyut</TableHead>
                <TableHead className="w-48 pr-4">Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.ogeler.map((o) => {
                const tur = TUR[o.hedef ?? o.tur] ?? TUR[o.tur];
                const suren = o.durum === "yedekleniyor" || o.durum === "paketleniyor" || o.durum === "hazirlaniyor" || o.durum === "yukleniyor";
                return (
                  <TableRow key={o.ad}>
                    <TableCell className="pl-4"><Simge d={o.durum} suruyor={a.suruyor} /></TableCell>
                    <TableCell className="max-w-72">
                      <div className="truncate font-medium">{o.ad}</div>
                      {o.hata && <div className="mt-0.5 text-xs whitespace-normal text-destructive">{o.hata}</div>}
                    </TableCell>
                    <TableCell>
                      {tur && <span className={"inline-flex rounded-md px-2 py-0.5 text-xs font-medium " + tur.renk}>{tur.ad}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {o.boyut > 0 ? bayt(o.boyut) : o.veriMb > 0 ? mb(o.veriMb) : "—"}
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className={"text-xs " + (o.durum === "tamam" ? "text-foreground" : o.durum === "hata" ? "text-destructive" : "text-muted-foreground")}>
                        {ADIM[o.durum]}
                        {o.durum === "yukleniyor" && o.boyut > 0 && ` · ${bayt(o.gonderilen)} / ${bayt(o.boyut)}`}
                        {suren && o.durum !== "yukleniyor" && ` · %${o.yuzde}`}
                      </div>
                      {suren && <Progress value={o.yuzde} className="mt-1 h-1.5" />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      </main>

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
  if (d === "tamam") return <CheckCircle2 className="size-5 shrink-0 text-foreground" />;
  if (d === "hata") return <XCircle className="size-5 shrink-0 text-destructive" />;
  if (d === "bekliyor" || !suruyor) return <Circle className="size-5 shrink-0 text-muted-foreground" />;
  return <Loader2 className="size-5 shrink-0 animate-spin text-primary" />;
}
