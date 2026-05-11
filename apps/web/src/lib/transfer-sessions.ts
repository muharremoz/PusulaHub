/**
 * Firma Aktarım — TransferSessions tablo helper'ları.
 *
 * Akış:
 *  - Admin Hub'da yeni aktarım oluşturur → token üretilir → satır kaydedilir
 *  - Müşteri (VPN'den) aktarim.pusulanet.net/{token}'a girer → upload başlar
 *  - Ubuntu upload servisi token'ı Hub'a doğrular, dosyaları alır, agent'a yollar
 *  - Periyodik olarak Hub'a progress raporlar (byte sayaçları)
 *  - Tamamlanınca Status='completed' işaretlenir
 *
 * Şema basit tutuldu — TransferFiles per-file detay sonradan eklenebilir.
 */

import { execute, query } from "@/lib/db"
import { randomBytes } from "crypto"

export type TransferStatus = "pending" | "active" | "completed" | "cancelled" | "expired"

export interface TransferSession {
  Id:                  string
  Token:               string
  CompanyId:           string
  FirmaName:           string
  SqlServerId:         string | null
  DepoServerId:        string | null
  Status:              TransferStatus
  CreatedBy:           string | null
  CreatedAt:           string
  ExpiresAt:           string
  CompletedAt:         string | null
  DataBytesTotal:      number
  DataBytesReceived:   number
  ImageFilesTotal:     number
  ImageFilesReceived:  number
  ImageBytesTotal:     number
  ImageBytesReceived:  number
  Notes:               string | null
}

let _tableEnsured = false

async function ensureTable(): Promise<void> {
  if (_tableEnsured) return
  await execute`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TransferSessions')
    BEGIN
      CREATE TABLE TransferSessions (
        Id                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        Token               NVARCHAR(64)  NOT NULL,
        CompanyId           NVARCHAR(50)  NOT NULL,
        FirmaName           NVARCHAR(200) NOT NULL,
        SqlServerId         NVARCHAR(50)  NULL,
        DepoServerId        NVARCHAR(50)  NULL,
        Status              NVARCHAR(20)  NOT NULL DEFAULT 'pending',
        CreatedBy           NVARCHAR(200) NULL,
        CreatedAt           DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
        ExpiresAt           DATETIME2(0)  NOT NULL,
        CompletedAt         DATETIME2(0)  NULL,
        DataBytesTotal      BIGINT        NOT NULL DEFAULT 0,
        DataBytesReceived   BIGINT        NOT NULL DEFAULT 0,
        ImageFilesTotal     INT           NOT NULL DEFAULT 0,
        ImageFilesReceived  INT           NOT NULL DEFAULT 0,
        ImageBytesTotal     BIGINT        NOT NULL DEFAULT 0,
        ImageBytesReceived  BIGINT        NOT NULL DEFAULT 0,
        Notes               NVARCHAR(MAX) NULL
      )
      CREATE UNIQUE INDEX UX_TransferSessions_Token ON TransferSessions (Token)
      CREATE INDEX IX_TransferSessions_CompanyId    ON TransferSessions (CompanyId)
      CREATE INDEX IX_TransferSessions_Status       ON TransferSessions (Status)
    END
  `
  _tableEnsured = true
}

/** URL-safe 24 karakter token üretir (alfanümerik). */
function generateToken(): string {
  // base64url ~24 char için 18 byte rastgele
  return randomBytes(18).toString("base64url")
}

export interface CreateInput {
  companyId:     string
  firmaName:     string
  sqlServerId?:  string | null
  depoServerId?: string | null
  expiresInDays?: number   // default 7
  createdBy?:    string | null
  notes?:        string | null
}

export async function createTransferSession(input: CreateInput): Promise<TransferSession> {
  await ensureTable()
  const token = generateToken()
  const days = Math.max(1, Math.min(60, input.expiresInDays ?? 7))

  await execute`
    INSERT INTO TransferSessions
      (Token, CompanyId, FirmaName, SqlServerId, DepoServerId, Status, CreatedBy, ExpiresAt, Notes)
    VALUES
      (${token}, ${input.companyId}, ${input.firmaName},
       ${input.sqlServerId ?? null}, ${input.depoServerId ?? null},
       'pending', ${input.createdBy ?? null},
       DATEADD(DAY, ${days}, SYSUTCDATETIME()), ${input.notes ?? null})
  `
  const rows = await query<TransferSession[]>`
    SELECT * FROM TransferSessions WHERE Token = ${token}
  `
  return rows[0]
}

export async function listTransferSessions(limit: number = 100): Promise<TransferSession[]> {
  await ensureTable()
  const safe = Math.max(1, Math.min(500, limit))
  return await query<TransferSession[]>`
    SELECT TOP (${safe}) * FROM TransferSessions
    ORDER BY CreatedAt DESC
  `
}

export async function getTransferSessionByToken(token: string): Promise<TransferSession | null> {
  await ensureTable()
  const rows = await query<TransferSession[]>`
    SELECT * FROM TransferSessions WHERE Token = ${token}
  `
  return rows[0] ?? null
}

export async function getTransferSessionById(id: string): Promise<TransferSession | null> {
  await ensureTable()
  const rows = await query<TransferSession[]>`
    SELECT * FROM TransferSessions WHERE Id = ${id}
  `
  return rows[0] ?? null
}

export async function cancelTransferSession(id: string): Promise<void> {
  await ensureTable()
  await execute`
    UPDATE TransferSessions
    SET Status = 'cancelled', CompletedAt = SYSUTCDATETIME()
    WHERE Id = ${id} AND Status IN ('pending','active')
  `
}

export async function deleteTransferSession(id: string): Promise<void> {
  await ensureTable()
  await execute`DELETE FROM TransferSessions WHERE Id = ${id}`
}

export interface ProgressInput {
  status?:             TransferStatus
  dataBytesTotal?:     number
  dataBytesReceived?:  number
  imageFilesTotal?:    number
  imageFilesReceived?: number
  imageBytesTotal?:    number
  imageBytesReceived?: number
}

export async function updateTransferProgress(
  token: string,
  patch: ProgressInput,
): Promise<TransferSession | null> {
  await ensureTable()
  // COALESCE ile sadece verilen alanlar güncellenir; status ayrıca completion zamanını da ayarlar
  await execute`
    UPDATE TransferSessions
    SET DataBytesTotal     = COALESCE(${patch.dataBytesTotal     ?? null}, DataBytesTotal),
        DataBytesReceived  = COALESCE(${patch.dataBytesReceived  ?? null}, DataBytesReceived),
        ImageFilesTotal    = COALESCE(${patch.imageFilesTotal    ?? null}, ImageFilesTotal),
        ImageFilesReceived = COALESCE(${patch.imageFilesReceived ?? null}, ImageFilesReceived),
        ImageBytesTotal    = COALESCE(${patch.imageBytesTotal    ?? null}, ImageBytesTotal),
        ImageBytesReceived = COALESCE(${patch.imageBytesReceived ?? null}, ImageBytesReceived),
        Status             = COALESCE(${patch.status ?? null}, Status),
        CompletedAt        = CASE
          WHEN ${patch.status ?? null} IN ('completed','cancelled','expired')
            THEN SYSUTCDATETIME()
          ELSE CompletedAt
        END
    WHERE Token = ${token}
  `
  return await getTransferSessionByToken(token)
}
