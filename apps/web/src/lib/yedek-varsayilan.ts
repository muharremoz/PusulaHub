/**
 * Kurulum sihirbazında bir veritabanının "otomatik yedekleme" kutusu varsayılan
 * olarak işaretli gelsin mi (`sirket.dbo.guvenlik.YedekAl`).
 *
 * Kural — adın içindeki yıl etiketine bakılır:
 *   - **Yılsız ad** (MERKEZ, SERTIFIKA, URETIM…)          → işaretli
 *   - **Güncel yıl** (…26 / …2026, içinde bulunulan yıl)  → işaretli
 *   - **Eski yıl** (…25 / …2025 / …24 / 2013…)            → işaretsiz
 *
 * Neden: eski yıl dataları değişmiyor, 15 dakikada bir diff yedeğe girmeleri
 * yalnız yer ve süre harcıyor. Arşivleri zaten Depo'da `D:\Eski Datalar` altında
 * duruyor. Yıl belirtmeyen datalar (üretim, sertifika, etiket, sipariş gibi
 * sürekli kullanılanlar) ve içinde bulunduğumuz yılın datası yedeklenmeli.
 *
 * Kullanıcı kutuyu elle değiştirebilir; bu yalnız ilk değerdir.
 */

/** Ad içindeki yıl etiketlerini döndürür (4 haneli `20xx` ve tek başına duran 2 haneli). */
function yilEtiketleri(ad: string): number[] {
  const yillar: number[] = []
  // 4 haneli: ...2025, VAL2025 — rakam dizisinin tamamı 20xx olmalı
  for (const m of ad.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)) yillar.push(Number(m[1]))
  // 2 haneli: SECKIN25, MIMRA26 — 15-40 aralığı yıl sayılır (MAVIBAHCE1, ALIAGA2 elenir)
  for (const m of ad.matchAll(/(?<!\d)(\d{2})(?!\d)/g)) {
    const n = Number(m[1])
    if (n >= 15 && n <= 40) yillar.push(2000 + n)
  }
  return yillar
}

/**
 * @param ad      Veritabanı adı — firma prefix'li de olabilir (`4434_BEYHAN25`), prefix atılır.
 * @param bugun   Test için; varsayılan bugün.
 */
export function yedekAlVarsayilan(ad: string, bugun: Date = new Date()): boolean {
  const temiz = (ad ?? "").trim()
  if (!temiz) return true

  // Firma numarası etiketini at: "4434_BEYHAN25" → "BEYHAN25" (yoksa adın kendisi).
  // Yalnız baştaki sayısal blok atılır; "ELA_MAGAZA25" olduğu gibi kalır.
  const govde = temiz.replace(/^\d+_/, "")

  const yillar = yilEtiketleri(govde)
  if (yillar.length === 0) return true                    // yılsız → yedeklenir
  const buYil = bugun.getFullYear()
  return yillar.some((y) => y >= buYil)                    // güncel (veya ileri) yıl varsa yedeklenir
}
