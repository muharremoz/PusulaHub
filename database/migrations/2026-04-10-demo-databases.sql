-- ============================================================
-- Migration: DemoDatabases tablosu
-- Tarih: 2026-04-10
-- Sebep: Firma kurulum sihirbazı 5. adım "Veri Kaynağı → Demo
--        Veritabanı" modu artık mock data yerine DB kataloğundan
--        beslenir. Her demo DB; bir görünen ad, bir teknik ad,
--        boyut bilgisi ve kaynak yolu tutar. Sihirbazda kullanıcı
--        bunlardan seçerek yeni firmaya restore ettirir.
-- ============================================================

USE PusulaHub;
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DemoDatabases' AND xtype='U')
CREATE TABLE DemoDatabases (
    Id           INT           IDENTITY(1,1) PRIMARY KEY,
    Name         NVARCHAR(200) NOT NULL,        -- UI'da görünen ad (örn. "ERP Demo")
    DataName     NVARCHAR(200) NOT NULL,        -- Teknik DB adı (örn. "ERP_DEMO") — firma prefix eklenir
    SizeMB       INT           NOT NULL DEFAULT 0,
    LocationType NVARCHAR(50)  NOT NULL DEFAULT 'Yerel',  -- 'Yerel' | 'Şablon' | 'Uzak'
    LocationPath NVARCHAR(500) NULL,            -- .bak yolu veya şablon konumu
    Description  NVARCHAR(500) NULL,            -- Kısa açıklama (opsiyonel)
    DisplayOrder INT           NOT NULL DEFAULT 0,
    IsActive     BIT           NOT NULL DEFAULT 1,
    CreatedAt    DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt    DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);
GO

PRINT 'DemoDatabases tablosu hazir.';
GO
