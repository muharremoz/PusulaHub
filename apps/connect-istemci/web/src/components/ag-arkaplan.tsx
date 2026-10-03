import { useMemo } from "react";
import type { COBEOptions } from "cobe";
import { Globe } from "@/components/ui/globe";
import { MUSTERI_ILLERI, MUSTERI_ULKELERI } from "@/lib/musteri-konumlari";

/**
 * Orta panelin arka planı: dünya (Magic UI Globe / cobe). Pusula müşterilerinin olduğu iller ve ülkeler
 * işaretli — İstanbul ve Ankara belirgin, diğerleri firma sayısıyla (log) büyür; hepsi nabız gibi atar. Türkiye ortada kalır (±6° salınır).
 * Bağlıyken yeşil, değilken gri.
 */

const log = (n: number) => Math.log10(Math.max(1, n));
/** İller: İstanbul ve Ankara öne çıkar, diğerleri küçük nokta (10 firma ≈ 0,017 · 150 ≈ 0,023) */
const ilBoyutu = (ad: string, firma: number) =>
  ad === "İstanbul" ? 0.085 : ad === "Ankara" ? 0.065 : 0.012 + 0.005 * log(firma);
/** Yurt dışı: tek tek göründükleri için biraz daha iri (1 firma ≈ 0,026 · Almanya 33 ≈ 0,041) */
const ulkeBoyutu = (firma: number) => 0.026 + 0.01 * log(firma);

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
      theta: 0.2, // kuzey öne eğik: Türkiye + Avrupa kartların altındaki görünen yarının ortasına iner
      dark: koyu ? 1 : 0,
      diffuse: 0.4,
      mapSamples: 16000,
      mapBrightness: koyu ? 2.5 : 1.2,
      baseColor: koyu ? [0.3, 0.3, 0.3] : [1, 1, 1],
      markerColor: isaret,
      glowColor: koyu ? [0.15, 0.15, 0.15] : [1, 1, 1],
      // cobe en çok 64 işaretçi çizer (13 ülke + 51 il)
      markers: [
        ...MUSTERI_ILLERI.map((i) => ({ location: i.konum, size: ilBoyutu(i.ad, i.firma) })),
        ...MUSTERI_ULKELERI.map((u) => ({ location: u.konum, size: ulkeBoyutu(u.firma) })),
      ],
    };
  }, [bagli, koyu]);

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
