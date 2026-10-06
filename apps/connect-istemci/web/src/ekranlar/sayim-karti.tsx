import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, ScanBarcode } from "lucide-react";
import { api, type Durum } from "@/api";
import { Button } from "@/components/ui/button";
import { YanKart, type Renk } from "./yedekler";

/**
 * Sol panel — sayım. Sayım kuruluysa (Pusula X ya da Pusula; aynı anda biri) görünür: program, (Pusula'da)
 * veritabanı · Perakende/Toptan, SQL bağlantı durumu ve "Sayımı başlat".
 * SQL bağlantısı: son ölçüm 10 dk'dan eskiyse (ya da hiç yoksa) ana ekran açılınca yeniden ölçülür —
 * sürekli yoklama yok. SQL adresi/kullanıcı adı gösterilmez.
 */
export function SayimYanKarti({ durum, setDurum }: { durum: Durum; setDurum: (d: Durum) => void }) {
  const sayim = durum.sayim?.kurulu ? { tur: "pusulax" as const, s: durum.sayim } : durum.sayimEski?.kurulu ? { tur: "eski" as const, s: durum.sayimEski } : null;
  const [basliyor, setBasliyor] = useState(false);
  const [olciliyor, setOlciliyor] = useState(false);
  const tur = sayim?.tur ?? null;
  const sonTest = sayim?.s.test?.zaman ?? null;

  useEffect(() => {
    if (!tur) return;
    if (sonTest && Date.now() - Date.parse(sonTest) < 10 * 60_000) return;
    let iptal = false;
    setOlciliyor(true);
    api("/sayim/test", { tur })
      .then(() => api<Durum>("/durum"))
      .then((d) => { if (!iptal) setDurum(d); })
      .catch(() => {})
      .finally(() => { if (!iptal) setOlciliyor(false); });
    return () => { iptal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tur]);

  if (!sayim) return null;

  const baslat = async () => {
    setBasliyor(true);
    try {
      await api("/sayim/baslat", { tur: sayim.tur });
    } catch (e) {
      toast.error("Sayım başlatılamadı", { description: (e as Error).message });
    } finally {
      // Program kendi penceresinde açılır; çift tıklamada iki kopya açılmasın
      window.setTimeout(() => setBasliyor(false), 2500);
    }
  };

  const test = sayim.s.test;
  const renk: Renk = olciliyor || !test ? "bekliyor" : test.ok ? "iyi" : "hata";
  const secim = sayim.tur === "eski" ? sayim.s.secim : null;

  return (
    <YanKart
      renk={renk}
      ikon={<ScanBarcode />}
      etiket="Sayım"
      baslik={sayim.tur === "eski" ? "Pusula" : "Pusula X"}
      ek={
        <Button size="sm" className="h-7 shrink-0 gap-1 px-2.5 text-xs [&_svg]:size-3.5" disabled={basliyor} onClick={() => void baslat()} title="Sayım programını aç">
          {basliyor ? <Loader2 className="animate-spin" /> : <Play />} Başlat
        </Button>
      }
    >
      <div className="truncate text-xs text-muted-foreground" title={[secim?.veritabani, test?.ok ? `SQL yanıtı ${test.sureMs} ms` : null].filter(Boolean).join(" · ") || undefined}>
        {secim && <>{secim.ad} · {secim.formId === "146" ? "Toptan" : "Perakende"} · </>}
        {olciliyor
          ? "SQL kontrol ediliyor…"
          : !test
            ? "SQL denetlenmedi"
            : test.ok
              ? "SQL hazır"
              : <span className="text-red-600 dark:text-red-400">SQL'e bağlanamadı</span>}
      </div>
    </YanKart>
  );
}
