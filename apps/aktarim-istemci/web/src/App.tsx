import { useCallback, useEffect, useState } from "react";
import { api, anahtarVar, nabziBaslat, simulasyonApi, type Durum } from "@/api";
import { simulasyonDurumu, simulasyonIstegi, simulasyonKipi } from "@/simulasyon";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnahtarYok, Bekleme } from "@/ekranlar/ortak";
import { GirisEkrani } from "@/ekranlar/giris";
import { SqlGirisEkrani } from "@/ekranlar/baglanti";
import { RaporEkrani } from "@/ekranlar/rapor";
import { AktarimEkrani } from "@/ekranlar/aktarim";

export function App() {
  const [durum, setDurum] = useState<Durum | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const tazele = useCallback(async () => {
    try {
      setDurum(await api<Durum>("/durum"));
      setHata(null);
    } catch (e) {
      setHata((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!anahtarVar()) return;
    void tazele();
    return nabziBaslat();
  }, [tazele]);

  // Arka planda süren adımlarda (SQL arama, tarama) sık yokla; diğerlerinde seyrek.
  const suruyor =
    durum?.asama === "acilis" || durum?.asama === "sqlAraniyor" || durum?.asama === "kesif" || !!durum?.aktarim?.suruyor;
  useEffect(() => {
    if (!anahtarVar()) return;
    const id = window.setInterval(() => void tazele(), suruyor ? 700 : 4000);
    return () => window.clearInterval(id);
  }, [suruyor, tazele]);

  // Geliştirme: ?simule=aktarim → aktarım ekranı sahte verilerle ilerler (gerçek aktarım başlamaz)
  const sim = simulasyonKipi();
  const [, setTik] = useState(0);
  useEffect(() => {
    if (!sim) return;
    simulasyonApi.yakala = (yol) => simulasyonIstegi(yol, durum);
    const id = window.setInterval(() => setTik((x) => x + 1), 400);
    return () => {
      window.clearInterval(id);
      simulasyonApi.yakala = null;
    };
  }, [sim, durum]);
  const gosterilen = sim ? simulasyonDurumu(durum) : durum;

  return (
    <TooltipProvider delayDuration={200}>
      {sim && (
        <div className="pointer-events-none fixed top-2 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-[11px] font-semibold tracking-wider text-background uppercase">
          Simülasyon · {sim}
        </div>
      )}
      <Icerik durum={gosterilen} setDurum={sim ? () => {} : setDurum} hata={hata} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}

function Icerik({ durum, setDurum, hata }: { durum: Durum | null; setDurum: (d: Durum) => void; hata: string | null }) {
  if (!anahtarVar()) return <AnahtarYok />;
  if (!durum) return <Bekleme baslik="Açılıyor…" alt={hata} />;
  const p = { durum, setDurum };
  switch (durum.asama) {
    case "acilis":
      return <Bekleme baslik="Önceki aktarım sürdürülüyor" alt="Pusula'ya bağlanılıyor…" />;
    case "aktarim":
      return durum.aktarim ? <AktarimEkrani {...p} /> : <Bekleme baslik="Hazırlanıyor…" />;
    case "giris":
      return <GirisEkrani {...p} />;
    case "sqlAraniyor":
      return (
        <Bekleme
          baslik="SQL Server aranıyor"
          alt={durum.ilerleme}
          aksiyon={
            <Button variant="outline" size="sm" onClick={() => void api<Durum>("/sql/atla", {}).then(setDurum)}>
              SQL olmadan devam et
            </Button>
          }
        />
      );
    case "sqlGiris":
      return <SqlGirisEkrani {...p} />;
    // Tarama ana ekrandan başlatılır ve orada izlenir (ayrı tarama ekranı kaldırıldı)
    case "taramaBekliyor":
    case "kesif":
    case "hazir":
      return <RaporEkrani {...p} />;
  }
}
