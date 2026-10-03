import { useMemo } from "react";
import type { COBEOptions } from "cobe";
import { Globe } from "@/components/ui/globe";
import { cozumleKonum } from "@/lib/il-koordinatlari";

/**
 * Orta panelin arka planı: dünya (Magic UI Globe / cobe). Yalnız firmanın ili (CRM'deki şehri, profil.sehir)
 * işaretli ve nabız gibi atar; dünya o ile ortalı, hafifçe salınır. Şehir yoksa ya da çözülemezse
 * işaretsiz, Türkiye ortada. Bağlıyken yeşil, değilken gri.
 */

/** Türkiye'nin yaklaşık ortası — şehir bilinmezken */
const TURKIYE: [number, number] = [39.0, 35.0];

export function AgArkaplan({ bagli, sehir }: { bagli: boolean; sehir?: string | null }) {
  // Uygulama yalnız .dark sınıfıyla koyulaşır (sistem teması değil)
  const koyu = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const konum = useMemo(() => cozumleKonum(sehir), [sehir]);

  const config = useMemo<COBEOptions>(() => {
    const isaret: [number, number, number] = bagli ? [16 / 255, 185 / 255, 129 / 255] : [0.45, 0.5, 0.58];
    const merkez: [number, number] = konum ? [konum.lat, konum.lng] : TURKIYE;
    return {
      width: 800,
      height: 800,
      devicePixelRatio: 2,
      // Merkezdeki boylam önde: cobe'de boylam λ için φ = π − (λ − π/2)
      phi: Math.PI - ((merkez[1] * Math.PI) / 180 - Math.PI / 2),
      theta: 0.2, // kuzey öne eğik: Türkiye kartların altındaki görünen yarının ortasına iner
      dark: koyu ? 1 : 0,
      diffuse: 0.4,
      mapSamples: 16000,
      mapBrightness: koyu ? 2.5 : 1.2,
      baseColor: koyu ? [0.3, 0.3, 0.3] : [1, 1, 1],
      markerColor: isaret,
      glowColor: koyu ? [0.15, 0.15, 0.15] : [1, 1, 1],
      markers: konum ? [{ location: [konum.lat, konum.lng], size: 0.03 }] : [],
    };
  }, [bagli, koyu, konum]);

  return (
    // Panelin altında, yarısı dışarıda (ufuktan doğan dünya)
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <Globe
        config={config}
        salinim={0.1}
        nabiz={0.6}
        className="inset-auto bottom-0 left-1/2 w-[min(100%,110vh)] max-w-[900px] -translate-x-1/2 translate-y-1/2 opacity-70"
      />
    </div>
  );
}
