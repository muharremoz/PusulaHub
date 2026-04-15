import { NextResponse } from "next/server"
import { query } from "@/lib/db"

/** Firma için AD + RDP/Windows sunucu seçenekleri. Yeni kullanıcı
 *  ekleme dialog'unda seçici doldurmak için. */

interface CompanyRow { AdServerId: string | null; WindowsServerId: string | null }
interface ServerOpt { id: string; name: string; ip: string; dns: string | null; domain: string | null; rdpPort: number | null }

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const company = await query<CompanyRow[]>`
      SELECT AdServerId, WindowsServerId
      FROM Companies
      WHERE CompanyId = ${firkod}
    `

    const adServers = await query<ServerOpt[]>`
      SELECT DISTINCT s.Id AS id, s.Name AS name, s.IP AS ip, s.DNS AS dns, s.Domain AS domain, s.RdpPort AS rdpPort
      FROM Servers s
      INNER JOIN ServerRoles r ON r.ServerId = s.Id
      WHERE r.Role = 'AD' AND s.AgentPort IS NOT NULL AND s.ApiKey IS NOT NULL AND s.ApiKey <> ''
      ORDER BY s.Name
    `

    const rdpServers = await query<ServerOpt[]>`
      SELECT DISTINCT s.Id AS id, s.Name AS name, s.IP AS ip, s.DNS AS dns, s.Domain AS domain, s.RdpPort AS rdpPort
      FROM Servers s
      INNER JOIN ServerRoles r ON r.ServerId = s.Id
      WHERE r.Role = 'RDP' AND s.AgentPort IS NOT NULL AND s.ApiKey IS NOT NULL AND s.ApiKey <> ''
      ORDER BY s.Name
    `

    return NextResponse.json({
      adServerId:      company[0]?.AdServerId ?? null,
      windowsServerId: company[0]?.WindowsServerId ?? null,
      adServers,
      rdpServers,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
