import { getSupabaseAdmin } from "./supabase/admin"
import { PRESET_MESSAGES, type PresetMessage } from "./preset-messages"

/**
 * Mesaj şablonları veri katmanı — Supabase `hub.message_templates` (service-role).
 * İki kaynaklı: PRESET_MESSAGES (statik, built-in) + DB (kullanıcı şablonları).
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

interface TplDbRow {
  id: string; title: string; description: string | null; subject: string; body: string
  type: TplType; priority: TplPriority; created_by: string | null; created_at: string; updated_at: string | null
}

const sb = () => getSupabaseAdmin().schema("hub")
const COLS = "id, title, description, subject, body, type, priority, created_by, created_at, updated_at"

function presetToTemplate(p: PresetMessage): MessageTemplate {
  return { id: p.id, title: p.title, description: p.description, subject: p.subject,
           body: p.body, type: p.type, priority: p.priority, builtIn: true }
}

function rowToTemplate(r: TplDbRow): MessageTemplate {
  return {
    id: r.id, title: r.title, description: r.description ?? "", subject: r.subject, body: r.body,
    type: r.type, priority: r.priority, builtIn: false,
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

/* ── List ──────────────────────────────────────────────── */
export async function listTemplates(): Promise<MessageTemplate[]> {
  const { data } = await sb().from("message_templates").select(COLS)
    .order("updated_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false })
  const userTemplates = ((data ?? []) as TplDbRow[]).map(rowToTemplate)
  const builtIn = PRESET_MESSAGES.map(presetToTemplate)
  return [...userTemplates, ...builtIn]
}

/* ── Get by id ─────────────────────────────────────────── */
export async function getTemplate(id: string): Promise<MessageTemplate | null> {
  const builtIn = PRESET_MESSAGES.find(p => p.id === id)
  if (builtIn) return presetToTemplate(builtIn)

  const { data } = await sb().from("message_templates").select(COLS).eq("id", id).maybeSingle()
  return data ? rowToTemplate(data as TplDbRow) : null
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
  const { data, error } = await sb().from("message_templates").insert({
    title: input.title, description: input.description ?? null, subject: input.subject,
    body: input.body, type: input.type, priority: input.priority, created_by: input.createdBy ?? null,
  }).select("id").single()
  if (error) throw error
  return data.id as string
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
  if (PRESET_MESSAGES.some(p => p.id === id)) return false // built-in düzenlenemez

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.title       != null) patch.title       = input.title
  if (input.description != null) patch.description = input.description
  if (input.subject     != null) patch.subject     = input.subject
  if (input.body        != null) patch.body        = input.body
  if (input.type        != null) patch.type        = input.type
  if (input.priority    != null) patch.priority    = input.priority

  const { data } = await sb().from("message_templates").update(patch).eq("id", id).select("id")
  return (data?.length ?? 0) > 0
}

/* ── Delete ────────────────────────────────────────────── */
export async function deleteTemplate(id: string): Promise<boolean> {
  if (PRESET_MESSAGES.some(p => p.id === id)) return false // built-in silinemez
  const { data } = await sb().from("message_templates").delete().eq("id", id).select("id")
  return (data?.length ?? 0) > 0
}
