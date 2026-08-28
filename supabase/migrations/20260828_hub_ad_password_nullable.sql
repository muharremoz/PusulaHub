-- ═══════════════════════════════════════════════════════════════════════
--  company_user_credentials.password artık NULL olabilir
-- ═══════════════════════════════════════════════════════════════════════
--
--  NEDEN: bir kullanıcının SQL giriş şifresini bilip AD/RDP şifresini
--  bilmediğimiz durum gerçek. Sihirbaz dışında elle açılmış SQL girişleri
--  böyle (2026-08-28: 6842 Hollanda Gold Point — AD kullanıcısı var,
--  saklanan şifresi yok, SQL girişi sonradan elle oluşturuldu).
--
--  Kolon NOT NULL olduğu için böyle bir kaydı yazabilmenin tek yolu AD
--  şifresi alanına bir değer UYDURMAKTI. Bu, ayrı sql_password kolonunu
--  eklerken kaçındığımız hatanın aynısı olurdu: ekranda doğru görünen ama
--  gerçekte yanlış olan bilgi. NULL = "bilmiyoruz" demenin dürüst yolu.
--
--  Okuma tarafı zaten güvenli: decrypt(null) null döner ve
--  getCompanyCredentials boş değerleri zaten atlıyor.
-- ═══════════════════════════════════════════════════════════════════════

alter table hub.company_user_credentials
  alter column password drop not null;

comment on column hub.company_user_credentials.password is
  'AD/RDP şifresi (AES-256-GCM, enc:v1:). NULL = kayıtlı değil — '
  'SQL şifresi bilinip AD şifresi bilinmeyen kayıtlar için.';
