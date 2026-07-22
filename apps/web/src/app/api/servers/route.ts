import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { encrypt } from "@/lib/crypto"
import { getAllAgents } from "@/lib/agent-store"
import { requirePermission } from "@/lib/require-permission"
import type { Server } from "@/types"

function slugify(name: string): string {
  return name.toLowerCase()
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

interface SrvRow {
  id: string; name: string; ip: string; dns: string | null; os: string; status: string
  cpu: number; ram: number; disk: number; uptime: string | null; last_checked: string | null
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
  const gate = await requirePermission("servers", "read")
  if (gate) return gate
  try {
    const sb = await getSupabaseServer()
    const [{ data: srvData, error }, { data: roleData }] = await Promise.all([
      sb.schema("hub").from("servers").select("id, name, ip, dns, os, status, cpu, ram, disk, uptime, last_checked").order("name"),
      sb.schema("hub").from("server_roles").select("server_id, role"),
    ])
    if (error) throw error

    const roleMap = new Map<string, string[]>()
    for (const r of (roleData ?? []) as { server_id: string; role: string }[]) {
      const arr = roleMap.get(r.server_id) ?? []; arr.push(r.role); roleMap.set(r.server_id, arr)
    }

    const agents = getAllAgents()
    const servers: Server[] = ((srvData ?? []) as SrvRow[]).map((r) => {
      const agent = agents.find((a) => a.agentId === r.id || a.hostname === r.name || a.ip === r.ip)
      const m = agent?.lastReport?.metrics
      return {
        id: r.id, slug: slugify(r.name), name: r.name, ip: r.ip, dns: r.dns ?? undefined,
        os: r.os as Server["os"],
        status: agent ? (agent.status as Server["status"]) : (r.status as Server["status"]),
        cpu: m ? m.cpu : r.cpu,
        ram: m ? Math.round((m.ram.usedMB / m.ram.totalMB) * 100) : r.ram,
        disk: m?.disks?.[0]?.percent ?? r.disk,
        uptime: m ? formatUptime(m.uptimeSeconds) : (r.uptime ?? "—"),
        lastChecked: agent ? agent.lastSeen : (r.last_checked ?? "—"),
        roles: (roleMap.get(r.id) ?? []) as Server["roles"],
      }
    })

    const resp = NextResponse.json(servers)
    resp.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=10")
    return resp
  } catch (err) {
    console.error("[GET /api/servers]", err)
    return NextResponse.json({ error: "Sunucular alınamadı" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const gate = await requirePermission("servers", "write")
  if (gate) return gate
  try {
    const body = await req.json()
    const { name, ip, dns, domain, os, status, cpu, ram, disk, uptime, lastChecked,
            roles, apiKey, agentPort, rdpPort, username, password, sqlUsername, sqlPassword } = body

    const id = `srv-${Date.now()}`
    const sb = await getSupabaseServer()

    const { error } = await sb.schema("hub").from("servers").insert({
      id, name, ip, dns: dns ?? null, domain: domain ?? null, os,
      status: status ?? "offline", cpu: cpu ?? 0, ram: ram ?? 0, disk: disk ?? 0,
      uptime: uptime ?? null, last_checked: lastChecked ?? null,
      api_key: apiKey ?? null, agent_port: agentPort ?? 8585, rdp_port: rdpPort ?? null,
      username: username ?? null, password: encrypt(password ?? null),
      sql_username: sqlUsername ?? null, sql_password: encrypt(sqlPassword ?? null),
    })
    if (error) throw error

    if (Array.isArray(roles) && roles.length) {
      await sb.schema("hub").from("server_roles").insert(roles.map((role: string) => ({ server_id: id, role })))
    }

    if (name && ip) {
      const { createKumaMonitor, kumaSafeCall } = await import("@/lib/kuma-client")
      void kumaSafeCall(`createMonitor(${name})`, () => createKumaMonitor({ name, hostname: ip, type: "ping" }))
    }

    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/servers]", err)
    return NextResponse.json({ error: "Sunucu eklenemedi" }, { status: 500 })
  }
}
