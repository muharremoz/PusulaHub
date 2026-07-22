import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getAllAgents } from "@/lib/agent-store"
import { getSupabaseServer } from "@/lib/supabase/server"
import { resolveCreators } from "@/lib/hub-users"
import { resolveCompanyNames } from "@/lib/hub-companies"

/**
 * GET /api/dashboard/summary — dashboard verisini tek atışta toplar.
 * HİBRİT (Faz 4 geçişi): sunucu/firma/başarısız-giriş mssql'de kalır;
 * projeler/takvim/notlar Supabase `hub` schema'sından okunur.
 */

const DONE_COLUMNS = new Set(["Tamamlandı", "Done", "Bitti"])

interface FailedLogonRow { Timestamp: string; ServerName: string; Username: string; ClientIp: string }
interface CompanyCountRow { Count: number }

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

    /* ── KPI 2: Firma + kullanıcı sayıları (mssql — Companies/ADUsers taşınmadı) ── */
    const companyRows = await query<{ Count: number; UserSum: number }[]>`
      SELECT
        (SELECT COUNT(*) FROM Companies
          WHERE CompanyId IS NOT NULL AND AdServerId IS NOT NULL) AS Count,
        (SELECT COUNT(*) FROM ADUsers a
          JOIN Companies c ON a.OU = c.CompanyId
          WHERE c.AdServerId IS NOT NULL) AS UserSum
    `
    const totalCompanies    = companyRows[0]?.Count   ?? 0
    const totalCompanyUsers = companyRows[0]?.UserSum ?? 0

    /* ── Son 24 saat failed RDP (mssql — FailedLogonAttempts taşınmadı) ── */
    let failedLogons: FailedLogonRow[] = []
    try {
      failedLogons = await query<FailedLogonRow[]>`
        SELECT TOP 15
          CONVERT(NVARCHAR(30), [Timestamp], 120) AS Timestamp, ServerName, Username, ClientIp
        FROM FailedLogonAttempts
        WHERE [Timestamp] >= DATEADD(hour, -24, SYSUTCDATETIME())
        ORDER BY [Timestamp] DESC
      `
    } catch { failedLogons = [] }

    let failedLogonTotal24h = 0
    try {
      const countRows = await query<CompanyCountRow[]>`
        SELECT COUNT(*) AS Count FROM FailedLogonAttempts
        WHERE [Timestamp] >= DATEADD(hour, -24, SYSUTCDATETIME())
      `
      failedLogonTotal24h = countRows[0]?.Count ?? 0
    } catch { /* ignore */ }

    /* ── Projeler / Takvim / Notlar (hub) ── */
    const sb = await getSupabaseServer()
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999)
    const todayDate  = todayStart.toISOString().slice(0, 10)

    const [{ data: projData }, { data: calData }, { data: noteData }] = await Promise.all([
      sb.schema("hub").from("projects")
        .select("id, name, color, status, company_id, created_at")
        .eq("status", "active").order("created_at", { ascending: false }),
      sb.schema("hub").from("calendar_events")
        .select("id, title, start_date, end_date, all_day, color, type")
        .lte("start_date", todayEnd.toISOString()).gte("end_date", todayStart.toISOString())
        .order("start_date", { ascending: true }).limit(8),
      sb.schema("hub").from("notes")
        .select("id, title, color, pinned, tags, created_by, created_at, updated_at")
        .order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(6),
    ])

    // Aktif proje + görev/done/next-due hesabı
    const activeProjs = (projData ?? []) as { id: string; name: string; color: string; company_id: string | null; created_at: string }[]
    const projIds = activeProjs.map(p => p.id)
    const stats = new Map<string, { total: number; done: number; nextDue: string | null }>()
    if (projIds.length) {
      const [{ data: cols }, { data: tasks }] = await Promise.all([
        sb.schema("hub").from("project_columns").select("id, name, project_id").in("project_id", projIds),
        sb.schema("hub").from("project_tasks").select("project_id, column_id, due_date").in("project_id", projIds),
      ])
      const colName = new Map(((cols ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
      for (const t of (tasks ?? []) as { project_id: string; column_id: string; due_date: string | null }[]) {
        const s = stats.get(t.project_id) ?? { total: 0, done: 0, nextDue: null }
        s.total++
        if (DONE_COLUMNS.has(colName.get(t.column_id) ?? "")) s.done++
        if (t.due_date && t.due_date >= todayDate && (s.nextDue === null || t.due_date < s.nextDue)) s.nextDue = t.due_date
        stats.set(t.project_id, s)
      }
    }

    // Görevi olan aktif projeler (top 20) + aktif proje sayısı
    const withTasks = activeProjs.filter(p => (stats.get(p.id)?.total ?? 0) > 0)
    const activeProjects = withTasks.length
    const companyNames = await resolveCompanyNames(withTasks.map(p => p.company_id))
    const projects = withTasks.slice(0, 20).map(p => {
      const s = stats.get(p.id)!
      return {
        id: p.id, name: p.name, color: p.color,
        companyName: p.company_id ? (companyNames.get(p.company_id) ?? null) : null,
        taskCount: s.total, doneCount: s.done, nextDueDate: s.nextDue,
      }
    })

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
      kpi: { totalServers, onlineServers, offlineServers, totalCompanies, totalCompanyUsers, activeProjects },
      failedLogons: {
        total24h: failedLogonTotal24h,
        recent: failedLogons.map((f) => ({ timestamp: f.Timestamp, serverName: f.ServerName, username: f.Username, clientIp: f.ClientIp })),
      },
      disks: diskList,
      ramBreakdown,
      problemServers,
      projects,
      calendar,
      notes,
    })
  } catch (err) {
    console.error("[GET /api/dashboard/summary]", err)
    return NextResponse.json({ error: "Dashboard verisi alınamadı" }, { status: 500 })
  }
}
