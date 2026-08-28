/**
 * Firma kaynaklarının ad kuralları — TEK KAYNAK.
 *
 * NEDEN AYRI DOSYA: bu kalıplar üç ayrı yerde elle yazılıyordu (kurulum
 * sihirbazı, firma detay sayfası, eski veri restore rotası) ve biri
 * değişince diğerleri geride kalıyordu. Ayrıca `{firkod}_` kalıbı dört
 * FARKLI şey için kullanılıyor — SQL girişi, Users.xml kullanıcısı,
 * veritabanı adı, AD güvenlik grubu — ve bunlar birbirine karıştırılırsa
 * yanlış nesne yeniden adlandırılır.
 *
 * Bu dosya sunucuya özel bir şey import ETMEZ (mssql vb.); istemci
 * bileşenleri de güvenle kullanabilsin diye.
 */

/** "2311.iremtoptan1" → "iremtoptan1" (firma öneki varsa atılır). */
export function kisaKullaniciAdi(firkod: string, tamKullanici: string): string {
  const onek = `${firkod}.`
  return tamKullanici.startsWith(onek) ? tamKullanici.slice(onek.length) : tamKullanici
}

/**
 * Firmanın SQL Server giriş adı.
 *
 * NOKTA ile — AD/RDP kullanıcı adıyla AYNI olsun diye. Eskiden alt çizgi
 * kullanılıyordu (`2311_iremtoptan1`) ve iki hesabın adı bir karakterle
 * ayrıldığı için sürekli karışıyordu: kullanıcı AD adını yazıp SQL'e
 * bağlanmaya çalışınca 18456 alıyordu. Aynı ad, karışma yok.
 *
 * SQL Server'da nokta içeren giriş adı geçerlidir; köşeli parantez içinde
 * kullanılması yeterli ([2311.iremtoptan1]).
 *
 * ⚠ Bu kuraldan ÖNCE kurulan firmaların girişleri hâlâ alt çizgili.
 * Ad üretmek yerine mevcut girişi arayan yerler (eski veri restore) bu
 * yüzden iki biçimi de tanımak zorunda — bkz. sqlLoginArama().
 */
export function sqlLoginAdi(firkod: string, tamKullanici: string): string {
  return `${firkod}.${kisaKullaniciAdi(firkod, tamKullanici)}`
}

/**
 * Mevcut girişi ararken kullanılacak LIKE deseni — hem yeni (nokta) hem
 * eski (alt çizgi) biçimi yakalar.
 *
 * Not: LIKE içinde `_` tek karakter joker'idir, yani `'2311_%'` deseni
 * zaten `2311.xxx` adını da yakalar. Buna bel bağlamak yerine niyeti
 * açıkça yazıyoruz; desen ileride değişirse sessizce bozulmasın.
 */
export function sqlLoginArama(firkod: string): string {
  return `${firkod}[._]%`
}

/**
 * Users.xml / web uygulaması kimliği — ALT ÇİZGİ kalır.
 * Bu ad SQL girişi değildir; Users.xml biçimiyle uyumlu olmak zorunda,
 * bu yüzden SQL giriş kuralı değişse de burası sabit.
 */
export function apiKullaniciAdi(firkod: string, tamKullanici: string): string {
  return `${firkod}_${kisaKullaniciAdi(firkod, tamKullanici)}`
}
