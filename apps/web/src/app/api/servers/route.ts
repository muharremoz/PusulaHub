/* ══════════════════════════════════════════════════════════
   GET /api/servers
   UI'a sunucu listesini döner.
   Agent'lardan veri varsa gerçek veri, yoksa mock data.
══════════════════════════════════════════════════════════ */

import { NextResponse } from "next/server"
import { getAllAgents, agentsToServerList } from "@/lib/agent-store"

export async function GET() {
  const agents = getAllAgents()

  if (agents.length === 0) {
    /* Henüz agent bağlanmadı — mock data döndür */
    return NextResponse.json({
      source:  "mock",
      servers: [],
      message: "Henüz bağlı agent yok. Sunuculara PusulaAgent kurun.",
    })
  }

  return NextResponse.json({
    source:  "live",
    servers: agentsToServerList(),
  })
}
