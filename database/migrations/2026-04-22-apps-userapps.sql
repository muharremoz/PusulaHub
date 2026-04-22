-- ============================================================================
-- AppUsers.AllowedApps CSV'den Apps + UserApps join tablosuna geçiş
-- ============================================================================
-- Önceki durum: AppUsers.AllowedApps NVARCHAR(200) — "hub,spareflow"
-- Yeni durum:
--   Apps     : app master kaydı (id, name, isActive)
--   UserApps : AppUsers <→ Apps many-to-many, FK + cascade
--
-- NOT: Eski AllowedApps kolonu bu migration'da DROP EDİLMEZ. Rollback
-- güvenliği için kod geçişinden 1-2 gün sonra ayrı bir migration ile
-- kaldırılır (bkz: 2026-04-XX-drop-allowed-apps.sql — sonra).
-- ============================================================================

-- 1) Apps (app master) -------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Apps' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.Apps (
    Id         VARCHAR(32)    NOT NULL PRIMARY KEY,
    Name       NVARCHAR(64)   NOT NULL,
    IsActive   BIT            NOT NULL CONSTRAINT DF_Apps_IsActive DEFAULT 1,
    CreatedAt  DATETIME2(0)   NOT NULL CONSTRAINT DF_Apps_CreatedAt DEFAULT SYSUTCDATETIME()
  );
  PRINT 'Apps tablosu olusturuldu.';
END
ELSE
  PRINT 'Apps tablosu zaten mevcut.';

-- Bilinen app'leri seed et (apps-registry.ts ve Switch apps.config.ts ile hizali)
IF NOT EXISTS (SELECT 1 FROM dbo.Apps WHERE Id = 'hub')
  INSERT INTO dbo.Apps (Id, Name) VALUES ('hub', 'PusulaHub');
IF NOT EXISTS (SELECT 1 FROM dbo.Apps WHERE Id = 'spareflow')
  INSERT INTO dbo.Apps (Id, Name) VALUES ('spareflow', 'SpareFlow');

-- 2) UserApps (join) --------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'UserApps' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.UserApps (
    UserId     NVARCHAR(36)     NOT NULL,  -- AppUsers.Id ile ayni tip
    AppId      VARCHAR(32)      NOT NULL,
    GrantedAt  DATETIME2(0)     NOT NULL CONSTRAINT DF_UserApps_GrantedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_UserApps PRIMARY KEY (UserId, AppId),
    CONSTRAINT FK_UserApps_User FOREIGN KEY (UserId) REFERENCES dbo.AppUsers(Id) ON DELETE CASCADE,
    CONSTRAINT FK_UserApps_App  FOREIGN KEY (AppId)  REFERENCES dbo.Apps(Id)     ON DELETE CASCADE
  );
  PRINT 'UserApps tablosu olusturuldu.';
END
ELSE
  PRINT 'UserApps tablosu zaten mevcut.';

-- 3) CSV → join tablo veri kopyasi ------------------------------------------
--    STRING_SPLIT SQL Server 2016+ ile gelir. Mevcut veriyi yay; duplicate
--    satirlari MERGE / NOT EXISTS ile engelle.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.AppUsers') AND name = 'AllowedApps')
BEGIN
  INSERT INTO dbo.UserApps (UserId, AppId)
  SELECT u.Id, LTRIM(RTRIM(v.value)) AS AppId
  FROM   dbo.AppUsers u
  CROSS APPLY STRING_SPLIT(u.AllowedApps, ',') v
  WHERE  u.AllowedApps IS NOT NULL
    AND  LTRIM(RTRIM(v.value)) <> ''
    -- yalnizca Apps'te kayitli olanlari al (gecersiz id'ler atilir)
    AND  EXISTS (SELECT 1 FROM dbo.Apps a WHERE a.Id = LTRIM(RTRIM(v.value)))
    -- zaten eklenmisse tekrar ekleme
    AND  NOT EXISTS (
      SELECT 1 FROM dbo.UserApps ua
      WHERE ua.UserId = u.Id AND ua.AppId = LTRIM(RTRIM(v.value))
    );

  DECLARE @rows INT = @@ROWCOUNT;
  PRINT CONCAT('UserApps''a ', @rows, ' kayit kopyalandi.');
END
ELSE
  PRINT 'AllowedApps kolonu yok — veri kopyasi atlandi.';

-- 4) Dogrulama (opsiyonel, konsola ozet yazar) ------------------------------
SELECT
  (SELECT COUNT(*) FROM dbo.Apps)     AS AppsCount,
  (SELECT COUNT(*) FROM dbo.UserApps) AS UserAppsCount;
