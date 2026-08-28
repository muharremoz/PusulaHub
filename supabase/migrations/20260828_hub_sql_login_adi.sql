-- ═══════════════════════════════════════════════════════════════════════
--  SQL giriş ADI artık türetilmiyor, saklanıyor
-- ═══════════════════════════════════════════════════════════════════════
--
--  SORUN
--  Arayüz SQL giriş adını kullanıcı adından TÜRETİYORDU. Kural
--  2026-08-28'de alt çizgiden noktaya çevrilince (AD adıyla aynı olsun
--  diye) türetme tüm firmalar için noktalı ad üretmeye başladı — oysa
--  sunucudaki 34 girişin 28'i hâlâ alt çizgili. Yani ekran, var olmayan
--  bir giriş adı gösteriyordu; kullanıcı onu deneyip 18456 alıyordu.
--  (3885.melisa1'de fark edildi: gerçek giriş 3885_melisa1.)
--
--  Ders: bir dış sistemdeki nesnenin adı türetilmez, kaydedilir. Kural
--  değişince türetme sessizce yalan söylemeye başlıyor.
--
--  ÇÖZÜM
--  Gerçek giriş adı kolonu. Sihirbaz oluştururken yazar; mevcut kayıtlar
--  sunucudan okunarak dolduruldu. NULL kalırsa arayüz eski davranışa
--  (türetme) döner — SQL girişi olmayan kullanıcılar için zaten anlamsız.
-- ═══════════════════════════════════════════════════════════════════════

alter table hub.company_user_credentials
  add column if not exists sql_login text;

comment on column hub.company_user_credentials.sql_login is
  'SQL Server''daki GERÇEK giriş adı. Türetilmez — ad kuralı zamanla '
  'değiştiği için (alt çizgi → nokta) türetme yanlış ad üretiyordu. '
  'NULL = bu kullanıcının SQL girişi yok ya da adı kaydedilmemiş.';
