-- ============================================================
-- PusulaHub — Proje Takip Sistemi
-- Migration: 2026-04-11
-- ============================================================

USE PusulaHub;

-- Projeler
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Projects' AND xtype='U')
CREATE TABLE Projects (
    Id          NVARCHAR(50)   NOT NULL PRIMARY KEY DEFAULT NEWID(),
    Name        NVARCHAR(200)  NOT NULL,
    Description NVARCHAR(1000) NULL,
    Status      NVARCHAR(20)   NOT NULL DEFAULT 'active'
                CHECK (Status IN ('active', 'completed', 'archived')),
    CompanyId   NVARCHAR(50)   NULL REFERENCES Companies(Id),
    Color       NVARCHAR(20)   NOT NULL DEFAULT '#3b82f6',
    CreatedAt   DATETIME2      NOT NULL DEFAULT GETDATE(),
    UpdatedAt   DATETIME2      NOT NULL DEFAULT GETDATE()
);

-- Kanban kolonları (her projenin kendi kolonları var)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ProjectColumns' AND xtype='U')
CREATE TABLE ProjectColumns (
    Id        NVARCHAR(50)  NOT NULL PRIMARY KEY DEFAULT NEWID(),
    ProjectId NVARCHAR(50)  NOT NULL REFERENCES Projects(Id) ON DELETE CASCADE,
    Name      NVARCHAR(100) NOT NULL,
    Color     NVARCHAR(20)  NOT NULL DEFAULT '#6b7280',
    Position  INT           NOT NULL DEFAULT 0,
    WipLimit  INT           NULL  -- NULL = sınır yok
);

-- Görevler / kartlar
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ProjectTasks' AND xtype='U')
CREATE TABLE ProjectTasks (
    Id          NVARCHAR(50)   NOT NULL PRIMARY KEY DEFAULT NEWID(),
    ProjectId   NVARCHAR(50)   NOT NULL REFERENCES Projects(Id) ON DELETE CASCADE,
    ColumnId    NVARCHAR(50)   NOT NULL REFERENCES ProjectColumns(Id),
    Title       NVARCHAR(500)  NOT NULL,
    Description NVARCHAR(4000) NULL,
    Priority    NVARCHAR(20)   NOT NULL DEFAULT 'medium'
                CHECK (Priority IN ('low', 'medium', 'high', 'critical')),
    AssignedTo  NVARCHAR(200)  NULL,
    DueDate     DATE           NULL,
    Labels      NVARCHAR(500)  NULL,  -- virgülle ayrılmış etiketler
    Position    INT            NOT NULL DEFAULT 0,
    CreatedAt   DATETIME2      NOT NULL DEFAULT GETDATE(),
    UpdatedAt   DATETIME2      NOT NULL DEFAULT GETDATE()
);

-- Görev yorumları
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ProjectTaskComments' AND xtype='U')
CREATE TABLE ProjectTaskComments (
    Id        NVARCHAR(50)   NOT NULL PRIMARY KEY DEFAULT NEWID(),
    TaskId    NVARCHAR(50)   NOT NULL REFERENCES ProjectTasks(Id) ON DELETE CASCADE,
    Author    NVARCHAR(200)  NOT NULL,
    Content   NVARCHAR(2000) NOT NULL,
    CreatedAt DATETIME2      NOT NULL DEFAULT GETDATE()
);

PRINT 'Projects migration tamamlandi.';
