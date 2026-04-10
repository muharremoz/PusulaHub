-- ============================================================
-- Migration: WizardServices.ParamFileName kolonunu ekle
-- Tarih: 2026-04-10
-- Sebep: Bazı Pusula hizmetlerinde kuruluma müteakip firma ID'si
--        parametre TXT dosyasına yazılmalı (eski uygulamada
--        TptParametre.txt / Parametre.txt / urtparametre.txt /
--        StokCariParametre.txt idi). Setup/run akışı bu dosya adını
--        bilmeli; hizmet bazlı (NULL = bu hizmette parametre TXT yok).
-- ============================================================

USE PusulaHub;
GO

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('WizardServices') AND name = 'ParamFileName'
)
BEGIN
    ALTER TABLE WizardServices ADD ParamFileName NVARCHAR(100) NULL;
    PRINT 'ParamFileName kolonu eklendi.';
END
ELSE
BEGIN
    PRINT 'ParamFileName kolonu zaten var, atlandi.';
END
GO
