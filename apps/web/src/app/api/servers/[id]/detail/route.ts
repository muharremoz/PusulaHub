import { NextResponse } from "next/server"
import { getAllAgents } from "@/lib/agent-store"
import { getSupabaseServer } from "@/lib/supabase/server"

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

  const sb = await getSupabaseServer()
  let srv = (await sb.schema("hub").from("servers").select("id, ip, name").eq("id", id).maybeSingle()).data as
    { id: string; ip: string; name: string } | null
  if (!srv) {
    const { data: all } = await sb.schema("hub").from("servers").select("id, ip, name")
    srv = ((all ?? []) as { id: string; ip: string; name: string }[]).find((s) => slugify(s.name) === id) ?? null
  }

  const serverId = srv?.id
  const serverIp = srv?.ip
  const serverName = srv?.name

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
  const resp = NextResponse.json({
    sessions:   r.sessions ?? [],
    security:   r.security ?? null,
    logs:       r.logs ?? null,
    ad:         r.ad ?? null,
    localUsers: r.localUsers ?? null,
    sql:        r.sql ?? null,
    iis:        r.iis ?? null,
    roles:      r.roles ?? [],
    ram:        r.metrics?.ram ?? null,   // totalMB / usedMB / freeMB / cacheMB / realUsedMB
  })
  resp.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=10")
  return resp
}
