import { getSupabaseAdmin } from "./supabase/admin"
import { getAllAgents } from "./agent-store"
import {
  createMessage,
  addRecipient,
  markRecipientDelivered,
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
    const { data: firma } = await hub().from("companies")
      .select("windows_server_id, ad_server_id").eq("company_id", input.companyId).maybeSingle()
    const f = firma as { windows_server_id: string | null; ad_server_id: string | null } | null
    if (!f) return groups
    allowedServerIds = new Set(
      [f.windows_server_id, f.ad_server_id].filter((x): x is string => !!x)
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

/*  Eski MSSQL `Servers`/`Companies` tablolarından okuyordu; yeni sistemde
 *  (Coolify, 2026-08) o veritabanı yok → gönderim hiç çalışmıyordu. Artık
 *  hub şeması. Service-role: agent-poller gibi oturumsuz çağrılar da var.  */
const hub = () => getSupabaseAdmin().schema("hub")

async function getServerInfo(serverIds: string[]): Promise<Map<string, ServerInfoRow>> {
  if (serverIds.length === 0) return new Map()
  const { data, error } = await hub().from("servers")
    .select("id, name, ip, api_key, agent_port").in("id", serverIds)
  if (error) throw error
  const map = new Map<string, ServerInfoRow>()
  for (const r of (data ?? []) as { id: string; name: string; ip: string; api_key: string | null; agent_port: number | null }[]) {
    map.set(r.id, { Id: r.id, Name: r.name, IP: r.ip, ApiKey: r.api_key, AgentPort: r.agent_port })
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
    const { data: firma } = await hub().from("companies")
      .select("name").eq("company_id", input.companyId).maybeSingle()
    companyName = (firma as { name: string } | null)?.name ?? null
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

  // Kullanıcının o anki Active session'larda olup olmadığını belirlemek için
  // agent-store'dan agent.lastReport.sessions kullanırız. Online olmayan
  // hedefler agent'a hiç gönderilmez (inject olmaz, sessions:0 sayılır),
  // MessageRecipients'ta `pending` kalır → Poller sonradan retry yapar.
  const allAgents = getAllAgents()

  await Promise.all(serverIds.map(async (serverId) => {
    const info = serverInfo.get(serverId)
    if (!info || !info.ApiKey || !info.AgentPort) {
      const err = "Agent bağlantı bilgileri eksik"
      await markServerFailed(input.msgId, serverId, err)
      errors.push({ serverId, error: err })
      return
    }

    const groupUsers = groups.get(serverId) ?? []
    // Bu sunucudaki o anki Active username set'i (agent.lastReport snapshot)
    const agentEntry  = allAgents.find(a => a.agentId === serverId)
    const activeSet   = new Set(
      (agentEntry?.lastReport?.sessions ?? [])
        .filter(s => s.username && s.state === "Active")
        .map(s => s.username.toLowerCase())
    )
    // Online şimdi inject edilebilir, offline pending kalır
    const onlineNow = groupUsers.filter(u => activeSet.has(u.toLowerCase()))

    // "selected" mod'ta hedef belli olduğundan online filter uygula;
    // "all" / "company" mod'ta zaten resolveTargets() Active filter'ı yapmıştı,
    // yani groupUsers == onlineNow olur.
    if (onlineNow.length === 0) {
      // Hiçbir hedef şu an aktif değil — agent'a istek gönderme,
      // tüm recipientlar `pending` olarak kalsın. Poller retry yapacak.
      return
    }

    try {
      const ctrl  = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 12000)
      const payload: Record<string, unknown> = {
        msgId:  input.msgId,
        title:  input.subject,
        body:   input.body,
        type:   input.type,
        from:   input.senderName,
        sentAt,
        // Agent'a SADECE şu an aktif olan target user'ları gönder; offline
        // olanlar pending kalır, sonradan login olunca Poller iletir.
        targetUsernames: onlineNow,
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
      // Agent yanıtı OK — inject edilenler için (=onlineNow) delivered işaretle
      await Promise.all(onlineNow.map(u =>
        markRecipientDelivered(input.msgId, serverId, u)
      ))
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
