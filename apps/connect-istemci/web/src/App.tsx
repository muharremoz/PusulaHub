import { useCallback, useEffect, useState } from "react";
import { api, anahtarVar, nabziBaslat, type Durum } from "@/api";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnahtarYok, Bekleme } from "@/ekranlar/ortak";
import { GirisEkrani } from "@/ekranlar/giris";
import { AnaEkran } from "@/ekranlar/ana";
import { KapatmaOnayi } from "@/ekranlar/kapatma-onayi";
import { KilitEkrani } from "@/ekranlar/iki-adim";

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

  // VPN kurulumu / güncelleme sürerken sık, yoksa seyrek (terminal kontrolü exe'de 10 sn'de bir).
  const suruyor = durum?.asama === "acilis" || !!durum?.vpnKurulum.suruyor || !!durum?.guncelleme.suruyor;
  useEffect(() => {
    if (!anahtarVar()) return;
    const id = window.setInterval(() => void tazele(), suruyor ? 800 : 3000);
    return () => window.clearInterval(id);
  }, [suruyor, tazele]);

  return (
    <TooltipProvider delayDuration={200}>
      <Icerik durum={durum} setDurum={setDurum} hata={hata} />
      <Toaster position="bottom-right" />
      {anahtarVar() && <KapatmaOnayi mesgul={!!durum?.vpnKurulum.suruyor || !!durum?.guncelleme.suruyor} />}
    </TooltipProvider>
  );
}

function Icerik({ durum, setDurum, hata }: { durum: Durum | null; setDurum: (d: Durum) => void; hata: string | null }) {
  if (!anahtarVar()) return <AnahtarYok />;
  if (!durum) return <Bekleme baslik="Açılıyor…" alt={hata} />;
  const p = { durum, setDurum };
  switch (durum.asama) {
    case "acilis":
      return <Bekleme baslik="Açılıyor…" />;
    case "kayit":
      return <GirisEkrani {...p} />;
    case "hazir":
      return durum.ikiAdim?.kilitli ? <KilitEkrani {...p} /> : <AnaEkran {...p} />;
  }
}
