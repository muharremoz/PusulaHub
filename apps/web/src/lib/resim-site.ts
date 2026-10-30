/**
 * Resim (iis-resim) site adı (30.10.2026). Firma detayından resim hizmeti
 * eklenirken Depo'daki klasör seçilebiliyor; her klasör ayrı site:
 *   kök        → <firmaId>_RESIM
 *   CIGLI      → <firmaId>_RESIM_CIGLI      (1991_RESIM_NUR gibi elle açılmışlarla aynı biçim)
 * Kurulum (api/setup/run) ve ekrandaki önizleme aynı adı üretsin diye tek yerde.
 */

/** Klasör adından site eki: Türkçe harfler ASCII'ye, harf/rakam dışı "_". */
export function resimSiteEki(klasor: string): string {
  const tr: Record<string, string> = { İ: "I", I: "I", Ş: "S", Ğ: "G", Ü: "U", Ö: "O", Ç: "C" }
  return klasor.toLocaleUpperCase("tr").replace(/[İIŞĞÜÖÇ]/g, (c) => tr[c] ?? c).replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

export function resimSiteAdi(firmaId: string, klasor?: string | null): string {
  const ek = klasor ? resimSiteEki(klasor) : ""
  return ek ? `${firmaId}_RESIM_${ek}` : `${firmaId}_RESIM`
}

/** Klasör adı tek bir klasör adı mı (yol ayırıcı, özel karakter, "." / ".." yok). */
export function resimKlasorGecerli(klasor: string): boolean {
  return !/[\\/:*?"<>|']/.test(klasor) && klasor !== "." && klasor !== ".." && !!resimSiteEki(klasor)
}
