-- ============================================================================
-- UserApps'e Role + UserPermissions'a AppId ekler
-- ============================================================================
-- Amac: Tek kullanici kimligi, uygulama basina farkli rol ve sayfa izni.
--   - UserApps  : (UserId, AppId, Role)           per-app rol
--   - UserPerms : (UserId, AppId, ModuleKey, Lvl) per-app sayfa izni
--
-- Guvenli idempotent calisir. Mevcut veri:
--   - UserApps satirlari varsa Role = 'user' default
--   - UserPermissions satirlari varsa AppId = 'hub' ile backfill
-- ============================================================================

-- 1) UserApps.Role kolonu -----------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.UserApps') AND name = 'Role'
)
BEGIN
  ALTER TABLE dbo.UserApps
    ADD [Role] NVARCHAR(20) NOT NULL CONSTRAINT DF_UserApps_Role DEFAULT 'user';
  PRINT 'UserApps.Role kolonu eklendi.';
END
ELSE
  PRINT 'UserApps.Role zaten mevcut.';
GO

-- CHECK constraint (admin/user/viewer)
IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints WHERE name = 'CK_UserApps_Role'
)
BEGIN
  ALTER TABLE dbo.UserApps
    ADD CONSTRAINT CK_UserApps_Role CHECK ([Role] IN ('admin','user','viewer'));
  PRINT 'CK_UserApps_Role eklendi.';
END
GO

-- 2) Eski AppUsers.Role -> UserApps.Role backfill ----------------------------
--    Her user'in global role'unu kendisinin izinli oldugu tum app'lere yansit.
UPDATE ua
  SET [Role] = u.[Role]
FROM dbo.UserApps ua
JOIN dbo.AppUsers u ON u.Id = ua.UserId
WHERE u.[Role] IN ('admin','user','viewer')
  AND ua.[Role] = 'user'; -- default olarak kalmis satirlari guncelle

PRINT 'UserApps.Role backfill tamamlandi.';
GO

-- 3) UserPermissions.AppId kolonu --------------------------------------------
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'UserPermissions' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.UserPermissions') AND name = 'AppId'
  )
  BEGIN
    -- Once kolonu nullable ekle, backfill yap, sonra NOT NULL'a cevir
    ALTER TABLE dbo.UserPermissions ADD AppId VARCHAR(32) NULL;
    PRINT 'UserPermissions.AppId (nullable) eklendi.';

    -- Eski satirlar Hub'a ait kabul edilir
    EXEC('UPDATE dbo.UserPermissions SET AppId = ''hub'' WHERE AppId IS NULL');
    PRINT 'Eski UserPermissions satirlari AppId=hub ile backfill edildi.';

    -- NOT NULL + default
    EXEC('ALTER TABLE dbo.UserPermissions ALTER COLUMN AppId VARCHAR(32) NOT NULL');
    EXEC('ALTER TABLE dbo.UserPermissions ADD CONSTRAINT DF_UserPerm_AppId DEFAULT ''hub'' FOR AppId');
    PRINT 'UserPermissions.AppId NOT NULL + default hub.';
  END
  ELSE
    PRINT 'UserPermissions.AppId zaten mevcut.';

  -- FK Apps(Id)
  IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_UserPerm_App'
  )
  BEGIN
    ALTER TABLE dbo.UserPermissions
      ADD CONSTRAINT FK_UserPerm_App FOREIGN KEY (AppId) REFERENCES dbo.Apps(Id) ON DELETE CASCADE;
    PRINT 'FK_UserPerm_App eklendi.';
  END

  -- Primary key'i yeniden kur (UserId, ModuleKey) -> (UserId, AppId, ModuleKey)
  IF EXISTS (
    SELECT 1 FROM sys.key_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.UserPermissions')
      AND type = 'PK'
  )
  BEGIN
    DECLARE @pkName sysname;
    SELECT @pkName = name FROM sys.key_constraints
      WHERE parent_object_id = OBJECT_ID('dbo.UserPermissions') AND type = 'PK';

    -- PK (UserId, AppId, ModuleKey) degilse drop + recreate
    IF NOT EXISTS (
      SELECT 1
      FROM sys.index_columns ic
      JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      WHERE ic.object_id = OBJECT_ID('dbo.UserPermissions')
        AND i.is_primary_key = 1
        AND c.name = 'AppId'
    )
    BEGIN
      EXEC('ALTER TABLE dbo.UserPermissions DROP CONSTRAINT ' + @pkName);
      ALTER TABLE dbo.UserPermissions
        ADD CONSTRAINT PK_UserPermissions PRIMARY KEY (UserId, AppId, ModuleKey);
      PRINT 'UserPermissions PK yeniden olusturuldu (UserId, AppId, ModuleKey).';
    END
  END
END
ELSE
BEGIN
  -- Tablo henuz yoksa olustur
  CREATE TABLE dbo.UserPermissions (
    UserId     NVARCHAR(36)  NOT NULL,
    AppId      VARCHAR(32)   NOT NULL CONSTRAINT DF_UserPerm_AppId DEFAULT 'hub',
    ModuleKey  NVARCHAR(50)  NOT NULL,
    [Level]    NVARCHAR(10)  NOT NULL,
    CONSTRAINT PK_UserPermissions PRIMARY KEY (UserId, AppId, ModuleKey),
    CONSTRAINT FK_UserPerm_User FOREIGN KEY (UserId) REFERENCES dbo.AppUsers(Id) ON DELETE CASCADE,
    CONSTRAINT FK_UserPerm_App  FOREIGN KEY (AppId)  REFERENCES dbo.Apps(Id)     ON DELETE CASCADE,
    CONSTRAINT CK_UserPerm_Level CHECK ([Level] IN ('none','read','write'))
  );
  PRINT 'UserPermissions tablosu olusturuldu.';
END

-- 4) Apps'e ModulesJson kolonu (her app kendi modul katalogunu seed edecek) ---
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Apps') AND name = 'ModulesJson'
)
BEGIN
  ALTER TABLE dbo.Apps ADD ModulesJson NVARCHAR(MAX) NULL;
  PRINT 'Apps.ModulesJson eklendi.';
END

-- 5) Ozet
SELECT
  (SELECT COUNT(*) FROM dbo.Apps)            AS AppsCount,
  (SELECT COUNT(*) FROM dbo.UserApps)        AS UserAppsCount,
  (SELECT COUNT(*) FROM dbo.UserPermissions) AS UserPermCount;
