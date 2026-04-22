-- 2026-04-22: Mail özelliği kaldırıldı.
-- Google OAuth token tablosu ve mail moduleKey'ine ait izin kayıtları temizlenir.

IF OBJECT_ID('dbo.UserGoogleTokens', 'U') IS NOT NULL
  DROP TABLE dbo.UserGoogleTokens;

DELETE FROM dbo.UserPermissions WHERE ModuleKey = 'mail';
