import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { requirePermission } from "@/lib/require-permission"

/**
 * GET /api/iis/sites
 *
 * Sistemdeki tüm IIS sitelerini döndürür.
 * WizardPortAssignments üzerinden firma (CompanyId) ve hizmet (WizardServices.Name)
 * bilgileri eklenir — sihirbaz dışı kurulan sitelerde bu alanlar boş gelir.
 */

interface Row {
  Id:           string
  Name:         string
  Server:       string
  Status:       string
  Binding:      string
  AppPool:      string
  PhysicalPath: string
  Firma:        string | null
  Hizmet:       string | null
}

export interface IISSiteDto {
  id:           string
  name:         string
  server:       string
  status:       string
  binding:      string
  appPool:      string
  physicalPath: string
  firma:        string
  hizmet:       string
}

export async function GET() {
  const gate = await requirePermission("iis", "read")
  if (gate) return gate
  try {
    const rows = await query<Row[]>`
      SELECT
        i.Id,
        i.Name,
        i.Server,
        i.Status,
        i.Binding,
        i.AppPool,
        i.PhysicalPath,
        ISNULL(wpa.CompanyId, '')   AS Firma,
        ISNULL(ws.Name,       '')   AS Hizmet
      FROM IISSites i
      LEFT JOIN WizardPortAssignments wpa ON wpa.SiteName = i.Name
      LEFT JOIN WizardServices ws         ON ws.Id        = wpa.ServiceId
      ORDER BY i.Server, i.Name
    `

    const sites: IISSiteDto[] = rows.map((r) => ({
      id:           r.Id,
      name:         r.Name,
      server:       r.Server,
      status:       r.Status,
      binding:      r.Binding,
      appPool:      r.AppPool,
      physicalPath: r.PhysicalPath,
      firma:        r.Firma  ?? "",
      hizmet:       r.Hizmet ?? "",
    }))

    const resp = NextResponse.json(sites)
    resp.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/iis/sites]", err)
    return NextResponse.json({ error: "IIS siteleri alınamadı" }, { status: 500 })
  }
}
