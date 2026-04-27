import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getAllAgents } from "@/lib/agent-store"

/**
 * GET /api/dashboard/summary
 * Dashboard için tek atışta tüm veriyi toplayıp döner:
 *  - KPI'lar (sunucu sayıları, firma sayısı, aktif proje sayısı)
 *  - Son 24 saatte RDP başarısız giriş denemeleri (tüm sunuculardan)
 *  - En dolu diskli sunucular (top 8)
 *  - Sorunlu sunucu listesi (offline + yüksek kaynak kullanımı)
 *  - Yaklaşan/aktif projeler (max 8)
 *  - Bugünkü takvim etkinlikleri (max 8)
 */

interface FailedLogonRow {
  Timestamp:  string
  ServerName: string
  Username:   string
  ClientIp:   string
}

interface ProjectRow {
  Id:          string
  Name:        string
  Color:       string
  Status:      string
  CompanyName: string | null
  TaskCount:   number
  DoneCount:   number
  NextDueDate: string | null
}

interface CalendarRow {
  Id:        string
  Title:     string
  StartDate: string
  EndDate:   string
  AllDay:    boolean
  Color:     string
  Type:      string
}

interface NoteRow {
  Id:        string
  Title:     string
  Color:     string
  Pinned:    boolean
  Tags:      string | null
  CreatedBy: string
  CreatedAt: string
  UpdatedAt: string
}

interface CompanyCountRow { Count: number }

