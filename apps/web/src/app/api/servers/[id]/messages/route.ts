import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getSentMessages, markMessageRead } from "@/lib/agent-store"

interface ServerRow {
  IP: string
  ApiKey: string | null
  AgentPort: number | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Agent'ı anlık poll et — pendingAcks'leri işle
  try {
    const rows = await query<ServerRow[]>`
      SELECT IP, ApiKey, AgentPort FROM Servers
      WHERE Id = ${id} OR LOWER(Name) = ${id.toLowerCase()}
    `
    if (rows.length && rows[0].ApiKey && rows[0].AgentPort) {
      const { IP, ApiKey, AgentPort } = rows[0]
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)

      const resp = await fetch(`http://${IP}:${AgentPort}/api/report`, {
        headers: { "X-Api-Key": ApiKey },
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (resp.ok) {
        const data = await resp.json()
        const pendingAcks: { msgId: string; username: string }[] = data.pendingAcks ?? []
        for (const ack of pendingAcks) {
          if (ack.msgId && ack.username) {
            markMessageRead(ack.msgId, ack.username)
          }
        }
      }
    }
  } catch {
    // Poll hatası sessizce geç — eski veriyi döndür
  }

  const messages = getSentMessages(id)
  return NextResponse.json({ messages })
}
