-- ============================================================
-- Migration: ServerRoles.Role CHECK'ine 'RDP' ekle
-- Tarih: 2026-04-10
-- Sebep: Firma kurulum sihirbazı 2. adım "Bağlantı Sunucusu"
--        listesi RDP rolündeki sunucuları göstermeli.
-- ============================================================

USE PusulaHub;
GO

-- Mevcut CHECK constraint'i bul ve düşür
DECLARE @cname NVARCHAR(200);
SELECT @cname = cc.name
FROM sys.check_constraints cc
INNER JOIN sys.columns col ON col.object_id = cc.parent_object_id AND col.column_id = cc.parent_column_id
WHERE cc.parent_object_id = OBJECT_ID('ServerRoles')
  AND col.name = 'Role';

IF @cname IS NOT NULL
BEGIN
    EXEC('ALTER TABLE ServerRoles DROP CONSTRAINT ' + @cname);
    PRINT 'Eski constraint silindi: ' + @cname;
END
GO

-- Yeni constraint (RDP dahil)
ALTER TABLE ServerRoles
ADD CONSTRAINT CK_ServerRoles_Role
CHECK (Role IN ('AD', 'SQL', 'IIS', 'File', 'DNS', 'DHCP', 'General', 'RDP'));
GO

PRINT 'RDP rolü ServerRoles.Role CHECK constraint''ine eklendi.';
GO
