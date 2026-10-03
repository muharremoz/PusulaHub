import { useMemo } from "react";
import type { COBEOptions } from "cobe";
import { Globe } from "@/components/ui/globe";

/**
 * Orta panelin arka planı: dönen dünya (Magic UI Globe / cobe). İstanbul (Pusula) büyük, Türkiye'deki
 * şehirler küçük işaretçi. Bağlıyken işaretçiler yeşil, değilken gri. Tema açık/koyuya göre renk.
 */

const SEHIRLER: [number, number][] = [
  [39.93, 32.86], [38.42, 27.14], [36.89, 30.71], [37.0, 35.32], [40.19, 29.06], [37.87, 32.48], [41.0, 39.72],
  [37.07, 37.38], [38.73, 35.48], [39.75, 37.02], [37.91, 40.23], [38.5, 43.38], [41.29, 36.33],
];

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
      phi: 0,
      theta: 0.3,
      dark: koyu ? 1 : 0,
      diffuse: 0.4,
      mapSamples: 16000,
      mapBrightness: koyu ? 2.5 : 1.2,
      baseColor: koyu ? [0.3, 0.3, 0.3] : [1, 1, 1],
      markerColor: isaret,
      glowColor: koyu ? [0.15, 0.15, 0.15] : [1, 1, 1],
      markers: [
        { location: [41.0082, 28.9784], size: 0.09 },
        ...SEHIRLER.map((location) => ({ location, size: 0.025 })),
      ],
    };
  }, [bagli, koyu]);

  return (
    // Panelin altında, yarısı dışarıda (ufuktan doğan dünya)
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <Globe
        config={config}
        className="inset-auto bottom-0 left-1/2 w-[min(100%,110vh)] max-w-[900px] -translate-x-1/2 translate-y-1/2 opacity-70"
      />
    </div>
  );
}
