import { getSupabaseAdmin } from "./supabase/admin"
import { ackAyir, cevapTemizle, type Anket, type AnketCevaplari } from "./anket"

/**
 * Mesaj sistemi veri katmanı — Supabase `hub` schema (service-role).
 *
 * hub.messages / hub.message_recipients.
 * Service-role: bu katman session'sız bağlamlardan da çağrılır (agent-poller,
 * /api/agent/* token-auth route'ları) → authenticated RLS yerine RLS bypass.
 */

export type MessageType     = "info" | "warning" | "urgent"
export type MessagePriority = "normal" | "high" | "urgent"
export type RecipientKind   = "all" | "company" | "selected"
/** closed: pencere okunmadan kapatıldı (X / otomatik kapanma) — okundu SAYILMAZ (15.10.2026) */
export type RecipientStatus = "pending" | "delivered" | "read" | "closed" | "failed"

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
  /** Anketse sorular (lib/anket.ts), değilse null */
  Survey:        Anket | null
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
  ClosedAt:     string | null
  ErrorMessage: string | null
  Answers:      AnketCevaplari | null
}

interface MsgDbRow {
  id: string; subject: string; body: string; type: MessageType; priority: MessagePriority
  recipient_type: RecipientKind; company_id: string | null; company_name: string | null
  sender_user_id: string | null; sender_name: string; sent_at: string
  total_count: number; read_count: number; survey: Anket | null
}

const MSG_COLS = "id, subject, body, type, priority, recipient_type, company_id, company_name, sender_user_id, sender_name, sent_at, total_count, read_count, survey"

const sb = () => getSupabaseAdmin().schema("hub")
const toZ = (ts: string | null): string => (ts ? new Date(ts).toISOString() : "")

function toMessageRow(r: MsgDbRow): MessageRow {
  return {
    Id: r.id, Subject: r.subject, Body: r.body, Type: r.type, Priority: r.priority,
    RecipientType: r.recipient_type, CompanyId: r.company_id, CompanyName: r.company_name,
    SenderUserId: r.sender_user_id, SenderName: r.sender_name, SentAt: toZ(r.sent_at),
    TotalCount: r.total_count, ReadCount: r.read_count, Survey: r.survey ?? null,
  }
}

/** Şema migration ile kurulu — geriye dönük uyum için noop. */
export async function ensureSchema(): Promise<void> { /* noop (hub schema migration) */ }

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
  survey?:       Anket | null
}

export async function createMessage(m: CreateMessageInput): Promise<void> {
  const { error } = await sb().from("messages").insert({
    id: m.id, subject: m.subject, body: m.body, type: m.type, priority: m.priority,
    recipient_type: m.recipientType, company_id: m.companyId ?? null, company_name: m.companyName ?? null,
    sender_user_id: m.senderUserId ?? null, sender_name: m.senderName,
    total_count: m.totalCount, read_count: 0, survey: m.survey ?? null,
  })
  if (error) throw error
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
  const { error } = await sb().from("message_recipients").insert({
    message_id: r.messageId, server_id: r.serverId, server_name: r.serverName ?? null,
    username: r.username, status: r.status ?? "pending",
    delivered_at: r.deliveredAt ? r.deliveredAt.toISOString() : null,
    error_message: r.errorMessage ?? null,
  })
  if (error) throw error
}

/** Sunucudaki tüm pending alıcıları delivered yap (geriye dönük). */
export async function markServerDelivered(messageId: string, serverId: string): Promise<void> {
  await sb().from("message_recipients")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("message_id", messageId).eq("server_id", serverId).eq("status", "pending")
}

/** Tek alıcı (server+username) için delivered. */
export async function markRecipientDelivered(messageId: string, serverId: string, username: string): Promise<void> {
  await sb().from("message_recipients")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("message_id", messageId).eq("server_id", serverId).eq("username", username).eq("status", "pending")
}

/**
 * Göndermeden ÖNCE alıcıları sahiplen: pending → delivered, atomik (UPDATE … WHERE status='pending').
 * Yalnız sahiplenilen kullanıcılar döner; agent'a yalnız onlar gönderilir.
 *
 * Neden: 15.10.2026 T1, 80 kişilik anket — fan-out alıcıları pending yazıp agent'a gönderirken
 * poller'ın 10 sn'lik retry'ı aynı pending satırları da görüp ayrıca gönderdi; retry turları da
 * üst üste bindi → aynı mesaj için kullanıcıya 2-3 pencere. Önce-gönder-sonra-işaretle yerine
 * önce-sahiplen-sonra-gönder: aynı satırı iki gönderen alamaz.
 */
