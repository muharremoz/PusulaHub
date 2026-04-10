import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getAllAgents } from "@/lib/agent-store"

/**
 * GET /api/setup/sql-servers
 * Firma kurulum sihirbazı 5. adım "SQL Sunucusu" listesi için:
 * sistemde Role='SQL' rolüne sahip tüm sunucuları döndürür.
 * Agent online durumu ile zenginleştirilir. Port/auth/dbCount/totalSize
 * şu an varsayılan değerlerle gelir; ileride agent SQL metrikleri ekleyince
 * burada zenginleştirilecek.
 */

interface Row {
  Id:     string
  Name:   string
  IP:     string
  DNS:    string | null
  Status: string
}

export interface SqlServerItem {
  id:          string
  name:        string
  ip:          string
  dns:         string
  port:        number
  authType:    "Windows" | "SQL"
  dbCount:     number
  totalSizeGB: number
  isOnline:    boolean
}

export async function GET() {
  try {
    const rows = await query<Row[]>`
      SELECT DISTINCT s.Id, s.Name, s.IP, s.DNS, s.Status
      FROM Servers s
      INNER JOIN ServerRoles r ON r.ServerId = s.Id
      WHERE r.Role = 'SQL'
      ORDER BY s.Name
    `

    const agents = getAllAgents()

    const servers: SqlServerItem[] = rows.map((r) => {
      const agent = agents.find(
        (a) => a.agentId === r.Id || a.hostname === r.Name || a.ip === r.IP
      )

      return {
        id:          r.Id,
        name:        r.Name,
        ip:          r.IP,
        dns:         r.DNS ?? "",
        port:        1433,
        authType:    "SQL",
        dbCount:     0,
        totalSizeGB: 0,
        isOnline:    agent ? agent.status === "online" : r.Status === "online",
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
