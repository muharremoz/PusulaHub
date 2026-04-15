-- ========================================================================
-- Migration (2026-04-14)
-- 1) Companies.SqlServerId — sihirbazda seçilen SQL sunucusu
-- 2) SQLDatabases'e RecoveryModel, Owner, DataFilePath, LogFilePath
-- ========================================================================

USE PusulaHub;
GO

-- 1) Companies.SqlServerId
IF COL_LENGTH('dbo.Companies', 'SqlServerId') IS NULL
BEGIN
    ALTER TABLE dbo.Companies ADD SqlServerId NVARCHAR(50) NULL;
    PRINT 'Companies.SqlServerId eklendi.';
END
GO

-- 2) SQLDatabases yeni kolonlar
IF COL_LENGTH('dbo.SQLDatabases', 'RecoveryModel') IS NULL
BEGIN
    ALTER TABLE dbo.SQLDatabases ADD RecoveryModel NVARCHAR(30) NULL;
    PRINT 'SQLDatabases.RecoveryModel eklendi.';
END
GO

IF COL_LENGTH('dbo.SQLDatabases', 'Owner') IS NULL
BEGIN
    ALTER TABLE dbo.SQLDatabases ADD [Owner] NVARCHAR(200) NULL;
    PRINT 'SQLDatabases.Owner eklendi.';
END
GO

IF COL_LENGTH('dbo.SQLDatabases', 'DataFilePath') IS NULL
BEGIN
    ALTER TABLE dbo.SQLDatabases ADD DataFilePath NVARCHAR(500) NULL;
    PRINT 'SQLDatabases.DataFilePath eklendi.';
END
GO

IF COL_LENGTH('dbo.SQLDatabases', 'LogFilePath') IS NULL
BEGIN
    ALTER TABLE dbo.SQLDatabases ADD LogFilePath NVARCHAR(500) NULL;
    PRINT 'SQLDatabases.LogFilePath eklendi.';
END
GO

PRINT 'Migration tamamlandi.';
GO
