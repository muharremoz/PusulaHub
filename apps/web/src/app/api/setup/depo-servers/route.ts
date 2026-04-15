import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getAllAgents } from "@/lib/agent-store"

/**
 * GET /api/setup/depo-servers
 * Firma kurulum sihirbazı 4. adımında Pusula programları seçildiğinde
 * "Depo Sunucusu" listesi için: Role='Depo' olan sunucuları döndürür.
 * Depo sunucusunda D:\Resimler\<firmaId> klasörü açılır ve NTFS yetkisi verilir.
 */

interface Row {
  Id:     string
  Name:   string
  IP:     string
  DNS:    string | null
  Status: string
}

export interface DepoServerItem {
  id:       string
  name:     string
  ip:       string
  dns:      string
  type:     string
  isOnline: boolean
}

export async function GET() {
  try {
    const rows = await query<Row[]>`
      SELECT DISTINCT s.Id, s.Name, s.IP, s.DNS, s.Status
      FROM Servers s
      INNER JOIN ServerRoles r ON r.ServerId = s.Id
      WHERE r.Role = 'File'
      ORDER BY s.Name
    `

    const agents = getAllAgents()

    const servers: DepoServerItem[] = rows.map((r) => {
      const agent = agents.find(
        (a) => a.agentId === r.Id || a.hostname === r.Name || a.ip === r.IP
      )
      return {
        id:       r.Id,
        name:     r.Name,
        ip:       r.IP,
        dns:      r.DNS ?? "",
        type:     "Depo / Dosya Sunucusu",
        isOnline: agent ? agent.status === "online" : r.Status === "online",
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
