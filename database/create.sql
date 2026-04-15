-- ============================================================
-- PusulaHub Database Schema
-- ============================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'PusulaHub')
BEGIN
    CREATE DATABASE PusulaHub;
END
GO

USE PusulaHub;
GO

-- ============================================================
-- SUNUCULAR
-- ============================================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Servers' AND xtype='U')
CREATE TABLE Servers (
    Id          NVARCHAR(50)  NOT NULL PRIMARY KEY,
    Name        NVARCHAR(100) NOT NULL,
    IP          NVARCHAR(50)  NOT NULL,
    DNS         NVARCHAR(200) NULL,
    Domain      NVARCHAR(255) NULL,
    OS          NVARCHAR(50)  NOT NULL,
    Status      NVARCHAR(20)  NOT NULL CHECK (Status IN ('online', 'warning', 'offline')),
    CPU         FLOAT         NOT NULL DEFAULT 0,
    RAM         FLOAT         NOT NULL DEFAULT 0,
    Disk        FLOAT         NOT NULL DEFAULT 0,
    Uptime      NVARCHAR(100) NULL,
    LastChecked NVARCHAR(100) NULL,
    CreatedAt   DATETIME2     NOT NULL DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ServerRoles' AND xtype='U')
CREATE TABLE ServerRoles (
    ServerId NVARCHAR(50) NOT NULL REFERENCES Servers(Id) ON DELETE CASCADE,
    Role     NVARCHAR(20) NOT NULL CHECK (Role IN ('AD', 'SQL', 'IIS', 'File', 'DNS', 'DHCP', 'General', 'RDP')),
    PRIMARY KEY (ServerId, Role)
);

-- Ek kolonlar (schema evrimi için)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'ApiKey' AND Object_ID = Object_ID(N'Servers'))
    ALTER TABLE Servers ADD ApiKey NVARCHAR(200) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'AgentPort' AND Object_ID = Object_ID(N'Servers'))
    ALTER TABLE Servers ADD AgentPort INT NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'Username' AND Object_ID = Object_ID(N'Servers'))
    ALTER TABLE Servers ADD Username NVARCHAR(200) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'Password' AND Object_ID = Object_ID(N'Servers'))
    ALTER TABLE Servers ADD Password NVARCHAR(500) NULL;
-- SQL sunucuları için sunucu bazlı SQL credentials (SA kullanıcısı/şifresi)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'SqlUsername' AND Object_ID = Object_ID(N'Servers'))
    ALTER TABLE Servers ADD SqlUsername NVARCHAR(200) NULL;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name = N'SqlPassword' AND Object_ID = Object_ID(N'Servers'))
    ALTER TABLE Servers ADD SqlPassword NVARCHAR(500) NULL;

-- ============================================================
-- FIRMALAR
-- ============================================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Companies' AND xtype='U')
CREATE TABLE Companies (
    Id            NVARCHAR(50)  NOT NULL PRIMARY KEY,
    CompanyId     NVARCHAR(20)  NULL,
    Name          NVARCHAR(200) NOT NULL,
    Sector        NVARCHAR(100) NOT NULL,
    ContactPerson NVARCHAR(200) NOT NULL,
    ContactEmail  NVARCHAR(200) NOT NULL,
    ContactPhone  NVARCHAR(50)  NOT NULL,
    UserCount     INT           NOT NULL DEFAULT 0,
    UserCapacity  INT           NOT NULL DEFAULT 0,
    Status        NVARCHAR(20)  NOT NULL CHECK (Status IN ('active', 'suspended', 'trial')),
    ContractStart DATE          NOT NULL,
    ContractEnd   DATE          NOT NULL,
    QuotaCpu      FLOAT         NOT NULL DEFAULT 0,
    QuotaRam      FLOAT         NOT NULL DEFAULT 0,
    QuotaDisk     FLOAT         NOT NULL DEFAULT 0,
    UsageCpu      FLOAT         NOT NULL DEFAULT 0,
    UsageRam      FLOAT         NOT NULL DEFAULT 0,
    UsageDisk     FLOAT         NOT NULL DEFAULT 0,
    DbQuota       INT           NOT NULL DEFAULT 0,
    WindowsServerId NVARCHAR(50) NULL REFERENCES Servers(Id),
    AdServerId    NVARCHAR(50) NULL REFERENCES Servers(Id),
    Notes         NVARCHAR(MAX) NULL,
    CreatedAt     DATETIME2     NOT NULL DEFAULT GETDATE()
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='UQ_Companies_CompanyId' AND object_id = OBJECT_ID('Companies'))
    ALTER TABLE Companies ADD CONSTRAINT UQ_Companies_CompanyId UNIQUE (CompanyId);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CompanyServers' AND xtype='U')
