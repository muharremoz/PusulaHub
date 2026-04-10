-- ============================================================
-- Migration: WizardServices tablosu + seed verisi
-- Tarih: 2026-04-10
-- Sebep: Firma kurulum sihirbazı 4. adım "Hizmetler" mock veri
--        yerine DB'den gerçek katalog okumalı. Her hizmet bir
--        kaynak klasöre (SourceFolderPath) işaret eder; sihirbaz
--        son adımda bu klasörü firma altına kopyalayacak.
--
-- Not: Mevcut 'Services' tablosu sistem servisleri (port/protocol)
--      için kullanıldığından, firma kurulum sihirbazına özel yeni
--      bir tablo açıyoruz.
-- ============================================================

USE PusulaHub;
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WizardServices' AND xtype='U')
CREATE TABLE WizardServices (
    Id               INT           IDENTITY(1,1) PRIMARY KEY,
    Name             NVARCHAR(200) NOT NULL,
    Category         NVARCHAR(100) NOT NULL,
    SourceFolderPath NVARCHAR(500) NOT NULL,  -- Kaynak klasör (sunucuda)
    ProgramCode      NVARCHAR(50)  NULL,       -- Parametre TXT dosyalarına yazılacak kod
    DisplayOrder     INT           NOT NULL DEFAULT 0,
    IsActive         BIT           NOT NULL DEFAULT 1,
    CreatedAt        DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt        DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);
GO

PRINT 'WizardServices tablosu hazir. Hizmetler manuel olarak eklenecek.';
GO
