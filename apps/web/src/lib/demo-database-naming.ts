/**
 * "Görünen Ad" → "Teknik DB Adı" dönüşümü.
 *
 * Restore sırasında hedef DB adı bu üretilen isimdir. Kullanıcı ayrıca
 * "Teknik DB Adı" girmek zorunda kalmasın diye isim otomatik türetilir.
 *
 * Kurallar:
 * - TR karakterleri (ş, ı, ğ, ü, ö, ç) ASCII karşılıklarına normalize edilir
 * - Uppercase'e çevrilir
 * - [A-Z0-9] dışındaki her şey "_" ile değiştirilir
 * - Baş/sondaki "_"ler temizlenir, ardışık "_"ler tek "_" yapılır
 *
 * Örn:
 *   "ERP Demo"           → "ERP_DEMO"
 *   "Muhasebe 2024"      → "MUHASEBE_2024"
 *   "Şablon Çalışma"     → "SABLON_CALISMA"
 *
 * Hem API (POST/PATCH) hem sheet (preview) aynı fonksiyonu kullanır ki
 * kullanıcının gördüğü ile kaydedilen birebir aynı olsun.
 */
export function deriveDataName(name: string): string {
  const tr: Record<string, string> = {
    "ş": "s", "Ş": "S", "ı": "i", "İ": "I", "ğ": "g", "Ğ": "G",
    "ü": "u", "Ü": "U", "ö": "o", "Ö": "O", "ç": "c", "Ç": "C",
  }
  const normalized = name.split("").map((c) => tr[c] ?? c).join("")
  return normalized
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}
