-- ============================================================
-- Migration: WizardServices type sistemi + WizardPortRanges
--            + WizardPortAssignments tabloları
-- Tarih: 2026-04-10
-- Sebep: Hizmet türleri farklılaştı (pusula-program / iis-site).
--        Type-specific alanlar JSON Config kolonunda tutulacak.
--        IIS site tipindeki hizmetler port havuzundan port alır;
--        port aralıkları bağımsız bir entity oldu, kurulum
--        sırasında atama yapılır.
--
-- Not: WizardServices içinde veri yok (önceden temizlendi),
--      eski kolonlar (SourceFolderPath, ProgramCode, ParamFileName)
--      güvenle drop ediliyor — yeni veriler Config JSON'una yazılacak.
-- ============================================================

USE PusulaHub;
GO

-- ── 1) WizardServices: Type + Config ekle, eski type-specific kolonları drop et ──

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('WizardServices') AND name = 'Type'
)
BEGIN
    ALTER TABLE WizardServices ADD Type NVARCHAR(50) NOT NULL CONSTRAINT DF_WizardServices_Type DEFAULT 'pusula-program';
    PRINT 'Type kolonu eklendi.';
END
GO

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('WizardServices') AND name = 'Config'
)
BEGIN
    ALTER TABLE WizardServices ADD Config NVARCHAR(MAX) NULL;
    PRINT 'Config kolonu eklendi.';
END
GO

-- Eski type-specific kolonları drop et (önce default constraint varsa drop)
DECLARE @ConstraintName NVARCHAR(200);

-- SourceFolderPath
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('WizardServices') AND name = 'SourceFolderPath')
BEGIN
    SELECT @ConstraintName = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.default_object_id = dc.object_id
    WHERE c.object_id = OBJECT_ID('WizardServices') AND c.name = 'SourceFolderPath';
    IF @ConstraintName IS NOT NULL
        EXEC('ALTER TABLE WizardServices DROP CONSTRAINT ' + @ConstraintName);
    ALTER TABLE WizardServices DROP COLUMN SourceFolderPath;
    PRINT 'SourceFolderPath kolonu drop edildi.';
END
GO

-- ProgramCode
DECLARE @ConstraintName NVARCHAR(200);
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('WizardServices') AND name = 'ProgramCode')
BEGIN
    SELECT @ConstraintName = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.default_object_id = dc.object_id
    WHERE c.object_id = OBJECT_ID('WizardServices') AND c.name = 'ProgramCode';
    IF @ConstraintName IS NOT NULL
        EXEC('ALTER TABLE WizardServices DROP CONSTRAINT ' + @ConstraintName);
    ALTER TABLE WizardServices DROP COLUMN ProgramCode;
    PRINT 'ProgramCode kolonu drop edildi.';
END
GO

-- ParamFileName
DECLARE @ConstraintName NVARCHAR(200);
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('WizardServices') AND name = 'ParamFileName')
BEGIN
    SELECT @ConstraintName = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.default_object_id = dc.object_id
    WHERE c.object_id = OBJECT_ID('WizardServices') AND c.name = 'ParamFileName';
    IF @ConstraintName IS NOT NULL
        EXEC('ALTER TABLE WizardServices DROP CONSTRAINT ' + @ConstraintName);
    ALTER TABLE WizardServices DROP COLUMN ParamFileName;
    PRINT 'ParamFileName kolonu drop edildi.';
END
GO

-- ── 2) WizardPortRanges: bağımsız port aralığı tanımları ──

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WizardPortRanges' AND xtype='U')
CREATE TABLE WizardPortRanges (
    Id           INT           IDENTITY(1,1) PRIMARY KEY,
    Name         NVARCHAR(200) NOT NULL,            -- "RFID Portları"
    PortStart    INT           NOT NULL,
    PortEnd      INT           NOT NULL,
    Protocol     NVARCHAR(10)  NOT NULL DEFAULT 'TCP',  -- TCP / UDP / TCP/UDP
    Description  NVARCHAR(500) NULL,
    IsActive     BIT           NOT NULL DEFAULT 1,
    CreatedAt    DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt    DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT CK_WizardPortRanges_Range CHECK (PortStart >= 1 AND PortEnd <= 65535 AND PortEnd >= PortStart)
);
GO

PRINT 'WizardPortRanges tablosu hazir.';
GO

-- ── 3) WizardPortAssignments: kurulum sırasında dolan atamalar ──

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WizardPortAssignments' AND xtype='U')
CREATE TABLE WizardPortAssignments (
    Id           INT           IDENTITY(1,1) PRIMARY KEY,
    PortRangeId  INT           NOT NULL,
    ServiceId    INT           NOT NULL,
    CompanyId    NVARCHAR(50)  NOT NULL,
    Port         INT           NOT NULL,
    SiteName     NVARCHAR(200) NULL,                -- "RFID_ATLAS" gibi (IIS site adı)
    AssignedAt   DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_WPA_PortRange FOREIGN KEY (PortRangeId) REFERENCES WizardPortRanges(Id),
    CONSTRAINT FK_WPA_Service   FOREIGN KEY (ServiceId)   REFERENCES WizardServices(Id),
    CONSTRAINT UQ_WPA_Range_Port UNIQUE (PortRangeId, Port)
);
GO

PRINT 'WizardPortAssignments tablosu hazir.';
GO

PRINT 'Migration tamamlandi.';
GO
