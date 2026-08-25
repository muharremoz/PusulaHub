import { NextResponse } from "next/server"
import { getAllAgents } from "@/lib/agent-store"
import { getSupabaseServer } from "@/lib/supabase/server"
import { resolveCreators } from "@/lib/hub-users"

/**
 * GET /api/dashboard/summary — dashboard verisini tek atışta toplar.
 * HİBRİT (Faz 4 geçişi): sunucu/firma/başarısız-giriş mssql'de kalır;
 * takvim/notlar Supabase `hub` schema'sından okunur.
 */

interface FailedLogonRow { Timestamp: string; ServerName: string; Username: string; ClientIp: string }

/** hub timestamptz → "YYYY-MM-DD HH:MM[:SS]" (client parity). */
function fmt(ts: string | null, len = 19): string {
  return ts ? ts.slice(0, len).replace("T", " ") : ""
}

export async function GET() {
  try {
    /* ── KPI 1: Sunucular (agent-store, in-memory) ── */
    const agents = getAllAgents()
    const totalServers   = agents.length
    const onlineServers  = agents.filter((a) => a.status === "online").length
    const offlineServers = agents.filter((a) => a.status === "offline").length

    const problemServers = agents
      .map((a) => {
        const metrics = a.lastReport?.metrics
        const cpu  = metrics?.cpu ?? 0
        const ram  = metrics ? Math.round((metrics.ram.usedMB / metrics.ram.totalMB) * 100) : 0
        const disk = metrics?.disks?.[0]?.percent ?? 0
        return { id: a.agentId, name: a.hostname, ip: a.ip, status: a.status, cpu, ram, disk,
                 isProblem: a.status === "offline" || cpu >= 85 || ram >= 85 || disk >= 85 }
      })
      .filter((s) => s.isProblem)
      .sort((a, b) => {
        if (a.status === "offline" && b.status !== "offline") return -1
        if (b.status === "offline" && a.status !== "offline") return 1
        return Math.max(b.cpu, b.ram, b.disk) - Math.max(a.cpu, a.ram, a.disk)
      })
      .slice(0, 8)

    const ramBreakdown = agents
      .filter((a) => a.status === "online" && a.lastReport?.metrics?.ram?.totalMB)
      .map((a) => {
        const r = a.lastReport!.metrics.ram
        const cacheMB = r.cacheMB ?? 0
        const freeMB = r.pureFreeMB ?? r.freeMB
        const realUsedMB = r.realUsedMB ?? Math.max(0, r.totalMB - freeMB - cacheMB)
        return { id: a.agentId, name: a.hostname, totalMB: r.totalMB, realUsedMB, cacheMB, freeMB }
      })
      .sort((a, b) => b.cacheMB - a.cacheMB)

    const diskList = agents
      .filter((a) => a.status === "online")
      .map((a) => {
        const d = a.lastReport?.metrics?.disks?.[0]
        return { id: a.agentId, name: a.hostname, drive: d?.drive ?? "",
                 disk: d?.percent ?? 0, totalGB: d?.totalGB ?? 0, usedGB: d?.usedGB ?? 0 }
      })
      .sort((a, b) => b.disk - a.disk)
      .slice(0, 8)

    const sb = await getSupabaseServer()

    /* ── KPI 2: Firma + kullanıcı sayıları (hub) ── */
    const { count: totalCompanies } = await sb.schema("hub").from("companies")
      .select("id", { count: "exact", head: true }).not("company_id", "is", null).not("ad_server_id", "is", null)
    // AD kurulu firmaların OU'su altındaki ad_users sayısı
    const { data: adFirms } = await sb.schema("hub").from("companies")
      .select("company_id").not("ad_server_id", "is", null).not("company_id", "is", null)
    const adOus = [...new Set(((adFirms ?? []) as { company_id: string }[]).map((c) => c.company_id))]
    let totalCompanyUsers = 0
    if (adOus.length) {
      const { count } = await sb.schema("hub").from("ad_users").select("id", { count: "exact", head: true }).in("ou", adOus)
      totalCompanyUsers = count ?? 0
    }

    /* ── Son 24 saat failed RDP (hub) ── */
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const { data: flData } = await sb.schema("hub").from("failed_logon_attempts")
      .select("server_name, username, client_ip, timestamp").gte("timestamp", since24h)
      .order("timestamp", { ascending: false }).limit(15)
    const failedLogons: FailedLogonRow[] = ((flData ?? []) as { server_name: string; username: string | null; client_ip: string | null; timestamp: string }[])
      .map((f) => ({ Timestamp: f.timestamp, ServerName: f.server_name, Username: f.username ?? "", ClientIp: f.client_ip ?? "" }))
    const { count: failedLogonTotal24h } = await sb.schema("hub").from("failed_logon_attempts")
      .select("id", { count: "exact", head: true }).gte("timestamp", since24h)

    /* ── Takvim / Notlar (hub) ── */
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999)
    
    const [{ data: calData }, { data: noteData }] = await Promise.all([
      sb.schema("hub").from("calendar_events")
        .select("id, title, start_date, end_date, all_day, color, type")
        .lte("start_date", todayEnd.toISOString()).gte("end_date", todayStart.toISOString())
        .order("start_date", { ascending: true }).limit(8),
      sb.schema("hub").from("notes")
        .select("id, title, color, pinned, tags, created_by, created_at, updated_at")
        .order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(6),
    ])

    // Takvim (bugün)
    const calendar = ((calData ?? []) as { id: string; title: string; start_date: string; end_date: string; all_day: boolean; color: string; type: string }[]).map(c => ({
      id: c.id, title: c.title, startDate: fmt(c.start_date), endDate: fmt(c.end_date),
      allDay: !!c.all_day, color: c.color, type: c.type,
    }))

    // Notlar
    const noteRows = (noteData ?? []) as { id: string; title: string; color: string; pinned: boolean; tags: string | null; created_by: string | null; created_at: string; updated_at: string }[]
    const creators = await resolveCreators(sb, noteRows.map(n => n.created_by))
    const notes = noteRows.map(n => ({
      id: n.id, title: n.title, color: n.color, pinned: !!n.pinned,
      tags: n.tags ? n.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      createdBy: n.created_by ? (creators.get(n.created_by) ?? "—") : "—",
      createdAt: fmt(n.created_at, 16), updatedAt: fmt(n.updated_at, 16),
    }))

    return NextResponse.json({
      kpi: { totalServers, onlineServers, offlineServers, totalCompanies: totalCompanies ?? 0, totalCompanyUsers },
      failedLogons: {
        total24h: failedLogonTotal24h ?? 0,
        recent: failedLogons.map((f) => ({ timestamp: f.Timestamp, serverName: f.ServerName, username: f.Username, clientIp: f.ClientIp })),
      },
      disks: diskList,
      ramBreakdown,
      problemServers,
      calendar,
      notes,
    })
  } catch (err) {
    console.error("[GET /api/dashboard/summary]", err)
    return NextResponse.json({ error: "Dashboard verisi alınamadı" }, { status: 500 })
  }
}
