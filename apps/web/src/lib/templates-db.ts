import { query, execute } from "./db"
import { ensureSchema } from "./messages-db"
import { PRESET_MESSAGES, type PresetMessage } from "./preset-messages"

/**
 * Mesaj şablonları (hazır mesajlar) veri katmanı.
 *
 * İki kaynaklı:
 *   - PRESET_MESSAGES (statik dosya): built-in şablonlar, silinemez/düzenlenemez
 *   - MessageTemplates (DB tablosu): kullanıcının eklediği şablonlar, full CRUD
 *
 * `listTemplates()` ikisini birleştirir, her biri `builtIn: true|false`
 * flag'i ile döner. UI built-in olanlarda edit/delete butonu göstermez.
 */

export type TplType     = "info" | "warning" | "urgent"
export type TplPriority = "normal" | "high" | "urgent"

export interface MessageTemplate {
  id:          string
  title:       string
  description: string
  subject:     string
  body:        string
  type:        TplType
  priority:    TplPriority
  builtIn:     boolean
  createdBy?:  string | null
  createdAt?:  string | null
  updatedAt?:  string | null
}

interface TemplateRow {
  Id:          string
  Title:       string
  Description: string | null
  Subject:     string
  Body:        string
  Type:        TplType
  Priority:    TplPriority
  CreatedBy:   string | null
  CreatedAt:   string
  UpdatedAt:   string | null
}

function presetToTemplate(p: PresetMessage): MessageTemplate {
  return {
    id:          p.id,
    title:       p.title,
    description: p.description,
    subject:     p.subject,
    body:        p.body,
    type:        p.type,
    priority:    p.priority,
    builtIn:     true,
  }
}

function rowToTemplate(r: TemplateRow): MessageTemplate {
  return {
    id:          r.Id,
    title:       r.Title,
    description: r.Description ?? "",
    subject:     r.Subject,
    body:        r.Body,
    type:        r.Type,
    priority:    r.Priority,
    builtIn:     false,
    createdBy:   r.CreatedBy,
    createdAt:   r.CreatedAt,
    updatedAt:   r.UpdatedAt,
  }
}

/* ── List ──────────────────────────────────────────────── */
export async function listTemplates(): Promise<MessageTemplate[]> {
  await ensureSchema()
  const rows = await query<TemplateRow[]>`
    SELECT Id, Title, Description, Subject, Body, Type, Priority,
           CreatedBy, CreatedAt, UpdatedAt
      FROM MessageTemplates
     ORDER BY UpdatedAt DESC, CreatedAt DESC
  `
  const userTemplates = rows.map(rowToTemplate)
  const builtIn       = PRESET_MESSAGES.map(presetToTemplate)
  // Kullanıcı şablonları üstte (en yeni en başta), sonra built-in'ler
  return [...userTemplates, ...builtIn]
}

/* ── Get by id ─────────────────────────────────────────── */
export async function getTemplate(id: string): Promise<MessageTemplate | null> {
  // Built-in mi kontrol et
  const builtIn = PRESET_MESSAGES.find(p => p.id === id)
  if (builtIn) return presetToTemplate(builtIn)

  await ensureSchema()
  const rows = await query<TemplateRow[]>`
    SELECT Id, Title, Description, Subject, Body, Type, Priority,
           CreatedBy, CreatedAt, UpdatedAt
      FROM MessageTemplates
     WHERE Id = ${id}
  `
  return rows[0] ? rowToTemplate(rows[0]) : null
}

/* ── Create ────────────────────────────────────────────── */
export interface CreateTemplateInput {
  title:        string
  description?: string
  subject:      string
  body:         string
  type:         TplType
  priority:     TplPriority
  createdBy?:   string | null
}

export async function createTemplate(input: CreateTemplateInput): Promise<string> {
  await ensureSchema()
  const rows = await query<{ Id: string }[]>`
    INSERT INTO MessageTemplates (Title, Description, Subject, Body, Type, Priority, CreatedBy)
    OUTPUT INSERTED.Id
    VALUES (${input.title},
            ${input.description ?? null},
            ${input.subject},
            ${input.body},
            ${input.type},
            ${input.priority},
            ${input.createdBy ?? null})
  `
  return rows[0].Id
}

/* ── Update ────────────────────────────────────────────── */
export interface UpdateTemplateInput {
  title?:       string
  description?: string
  subject?:     string
  body?:        string
  type?:        TplType
  priority?:    TplPriority
}

export async function updateTemplate(id: string, input: UpdateTemplateInput): Promise<boolean> {
  // Built-in'ler güncellenemez
  if (PRESET_MESSAGES.some(p => p.id === id)) return false

  await ensureSchema()
  // Her alan opsiyonel — COALESCE ile gönderilen değerlerle güncelle, gönderilmeyenler aynen kalsın.
  const result = await execute`
    UPDATE MessageTemplates
       SET Title       = COALESCE(${input.title       ?? null}, Title),
           Description = COALESCE(${input.description ?? null}, Description),
           Subject     = COALESCE(${input.subject     ?? null}, Subject),
           Body        = COALESCE(${input.body        ?? null}, Body),
           Type        = COALESCE(${input.type        ?? null}, Type),
           Priority    = COALESCE(${input.priority    ?? null}, Priority),
           UpdatedAt   = SYSUTCDATETIME()
     WHERE Id = ${id}
  `
  return (result.rowsAffected[0] ?? 0) > 0
}

/* ── Delete ────────────────────────────────────────────── */
export async function deleteTemplate(id: string): Promise<boolean> {
  if (PRESET_MESSAGES.some(p => p.id === id)) return false  // built-in silinemez
  await ensureSchema()
  const result = await execute`DELETE FROM MessageTemplates WHERE Id = ${id}`
  return (result.rowsAffected[0] ?? 0) > 0
}
