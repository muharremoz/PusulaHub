import { NextResponse } from "next/server"
import { getAllAgents } from "@/lib/agent-store"
import { query } from "@/lib/db"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * GET /api/servers/[id]/detail
 * Agent store'daki son rapor verisini döner (sessions, security, logs, ad, sql, iis).
 * Sunucu id veya name(slug) ile eşleşir.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Önce Id ile dene
  let rows = await query<{ Id: string; IP: string; Name: string }[]>`
    SELECT Id, IP, Name FROM Servers WHERE Id = ${id}
  `

  // Bulunamazsa tüm sunucuları çekip slug ile eşleştir
  if (!rows.length) {
    const all = await query<{ Id: string; IP: string; Name: string }[]>`
      SELECT Id, IP, Name FROM Servers
    `
    const match = all.find((s) => slugify(s.Name) === id)
    if (match) rows = [match]
  }

  const serverId = rows[0]?.Id
  const serverIp = rows[0]?.IP
  const serverName = rows[0]?.Name

  if (!serverId) {
    return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })
  }

  // Agent store'dan son raporu al (liste route ile aynı 3'lü eşleşme)
  const agents = getAllAgents()
  const agent = agents.find(
    (a) => a.agentId === serverId || a.hostname === serverName || a.ip === serverIp
  )

  if (!agent || !agent.lastReport) {
    return NextResponse.json({
      sessions: [],
      security: null,
      logs: null,
      ad: null,
      sql: null,
      iis: null,
      roles: [],
    })
  }

  const r = agent.lastReport
  return NextResponse.json({
    sessions:   r.sessions ?? [],
    security:   r.security ?? null,
    logs:       r.logs ?? null,
    ad:         r.ad ?? null,
    localUsers: r.localUsers ?? null,
    sql:        r.sql ?? null,
    iis:        r.iis ?? null,
    roles:      r.roles ?? [],
  })
}
