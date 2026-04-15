import { NextResponse } from "next/server"
import { query } from "@/lib/db"

/**
 * GET /api/companies/[firkod]/services
 * Firma detay sayfası "Hizmetler" tabı için:
 * Firmaya sihirbaz tarafından atanan hizmetleri (WizardPortAssignments) +
 * katalog bilgisini (WizardServices) + kurulu olduğu sunucuyu (IISSites)
 * birleştirerek döndürür.
 */

interface Row {
  Id:         number
  Name:       string
  Category:   string | null
  Type:       string
  Port:       number | null
  SiteName:   string | null
  AssignedAt: string | null
  Server:     string | null
  Status:     string | null
  AppPool:    string | null
}

export interface CompanyServiceDto {
  id:         number
  name:       string
  category:   string
  type:       string
  port:       number | null
  siteName:   string
  server:     string
  status:     string
  appPool:    string
  assignedAt: string
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const rows = await query<Row[]>`
      SELECT
        wpa.Id,
        ws.Name,
        ws.Category,
        ws.Type,
        wpa.Port,
        wpa.SiteName,
        CONVERT(NVARCHAR(30), wpa.AssignedAt, 120) AS AssignedAt,
        iis.Server,
        iis.Status,
        iis.AppPool
      FROM WizardPortAssignments wpa
      JOIN WizardServices ws ON ws.Id = wpa.ServiceId
      LEFT JOIN IISSites iis ON iis.Name = wpa.SiteName AND iis.Firma = ${firkod}
      WHERE wpa.CompanyId = ${firkod}
      ORDER BY ws.Name
    `

    const services: CompanyServiceDto[] = rows.map((r) => ({
      id:         r.Id,
      name:       r.Name,
      category:   r.Category ?? "",
      type:       r.Type,
      port:       r.Port,
      siteName:   r.SiteName ?? "",
      server:     r.Server ?? "",
      status:     r.Status ?? "",
      appPool:    r.AppPool ?? "",
      assignedAt: r.AssignedAt ?? "",
    }))

    const resp = NextResponse.json(services)
    resp.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/services]", err)
    return NextResponse.json({ error: "Hizmet verisi alınamadı" }, { status: 500 })
  }
}
