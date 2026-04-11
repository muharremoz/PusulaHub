/* ══════════════════════════════════════════════════════════
   POST /api/messages/send
   Hub UI'dan bir agent'a mesaj gönderir.
   Body: { agentId, title, body, type, from }
══════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from "next/server"
import { queueMessage, getAgentById } from "@/lib/agent-store"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { agentId, title, body: msgBody, type, from } = body

    if (!agentId || !title || !msgBody) {
      return NextResponse.json(
        { error: "agentId, title ve body zorunlu" },
        { status: 400 }
      )
    }

    const validTypes = ["info", "warning", "urgent"]
    const msgType = validTypes.includes(type) ? type : "info"

    const agent = getAgentById(agentId)
    if (!agent) {
      return NextResponse.json({ error: "Agent bulunamadı" }, { status: 404 })
    }

    const message = queueMessage(agentId, {
      title,
      body:      msgBody,
      type:      msgType,
      from:      from ?? "PusulaHub",
      toCompany: "",
    })

    return NextResponse.json({
      ok:        true,
      messageId: message?.id,
      queued:    true,
      agent:     agent.hostname,
      online:    agent.status === "online",
    })
  } catch (err) {
    console.error("[Messages Send]", err)
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 })
  }
}

/* GET /api/messages/send — Tüm mesaj geçmişi (UI için) */
export async function GET() {
  const { getAllMessages } = await import("@/lib/agent-store")
  return NextResponse.json({ messages: getAllMessages() })
}
