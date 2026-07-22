import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"

/**
 * GET /api/iis/sites — tüm IIS siteleri + (wizard_port_assignments üzerinden)
 * firma (company_id) ve hizmet (wizard_services.name) bilgisi.
 */

export interface IISSiteDto {
  id: string; name: string; server: string; status: string; binding: string
  appPool: string; physicalPath: string; firma: string; hizmet: string
}

export async function GET() {
  const gate = await requirePermission("iis", "read")
  if (gate) return gate
  try {
    const sb = await getSupabaseServer()
    const [{ data: sites }, { data: wpa }, { data: ws }] = await Promise.all([
      sb.schema("hub").from("iis_sites").select("id, name, server, status, binding, app_pool, physical_path").order("server").order("name"),
      sb.schema("hub").from("wizard_port_assignments").select("site_name, company_id, service_id"),
      sb.schema("hub").from("wizard_services").select("id, name"),
    ])
    const wsName = new Map(((ws ?? []) as { id: number; name: string }[]).map((s) => [s.id, s.name]))
    const bySite = new Map<string, { firma: string; hizmet: string }>()
    for (const a of (wpa ?? []) as { site_name: string | null; company_id: string; service_id: number }[]) {
      if (a.site_name) bySite.set(a.site_name, { firma: a.company_id ?? "", hizmet: wsName.get(a.service_id) ?? "" })
    }

    const out: IISSiteDto[] = ((sites ?? []) as {
      id: string; name: string; server: string; status: string; binding: string; app_pool: string; physical_path: string
    }[]).map((r) => {
      const extra = bySite.get(r.name)
      return {
        id: r.id, name: r.name, server: r.server, status: r.status, binding: r.binding,
        appPool: r.app_pool, physicalPath: r.physical_path,
        firma: extra?.firma ?? "", hizmet: extra?.hizmet ?? "",
      }
    })

    const resp = NextResponse.json(out)
    resp.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/iis/sites]", err)
    return NextResponse.json({ error: "IIS siteleri alınamadı" }, { status: 500 })
  }
}
