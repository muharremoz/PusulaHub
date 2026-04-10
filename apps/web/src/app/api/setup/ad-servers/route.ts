import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getAllAgents } from "@/lib/agent-store"

/**
 * GET /api/setup/ad-servers
 * Firma kurulum sihirbazı 1. adım için: sistemde Role='AD' rolüne sahip
 * tüm sunucuları döndürür. Her kayıtta agent-store'dan canlı durum,
 * kullanıcı sayısı ve firma sayısı zenginleştirilir.
 */

interface Row {
  Id:    string
  Name:  string
  IP:    string
  DNS:   string | null
  Status: string
}

export interface AdServerDto {
  id:           string
  name:         string
  ip:           string
  domain:       string
  isOnline:     boolean
  userCount:    number
  companyCount: number
}

/** "dc1.sirket.local" → "sirket.local"  /  "dc1" → "" */
function domainFromDns(dns: string | null): string {
  if (!dns) return ""
  const idx = dns.indexOf(".")
  if (idx === -1) return ""
  return dns.slice(idx + 1)
}

export async function GET() {
  try {
    const rows = await query<Row[]>`
      SELECT DISTINCT s.Id, s.Name, s.IP, s.DNS, s.Status
      FROM Servers s
      INNER JOIN ServerRoles r ON r.ServerId = s.Id
      WHERE r.Role = 'AD'
      ORDER BY s.Name
    `

    const agents = getAllAgents()

    const servers: AdServerDto[] = rows.map((r) => {
      const agent = agents.find(
        (a) => a.agentId === r.Id || a.hostname === r.Name || a.ip === r.IP
      )
      const ad = agent?.lastReport?.ad
      return {
        id:           r.Id,
        name:         r.Name,
        ip:           r.IP,
        domain:       domainFromDns(r.DNS),
        isOnline:     agent ? agent.status === "online" : r.Status === "online",
        userCount:    ad?.users?.length ?? 0,
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
