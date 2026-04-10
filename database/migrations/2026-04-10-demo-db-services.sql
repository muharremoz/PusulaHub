USE PusulaHub;
GO

/* ── DemoDatabases tablosundan SizeMB kolonunu kaldır ──────────────── */
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE Name = N'SizeMB'
      AND Object_ID = Object_ID(N'dbo.DemoDatabases')
)
BEGIN
    -- Varsa default constraint'i düşür
    DECLARE @constraint NVARCHAR(200);
    SELECT @constraint = dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
    WHERE dc.parent_object_id = OBJECT_ID(N'dbo.DemoDatabases')
      AND c.name = N'SizeMB';
    IF @constraint IS NOT NULL
        EXEC('ALTER TABLE dbo.DemoDatabases DROP CONSTRAINT ' + @constraint);

    ALTER TABLE dbo.DemoDatabases DROP COLUMN SizeMB;
    PRINT 'DemoDatabases.SizeMB kolonu silindi';
END
GO

/* ── DemoDatabaseServices junction tablosu ─────────────────────────── */
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DemoDatabaseServices' AND xtype='U')
BEGIN
    CREATE TABLE dbo.DemoDatabaseServices (
        DemoDatabaseId INT NOT NULL,
        ServiceId      INT NOT NULL,
        CONSTRAINT PK_DemoDatabaseServices PRIMARY KEY (DemoDatabaseId, ServiceId),
        CONSTRAINT FK_DemoDatabaseServices_DemoDatabase
            FOREIGN KEY (DemoDatabaseId) REFERENCES dbo.DemoDatabases(Id) ON DELETE CASCADE,
        CONSTRAINT FK_DemoDatabaseServices_Service
            FOREIGN KEY (ServiceId) REFERENCES dbo.WizardServices(Id) ON DELETE CASCADE
    );
    PRINT 'DemoDatabaseServices junction tablosu oluşturuldu';
END
GO
