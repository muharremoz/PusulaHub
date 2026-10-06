import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Loader2, Play, ScanBarcode } from "lucide-react";
import { api, type Durum } from "@/api";
import { Button } from "@/components/ui/button";

/**
 * Ana ekran (orta panel) — sayım kartı. Sayım kuruluysa (Pusula X ya da Pusula; aynı anda biri) görünür:
 * program, (Pusula'da) veritabanı · Perakende/Toptan, SQL bağlantı durumu ve "Sayımı başlat".
 * SQL bağlantısı: son ölçüm 10 dk'dan eskiyse (ya da hiç yoksa) ana ekran açılınca yeniden ölçülür —
 * sürekli yoklama yok. SQL adresi/kullanıcı adı gösterilmez.
 */
export function SayimKarti({ durum, setDurum }: { durum: Durum; setDurum: (d: Durum) => void }) {
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
  const renk = !test ? "bekliyor" : test.ok ? "iyi" : "hata";
  const KUTU = {
    iyi: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
    hata: "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400",
    bekliyor: "bg-muted text-muted-foreground ring-border",
  }[renk];

  return (
    <div className="relative col-span-2 flex items-center gap-3 overflow-hidden rounded-xl border bg-card p-4 shadow-xs">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 [&_svg]:size-5 ${KUTU}`}><ScanBarcode /></span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">Sayım</div>
        <div className="truncate text-[15px] leading-tight font-semibold">
          {sayim.tur === "eski" ? "Pusula" : "Pusula X"}
          {sayim.tur === "eski" && sayim.s.secim && (
            <span className="font-normal text-muted-foreground" title={sayim.s.secim.veritabani}>
              {" · "}{sayim.s.secim.ad} · {sayim.s.secim.formId === "146" ? "Toptan" : "Perakende"}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {olciliyor ? (
            <><Loader2 className="size-3 animate-spin" /> SQL bağlantısı kontrol ediliyor…</>
          ) : !test ? (
            "SQL bağlantısı henüz denetlenmedi"
          ) : test.ok ? (
            <><CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" /> SQL bağlı · {test.sureMs} ms</>
          ) : (
            <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400"><CircleAlert className="size-3.5" /> SQL bağlanamadı</span>
          )}
        </div>
      </div>
      <Button size="sm" className="shrink-0" disabled={basliyor} onClick={() => void baslat()}>
        {basliyor ? <Loader2 className="animate-spin" /> : <Play />} Sayımı başlat
      </Button>
    </div>
  );
}
