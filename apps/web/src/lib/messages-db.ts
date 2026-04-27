import { query, execute } from "./db"

/**
 * Mesaj sistemi veri katmanı.
 *
 * İki tablo kullanır:
 *   Messages            — gönderilen mesajın metadata'sı
 *   MessageRecipients   — mesajın her bir alıcı (sunucu+kullanıcı) satırı
 *
 * İlk çağrıda tablolar yoksa oluşturulur (idempotent).
 */

export type MessageType         = "info" | "warning" | "urgent"
export type MessagePriority     = "normal" | "high" | "urgent"
export type RecipientKind       = "all" | "company" | "selected"
export type RecipientStatus     = "pending" | "delivered" | "read" | "failed"

export interface MessageRow {
  Id:            string
  Subject:       string
  Body:          string
  Type:          MessageType
  Priority:      MessagePriority
  RecipientType: RecipientKind
  CompanyId:     string | null
  CompanyName:   string | null
  SenderUserId:  string | null
  SenderName:    string
  SentAt:        string
  TotalCount:    number
  ReadCount:     number
}

export interface RecipientRow {
  Id:           number
  MessageId:    string
  ServerId:     string
  ServerName:   string | null
  Username:     string
  Status:       RecipientStatus
  DeliveredAt:  string | null
  ReadAt:       string | null
  ErrorMessage: string | null
}

