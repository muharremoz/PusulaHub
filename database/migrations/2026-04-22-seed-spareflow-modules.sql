-- ============================================================================
-- SpareFlow modul katalogunu Apps.ModulesJson'a seed eder.
-- ============================================================================
-- Permissions Sheet'teki "SpareFlow" tab'i bu listeyi gosterir ve her modul
-- icin (none/read/write) seviyesi UserPermissions tablosunda saklanir.
--
-- Hub kendi katalogunu kodda tutar (lib/permissions.ts MODULES); diger app'ler
-- icin bu kolonu doldurmak gerekir.
-- ============================================================================

UPDATE dbo.Apps SET ModulesJson = N'[
  {"key":"dashboard","label":"Pano","group":"general"},
  {"key":"installations","label":"Kurulumlar","group":"general"},
  {"key":"customer-keys","label":"Musteri Anahtarlari","group":"general"},
  {"key":"backups","label":"Yedekler","group":"data"},
  {"key":"logs","label":"Loglar","group":"data"},
  {"key":"audit-logs","label":"Denetim Loglari","group":"data"},
  {"key":"password-resets","label":"Sifre Sifirlamalari","group":"admin"},
  {"key":"api-connections","label":"API Baglantilari","group":"admin"},
  {"key":"users","label":"Kullanicilar","group":"admin"},
  {"key":"server","label":"Sunucu","group":"services"},
  {"key":"cloud-server","label":"Bulut Sunucu","group":"services"},
  {"key":"settings","label":"Ayarlar","group":"admin"}
]'
WHERE Id = 'spareflow';

PRINT 'SpareFlow ModulesJson guncellendi.';
