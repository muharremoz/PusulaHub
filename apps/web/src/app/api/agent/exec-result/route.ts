import { NextResponse } from "next/server"
import { getAgentByToken, storeExecResult } from "@/lib/agent-store"
import type { AgentExecResult } from "@/lib/agent-types"

/* POST — Agent komut sonucunu gönderir */
export async function POST(req: Request) {
  const body: AgentExecResult = await req.json()
  const { agentId, token } = body

  const agent = getAgentByToken(token)
  if (!agent || agent.agentId !== agentId) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 })
  }

  storeExecResult(body)
  return NextResponse.json({ ok: true })
}