export async function claimRecipients(messageId: string, serverId: string, usernames: string[]): Promise<string[]> {
  if (!usernames.length) return []
  const { data, error } = await sb().from("message_recipients")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("message_id", messageId).eq("server_id", serverId).in("username", usernames).eq("status", "pending")
    .select("username")
  if (error) throw error
  return ((data ?? []) as { username: string }[]).map(r => r.username)
}

/** Sahiplenilip gönderilemeyen alıcıyı yeniden pending yap (poller sonra dener). */
export async function releaseRecipient(messageId: string, serverId: string, username: string): Promise<void> {
  await sb().from("message_recipients")
    .update({ status: "pending", delivered_at: null })
    .eq("message_id", messageId).eq("server_id", serverId).eq("username", username).eq("status", "delivered")
}

/** Sahiplenilmiş alıcılar için gönderim hatası → failed. */
export async function markRecipientsFailed(messageId: string, serverId: string, usernames: string[], error: string): Promise<void> {
  if (!usernames.length) return
  await sb().from("message_recipients")
    .update({ status: "failed", error_message: error.slice(0, 500) })
    .eq("message_id", messageId).eq("server_id", serverId).in("username", usernames).eq("status", "delivered")
}

export interface PendingForServerRow {
  messageId:  string
  username:   string
  subject:    string
  body:       string
  type:       MessageType
  priority:   MessagePriority
  senderName: string
  sentAt:     string
  survey:     Anket | null
}

/** Sunucudaki pending alıcılar + mesaj içeriği (7 gün TTL). */
export async function getPendingForServer(serverId: string): Promise<PendingForServerRow[]> {
  const { data: recips } = await sb().from("message_recipients")
    .select("message_id, username")
    .eq("server_id", serverId).eq("status", "pending").is("read_at", null)
  const rlist = (recips ?? []) as { message_id: string; username: string }[]
  if (!rlist.length) return []

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const msgIds = [...new Set(rlist.map(r => r.message_id))]
  const { data: msgs } = await sb().from("messages")
    .select("id, subject, body, type, priority, sender_name, sent_at, survey")
    .in("id", msgIds).gte("sent_at", sevenDaysAgo)
  const mmap = new Map(((msgs ?? []) as {
    id: string; subject: string; body: string; type: MessageType; priority: MessagePriority; sender_name: string; sent_at: string; survey: Anket | null
  }[]).map(m => [m.id, m]))

  return rlist
    .filter(r => mmap.has(r.message_id))
    .map(r => {
      const m = mmap.get(r.message_id)!
      return { messageId: r.message_id, username: r.username, subject: m.subject, body: m.body,
               type: m.type, priority: m.priority, senderName: m.sender_name, sentAt: toZ(m.sent_at), survey: m.survey ?? null }
    })
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
}

/** Sunucu fan-out hatası → alıcıları failed. */
export async function markServerFailed(messageId: string, serverId: string, error: string): Promise<void> {
  await sb().from("message_recipients")
    .update({ status: "failed", error_message: error.slice(0, 500) })
    .eq("message_id", messageId).eq("server_id", serverId).eq("status", "pending")
}

/** ACK → kullanıcı okundu + ReadCount atomik artış. */
/**
 * ACK'teki kullanıcı adı Windows'tan gelir ve büyük/küçük harfi alıcı kaydından farklı olabilir
 * ("Alusup" ↔ "alusup", 07.10.2026: deneme anketinin cevabı bu yüzden yazılmadı) → harf duyarsız eşle.
 * ilike'ta % ve _ joker olduğu için kaçırılır.
 */
const adDesen = (u: string) => u.replace(/[\\%_]/g, (c) => "\\" + c)

export async function markRead(messageId: string, serverId: string, username: string): Promise<void> {
  const { data } = await sb().from("message_recipients")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("message_id", messageId).eq("server_id", serverId).ilike("username", adDesen(username)).neq("status", "read")
    .select("id")
  if ((data?.length ?? 0) > 0) {
    await getSupabaseAdmin().schema("hub").rpc("inc_message_read", { p_id: messageId, p_n: 1 })
  }
}

/**
 * ACK ama server/username bilinmiyorsa msgId üzerinden.
 * cevaplar: anket cevabı (lib/anket.ts cevapAyir) — ankete göre süzülüp yazılır.
 */
export async function markReadByMsgId(msgId: string, username: string, cevaplar?: AnketCevaplari | null): Promise<void> {
  const { data } = await sb().from("message_recipients")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("message_id", msgId).ilike("username", adDesen(username)).neq("status", "read")
    .select("id")
  const n = data?.length ?? 0
  if (n > 0) {
    await getSupabaseAdmin().schema("hub").rpc("inc_message_read", { p_id: msgId, p_n: n })
  }
  if (cevaplar) {
    const { data: m } = await sb().from("messages").select("survey").eq("id", msgId).maybeSingle()
    const anket = (m as { survey: Anket | null } | null)?.survey
    if (anket) {
      await sb().from("message_recipients")
        .update({ answers: cevapTemizle(anket, cevaplar) })
        .eq("message_id", msgId).ilike("username", adDesen(username))
    }
  }
}

