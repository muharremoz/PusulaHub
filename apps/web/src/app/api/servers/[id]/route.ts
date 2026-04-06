import { NextResponse } from "next/server"
import { query, execute } from "@/lib/db"

interface ServerRow {
  Id: string; Name: string; IP: string; DNS: string | null; OS: string
  ApiKey: string | null; AgentPort: number | null; Username: string | null; Password: string | null
  Roles: string | null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const rows = await query<ServerRow[]>`
      SELECT s.Id, s.Name, s.IP, s.DNS, s.OS,
             s.ApiKey, s.AgentPort, s.Username, s.Password,
             STRING_AGG(r.Role, ',') AS Roles
      FROM Servers s
      LEFT JOIN ServerRoles r ON r.ServerId = s.Id
      WHERE s.Id = ${id} OR LOWER(s.Name) = ${id.toLowerCase()}
      GROUP BY s.Id, s.Name, s.IP, s.DNS, s.OS, s.ApiKey, s.AgentPort, s.Username, s.Password
    `
    if (!rows.length) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 })
    const r = rows[0]
    const resp = NextResponse.json({
      id:        r.Id,
      name:      r.Name,
      ip:        r.IP,
      dns:       r.DNS ?? "",
      os:        r.OS,
      roles:     r.Roles ? r.Roles.split(",") : [],
      apiKey:    r.ApiKey ?? "",
      agentPort: r.AgentPort ?? 8585,
      username:  r.Username ?? "",
      password:  r.Password ?? "",
    })
    resp.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=10")
    return resp
  } catch (err) {
    console.error("[GET /api/servers/[id]]", err)
    return NextResponse.json({ error: "Sunucu alınamadı" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { name, ip, dns, os, roles, apiKey, agentPort, username, password } = await req.json()

    await execute`
      UPDATE Servers
      SET Name      = ${name},
          IP        = ${ip},
          DNS       = ${dns ?? null},
          OS        = ${os},
          ApiKey    = ${apiKey ?? null},
          AgentPort = ${agentPort ?? 8585},
          Username  = ${username ?? null},
          Password  = ${password ?? null}
      WHERE Id = ${id}
    `

    // Rolleri güncelle
    await execute`DELETE FROM ServerRoles WHERE ServerId = ${id}`
    if (Array.isArray(roles)) {
      for (const role of roles) {
        await execute`INSERT INTO ServerRoles (ServerId, Role) VALUES (${id}, ${role})`
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[PATCH /api/servers/[id]]", err)
    return NextResponse.json({ error: "Sunucu güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await execute`DELETE FROM Servers WHERE Id = ${id}`
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[DELETE /api/servers/[id]]", err)
    return NextResponse.json({ error: "Sunucu kaldırılamadı" }, { status: 500 })
  }
}
