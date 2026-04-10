-- Migration: Companies tablosuna WindowsServerId ve AdServerId kolonları ekle
-- Sihirbazda seçilen RDP/Terminal sunucu ve AD sunucu bilgisini şirkete bağlar

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('Companies') AND name = 'WindowsServerId'
)
  ALTER TABLE Companies ADD WindowsServerId NVARCHAR(50) NULL REFERENCES Servers(Id);

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('Companies') AND name = 'AdServerId'
)
  ALTER TABLE Companies ADD AdServerId NVARCHAR(50) NULL REFERENCES Servers(Id);
