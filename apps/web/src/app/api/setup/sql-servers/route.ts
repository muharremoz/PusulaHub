import { NextResponse } from "next/server"
import { serversWithRole } from "@/lib/hub-servers"
import { getAllAgents } from "@/lib/agent-store"

/** GET /api/setup/sql-servers — Role='SQL' sunucular + agent online. */

interface Row { id: string; name: string; ip: string; dns: string | null; status: string }

export interface SqlServerItem {
  id: string; name: string; ip: string; dns: string; port: number
  authType: "Windows" | "SQL"; dbCount: number; totalSizeGB: number; isOnline: boolean
}

export async function GET() {
  try {
    const rows = await serversWithRole("SQL", "id, name, ip, dns, status") as unknown as Row[]
    const agents = getAllAgents()

    const servers: SqlServerItem[] = rows.map((r) => {
      const agent = agents.find((a) => a.agentId === r.id || a.hostname === r.name || a.ip === r.ip)
      return {
        id: r.id, name: r.name, ip: r.ip, dns: r.dns ?? "", port: 1433, authType: "SQL",
        dbCount: 0, totalSizeGB: 0,
        isOnline: agent ? agent.status === "online" : r.status === "online",
      }
    })

    const resp = NextResponse.json(servers)
    resp.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/setup/sql-servers]", err)
    return NextResponse.json({ error: "SQL sunucuları alınamadı" }, { status: 500 })
  }
}
