/* ══════════════════════════════════════════════════════════
   GET /api/agent/messages
   Notifier uygulaması bu endpoint'i poll eder.
   Query: ?agentId=xxx&token=xxx
   Yanıt: Bekleyen mesajlar (delivered=false olanlar)
══════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from "next/server"
import { getAgentByToken, popPendingMessages, popPendingExecs } from "@/lib/agent-store"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const agentId = searchParams.get("agentId")
  const token   = searchParams.get("token")

  if (!agentId || !token) {
    return NextResponse.json(
      { error: "agentId ve token zorunlu" },
      { status: 400 }
    )
  }

  /* Token doğrulama */
  const agent = getAgentByToken(token)
  if (!agent || agent.agentId !== agentId) {
    return NextResponse.json(
      { error: "invalid_token", action: "reregister" },
      { status: 401 }
    )
  }

  const messages = popPendingMessages(agentId)
  const execs    = popPendingExecs(agentId)

  return NextResponse.json({
    messages,
    execs,
    serverTime: new Date().toISOString(),
  })
}
