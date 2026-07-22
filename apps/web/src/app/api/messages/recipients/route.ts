import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { getAllAgents } from "@/lib/agent-store"
import { getSupabaseServer } from "@/lib/supabase/server"

/** GET /api/messages/recipients — online sunucuların aktif WTS oturumları + firma eşlemesi. */

export async function GET() {
  const gate = await requirePermission("messages", "read")
  if (gate) return gate
  try {
    const agents = getAllAgents()
    const sb = await getSupabaseServer()

    // Kurulu firmalar (sunucu atanmış) — server→company eşlemesi + seçilebilir firma listesi
    const { data: instData } = await sb.schema("hub").from("companies")
      .select("company_id, name, windows_server_id, ad_server_id")
      .or("windows_server_id.not.is.null,ad_server_id.not.is.null").limit(10000)
    const instComps = (instData ?? []) as { company_id: string; name: string; windows_server_id: string | null; ad_server_id: string | null }[]

    const serverCompany = new Map<string, string>()
    for (const c of instComps) {
      if (c.windows_server_id && !serverCompany.has(c.windows_server_id)) serverCompany.set(c.windows_server_id, c.name)
      if (c.ad_server_id && !serverCompany.has(c.ad_server_id)) serverCompany.set(c.ad_server_id, c.name)
    }

    // Kullanıcı→firma: ad_users.ou → companies.company_id (öncelikli, shared RDP için)
    const { data: adu } = await sb.schema("hub").from("ad_users").select("username, ou")
    const aduRows = (adu ?? []) as { username: string; ou: string }[]
    const ous = [...new Set(aduRows.map((u) => u.ou).filter(Boolean))]
    const nameByFirkod = new Map<string, string>(instComps.map((c) => [c.company_id, c.name]))
    if (ous.length) {
      const { data: ouComps } = await sb.schema("hub").from("companies").select("company_id, name").in("company_id", ous)
      for (const c of (ouComps ?? []) as { company_id: string; name: string }[]) nameByFirkod.set(c.company_id, c.name)
    }
    const userCompany = new Map<string, string>()
    for (const u of aduRows) {
      const cn = nameByFirkod.get(u.ou)
      if (u.username && cn) userCompany.set(u.username.toLowerCase(), cn)
    }

    const recipients: { agentId: string; serverName: string; username: string; company: string; online: boolean; sessionType: string; state: string }[] = []
    for (const a of agents) {
      for (const s of a.lastReport?.sessions ?? []) {
        if (!s.username) continue
        recipients.push({
          agentId: a.agentId, serverName: a.hostname, username: s.username,
          company: userCompany.get(s.username.toLowerCase()) ?? serverCompany.get(a.agentId) ?? "—",
          online: a.status === "online" && s.state === "Active",
          sessionType: s.sessionType, state: s.state,
        })
      }
    }

    const seen = new Set<string>()
    const dedup = recipients.filter((r) => {
      const k = `${r.agentId}::${r.username}`
      if (seen.has(k)) return false
      seen.add(k); return true
    })

    const onlineSet = new Set(agents.filter((a) => a.status === "online").map((a) => a.agentId))
    const companies = instComps
      .filter((c) => (c.windows_server_id && onlineSet.has(c.windows_server_id)) || (c.ad_server_id && onlineSet.has(c.ad_server_id)))
      .map((c) => ({ id: c.company_id, name: c.name, userCount: dedup.filter((r) => r.company === c.name).length }))

    return NextResponse.json({ recipients: dedup, companies })
  } catch (err) {
    console.error("[GET /api/messages/recipients]", err)
    return NextResponse.json({ error: "Alıcı listesi alınamadı" }, { status: 500 })
  }
}