/**
 * Pencere okunmadan kapatıldı ("<msgId>~k"): status closed + closed_at. read_count ARTMAZ.
 * Okunmuş / zaten kapatılmış satıra dokunmaz.
 */
export async function markClosedByMsgId(msgId: string, username: string): Promise<void> {
  await sb().from("message_recipients")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("message_id", msgId).ilike("username", adDesen(username)).in("status", ["pending", "delivered"])
}

/**
 * Agent'ın pendingAcks listesindeki tek ACK'yi işler (poller + /api/servers/[id]/messages ortak).
 * msgId biçimleri lib/anket.ts ackAyir: düz (okudu) · "~a~<cevap>" (anket) · "~k" (kapattı).
 * Dönüş: okundu sayıldıysa gerçek msgId (agent-store in-memory log'u için), değilse null.
 */
export async function ackIsle(ack: { msgId: string; username: string }): Promise<string | null> {
  const { msgId, cevaplar, kapatti } = ackAyir(ack.msgId)
  if (kapatti) { await markClosedByMsgId(msgId, ack.username); return null }
  await markReadByMsgId(msgId, ack.username, cevaplar)
  return msgId
}

/* ── Read ─────────────────────────────────────────────── */

export interface ListFilter {
  search?:    string
  subject?:   string
  type?:      MessageType
  priority?:  MessagePriority
  agentId?:   string
  companyId?: string
  username?:  string
  from?:      string
  to?:        string
  limit?:     number
  offset?:    number
}

export async function listMessages(f: ListFilter = {}): Promise<MessageRow[]> {
  const limit  = Math.min(f.limit ?? 100, 500)
  const offset = f.offset ?? 0

  // agentId / username filtreleri: önce ilgili message_id'leri recipients'tan çek
  let restrictIds: string[] | null = null
  if (f.agentId || f.username) {
    let rq = sb().from("message_recipients").select("message_id")
    if (f.agentId)  rq = rq.eq("server_id", f.agentId)
    if (f.username) rq = rq.eq("username", f.username)
    const { data } = await rq
    restrictIds = [...new Set(((data ?? []) as { message_id: string }[]).map(r => r.message_id))]
    if (!restrictIds.length) return []
  }

  let q = sb().from("messages")
    .select(MSG_COLS)
    .order("sent_at", { ascending: false })
  if (f.type)      q = q.eq("type", f.type)
  if (f.priority)  q = q.eq("priority", f.priority)
  if (f.companyId) q = q.eq("company_id", f.companyId)
  if (f.subject?.trim()) q = q.ilike("subject", `%${f.subject.trim()}%`)
  if (f.search?.trim())  q = q.or(`subject.ilike.%${f.search.trim()}%,body.ilike.%${f.search.trim()}%`)
  if (f.from) q = q.gte("sent_at", f.from)
  if (f.to) {
    const toNext = new Date(f.to); toNext.setDate(toNext.getDate() + 1)
    q = q.lt("sent_at", toNext.toISOString().slice(0, 10))
  }
  if (restrictIds) q = q.in("id", restrictIds)
  q = q.range(offset, offset + limit - 1)

  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as MsgDbRow[]).map(toMessageRow)
}

export async function getMessage(id: string): Promise<MessageRow | null> {
  const { data } = await sb().from("messages")
    .select(MSG_COLS)
    .eq("id", id).maybeSingle()
  return data ? toMessageRow(data as MsgDbRow) : null
}

export async function getRecipients(messageId: string): Promise<RecipientRow[]> {
  const { data } = await sb().from("message_recipients")
    .select("id, message_id, server_id, server_name, username, status, delivered_at, read_at, closed_at, error_message, answers")
    .eq("message_id", messageId)
    .order("status", { ascending: false }).order("server_name").order("username")
  return ((data ?? []) as {
    id: number; message_id: string; server_id: string; server_name: string | null; username: string
    status: RecipientStatus; delivered_at: string | null; read_at: string | null; closed_at: string | null; error_message: string | null
    answers: AnketCevaplari | null
  }[]).map(r => ({
    Id: r.id, MessageId: r.message_id, ServerId: r.server_id, ServerName: r.server_name,
    Username: r.username, Status: r.status,
    DeliveredAt: r.delivered_at ? toZ(r.delivered_at) : null,
    ReadAt: r.read_at ? toZ(r.read_at) : null,
    ClosedAt: r.closed_at ? toZ(r.closed_at) : null,
    ErrorMessage: r.error_message,
    Answers: r.answers ?? null,
  }))
}
