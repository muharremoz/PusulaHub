import { NextResponse } from "next/server"
import { findServerBy } from "@/lib/hub-servers"
import { requirePermission } from "@/lib/require-permission"
import { listMessages, getRecipients } from "@/lib/messages-db"
import { markReadByMsgId } from "@/lib/messages-db"

/**
 * GET /api/servers/[id]/messages
 * Bu sunucuya gönderilmiş mesajların geçmişi (DB'den).
 * Aynı zamanda agent'ı bir kez poll'leyip pendingAcks'leri DB'ye işler.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePermission("messages", "read")
  if (gate) return gate

  const { id } = await params

  // Önce sunucu kaydını çöz (Id veya Name)
  const server = await findServerBy(id, "id, ip, api_key, agent_port") as
    { id: string; ip: string; api_key: string | null; agent_port: number | null } | null
  if (!server) {
    return NextResponse.json({ messages: [] })
  }
  const serverId = server.id

  // Agent'ı poll et — pendingAcks varsa DB'ye işle
  const { api_key: ApiKey, agent_port: AgentPort, ip: IP } = server
  if (ApiKey && AgentPort) {
    try {
      const ctrl  = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 5000)
      const resp = await fetch(`http://${IP}:${AgentPort}/api/report`, {
        headers: { "X-Api-Key": ApiKey },
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (resp.ok) {
        const data = await resp.json()
        const acks: { msgId: string; username: string }[] = data.pendingAcks ?? []
        for (const a of acks) {
          if (a.msgId && a.username) {
            await markReadByMsgId(a.msgId, a.username)
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Bu sunucuya gönderilen mesajlar
  const rows = await listMessages({ agentId: serverId, limit: 50 })

  // Her mesaj için bu sunucudaki alıcı satırlarını da getir (UI'da X/Y okundu için)
  const messages = await Promise.all(rows.map(async (m) => {
    const recipients = await getRecipients(m.Id)
    const here = recipients.filter(r => r.ServerId === serverId)
    const readBy = here
      .filter(r => r.Status === "read" && r.ReadAt)
      .map(r => ({ username: r.Username, readAt: r.ReadAt as string }))
    return {
      id:       m.Id,
      title:    m.Subject,
      body:     m.Body,
      type:     m.Type,
      from:     m.SenderName,
      sentAt:   m.SentAt,
      sessions: here.length,
      readBy,
    }
  }))

  return NextResponse.json({ messages })
}
