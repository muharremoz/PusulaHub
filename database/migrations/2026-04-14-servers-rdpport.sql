-- Servers.RdpPort — RDP rolündeki sunucu için RDP port bilgisi (müşteri mesajında dns:port olarak gösterilir).
IF COL_LENGTH('dbo.Servers', 'RdpPort') IS NULL
BEGIN
    ALTER TABLE dbo.Servers ADD RdpPort INT NULL;
END
GO
