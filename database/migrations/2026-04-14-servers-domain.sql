-- ============================================================
-- Migration: Servers tablosuna Domain kolonu ekle
-- Tarih: 2026-04-14
-- Sebep: Sunucu eklerken/düzenlerken domain adresini (örn. sirket.local)
--        kaydedebilmek için. AD join, DNS ve servis bağlantılarında kullanılır.
-- ============================================================

USE PusulaHub;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('Servers') AND name = 'Domain'
)
BEGIN
    ALTER TABLE Servers ADD Domain NVARCHAR(255) NULL;
    PRINT 'Servers.Domain kolonu eklendi.';
END
ELSE
BEGIN
    PRINT 'Servers.Domain kolonu zaten mevcut, atlandı.';
END
GO