let _schemaReady = false
async function ensureSchema(): Promise<void> {
  if (_schemaReady) return
  await execute`
    IF OBJECT_ID('Messages','U') IS NULL
    BEGIN
      CREATE TABLE Messages (
        Id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        Subject       NVARCHAR(300)    NOT NULL,
        Body          NVARCHAR(MAX)    NOT NULL,
        Type          NVARCHAR(20)     NOT NULL CONSTRAINT DF_Messages_Type     DEFAULT 'info',
        Priority      NVARCHAR(20)     NOT NULL CONSTRAINT DF_Messages_Priority DEFAULT 'normal',
        RecipientType NVARCHAR(20)     NOT NULL,
        CompanyId     UNIQUEIDENTIFIER NULL,
        CompanyName   NVARCHAR(200)    NULL,
        SenderUserId  UNIQUEIDENTIFIER NULL,
        SenderName    NVARCHAR(200)    NOT NULL,
        SentAt        DATETIME2        NOT NULL CONSTRAINT DF_Messages_SentAt   DEFAULT SYSUTCDATETIME(),
        TotalCount    INT              NOT NULL CONSTRAINT DF_Messages_Total    DEFAULT 0,
        ReadCount     INT              NOT NULL CONSTRAINT DF_Messages_Read     DEFAULT 0
      )
      CREATE INDEX IX_Messages_SentAt ON Messages (SentAt DESC)
    END
  `
  // Eski create.sql ile oluşmuş Messages tablosunu yeni şemaya hizala.
  // Her ALTER idempotent — kolon yoksa ekle, eski 'Sender' varsa 'SenderName'e yeniden adlandır.
  await execute`
    IF COL_LENGTH('Messages','SenderName') IS NULL AND COL_LENGTH('Messages','Sender') IS NOT NULL
      EXEC sp_rename 'Messages.Sender', 'SenderName', 'COLUMN'
  `
  await execute`
    IF COL_LENGTH('Messages','SenderName') IS NULL
      ALTER TABLE Messages ADD SenderName NVARCHAR(200) NOT NULL CONSTRAINT DF_Messages_SenderName DEFAULT ''
  `
  await execute`
    IF COL_LENGTH('Messages','Type') IS NULL
      ALTER TABLE Messages ADD Type NVARCHAR(20) NOT NULL CONSTRAINT DF_Messages_Type DEFAULT 'info'
  `
  await execute`
    IF COL_LENGTH('Messages','CompanyId') IS NULL
      ALTER TABLE Messages ADD CompanyId UNIQUEIDENTIFIER NULL
  `
  await execute`
    IF COL_LENGTH('Messages','CompanyName') IS NULL
      ALTER TABLE Messages ADD CompanyName NVARCHAR(200) NULL
  `
  await execute`
    IF COL_LENGTH('Messages','SenderUserId') IS NULL
      ALTER TABLE Messages ADD SenderUserId UNIQUEIDENTIFIER NULL
  `
  // Eski 'Company' kolonu varsa değerini CompanyName'e taşı (bir defa).
  await execute`
    IF COL_LENGTH('Messages','Company') IS NOT NULL AND COL_LENGTH('Messages','CompanyName') IS NOT NULL
    BEGIN
      UPDATE Messages SET CompanyName = Company WHERE CompanyName IS NULL AND Company IS NOT NULL
    END
  `
  // Eski create.sql Messages.Status'u NOT NULL/default'suz oluşturmuş; yeni
  // INSERT'ler bu kolona değer göndermediği için "Cannot insert NULL into
  // column 'Status'" hatası veriyor. Nullable yap (idempotent).
  await execute`
    IF EXISTS (
      SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID('Messages') AND name = 'Status' AND is_nullable = 0
    )
      ALTER TABLE Messages ALTER COLUMN Status NVARCHAR(50) NULL
  `

  // Eski create.sql MessageRecipients tablosu (user directory şeması) varsa
  // yeniden adlandır — doğru şemayla yeniden oluşturulacak.
  await execute`
    IF OBJECT_ID('MessageRecipients','U') IS NOT NULL
       AND COL_LENGTH('MessageRecipients','MessageId') IS NULL
      EXEC sp_rename 'MessageRecipients', 'MessageRecipients_Legacy'
  `

  // KRİTİK: MessageRecipients.MessageId'nin tipi VE UZUNLUĞU Messages.Id
  // ile birebir eşleşmeli. Eski create.sql Messages.Id'yi NVARCHAR(50) olarak
  // oluşturmuş. NVARCHAR(36) yeterli görünse de FK için "same length and scale"
  // şartı var (SQL Server FK kuralı) → 1750. NVARCHAR(50) yapalım.
  // Constraint adlarını anonymous bırak — DB-wide name conflict riskini de sıfırlar.
  await execute`
    IF OBJECT_ID('MessageRecipients','U') IS NULL
    BEGIN
      CREATE TABLE MessageRecipients (
        Id            BIGINT           IDENTITY(1,1) PRIMARY KEY,
        MessageId     NVARCHAR(50)     NOT NULL,
        ServerId      NVARCHAR(50)     NOT NULL,
        ServerName    NVARCHAR(200)    NULL,
        Username      NVARCHAR(200)    NOT NULL,
        Status        NVARCHAR(20)     NOT NULL DEFAULT 'pending',
        DeliveredAt   DATETIME2        NULL,
        ReadAt        DATETIME2        NULL,
        ErrorMessage  NVARCHAR(500)    NULL,
        FOREIGN KEY (MessageId) REFERENCES Messages(Id) ON DELETE CASCADE
      )
      CREATE INDEX IX_MR_MessageId ON MessageRecipients (MessageId)
      CREATE INDEX IX_MR_Lookup    ON MessageRecipients (MessageId, Username)
    END
  `

  // MessageTemplates — kullanıcının kendi hazır mesaj şablonları.
  // Statik PRESET_MESSAGES (apps/web/src/lib/preset-messages.ts) korunur,
  // bu tablo SADECE kullanıcının eklediği şablonları tutar. API GET
  // sırasında ikisi merge edilir (statik = built-in, DB = user).
  //
  // KRİTİK — anonymous constraint: PK/DEFAULT adlarını NAMED bırakmak
  // SQL Server'ın DB-wide constraint name uniqueness'ı yüzünden IF guard
  // false olsa bile re-execution sırasında "Could not create constraint
  // or index" (1750) hatası veriyor. Adsız bırak, SQL Server otomatik
  // benzersiz ad üretir.
  await execute`
    IF OBJECT_ID('MessageTemplates','U') IS NULL
    BEGIN
      CREATE TABLE MessageTemplates (
        Id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        Title       NVARCHAR(100)    NOT NULL,
        Description NVARCHAR(255)    NULL,
        Subject     NVARCHAR(200)    NOT NULL,
        Body        NVARCHAR(MAX)    NOT NULL,
        Type        NVARCHAR(20)     NOT NULL DEFAULT 'info',
        Priority    NVARCHAR(20)     NOT NULL DEFAULT 'normal',
        CreatedBy   NVARCHAR(100)    NULL,
        CreatedAt   DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt   DATETIME2        NULL
      )
    END
  `
  _schemaReady = true
}

export { ensureSchema }

