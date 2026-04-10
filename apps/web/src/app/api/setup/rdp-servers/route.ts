import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getAllAgents } from "@/lib/agent-store"

/**
 * GET /api/setup/rdp-servers
 * Firma kurulum sihirbazı 2. adım "Bağlantı Sunucusu" listesi için:
 * sistemde Role='RDP' rolüne sahip tüm Windows sunucularını döndürür.
 * Agent-store'dan canlı oturum sayısı, RAM kapasitesi ve online durumu
 * ile zenginleştirilir.
 */

interface Row {
  Id:    string
  Name:  string
  IP:    string
  DNS:   string | null
  Status: string
}

export interface RdpServerItem {
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
      WHERE r.Role = 'RDP'
      ORDER BY s.Name
    `

    const agents = getAllAgents()

    const servers: RdpServerItem[] = rows.map((r) => {
      const agent = agents.find(
        (a) => a.agentId === r.Id || a.hostname === r.Name || a.ip === r.IP
      )
      const report  = agent?.lastReport
      const totalMB = report?.metrics?.ram?.totalMB ?? 0
      // Sadece aktif (Active) RDP oturumlarını say — Disconnected'ları hariç tut
      const sessions = report?.sessions ?? []
      const activeSessions = sessions.filter(
        (s) => (s.state ?? "").toLowerCase() === "active"
      ).length

      return {
        id:         r.Id,
        name:       r.Name,
        ip:         r.IP,
        dns:        r.DNS ?? "",
        type:       "Terminal Server",
        userCount:  activeSessions,
        totalRamGB: Math.round(totalMB / 1024),
        isOnline:   agent ? agent.status === "online" : r.Status === "online",
      }
    })

    const resp = NextResponse.json(servers)
    resp.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/setup/rdp-servers]", err)
    return NextResponse.json({ error: "RDP sunucuları alınamadı" }, { status: 500 })
  }
}
