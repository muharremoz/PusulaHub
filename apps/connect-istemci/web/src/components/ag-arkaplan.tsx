import { useMemo } from "react";
import type { COBEOptions } from "cobe";
import { Globe } from "@/components/ui/globe";
import { MUSTERI_ULKELERI } from "@/lib/musteri-ulkeleri";

/**
 * Orta panelin arka planı: dönen dünya (Magic UI Globe / cobe). Pusula müşterilerinin olduğu ülkeler
 * işaretli; işaretçi büyüklüğü firma sayısıyla (log) büyür. Türkiye ortada kalır (±6° salınır).
 * Bağlıyken yeşil, değilken gri.
 */

/** 1 firma ≈ 0,03 · Türkiye (~4.900) ≈ 0,1 */
const boyut = (firma: number) => 0.03 + 0.019 * Math.log10(Math.max(1, firma));

export function AgArkaplan({ bagli }: { bagli: boolean }) {
  // Uygulama yalnız .dark sınıfıyla koyulaşır (sistem teması değil)
  const koyu = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const config = useMemo<COBEOptions>(() => {
    const isaret: [number, number, number] = bagli ? [16 / 255, 185 / 255, 129 / 255] : [0.45, 0.5, 0.58];
    return {
      width: 800,
      height: 800,
      onRender: () => {},
      devicePixelRatio: 2,
      // Türkiye (35° D) ortada: cobe'de boylam λ için φ = π − (λ − π/2)
      phi: Math.PI - ((35 * Math.PI) / 180 - Math.PI / 2),
      theta: 0.05, // yarısı panelin altında: eğim az olsun ki Türkiye (39° K) görünen yarının ortasına gelsin
      dark: koyu ? 1 : 0,
      diffuse: 0.4,
      mapSamples: 16000,
      mapBrightness: koyu ? 2.5 : 1.2,
      baseColor: koyu ? [0.3, 0.3, 0.3] : [1, 1, 1],
      markerColor: isaret,
      glowColor: koyu ? [0.15, 0.15, 0.15] : [1, 1, 1],
      markers: MUSTERI_ULKELERI.map((u) => ({ location: u.konum, size: boyut(u.firma) })),
    };
  }, [bagli, koyu]);

  return (
    // Panelin altında, yarısı dışarıda (ufuktan doğan dünya)
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <Globe
        config={config}
        salinim={0.1}
        className="inset-auto bottom-0 left-1/2 w-[min(100%,110vh)] max-w-[900px] -translate-x-1/2 translate-y-1/2 opacity-70"
      />
    </div>
  );
}
