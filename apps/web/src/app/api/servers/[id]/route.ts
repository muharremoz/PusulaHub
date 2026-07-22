import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { encrypt, decrypt } from "@/lib/crypto"
import { requirePermission } from "@/lib/require-permission"

interface SrvRow {
  id: string; name: string; ip: string; dns: string | null; domain: string | null; os: string
  api_key: string | null; agent_port: number | null; rdp_port: number | null
  username: string | null; password: string | null; sql_username: string | null; sql_password: string | null
}
const COLS = "id, name, ip, dns, domain, os, api_key, agent_port, rdp_port, username, password, sql_username, sql_password"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("servers", "read")
  if (gate) return gate
  try {
    const { id } = await params
    const sb = await getSupabaseServer()
    let { data: srv } = await sb.schema("hub").from("servers").select(COLS).eq("id", id).maybeSingle()
    if (!srv) {
      const { data } = await sb.schema("hub").from("servers").select(COLS).ilike("name", id).limit(1).maybeSingle()
      srv = data
    }
    if (!srv) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 })
    const r = srv as SrvRow
    const { data: roleData } = await sb.schema("hub").from("server_roles").select("role").eq("server_id", r.id)
    const roles = ((roleData ?? []) as { role: string }[]).map(x => x.role)

    const resp = NextResponse.json({
      id: r.id, name: r.name, ip: r.ip, dns: r.dns ?? "", domain: r.domain ?? "", os: r.os,
      roles, apiKey: r.api_key ?? "", agentPort: r.agent_port ?? 8585, rdpPort: r.rdp_port ?? null,
      username: r.username ?? "", password: decrypt(r.password) ?? "",
      sqlUsername: r.sql_username ?? "", sqlPassword: decrypt(r.sql_password) ?? "",
    })
    resp.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=10")
    return resp
  } catch (err) {
    console.error("[GET /api/servers/[id]]", err)
    return NextResponse.json({ error: "Sunucu alınamadı" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("servers", "write")
  if (gate) return gate
  try {
    const { id } = await params
    const { name, ip, dns, domain, os, roles, apiKey, agentPort, rdpPort, username, password, sqlUsername, sqlPassword } = await req.json()
    const sb = await getSupabaseServer()

    const { data: prev } = await sb.schema("hub").from("servers").select("name, ip").eq("id", id).maybeSingle()
    const prevName = (prev as { name: string } | null)?.name ?? null
    const prevIp   = (prev as { ip: string } | null)?.ip ?? null

    const { error } = await sb.schema("hub").from("servers").update({
      name, ip, dns: dns ?? null, domain: domain ?? null, os,
      api_key: apiKey ?? null, agent_port: agentPort ?? 8585, rdp_port: rdpPort ?? null,
      username: username ?? null, password: encrypt(password ?? null),
      sql_username: sqlUsername ?? null, sql_password: encrypt(sqlPassword ?? null),
    }).eq("id", id)
    if (error) throw error

    await sb.schema("hub").from("server_roles").delete().eq("server_id", id)
    if (Array.isArray(roles) && roles.length) {
      await sb.schema("hub").from("server_roles").insert(roles.map((role: string) => ({ server_id: id, role })))
    }

    if (prevName && name && ip && (prevName !== name || prevIp !== ip)) {
      const { updateKumaMonitorByName, kumaSafeCall } = await import("@/lib/kuma-client")
      void kumaSafeCall(`updateMonitor(${prevName} → ${name})`, () => updateKumaMonitorByName(prevName, { name, hostname: ip, type: "ping" }))
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[PATCH /api/servers/[id]]", err)
    return NextResponse.json({ error: "Sunucu güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("servers", "write")
  if (gate) return gate
  try {
    const { id } = await params
    const sb = await getSupabaseServer()
    const { data: prev } = await sb.schema("hub").from("servers").select("name").eq("id", id).maybeSingle()
    const prevName = (prev as { name: string } | null)?.name ?? null

    await sb.schema("hub").from("server_roles").delete().eq("server_id", id)
    const { error } = await sb.schema("hub").from("servers").delete().eq("id", id)
    if (error) throw error

    if (prevName) {
      const { deleteKumaMonitorByName, kumaSafeCall } = await import("@/lib/kuma-client")
      void kumaSafeCall(`deleteMonitor(${prevName})`, () => deleteKumaMonitorByName(prevName))
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[DELETE /api/servers/[id]]", err)
    return NextResponse.json({ error: "Sunucu kaldırılamadı" }, { status: 500 })
  }
}
