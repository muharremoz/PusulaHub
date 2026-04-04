import { NextResponse } from "next/server"
import { getAllAgents } from "@/lib/agent-store"
import { query } from "@/lib/db"

/**
 * GET /api/servers/[id]/detail
 * Agent store'daki son rapor verisini döner (sessions, security, logs, ad, sql, iis).
 * Sunucu id veya name(lowercase) ile eşleşir.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // DB'den sunucu Id'sini bul (slug veya id ile)
  const rows = await query<{ Id: string }[]>`
    SELECT Id FROM Servers WHERE Id = ${id} OR LOWER(Name) = ${id.toLowerCase()}
  `
  const serverId = rows[0]?.Id

  if (!serverId) {
    return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })
  }

  // Agent store'dan son raporu al
  const agents = getAllAgents()
  const agent = agents.find(a => a.agentId === serverId)

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
