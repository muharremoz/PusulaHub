import { query } from "./db"
import { getAllAgents } from "./agent-store"
import {
  createMessage,
  addRecipient,
  markServerDelivered,
  markServerFailed,
  type MessageType,
  type MessagePriority,
  type RecipientKind,
} from "./messages-db"

/**
 * Mesaj fan-out katmanı.
 * Bir broadcast isteğini alıp:
 *   - Hedef sunucu+kullanıcı listesini hesaplar
 *   - Messages + MessageRecipients DB satırlarını yazar
 *   - Her hedef sunucuya paralel `/api/notify` POST eder
 *   - Sonuca göre delivered / failed işaretler
 */

export interface BroadcastInput {
  msgId:         string
  subject:       string
  body:          string
  type:          MessageType
  priority:      MessagePriority
  recipientType: RecipientKind
  companyId?:    string | null
  targets?:      { agentId: string; username: string }[]   // recipientType="selected" için
  senderName:    string
  senderUserId?: string | null
}

export interface BroadcastResult {
  msgId:           string
  totalRecipients: number
  serversTargeted: number
  serversOk:       number
  serversFailed:   number
  errors:          { serverId: string; error: string }[]
}

interface ServerInfoRow {
  Id:        string
  Name:      string
  IP:        string
  ApiKey:    string | null
  AgentPort: number | null
}

/**
 * Hedef listesini {serverId, username[]} grupları halinde döndürür.
 */
async function resolveTargets(input: BroadcastInput): Promise<Map<string, string[]>> {
  const groups = new Map<string, string[]>()

  if (input.recipientType === "selected") {
    for (const t of input.targets ?? []) {
      if (!t.agentId || !t.username) continue
      const arr = groups.get(t.agentId) ?? []
      if (!arr.includes(t.username)) arr.push(t.username)
      groups.set(t.agentId, arr)
    }
    return groups
  }

  // "all" veya "company" → online agent'ların aktif WTS oturumlarını topla
  const agents = getAllAgents().filter(a => a.status === "online")

  let allowedServerIds: Set<string> | null = null
  if (input.recipientType === "company") {
    if (!input.companyId) return groups
    const rows = await query<{ WindowsServerId: string | null; AdServerId: string | null }[]>`
      SELECT WindowsServerId, AdServerId FROM Companies WHERE CompanyId = ${input.companyId}
    `
    if (!rows.length) return groups
    allowedServerIds = new Set(
      [rows[0].WindowsServerId, rows[0].AdServerId].filter((x): x is string => !!x)
    )
  }

  for (const a of agents) {
    if (allowedServerIds && !allowedServerIds.has(a.agentId)) continue
    const sessions = a.lastReport?.sessions ?? []
    const usernames = Array.from(new Set(
      sessions
        .filter(s => s.username && s.state === "Active")
        .map(s => s.username)
    ))
    if (usernames.length === 0) continue
    groups.set(a.agentId, usernames)
  }

  return groups
}

async function getServerInfo(serverIds: string[]): Promise<Map<string, ServerInfoRow>> {
  if (serverIds.length === 0) return new Map()
  const map = new Map<string, ServerInfoRow>()
  // Tek tek çek — id sayısı genellikle az (online agent'lar)
  for (const id of serverIds) {
    const rows = await query<ServerInfoRow[]>`
      SELECT Id, Name, IP, ApiKey, AgentPort FROM Servers WHERE Id = ${id}
    `
    if (rows.length) map.set(id, rows[0])
  }
  return map
}

export async function broadcast(input: BroadcastInput): Promise<BroadcastResult> {
  const groups = await resolveTargets(input)
  const serverIds = [...groups.keys()]
  const serverInfo = await getServerInfo(serverIds)

  // Firma adını çek (UI'da göstermek için)
  let companyName: string | null = null
  if (input.recipientType === "company" && input.companyId) {
    const rows = await query<{ Name: string }[]>`
      SELECT Name FROM Companies WHERE CompanyId = ${input.companyId}
    `
    companyName = rows[0]?.Name ?? null
  }

  // Toplam alıcı sayısı
  let totalRecipients = 0
  for (const usernames of groups.values()) totalRecipients += usernames.length

  // Mesajı kaydet
  await createMessage({
    id:            input.msgId,
    subject:       input.subject,
    body:          input.body,
    type:          input.type,
    priority:      input.priority,
    recipientType: input.recipientType,
    companyId:     input.companyId ?? null,
    companyName,
    senderUserId:  input.senderUserId ?? null,
    senderName:    input.senderName,
    totalCount:    totalRecipients,
  })

  // Alıcı satırlarını yaz (pending)
  for (const [serverId, usernames] of groups.entries()) {
    const info = serverInfo.get(serverId)
    for (const username of usernames) {
      await addRecipient({
        messageId:  input.msgId,
        serverId,
        serverName: info?.Name ?? null,
        username,
      })
    }
  }

  // Paralel fan-out
  const sentAt  = new Date().toISOString()
  const errors: { serverId: string; error: string }[] = []
  let serversOk = 0

  await Promise.all(serverIds.map(async (serverId) => {
    const info = serverInfo.get(serverId)
    if (!info || !info.ApiKey || !info.AgentPort) {
      const err = "Agent bağlantı bilgileri eksik"
      await markServerFailed(input.msgId, serverId, err)
      errors.push({ serverId, error: err })
      return
    }
    try {
      const ctrl  = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 12000)
      // "selected" modunda agent'a yalnızca seçili kullanıcılara inject etmesini söyle;
      // diğer modlarda (all/company) tüm aktif oturumlara gönderilsin — alan yollanmaz.
      const payload: Record<string, unknown> = {
        msgId:  input.msgId,
        title:  input.subject,
        body:   input.body,
        type:   input.type,
        from:   input.senderName,
        sentAt,
      }
      if (input.recipientType === "selected") {
        const serverUsernames = groups.get(serverId) ?? []
        if (serverUsernames.length > 0) {
          payload.targetUsernames = serverUsernames
        }
      }

      const res = await fetch(`http://${info.IP}:${info.AgentPort}/api/notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key":    info.ApiKey,
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (!res.ok) {
        const e = `Agent HTTP ${res.status}`
        await markServerFailed(input.msgId, serverId, e)
        errors.push({ serverId, error: e })
        return
      }
      await markServerDelivered(input.msgId, serverId)
      serversOk++
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      await markServerFailed(input.msgId, serverId, msg)
      errors.push({ serverId, error: msg })
    }
  }))

  return {
    msgId:           input.msgId,
    totalRecipients,
    serversTargeted: serverIds.length,
    serversOk,
    serversFailed:   serverIds.length - serversOk,
    errors,
  }
}
