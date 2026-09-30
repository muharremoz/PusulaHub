import { useCallback, useEffect, useState } from "react";
import { api, anahtarVar, nabziBaslat, type Durum } from "@/api";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnahtarYok, Bekleme } from "@/ekranlar/ortak";
import { GirisEkrani } from "@/ekranlar/giris";
import { SqlGirisEkrani } from "@/ekranlar/baglanti";
import { RaporEkrani } from "@/ekranlar/rapor";
import { KapatmaOnayi } from "@/ekranlar/kapatma-onayi";

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
  const suruyor = durum?.asama === "sqlAraniyor" || durum?.asama === "kesif";
  useEffect(() => {
    if (!anahtarVar()) return;
    const id = window.setInterval(() => void tazele(), suruyor ? 700 : 4000);
    return () => window.clearInterval(id);
  }, [suruyor, tazele]);

  return (
    <TooltipProvider delayDuration={200}>
      <Icerik durum={durum} setDurum={setDurum} hata={hata} />
      <Toaster position="bottom-right" />
      {anahtarVar() && <KapatmaOnayi />}
    </TooltipProvider>
  );
}

function Icerik({ durum, setDurum, hata }: { durum: Durum | null; setDurum: (d: Durum) => void; hata: string | null }) {
  if (!anahtarVar()) return <AnahtarYok />;
  if (!durum) return <Bekleme baslik="Açılıyor…" alt={hata} />;
  const p = { durum, setDurum };
  switch (durum.asama) {
    case "giris":
      return <GirisEkrani {...p} />;
    case "sqlAraniyor":
      return <Bekleme baslik="SQL Server aranıyor" alt={durum.ilerleme} />;
    case "sqlGiris":
      return <SqlGirisEkrani {...p} />;
    case "kesif":
      return <Bekleme baslik="Verileriniz taranıyor" alt={durum.ilerleme} />;
    case "hazir":
      return <RaporEkrani {...p} />;
  }
}
