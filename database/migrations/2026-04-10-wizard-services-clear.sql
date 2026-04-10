-- ============================================================
-- Migration: WizardServices seed verilerini temizle
-- Tarih: 2026-04-10
-- Sebep: 2026-04-10-wizard-services.sql ile gelen 15 mock hizmet
--        kaldırılıyor. Hizmetler sihirbaz ekranından (veya manuel
--        olarak) gerçek kaynak klasör yollarıyla eklenecek.
-- ============================================================

USE PusulaHub;
GO

DELETE FROM WizardServices;
DBCC CHECKIDENT ('WizardServices', RESEED, 0);
PRINT 'WizardServices temizlendi, identity sifirlandi.';
GO