/* ── Create ───────────────────────────────────────────── */

export interface CreateMessageInput {
  id:            string
  subject:       string
  body:          string
  type:          MessageType
  priority:      MessagePriority
  recipientType: RecipientKind
  companyId?:    string | null
  companyName?:  string | null
  senderUserId?: string | null
  senderName:    string
  totalCount:    number
}

export async function createMessage(m: CreateMessageInput): Promise<void> {
  await ensureSchema()
  // Eski create.sql Messages.SentAt'a default tanımı bırakmamış (nullable=false,
  // default=null) → SentAt göndermezsek "Cannot insert NULL". SYSUTCDATETIME()
  // ile explicit doldur — yeni şemada zaten default vardı, eski tabloyla
  // hizalanmak için INSERT'te de explicit veriyoruz.
  await execute`
    INSERT INTO Messages
      (Id, Subject, Body, Type, Priority, RecipientType, CompanyId, CompanyName,
       SenderUserId, SenderName, SentAt, TotalCount, ReadCount)
    VALUES
      (${m.id}, ${m.subject}, ${m.body}, ${m.type}, ${m.priority}, ${m.recipientType},
       ${m.companyId ?? null}, ${m.companyName ?? null},
       ${m.senderUserId ?? null}, ${m.senderName}, SYSUTCDATETIME(), ${m.totalCount}, 0)
  `
}

export interface AddRecipientInput {
  messageId:    string
  serverId:     string
  serverName?:  string | null
  username:     string
  status?:      RecipientStatus
  deliveredAt?: Date | null
  errorMessage?: string | null
}

export async function addRecipient(r: AddRecipientInput): Promise<void> {
  await ensureSchema()
  await execute`
    INSERT INTO MessageRecipients
      (MessageId, ServerId, ServerName, Username, Status, DeliveredAt, ErrorMessage)
    VALUES
      (${r.messageId}, ${r.serverId}, ${r.serverName ?? null}, ${r.username},
       ${r.status ?? "pending"}, ${r.deliveredAt ?? null}, ${r.errorMessage ?? null})
  `
}

/** Bir sunucuya inject sonrası — o sunucudaki tüm henüz teslim edilmemiş alıcıları "delivered" yap. */
export async function markServerDelivered(messageId: string, serverId: string): Promise<void> {
  await ensureSchema()
  await execute`
    UPDATE MessageRecipients
       SET Status = 'delivered', DeliveredAt = SYSUTCDATETIME()
     WHERE MessageId = ${messageId} AND ServerId = ${serverId} AND Status = 'pending'
  `
}

/** Bir sunucu fan-out'ta hata verirse — o sunucudaki alıcıları "failed" işaretle. */
export async function markServerFailed(messageId: string, serverId: string, error: string): Promise<void> {
  await ensureSchema()
  await execute`
    UPDATE MessageRecipients
       SET Status = 'failed', ErrorMessage = ${error.slice(0, 500)}
     WHERE MessageId = ${messageId} AND ServerId = ${serverId} AND Status = 'pending'
  `
}

/** ACK geldiğinde kullanıcıyı okundu işaretle ve mesajın ReadCount'unu güncelle. */
export async function markRead(messageId: string, serverId: string, username: string): Promise<void> {
  await ensureSchema()
  // İdempotent: yalnızca daha önce okunmamış satırı işaretle
  const result = await execute`
    UPDATE MessageRecipients
       SET Status = 'read', ReadAt = SYSUTCDATETIME()
     WHERE MessageId = ${messageId} AND ServerId = ${serverId}
       AND Username = ${username} AND Status <> 'read'
  `
  const updated = (result?.rowsAffected?.[0] ?? 0) > 0
  if (updated) {
    await execute`
      UPDATE Messages SET ReadCount = ReadCount + 1 WHERE Id = ${messageId}
    `
  }
}

/** ACK geldi ama mesaj/sunucu/kullanıcı bilinmiyorsa kayıt eksik olabilir. msgId üzerinden lookup eder. */
export async function markReadByMsgId(msgId: string, username: string): Promise<void> {
  await ensureSchema()
  // Hangi sunucularda bu kullanıcı için pending/delivered satır var → hepsi read
  const result = await execute`
    UPDATE MessageRecipients
       SET Status = 'read', ReadAt = SYSUTCDATETIME()
     WHERE MessageId = ${msgId} AND Username = ${username} AND Status <> 'read'
  `
  const n = result?.rowsAffected?.[0] ?? 0
  if (n > 0) {
    await execute`
      UPDATE Messages SET ReadCount = ReadCount + ${n} WHERE Id = ${msgId}
    `
  }
}

