import { NextResponse } from "next/server"
import { serversWithRole } from "@/lib/hub-servers"
import { getAllAgents } from "@/lib/agent-store"

/** GET /api/setup/ad-servers — Role='AD' sunucular + agent-store zenginleştirme. */

interface Row {
  id: string; name: string; ip: string; dns: string | null; domain: string | null; rdp_port: number | null; status: string
}

export interface AdServerDto {
  id: string; name: string; ip: string; dns: string; domain: string
  rdpPort: number | null; isOnline: boolean; userCount: number; companyCount: number
}

function domainFromDns(dns: string | null): string {
  if (!dns) return ""
  const idx = dns.indexOf(".")
  return idx === -1 ? "" : dns.slice(idx + 1)
}

export async function GET() {
  try {
    const rows = await serversWithRole("AD", "id, name, ip, dns, domain, rdp_port, status") as unknown as Row[]
    const agents = getAllAgents()

    const servers: AdServerDto[] = rows.map((r) => {
      const agent = agents.find((a) => a.agentId === r.id || a.hostname === r.name || a.ip === r.ip)
      const ad = agent?.lastReport?.ad
      return {
        id: r.id, name: r.name, ip: r.ip, dns: r.dns ?? "",
        domain: (r.domain && r.domain.trim()) ? r.domain.trim() : domainFromDns(r.dns),
        rdpPort: r.rdp_port,
        isOnline: agent ? agent.status === "online" : r.status === "online",
        userCount: ad?.users?.length ?? 0,
        companyCount: ad?.companies?.length ?? 0,
      }
    })

    const resp = NextResponse.json(servers)
    resp.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/setup/ad-servers]", err)
    return NextResponse.json({ error: "AD sunucuları alınamadı" }, { status: 500 })
  }
}
