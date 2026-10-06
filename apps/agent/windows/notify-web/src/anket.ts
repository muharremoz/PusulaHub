/**
 * Anket tipleri — Hub'daki apps/web/src/lib/anket.ts ile AYNI biçim.
 * Cevap exe'ye { tur: "okudum", cevaplar } olarak gider; exe ACK msgId'sine
 * "~a~" + base64url(JSON) ekler, Hub poller ayırır.
 */
export type SoruTipi = "tek" | "coklu" | "puan" | "metin";

export interface AnketSorusu {
  id: string;
  tip: SoruTipi;
  soru: string;
  secenekler?: string[];
  zorunlu: boolean;
}

export interface Anket {
  sorular: AnketSorusu[];
}

export type AnketCevaplari = Record<string, string | string[] | number>;

export const METIN_SINIRI = 500;

/** Cevaplanmamış zorunlu sorular (id listesi). */
export function eksikZorunlular(a: Anket, c: AnketCevaplari): string[] {
  return a.sorular
    .filter((s) => s.zorunlu)
    .filter((s) => {
      const v = c[s.id];
      if (v === undefined) return true;
      if (Array.isArray(v)) return v.length === 0;
      if (typeof v === "string") return !v.trim();
      return false;
    })
    .map((s) => s.id);
}
