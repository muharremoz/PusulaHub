/**
 * `sirket.dbo.guvenlik.KOD` — Pusula programlarının datayı tanıdığı kod.
 *
 * Varsayılan firma numarasıdır (4515). Aynı firmanın birden fazla datası farklı
 * kod isteyebilir; o zaman ilk data firma numarasını, diğerleri sonuna sıra
 * eklenmiş halini alır: 4515, 45151, 45152… Her zaman gerekmediği için
 * otomatik değil, sihirbazda / Yeni Veritabanı Ekle'de düğmeyle uygulanır.
 * `PusulaFirmaId` kodla değişmez, daima firma numarasıdır.
 */

/** Geçerli kod: 1–9 rakam (guvenlik.KOD int). */
export function kodGecerliMi(kod: string): boolean {
  return /^\d{1,9}$/.test(kod.trim())
}

/** `n` data için sıralı kodlar: [firma, firma+"1", firma+"2", …]. */
export function kodSirala(firmaId: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => (i === 0 ? firmaId : `${firmaId}${i}`))
}

/** Boş/geçersiz kod → firma numarası; sayı olarak (guvenlik.KOD'a yazılacak değer). */
export function kodDegeri(kod: string | undefined | null, firmaId: string): number {
  const k = (kod ?? "").trim()
  return Number.parseInt(kodGecerliMi(k) ? k : firmaId, 10)
}

/** Başka firmanın guvenlik kaydında kullanılan kod. */
export interface KodCakismasi {
  kod: number
  firmaId: number | null
  srkadi: string
  dataYolu: string
}
