import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { getAllAgents } from "@/lib/agent-store"
import { query } from "@/lib/db"

/**
 * GET /api/messages/recipients
 * Compose ekranı için: tüm online sunuculardaki aktif WTS oturumlarını
 * birleşik liste halinde döndürür. Her satır: (agentId, serverName, username,
 * companyName, online, sessionType, state).
 */
interface ServerCompanyRow {
  Id:          string
  Name:        string
  CompanyName: string | null
}

export async function GET() {
  const gate = await requirePermission("messages", "read")
  if (gate) return gate

  try {
    const agents = getAllAgents()

    // Her sunucunun firma adını DB'den çek (Companies.WindowsServerId / AdServerId üzerinden)
    const ids = agents.map(a => a.agentId)
    const serverCompany = new Map<string, string | null>()
    if (ids.length > 0) {
      const rows = await query<ServerCompanyRow[]>`
        SELECT s.Id, s.Name,
               (SELECT TOP 1 c.Name
                  FROM Companies c
                 WHERE c.WindowsServerId = s.Id OR c.AdServerId = s.Id
                 ORDER BY c.Name) AS CompanyName
          FROM Servers s
      `
      for (const r of rows) serverCompany.set(r.Id, r.CompanyName)
    }

    const recipients: {
      agentId:     string
      serverName:  string
      username:    string
      company:     string
      online:      boolean
      sessionType: string
      state:       string
    }[] = []

    for (const a of agents) {
      const sessions = a.lastReport?.sessions ?? []
      for (const s of sessions) {
        if (!s.username) continue
        recipients.push({
          agentId:     a.agentId,
          serverName:  a.hostname,
          username:    s.username,
          company:     serverCompany.get(a.agentId) ?? "—",
          online:      a.status === "online" && s.state === "Active",
          sessionType: s.sessionType,
          state:       s.state,
        })
      }
    }

    // Aynı kullanıcı birden fazla session açmışsa tek satıra indir (agentId+username unique)
    const seen = new Set<string>()
    const dedup = recipients.filter(r => {
      const k = `${r.agentId}::${r.username}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    // Mesaj göndermek için seçilebilecek firmalar (online sunucusu olanlar)
    let companies: { id: string; name: string; userCount: number }[] = []
    try {
      const compRows = await query<{ CompanyId: string; Name: string; WindowsServerId: string | null; AdServerId: string | null }[]>`
        SELECT CompanyId, Name, WindowsServerId, AdServerId
          FROM Companies WHERE CompanyId IS NOT NULL
      `
      const onlineSet = new Set(agents.filter(a => a.status === "online").map(a => a.agentId))
      companies = compRows
        .filter(c => (c.WindowsServerId && onlineSet.has(c.WindowsServerId)) ||
                     (c.AdServerId      && onlineSet.has(c.AdServerId)))
        .map(c => ({
          id:        c.CompanyId,
          name:      c.Name,
          userCount: dedup.filter(r =>
            r.agentId === c.WindowsServerId || r.agentId === c.AdServerId
          ).length,
        }))
    } catch { /* ignore */ }

    return NextResponse.json({ recipients: dedup, companies })
  } catch (err) {
    console.error("[GET /api/messages/recipients]", err)
    return NextResponse.json({ error: "Alıcı listesi alınamadı" }, { status: 500 })
  }
}