CREATE TABLE CompanyServers (
    CompanyId NVARCHAR(50) NOT NULL REFERENCES Companies(Id) ON DELETE CASCADE,
    ServerId  NVARCHAR(50) NOT NULL REFERENCES Servers(Id),
    PRIMARY KEY (CompanyId, ServerId)
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CompanyServices' AND xtype='U')
CREATE TABLE CompanyServices (
    Id        INT           IDENTITY(1,1) PRIMARY KEY,
    CompanyId NVARCHAR(50)  NOT NULL REFERENCES Companies(Id) ON DELETE CASCADE,
    Name      NVARCHAR(200) NOT NULL,
    Status    NVARCHAR(20)  NOT NULL CHECK (Status IN ('active', 'inactive'))
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CompanyWeeklyUsage' AND xtype='U')
CREATE TABLE CompanyWeeklyUsage (
    Id        INT          IDENTITY(1,1) PRIMARY KEY,
    CompanyId NVARCHAR(50) NOT NULL REFERENCES Companies(Id) ON DELETE CASCADE,
    Day       NVARCHAR(10) NOT NULL,
    DayOrder  INT          NOT NULL CHECK (DayOrder BETWEEN 1 AND 7),
    CPU       FLOAT        NOT NULL DEFAULT 0,
    RAM       FLOAT        NOT NULL DEFAULT 0,
    Disk      FLOAT        NOT NULL DEFAULT 0
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CompanyDatabases' AND xtype='U')
CREATE TABLE CompanyDatabases (
    Id        INT           IDENTITY(1,1) PRIMARY KEY,
    CompanyId NVARCHAR(50)  NOT NULL REFERENCES Companies(Id) ON DELETE CASCADE,
    Name      NVARCHAR(200) NOT NULL,
    Type      NVARCHAR(20)  NOT NULL CHECK (Type IN ('MSSQL', 'MySQL', 'PostgreSQL')),
    SizeGB    FLOAT         NOT NULL DEFAULT 0,
    Status    NVARCHAR(20)  NOT NULL CHECK (Status IN ('online', 'offline'))
);

-- ============================================================
-- HİZMETLER
-- ============================================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Services' AND xtype='U')
CREATE TABLE Services (
    Id          NVARCHAR(50)  NOT NULL PRIMARY KEY,
    Name        NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Category    NVARCHAR(50)  NOT NULL CHECK (Category IN ('Altyapi', 'Veritabani', 'Web', 'Guvenlik', 'Yedekleme', 'Izleme')),
    Status      NVARCHAR(20)  NOT NULL CHECK (Status IN ('active', 'inactive', 'maintenance')),
    Port        INT           NULL,
    Protocol    NVARCHAR(50)  NULL,
    CreatedAt   DATE          NOT NULL,
    UpdatedAt   DATE          NOT NULL,
    Notes       NVARCHAR(MAX) NULL
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ServiceServers' AND xtype='U')
CREATE TABLE ServiceServers (
    ServiceId  NVARCHAR(50)  NOT NULL REFERENCES Services(Id) ON DELETE CASCADE,
    ServerName NVARCHAR(100) NOT NULL,
    PRIMARY KEY (ServiceId, ServerName)
);

-- ============================================================
-- IIS
-- ============================================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='IISSites' AND xtype='U')
CREATE TABLE IISSites (
    Id           NVARCHAR(50)  NOT NULL PRIMARY KEY,
    Name         NVARCHAR(200) NOT NULL,
    Server       NVARCHAR(100) NOT NULL,
    Status       NVARCHAR(20)  NOT NULL CHECK (Status IN ('Started', 'Stopped')),
    Binding      NVARCHAR(500) NOT NULL,
    AppPool      NVARCHAR(200) NOT NULL,
    PhysicalPath NVARCHAR(500) NOT NULL,
    Firma        NVARCHAR(200) NULL,
    Hizmet       NVARCHAR(200) NULL
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='IISAppPools' AND xtype='U')
CREATE TABLE IISAppPools (
    Name         NVARCHAR(200) NOT NULL PRIMARY KEY,
    Status       NVARCHAR(20)  NOT NULL CHECK (Status IN ('Started', 'Stopped')),
    Runtime      NVARCHAR(50)  NOT NULL,
    PipelineMode NVARCHAR(50)  NOT NULL
);

-- ============================================================
-- SQL SERVER VERİTABANLARI
-- ============================================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SQLDatabases' AND xtype='U')
CREATE TABLE SQLDatabases (
    Id         NVARCHAR(50)  NOT NULL PRIMARY KEY,
    Name       NVARCHAR(200) NOT NULL,
    Server     NVARCHAR(100) NOT NULL,
    FirmaNo    NVARCHAR(20)  NULL,
    SizeMB     INT           NOT NULL DEFAULT 0,
    Status     NVARCHAR(20)  NOT NULL CHECK (Status IN ('Online', 'Offline', 'Restoring')),
    LastBackup DATETIME2     NULL,
    Tables     INT           NOT NULL DEFAULT 0
);

-- ============================================================
-- ACTIVE DIRECTORY
-- ============================================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ADUsers' AND xtype='U')
CREATE TABLE ADUsers (
    Id          NVARCHAR(50)  NOT NULL PRIMARY KEY,
    Server      NVARCHAR(100) NULL,
    Username    NVARCHAR(200) NOT NULL,
    DisplayName NVARCHAR(200) NOT NULL,
    Email       NVARCHAR(200) NOT NULL,
    Phone       NVARCHAR(50)  NULL,
    OU          NVARCHAR(200) NOT NULL,
    Enabled     BIT           NOT NULL DEFAULT 1,
    LastLogin   DATETIME2     NULL,
    CreatedAt   DATE          NOT NULL
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ADOUs' AND xtype='U')
CREATE TABLE ADOUs (
    Id        INT           IDENTITY(1,1) PRIMARY KEY,
    Name      NVARCHAR(200) NOT NULL,
    Path      NVARCHAR(500) NOT NULL UNIQUE,
    ParentId  INT           NULL REFERENCES ADOUs(Id),
    UserCount INT           NOT NULL DEFAULT 0
);

-- ============================================================
-- LOGLAR & OLAYLAR
-- ============================================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LogEntries' AND xtype='U')
CREATE TABLE LogEntries (
    Id        NVARCHAR(50)  NOT NULL PRIMARY KEY,
    Timestamp DATETIME2     NOT NULL,
    Server    NVARCHAR(100) NOT NULL,
    Level     NVARCHAR(20)  NOT NULL CHECK (Level IN ('info', 'warning', 'error', 'critical')),
    Source    NVARCHAR(200) NOT NULL,
    Message   NVARCHAR(MAX) NOT NULL
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RecentEvents' AND xtype='U')
CREATE TABLE RecentEvents (
    Id        NVARCHAR(50)  NOT NULL PRIMARY KEY,
    Timestamp NVARCHAR(50)  NOT NULL,
    Server    NVARCHAR(100) NOT NULL,
    Type      NVARCHAR(20)  NOT NULL CHECK (Type IN ('info', 'warning', 'error', 'success')),
    Message   NVARCHAR(MAX) NOT NULL,
    CreatedAt DATETIME2     NOT NULL DEFAULT GETDATE()
);

-- ============================================================
-- PANEL KULLANICILARI
-- ============================================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PanelUsers' AND xtype='U')
CREATE TABLE PanelUsers (
    Id           NVARCHAR(50)  NOT NULL PRIMARY KEY,
    Name         NVARCHAR(200) NOT NULL,
    Email        NVARCHAR(200) NOT NULL UNIQUE,
    Role         NVARCHAR(20)  NOT NULL CHECK (Role IN ('admin', 'operator', 'viewer')),
    PasswordHash NVARCHAR(500) NOT NULL,
    LastActive   NVARCHAR(100) NULL,
    CreatedAt    DATETIME2     NOT NULL DEFAULT GETDATE()
);

-- ============================================================
-- MESAJLAR
-- ============================================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='MessageRecipients' AND xtype='U')
CREATE TABLE MessageRecipients (
    Id              NVARCHAR(50)  NOT NULL PRIMARY KEY,
    Name            NVARCHAR(200) NOT NULL,
    Email           NVARCHAR(200) NOT NULL,
    Company         NVARCHAR(200) NOT NULL,
    Server          NVARCHAR(100) NOT NULL,
    Online          BIT           NOT NULL DEFAULT 0,
    LastLogin       DATETIME2     NULL,
    SessionDuration NVARCHAR(50)  NULL
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Messages' AND xtype='U')
CREATE TABLE Messages (
    Id            NVARCHAR(50)  NOT NULL PRIMARY KEY,
    Subject       NVARCHAR(500) NOT NULL,
    Body          NVARCHAR(MAX) NOT NULL,
    Priority      NVARCHAR(20)  NOT NULL CHECK (Priority IN ('normal', 'high', 'urgent')),
    Sender        NVARCHAR(200) NOT NULL,
    RecipientType NVARCHAR(20)  NOT NULL CHECK (RecipientType IN ('all', 'company', 'selected')),
    Company       NVARCHAR(200) NULL,
    Status        NVARCHAR(20)  NOT NULL CHECK (Status IN ('sent', 'delivered', 'read', 'failed')),
    SentAt        DATETIME2     NOT NULL,
    ReadCount     INT           NOT NULL DEFAULT 0,
    TotalCount    INT           NOT NULL DEFAULT 0
);

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='MessageRecipientMap' AND xtype='U')
CREATE TABLE MessageRecipientMap (
    MessageId   NVARCHAR(50) NOT NULL REFERENCES Messages(Id) ON DELETE CASCADE,
    RecipientId NVARCHAR(50) NOT NULL REFERENCES MessageRecipients(Id),
    PRIMARY KEY (MessageId, RecipientId)
);


-- ============================================================
-- KULLANICI GÜNLÜK KAYNAK KULLANIMI
-- ============================================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UserDailyUsage' AND xtype='U')
CREATE TABLE UserDailyUsage (
    Id             INT           IDENTITY(1,1) PRIMARY KEY,
    Date           DATE          NOT NULL,
    Username       NVARCHAR(200) NOT NULL,
    FirmaNo        NVARCHAR(20)  NULL,
    Server         NVARCHAR(100) NOT NULL,
    AvgCpu         FLOAT         NOT NULL DEFAULT 0,
    AvgRamMB       FLOAT         NOT NULL DEFAULT 0,
    SessionMinutes INT           NOT NULL DEFAULT 0,
    SampleCount    INT           NOT NULL DEFAULT 0,
    CONSTRAINT UQ_UserDailyUsage UNIQUE (Date, Username, Server)
);

-- ============================================================
-- DEMO VERİTABANLARI (Firma Kurulum Sihirbazı — 5. adım)
-- ============================================================

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DemoDatabases' AND xtype='U')
CREATE TABLE DemoDatabases (
    Id           INT           IDENTITY(1,1) PRIMARY KEY,
    Name         NVARCHAR(200) NOT NULL,
    DataName     NVARCHAR(200) NOT NULL,
    LocationType NVARCHAR(50)  NOT NULL DEFAULT 'Yerel',
    LocationPath NVARCHAR(500) NULL,
    Description  NVARCHAR(500) NULL,
    DisplayOrder INT           NOT NULL DEFAULT 0,
    IsActive     BIT           NOT NULL DEFAULT 1,
    CreatedAt    DATETIME2     NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt    DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);

-- Demo DB ↔ Pusula Programı (WizardServices) many-to-many
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DemoDatabaseServices' AND xtype='U')
CREATE TABLE DemoDatabaseServices (
    DemoDatabaseId INT NOT NULL,
    ServiceId      INT NOT NULL,
    CONSTRAINT PK_DemoDatabaseServices PRIMARY KEY (DemoDatabaseId, ServiceId),
    CONSTRAINT FK_DemoDatabaseServices_DemoDatabase
        FOREIGN KEY (DemoDatabaseId) REFERENCES DemoDatabases(Id) ON DELETE CASCADE,
    CONSTRAINT FK_DemoDatabaseServices_Service
        FOREIGN KEY (ServiceId) REFERENCES WizardServices(Id) ON DELETE CASCADE
);

PRINT 'PusulaHub veritabani basariyla olusturuldu.';
GO
