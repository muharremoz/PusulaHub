import { NextResponse } from "next/server"
import { query, execute } from "@/lib/db"
import { getAllAgents } from "@/lib/agent-store"
import type { Server } from "@/types"

interface ServerRow {
  Id: string
  Name: string
  IP: string
  DNS: string | null
  OS: string
  Status: string
  CPU: number
  RAM: number
  Disk: number
  Uptime: string | null
  LastChecked: string | null
  Roles: string | null
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}g ${h}s`
  if (h > 0) return `${h}s ${m}d`
  return `${m}d`
}

export async function GET() {
  try {
    const rows = await query<ServerRow[]>`
      SELECT
        s.Id, s.Name, s.IP, s.DNS, s.OS, s.Status,
        s.CPU, s.RAM, s.Disk, s.Uptime, s.LastChecked,
        STRING_AGG(r.Role, ',') AS Roles
      FROM Servers s
      LEFT JOIN ServerRoles r ON r.ServerId = s.Id
      GROUP BY s.Id, s.Name, s.IP, s.DNS, s.OS, s.Status,
               s.CPU, s.RAM, s.Disk, s.Uptime, s.LastChecked, s.CreatedAt
      ORDER BY s.Name
    `

    const agents = getAllAgents()

    const servers: Server[] = rows.map((r) => {
      // DB kaydıyla eşleşen canlı agent varsa metriklerini kullan
      const agent = agents.find(
        (a) => a.hostname === r.Name || a.ip === r.IP
      )
      const m = agent?.lastReport?.metrics

      return {
        id:          r.Id,
        name:        r.Name,
        ip:          r.IP,
        dns:         r.DNS ?? undefined,
        os:          r.OS as Server["os"],
        status:      agent ? (agent.status as Server["status"]) : (r.Status as Server["status"]),
        cpu:         m ? m.cpu : r.CPU,
        ram:         m ? Math.round((m.ram.usedMB / m.ram.totalMB) * 100) : r.RAM,
        disk:        m?.disks?.[0]?.percent ?? r.Disk,
        uptime:      m ? formatUptime(m.uptimeSeconds) : (r.Uptime ?? "—"),
        lastChecked: agent ? agent.lastSeen : (r.LastChecked ?? "—"),
        roles:       r.Roles ? (r.Roles.split(",") as Server["roles"]) : [],
      }
    })

    return NextResponse.json(servers)
  } catch (err) {
    console.error("[GET /api/servers]", err)
    return NextResponse.json({ error: "Sunucular alınamadı" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, ip, dns, os, status, cpu, ram, disk, uptime, lastChecked, roles, apiKey, agentPort, username, password } = body

    const id = `srv-${Date.now()}`

    await execute`
      INSERT INTO Servers (Id, Name, IP, DNS, OS, Status, CPU, RAM, Disk, Uptime, LastChecked, ApiKey, AgentPort, Username, Password)
      VALUES (
        ${id}, ${name}, ${ip}, ${dns ?? null}, ${os},
        ${status ?? "offline"}, ${cpu ?? 0}, ${ram ?? 0}, ${disk ?? 0},
        ${uptime ?? null}, ${lastChecked ?? null},
        ${apiKey ?? null}, ${agentPort ?? 5000}, ${username ?? null}, ${password ?? null}
      )
    `

    if (Array.isArray(roles)) {
      for (const role of roles) {
        await execute`INSERT INTO ServerRoles (ServerId, Role) VALUES (${id}, ${role})`
      }
    }

    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/servers]", err)
    return NextResponse.json({ error: "Sunucu eklenemedi" }, { status: 500 })
  }
}
