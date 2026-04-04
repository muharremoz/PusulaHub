import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { logSentMessage } from "@/lib/agent-store"
import { randomUUID } from "crypto"

interface ServerRow {
  Name: string
  IP: string
  ApiKey: string | null
  AgentPort: number | null
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { title, body: msgBody, type = "info", from = "Pusula Yazılım" } = await req.json()

  if (!title?.trim() || !msgBody?.trim()) {
    return NextResponse.json({ error: "Başlık ve mesaj zorunlu" }, { status: 400 })
  }

  const rows = await query<ServerRow[]>`
    SELECT Name, IP, ApiKey, AgentPort FROM Servers
    WHERE Id = ${id} OR LOWER(Name) = ${id.toLowerCase()}
  `
  if (!rows.length) {
    return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })
  }

  const server = rows[0]
  if (!server.ApiKey || !server.AgentPort) {
    return NextResponse.json({ error: "Agent bağlantı bilgileri eksik" }, { status: 400 })
  }

  const msgId = randomUUID()
  const sentAt = new Date().toISOString()
  const agentUrl = `http://${server.IP}:${server.AgentPort}`

  const payload = {
    msgId,
    hubUrl,
    title: title.trim(),
    body: msgBody.trim(),
    type,
    from,
    sentAt,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)

  try {
    const res = await fetch(`${agentUrl}/api/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": server.ApiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: err.error ?? `Agent HTTP ${res.status}` },
        { status: 502 }
      )
    }

    const data = await res.json()
    const sessions: number = data.sessions ?? 0

    logSentMessage({ id: msgId, agentId: id, title: title.trim(), body: msgBody.trim(), type, from, sentAt, sessions })

    return NextResponse.json({ ok: true, sessions })
  } catch (err: unknown) {
    clearTimeout(timer)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
