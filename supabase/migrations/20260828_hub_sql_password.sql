-- ═══════════════════════════════════════════════════════════════════════
--  SQL Server giriş şifresi AD şifresinden AYRILIYOR
-- ═══════════════════════════════════════════════════════════════════════
--
--  SORUN
--  `company_user_credentials.password` tek bir şifre tutuyordu ve firma
--  detayındaki "Erişim" sekmesi bunu hem AD/RDP hem SQL şifresi olarak
--  gösteriyordu. İkisi kurulum anında aynı oluyor ama ayrı hesaplar:
--  AD şifresi değiştiğinde SQL girişininki değişmiyor.
--
--  2026-08-28'de yaşandı: İrem Toptan'ın (2311) 9 kullanıcısının AD
--  şifresi değiştirildi, tablo güncellendi ve ekran SQL şifresi olarak da
--  yeni değeri göstermeye başladı — oysa SQL girişi hâlâ eski şifreyle
--  çalışıyordu. Ekranda doğru görünen ama gerçekte yanlış olan bir bilgi,
--  hiç bilgi olmamasından daha kötü.
--
--  ÇÖZÜM
--  Ayrı kolon. Yalnız SQL girişi olan kullanıcının satırında dolu olur
--  (kurulum sihirbazı girişi firmanın 1. kullanıcısı için açıyor).
--  NULL = "bu kullanıcının ayrıca saklanan bir SQL şifresi yok".
--
--  Geriye dönük veri BİLEREK doldurulmuyor: mevcut firmaların SQL
--  şifresinin AD şifresiyle hâlâ aynı olduğunu varsayamayız. Boş kalması,
--  yanlış bir değer göstermekten iyidir; arayüz bu durumu "kayıtlı değil"
--  diye gösteriyor.
-- ═══════════════════════════════════════════════════════════════════════

alter table hub.company_user_credentials
  add column if not exists sql_password text;

comment on column hub.company_user_credentials.sql_password is
  'SQL Server giriş şifresi (AES-256-GCM, enc:v1:). AD/RDP şifresinden ayrıdır; '
  'yalnız firmanın SQL girişi olan kullanıcısında dolu olur. NULL = kayıtlı değil.';
