import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"

/**
 * GET /api/companies/[firkod]/services
 * Firma detay sayfası "Hizmetler" tabı için:
 * Firmaya sihirbaz tarafından atanan hizmetleri (WizardPortAssignments) +
 * katalog bilgisini (WizardServices) + kurulu olduğu sunucuyu (IISSites)
 * birleştirerek döndürür.
 */

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
  const gate = await requirePermission("company-detail", "read")
  if (gate) return gate
  const { firkod } = await params
  try {
    const sb = await getSupabaseServer()
    const [{ data: wpa }, { data: ws }, { data: iis }] = await Promise.all([
      sb.schema("hub").from("wizard_port_assignments").select("id, service_id, port, site_name, assigned_at").eq("company_id", firkod),
      sb.schema("hub").from("wizard_services").select("id, name, category, type"),
      sb.schema("hub").from("iis_sites").select("name, server, status, app_pool").eq("firma", firkod),
    ])
    const wsById = new Map(((ws ?? []) as { id: number; name: string; category: string | null; type: string }[]).map((s) => [s.id, s]))
    const iisByName = new Map(((iis ?? []) as { name: string; server: string; status: string; app_pool: string }[]).map((i) => [i.name, i]))

    const services: CompanyServiceDto[] = ((wpa ?? []) as { id: number; service_id: number; port: number | null; site_name: string | null; assigned_at: string | null }[])
      .map((a) => {
        const s = wsById.get(a.service_id)
        const i = a.site_name ? iisByName.get(a.site_name) : null
        return {
          id: a.id, name: s?.name ?? "", category: s?.category ?? "", type: s?.type ?? "",
          port: a.port, siteName: a.site_name ?? "", server: i?.server ?? "",
          status: i?.status ?? "", appPool: i?.app_pool ?? "",
          assignedAt: a.assigned_at ? a.assigned_at.slice(0, 19).replace("T", " ") : "",
        }
      })
      .filter((x) => x.name)
      .sort((a, b) => a.name.localeCompare(b.name))

    const resp = NextResponse.json(services)
    resp.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/services]", err)
    return NextResponse.json({ error: "Hizmet verisi alınamadı" }, { status: 500 })
  }
}
