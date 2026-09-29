/**
 * Active Directory kullanıcı adı (sAMAccountName) kuralları.
 *
 * AD, sAMAccountName'i EN FAZLA 20 karakter kabul ediyor; aşılırsa New-ADUser
 * "The name provided is not a properly formed account name" (1315) ile düşüyor.
 * Firma öneki ("6675.") de bu 20'ye dahil — 2026-09-29'da kurulum sihirbazında
 * "6675.goldartantwerpen1" (22 karakter) böyle yarıda kaldı.
 *
 * İstemci ve sunucu aynı kontrolü kullanır: ekranda uyarı + ileri düğmesi
 * kapalı, API'de AD'ye gitmeden anlaşılır hata.
 */

export const AD_KULLANICI_ADI_MAX = 20

/** AD'nin sAMAccountName'de kabul etmediği karakterler (+ boşluk). */
const YASAK = /["\[\]:;|=+*?<>/\\,@\s]/

/** Tam kullanıcı adı (öneki dahil) için hata metni; geçerliyse null. */
export function adKullaniciAdiHatasi(tamAd: string): string | null {
  const ad = tamAd.trim()
  if (!ad) return "Kullanıcı adı boş olamaz"
  if (ad.length > AD_KULLANICI_ADI_MAX) {
    return `En fazla ${AD_KULLANICI_ADI_MAX} karakter (firma öneki dahil) — şu an ${ad.length}`
  }
  const k = ad.match(YASAK)
  if (k) return k[0].trim() ? `Geçersiz karakter: ${k[0]}` : "Boşluk kullanılamaz"
  if (ad.endsWith(".")) return "Nokta ile bitemez"
  return null
}

/** Önekten sonra yazılabilecek en fazla karakter sayısı ("6675." → 15). */
export function onekSonrasiMax(firmaId: string): number {
  return Math.max(1, AD_KULLANICI_ADI_MAX - (firmaId.length + 1))
}
