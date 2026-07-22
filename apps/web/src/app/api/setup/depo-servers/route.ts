import { NextResponse } from "next/server"
import { serversWithRole } from "@/lib/hub-servers"
import { getAllAgents } from "@/lib/agent-store"

/** GET /api/setup/depo-servers — Role='File' (depo) sunucular. */

interface Row { id: string; name: string; ip: string; dns: string | null; status: string }

export interface DepoServerItem {
  id: string; name: string; ip: string; dns: string; type: string; isOnline: boolean
}

export async function GET() {
  try {
    const rows = await serversWithRole("File", "id, name, ip, dns, status") as unknown as Row[]
    const agents = getAllAgents()

    const servers: DepoServerItem[] = rows.map((r) => {
      const agent = agents.find((a) => a.agentId === r.id || a.hostname === r.name || a.ip === r.ip)
      return {
        id: r.id, name: r.name, ip: r.ip, dns: r.dns ?? "", type: "Depo / Dosya Sunucusu",
        isOnline: agent ? agent.status === "online" : r.status === "online",
      }
    })

    const resp = NextResponse.json(servers)
    resp.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/setup/depo-servers]", err)
    return NextResponse.json({ error: "Depo sunucuları alınamadı" }, { status: 500 })
  }
}
