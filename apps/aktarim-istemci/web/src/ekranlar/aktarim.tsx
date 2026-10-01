import { useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Info, Loader2, Pause, Play, WifiOff, XCircle } from "lucide-react";
import { api, type Durum, type IsOgesi } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { mb } from "./ortak";

type P = { durum: Durum; setDurum: (d: Durum) => void };

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
                {tamam} / {a.ogeler.length} veritabanı tamamlandı{hatali ? ` · ${hatali} hatalı` : ""}
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums">{genel}%</div>
          </div>
          <Progress value={genel} />
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
        {a.bitti && <SunucuDurumu a={a} />}
        {a.bitti && a.veritabanlariAyir && <AyirmaDurumu d={durum} />}

        <section className="overflow-hidden rounded-lg border bg-card">
          {a.ogeler.map((o) => (
            <div key={o.ad} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
              <Simge d={o.durum} suruyor={a.suruyor} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-mono text-sm">{o.ad}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {ADIM[o.durum]}
                    {o.durum === "yukleniyor" && o.boyut > 0 && ` · ${bayt(o.gonderilen)} / ${bayt(o.boyut)}`}
                    {o.durum !== "yukleniyor" && o.durum !== "tamam" && o.durum !== "hata" && o.durum !== "bekliyor" && ` · %${o.yuzde}`}
                    {o.durum === "tamam" && o.boyut > 0 && ` · ${bayt(o.boyut)}`}
                  </span>
                </div>
                {(o.durum === "yedekleniyor" || o.durum === "paketleniyor" || o.durum === "hazirlaniyor" || o.durum === "yukleniyor") && (
                  <Progress value={o.yuzde} className="mt-1.5 h-1.5" />
                )}
                {o.hata && <div className="mt-1 text-xs text-destructive">{o.hata}</div>}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

/** Yükleme bitti: Pusula tarafında dosyalar sunuculara taşınıyor. Müşterinin yapacağı bir şey yok. */
function SunucuDurumu({ a }: { a: NonNullable<Durum["aktarim"]> }) {
  const s = a.sunucu;
  if (!a.bildirildi || !s) {
    return (
      <Alert>
        <Loader2 className="animate-spin" />
        <AlertDescription>Yükleme tamamlandı, Pusula'ya bildiriliyor…</AlertDescription>
      </Alert>
    );
  }
  if (s.durum === "tamamlandi") {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertDescription>Aktarım tamamlandı. Verileriniz Pusula sunucularında; bu pencereyi kapatabilirsiniz.</AlertDescription>
      </Alert>
    );
  }
  if (s.durum === "hata") {
    return (
      <Alert>
        <AlertTriangle />
        <AlertDescription>
          Dosyalarınız bize ulaştı; sunucuya yerleştirirken bir sorun çıktı ve ekibimiz ilgileniyor. Tekrar yüklemeniz gerekmiyor, bu pencereyi
          kapatabilirsiniz.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <Loader2 className="animate-spin" />
      <AlertDescription>
        Dosyalarınız bize ulaştı, Pusula sunucularına yerleştiriliyor ({s.ilerleme}%).{" "}
        {a.veritabanlariAyir
          ? "Pencereyi kapatmayın: işlem bitince veritabanları bu bilgisayardaki SQL Server'dan ayrılacak."
          : "Bu pencereyi kapatabilirsiniz; işlem bizim tarafta sürer."}
      </AlertDescription>
    </Alert>
  );
}

/** Aktarım tamamlandıktan sonra veritabanlarının SQL Server'dan ayrılması (detach). */
function AyirmaDurumu({ d }: { d: Durum }) {
  const y = d.ayirma;
  if (!y) {
    return (
      <Alert>
        <Info />
        <AlertDescription>Aktarım tamamlanınca aktarılan veritabanları bu SQL Server'dan ayrılacak (dosyalar silinmez).</AlertDescription>
      </Alert>
    );
  }
  if (y.durum === "suruyor") {
    return (
      <Alert>
        <Loader2 className="animate-spin" />
        <AlertDescription>Veritabanları SQL Server'dan ayrılıyor… ({y.ayrilanlar.length} ayrıldı)</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant={y.hatalar.length ? "destructive" : "default"}>
      {y.hatalar.length ? <AlertTriangle /> : <CheckCircle2 />}
      <AlertDescription>
        <span>{y.ayrilanlar.length} veritabanı SQL Server'dan ayrıldı. Veri dosyaları diskte duruyor.</span>
        {y.hatalar.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-xs">
            {y.hatalar.map((h) => <li key={h}>{h}</li>)}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}

function Simge({ d, suruyor }: { d: IsOgesi["durum"]; suruyor: boolean }) {
  if (d === "tamam") return <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />;
  if (d === "hata") return <XCircle className="size-5 shrink-0 text-destructive" />;
  if (d === "bekliyor" || !suruyor) return <Circle className="size-5 shrink-0 text-muted-foreground" />;
  return <Loader2 className="size-5 shrink-0 animate-spin text-primary" />;
}