/* ── Read ─────────────────────────────────────────────── */

export interface ListFilter {
  search?:    string             // Subject veya Body içinde geçen
  subject?:   string             // sadece Subject — search'ten ayrı, filtre çubuğunda "Konu" alanı
  type?:      MessageType
  priority?:  MessagePriority
  agentId?:   string             // sadece bu sunucuya gönderilenler
  companyId?: string             // sadece bu firmaya gönderilenler (m.CompanyId)
  username?:  string             // alıcı kullanıcısı (MessageRecipients.Username) bu kişiyi içerenler
  from?:      string             // ISO tarih (yyyy-MM-dd) — bu tarih dahil
  to?:        string             // ISO tarih (yyyy-MM-dd) — bu tarih dahil
  limit?:     number
  offset?:    number
}

export async function listMessages(f: ListFilter = {}): Promise<MessageRow[]> {
  await ensureSchema()
  const limit   = Math.min(f.limit ?? 100, 500)
  const offset  = f.offset ?? 0
  const search  = f.search?.trim()  ? `%${f.search.trim()}%`  : null
  const subject = f.subject?.trim() ? `%${f.subject.trim()}%` : null
  // SQL Server NULL safety + parametreli filtreleme — NULL ise filtre uygulanmaz.
  const type      = f.type      ?? null
  const priority  = f.priority  ?? null
  const agentId   = f.agentId   ?? null
  const companyId = f.companyId ?? null
  const username  = f.username  ?? null
  const from      = f.from      ?? null
  const to        = f.to        ?? null

  return query<MessageRow[]>`
    SELECT m.Id, m.Subject, m.Body, m.Type, m.Priority, m.RecipientType,
           m.CompanyId, m.CompanyName, m.SenderUserId, m.SenderName,
           CONVERT(NVARCHAR(30), m.SentAt, 120) AS SentAt,
           m.TotalCount, m.ReadCount
      FROM Messages m
     WHERE (${search}    IS NULL OR m.Subject LIKE ${search} OR m.Body LIKE ${search})
       AND (${subject}   IS NULL OR m.Subject LIKE ${subject})
       AND (${type}      IS NULL OR m.Type     = ${type})
       AND (${priority}  IS NULL OR m.Priority = ${priority})
       AND (${companyId} IS NULL OR m.CompanyId = ${companyId})
       AND (${from}      IS NULL OR m.SentAt >= ${from})
       AND (${to}        IS NULL OR m.SentAt <  DATEADD(day, 1, CAST(${to} AS DATE)))
       AND (${agentId}   IS NULL OR EXISTS (
         SELECT 1 FROM MessageRecipients r
          WHERE r.MessageId = m.Id AND r.ServerId = ${agentId}))
       AND (${username}  IS NULL OR EXISTS (
         SELECT 1 FROM MessageRecipients r
          WHERE r.MessageId = m.Id AND r.Username = ${username}))
     ORDER BY m.SentAt DESC
     OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
  `
}

export async function getMessage(id: string): Promise<MessageRow | null> {
  await ensureSchema()
  const rows = await query<MessageRow[]>`
    SELECT Id, Subject, Body, Type, Priority, RecipientType,
           CompanyId, CompanyName, SenderUserId, SenderName,
           CONVERT(NVARCHAR(30), SentAt, 120) AS SentAt,
           TotalCount, ReadCount
      FROM Messages WHERE Id = ${id}
  `
  return rows[0] ?? null
}

export async function getRecipients(messageId: string): Promise<RecipientRow[]> {
  await ensureSchema()
  return query<RecipientRow[]>`
    SELECT Id, MessageId, ServerId, ServerName, Username, Status,
           CONVERT(NVARCHAR(30), DeliveredAt, 120) AS DeliveredAt,
           CONVERT(NVARCHAR(30), ReadAt,      120) AS ReadAt,
           ErrorMessage
      FROM MessageRecipients
     WHERE MessageId = ${messageId}
     ORDER BY Status DESC, ServerName, Username
  `
}
