import { NextResponse } from "next/server"
import { serversWithRole } from "@/lib/hub-servers"
import { getAllAgents } from "@/lib/agent-store"

/** GET /api/setup/iis-servers — Role='IIS' sunucular + agent-store zenginleştirme. */

interface Row { id: string; name: string; ip: string; dns: string | null; status: string }

export interface IisServerItem {
  id: string; name: string; ip: string; dns: string; type: string
  userCount: number; totalRamGB: number; isOnline: boolean
}

export async function GET() {
  try {
    const rows = await serversWithRole("IIS", "id, name, ip, dns, status") as unknown as Row[]
    const agents = getAllAgents()

    const servers: IisServerItem[] = rows.map((r) => {
      const agent = agents.find((a) => a.agentId === r.id || a.hostname === r.name || a.ip === r.ip)
      const totalMB = agent?.lastReport?.metrics?.ram?.totalMB ?? 0
      return {
        id: r.id, name: r.name, ip: r.ip, dns: r.dns ?? "", type: "IIS Web Server",
        userCount: 0, totalRamGB: Math.round(totalMB / 1024),
        isOnline: agent ? agent.status === "online" : r.status === "online",
      }
    })

    const resp = NextResponse.json(servers)
    resp.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/setup/iis-servers]", err)
    return NextResponse.json({ error: "IIS sunucuları alınamadı" }, { status: 500 })
  }
}
