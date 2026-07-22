import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { serversWithRole } from "@/lib/hub-servers"

/** Firma için AD + RDP/Windows sunucu seçenekleri (yeni kullanıcı dialog'u). */

interface ServerOpt { id: string; name: string; ip: string; dns: string | null; domain: string | null; rdpPort: number | null }

export async function GET(_req: Request, { params }: { params: Promise<{ firkod: string }> }) {
  const { firkod } = await params
  try {
    const sb = await getSupabaseServer()
    const { data: company } = await sb.schema("hub").from("companies")
      .select("ad_server_id, windows_server_id").eq("company_id", firkod).maybeSingle()
    const c = company as { ad_server_id: string | null; windows_server_id: string | null } | null

    const cols = "id, name, ip, dns, domain, rdp_port, agent_port, api_key"
    const activeOnly = (rows: Record<string, unknown>[]): ServerOpt[] => rows
      .filter((r) => r.agent_port != null && r.api_key)
      .map((r) => ({ id: r.id as string, name: r.name as string, ip: r.ip as string, dns: (r.dns as string | null) ?? null, domain: (r.domain as string | null) ?? null, rdpPort: (r.rdp_port as number | null) ?? null }))

    const [adServers, rdpServers] = await Promise.all([
      serversWithRole("AD", cols).then(activeOnly),
      serversWithRole("RDP", cols).then(activeOnly),
    ])

    return NextResponse.json({
      adServerId: c?.ad_server_id ?? null,
      windowsServerId: c?.windows_server_id ?? null,
      adServers, rdpServers,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