export async function GET() {
  try {
    /* ── KPI 1: Sunucu sayıları + sorunlu + disk özeti (agent-store) ── */
    const agents = getAllAgents()
    const totalServers   = agents.length
    const onlineServers  = agents.filter((a) => a.status === "online").length
    const offlineServers = agents.filter((a) => a.status === "offline").length

    // Sorunlu sunucu = offline OR (CPU/RAM/Disk yüksek)
    const problemServers = agents
      .map((a) => {
        const r = a.lastReport
        const metrics = r?.metrics
        const cpu  = metrics?.cpu ?? 0
        const ram  = metrics ? Math.round((metrics.ram.usedMB / metrics.ram.totalMB) * 100) : 0
        const disk = metrics?.disks?.[0]?.percent ?? 0
        const isProblem =
          a.status === "offline" ||
          cpu >= 85 ||
          ram >= 85 ||
          disk >= 85
        return {
          id:     a.agentId,
          name:   a.hostname,
          ip:     a.ip,
          status: a.status,
          cpu, ram, disk,
          isProblem,
        }
      })
      .filter((s) => s.isProblem)
      .sort((a, b) => {
        if (a.status === "offline" && b.status !== "offline") return -1
        if (b.status === "offline" && a.status !== "offline") return 1
        return Math.max(b.cpu, b.ram, b.disk) - Math.max(a.cpu, a.ram, a.disk)
      })
      .slice(0, 8)

    // En dolu disk listesi (online olanlar, top 8)
    const diskList = agents
      .filter((a) => a.status === "online")
      .map((a) => {
        const d = a.lastReport?.metrics?.disks?.[0]
        return {
          id:      a.agentId,
          name:    a.hostname,
          drive:   d?.drive ?? "",
          disk:    d?.percent ?? 0,
          totalGB: d?.totalGB ?? 0,
          usedGB:  d?.usedGB ?? 0,
        }
      })
      .sort((a, b) => b.disk - a.disk)
      .slice(0, 8)

    /* ── KPI 2: Firma sayısı + toplam kullanıcı sayısı (AD kurulmuş firmalar) ── */
    const companyRows = await query<{ Count: number; UserSum: number }[]>`
      SELECT COUNT(*) AS Count, ISNULL(SUM(UserCount), 0) AS UserSum
      FROM Companies
      WHERE CompanyId IS NOT NULL AND AdServerId IS NOT NULL
    `
    const totalCompanies     = companyRows[0]?.Count   ?? 0
    const totalCompanyUsers  = companyRows[0]?.UserSum ?? 0

    /* ── KPI 3: Aktif proje sayısı ── */
    const activeProjectRows = await query<CompanyCountRow[]>`
      SELECT COUNT(*) AS Count FROM Projects p
      WHERE p.Status = 'active'
        AND EXISTS (SELECT 1 FROM ProjectTasks t WHERE t.ProjectId = p.Id)
    `
    const activeProjects = activeProjectRows[0]?.Count ?? 0

    /* ── Son 24 saat failed RDP denemeleri ── */
    let failedLogons: FailedLogonRow[] = []
    try {
      failedLogons = await query<FailedLogonRow[]>`
        SELECT TOP 15
          CONVERT(NVARCHAR(30), [Timestamp], 120) AS Timestamp,
          ServerName,
          Username,
          ClientIp
        FROM FailedLogonAttempts
        WHERE [Timestamp] >= DATEADD(hour, -24, SYSUTCDATETIME())
        ORDER BY [Timestamp] DESC
      `
    } catch {
      // Tablo henüz yoksa (ilk başlangıç) — boş dön
      failedLogons = []
    }

    // 24 saat toplam sayısı
    let failedLogonTotal24h = 0
    try {
      const countRows = await query<CompanyCountRow[]>`
        SELECT COUNT(*) AS Count
        FROM FailedLogonAttempts
        WHERE [Timestamp] >= DATEADD(hour, -24, SYSUTCDATETIME())
      `
      failedLogonTotal24h = countRows[0]?.Count ?? 0
    } catch { /* ignore */ }

    /* ── Aktif projeler listesi (en son oluşturulan 20) ── */
    const projectRows = await query<ProjectRow[]>`
      SELECT TOP 20
        p.Id, p.Name, p.Color, p.Status,
        c.Name AS CompanyName,
        ISNULL((SELECT COUNT(*) FROM ProjectTasks t WHERE t.ProjectId = p.Id), 0) AS TaskCount,
        ISNULL((
          SELECT COUNT(*) FROM ProjectTasks t
          JOIN ProjectColumns col ON col.Id = t.ColumnId
          WHERE t.ProjectId = p.Id AND col.Name IN ('Tamamlandı', 'Done', 'Bitti')
        ), 0) AS DoneCount,
        CONVERT(NVARCHAR(10), (
          SELECT MIN(t.DueDate) FROM ProjectTasks t
          WHERE t.ProjectId = p.Id AND t.DueDate IS NOT NULL AND t.DueDate >= CAST(GETDATE() AS DATE)
        ), 23) AS NextDueDate
      FROM Projects p
      LEFT JOIN Companies c ON c.Id = p.CompanyId
      WHERE p.Status = 'active'
        AND EXISTS (SELECT 1 FROM ProjectTasks t WHERE t.ProjectId = p.Id)
      ORDER BY p.CreatedAt DESC
    `

    /* ── Bugünkü takvim etkinlikleri ── */
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)
    const todayStartStr = todayStart.toISOString().slice(0, 19).replace("T", " ")
    const todayEndStr   = todayEnd.toISOString().slice(0, 19).replace("T", " ")

    const calendarRows = await query<CalendarRow[]>`
      SELECT TOP 8
        Id, Title,
        CONVERT(NVARCHAR(19), StartDate, 120) AS StartDate,
        CONVERT(NVARCHAR(19), EndDate, 120)   AS EndDate,
        AllDay, Color, Type
      FROM CalendarEvents
      WHERE StartDate <= ${todayEndStr}
        AND EndDate   >= ${todayStartStr}
      ORDER BY StartDate ASC
    `

    /* ── Son notlar (pinned + en güncel 6) ── */
    const noteRows = await query<NoteRow[]>`
      SELECT TOP 6
        Id, Title, Color, Pinned, Tags, CreatedBy,
        CONVERT(NVARCHAR(16), CreatedAt, 120) AS CreatedAt,
        CONVERT(NVARCHAR(16), UpdatedAt, 120) AS UpdatedAt
      FROM Notes
      ORDER BY Pinned DESC, UpdatedAt DESC
    `

    return NextResponse.json({
      kpi: {
        totalServers,
        onlineServers,
        offlineServers,
        totalCompanies,
        totalCompanyUsers,
        activeProjects,
      },
      failedLogons: {
        total24h: failedLogonTotal24h,
        recent:   failedLogons.map((f) => ({
          timestamp:  f.Timestamp,
          serverName: f.ServerName,
          username:   f.Username,
          clientIp:   f.ClientIp,
        })),
      },
      disks: diskList,
      problemServers,
      projects: projectRows.map((p) => ({
        id:          p.Id,
        name:        p.Name,
        color:       p.Color,
        companyName: p.CompanyName,
        taskCount:   p.TaskCount,
        doneCount:   p.DoneCount,
        nextDueDate: p.NextDueDate,
      })),
      calendar: calendarRows.map((c) => ({
        id:        c.Id,
        title:     c.Title,
        startDate: c.StartDate,
        endDate:   c.EndDate,
        allDay:    c.AllDay,
        color:     c.Color,
        type:      c.Type,
      })),
      notes: noteRows.map((n) => ({
        id:        n.Id,
        title:     n.Title,
        color:     n.Color,
        pinned:    !!n.Pinned,
        tags:      n.Tags ? n.Tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        createdBy: n.CreatedBy,
        createdAt: n.CreatedAt,
        updatedAt: n.UpdatedAt,
      })),
    })
  } catch (err) {
    console.error("[GET /api/dashboard/summary]", err)
    return NextResponse.json({ error: "Dashboard verisi alınamadı" }, { status: 500 })
  }
}
