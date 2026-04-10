import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getAllAgents } from "@/lib/agent-store"

/**
 * GET /api/setup/iis-servers
 * Firma kurulum sihirbazı 4. adım "IIS Sunucusu" listesi için:
 * sistemde Role='IIS' rolüne sahip tüm Windows sunucularını döndürür.
 * Agent-store'dan canlı RAM kapasitesi ve online durumu ile zenginleştirilir.
 */

interface Row {
  Id:     string
  Name:   string
  IP:     string
  DNS:    string | null
  Status: string
}

export interface IisServerItem {
  id:         string
  name:       string
  ip:         string
  dns:        string
  type:       string
  userCount:  number
  totalRamGB: number
  isOnline:   boolean
}

export async function GET() {
  try {
    const rows = await query<Row[]>`
      SELECT DISTINCT s.Id, s.Name, s.IP, s.DNS, s.Status
      FROM Servers s
      INNER JOIN ServerRoles r ON r.ServerId = s.Id
      WHERE r.Role = 'IIS'
      ORDER BY s.Name
    `

    const agents = getAllAgents()

    const servers: IisServerItem[] = rows.map((r) => {
      const agent = agents.find(
        (a) => a.agentId === r.Id || a.hostname === r.Name || a.ip === r.IP
      )
      const report  = agent?.lastReport
      const totalMB = report?.metrics?.ram?.totalMB ?? 0

      return {
        id:         r.Id,
        name:       r.Name,
        ip:         r.IP,
        dns:        r.DNS ?? "",
        type:       "IIS Web Server",
        userCount:  0,
        totalRamGB: Math.round(totalMB / 1024),
        isOnline:   agent ? agent.status === "online" : r.Status === "online",
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
