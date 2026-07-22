import { NextResponse } from "next/server"
import { serversWithRole } from "@/lib/hub-servers"
import { getAllAgents } from "@/lib/agent-store"

/**
 * GET /api/setup/rdp-servers
 * Firma kurulum sihirbazı 2. adım "Bağlantı Sunucusu" listesi için:
 * sistemde Role='RDP' rolüne sahip tüm Windows sunucularını döndürür.
 * Agent-store'dan canlı oturum sayısı, RAM kapasitesi ve online durumu
 * ile zenginleştirilir.
 */

interface Row {
  id:    string
  name:  string
  ip:    string
  dns:   string | null
  rdp_port: number | null
  status: string
}

export interface RdpServerItem {
  id:         string
  name:       string
  ip:         string
  dns:        string
  rdpPort:    number | null
  type:       string
  userCount:  number
  totalRamGB: number
  isOnline:   boolean
}

export async function GET() {
  try {
    const rows = await serversWithRole("RDP", "id, name, ip, dns, rdp_port, status") as unknown as Row[]

    const agents = getAllAgents()

    const servers: RdpServerItem[] = rows.map((r) => {
      const agent = agents.find(
        (a) => a.agentId === r.id || a.hostname === r.name || a.ip === r.ip
      )
      const report  = agent?.lastReport
      const totalMB = report?.metrics?.ram?.totalMB ?? 0
      // Sadece aktif (Active) RDP oturumlarını say — Disconnected'ları hariç tut
      const sessions = report?.sessions ?? []
      const activeSessions = sessions.filter(
        (s) => (s.state ?? "").toLowerCase() === "active"
      ).length

      return {
        id:         r.id,
        name:       r.name,
        ip:         r.ip,
        dns:        r.dns ?? "",
        rdpPort:    r.rdp_port,
        type:       "Terminal Server",
        userCount:  activeSessions,
        totalRamGB: Math.round(totalMB / 1024),
        isOnline:   agent ? agent.status === "online" : r.status === "online",
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
