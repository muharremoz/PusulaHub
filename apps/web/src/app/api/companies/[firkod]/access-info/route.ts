/**
 * GET /api/companies/[firkod]/access-info
 *
 * Firma detay sayfasındaki "Erişim Bilgileri" modal'ı için ek sunucu
 * bilgilerini döner (frontend zaten tabUsers/tabIIS/tabSQL'e sahip).
 * Şifreler DB'de tutulmaz — döndürülmez.
 */

import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { requirePermission } from "@/lib/require-permission"
import { getCompanyCredentials } from "@/lib/firma-credentials"

export interface AccessInfoResponse {
  firmaId:   string

  /** AD sunucusu — domain bilgisi için */
  ad?: {
    name:   string
    ip:     string
    domain: string | null
  } | null

  /** Windows/RDP sunucusu — RDP hedefi için */
  windows?: {
    name:    string
    ip:      string
    dns:     string | null
    rdpPort: number | null
  } | null

  /** IIS sunucusu — WAN'dan erişilebilen DNS için */
  iis?: {
    name: string
    ip:   string
    dns:  string | null
  } | null

  /** Kullanıcı şifreleri — tam username ("2507.vefa1") → düz şifre.
   *  CompanyUserCredentials tablosundan decrypt edilir. */
  credentials: Record<string, string>
}

interface CompanyRow {
  CompanyId:       string
  AdServerId:      string | null
  WindowsServerId: string | null
}

interface ServerRow {
  Id:      string
  Name:    string
  IP:      string
  DNS:     string | null
  Domain:  string | null
  RdpPort: number | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate

  const { firkod } = await params

  try {
    const compRows = await query<CompanyRow[]>`
      SELECT CompanyId, AdServerId, WindowsServerId
      FROM Companies WHERE CompanyId = ${firkod}
    `
    if (!compRows.length) {
      return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 })
    }
    const c = compRows[0]

    const fetchServer = async (id: string | null): Promise<ServerRow | null> => {
      if (!id) return null
      const r = await query<ServerRow[]>`
        SELECT Id, Name, IP, DNS, Domain, RdpPort FROM Servers WHERE Id = ${id}
      `
      return r[0] ?? null
    }
    // IIS sunucusu — firma'nın IIS sitelerinden ilkinin Server adını bul
    const fetchIisServer = async (): Promise<ServerRow | null> => {
      const r = await query<{ Server: string | null }[]>`
        SELECT TOP 1 i.Server
        FROM IISSites i
        WHERE i.Firma = ${firkod} AND i.Server IS NOT NULL
        ORDER BY i.Name
      `
      const name = r[0]?.Server
      if (!name) return null
      const s = await query<ServerRow[]>`
        SELECT TOP 1 Id, Name, IP, DNS, Domain, RdpPort FROM Servers WHERE Name = ${name}
      `
      return s[0] ?? null
    }

    const [adRow, winRow, iisRow, credentials] = await Promise.all([
      fetchServer(c.AdServerId),
      fetchServer(c.WindowsServerId),
      fetchIisServer(),
      getCompanyCredentials(firkod),
    ])

    const response: AccessInfoResponse = {
      firmaId:   c.CompanyId,
      ad:       adRow  ? { name: adRow.Name,  ip: adRow.IP,  domain: adRow.Domain ?? null } : null,
      windows:  winRow ? { name: winRow.Name, ip: winRow.IP, dns: winRow.DNS ?? null, rdpPort: winRow.RdpPort ?? null } : null,
      iis:      iisRow ? { name: iisRow.Name, ip: iisRow.IP, dns: iisRow.DNS ?? null } : null,
      credentials,
    }
    return NextResponse.json(response)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
