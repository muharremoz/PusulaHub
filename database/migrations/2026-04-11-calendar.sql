-- Takvim etkinlikleri
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CalendarEvents')
BEGIN
  CREATE TABLE CalendarEvents (
    Id          NVARCHAR(36)  NOT NULL PRIMARY KEY,
    Title       NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    StartDate   DATETIME2     NOT NULL,
    EndDate     DATETIME2     NOT NULL,
    AllDay      BIT           NOT NULL DEFAULT 0,
    Color       NVARCHAR(20)  NOT NULL DEFAULT '#3b82f6',
    Type        NVARCHAR(20)  NOT NULL DEFAULT 'event',  -- event | reminder
    CreatedBy   NVARCHAR(100) NOT NULL DEFAULT 'Admin',
    CreatedAt   DATETIME2     NOT NULL DEFAULT GETDATE(),
    UpdatedAt   DATETIME2     NOT NULL DEFAULT GETDATE()
  )
END
GO
