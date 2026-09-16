import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import { parseConfig, type ParsConfig } from "@/lib/wizard-service-config"

/**
 * GET /api/companies/[firkod]/services
 * Firma detay sayfası "Hizmetler" tabı için:
 * Firmaya sihirbaz tarafından atanan hizmetleri (WizardPortAssignments) +
 * katalog bilgisini (WizardServices) + kurulu olduğu sunucuyu (IISSites)
 * birleştirerek döndürür. Pars hizmeti port almaz; company_pars_users'tan
 * kullanıcı listesiyle tek satır olarak eklenir.
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
  /** Pars: Ayar.mdb'ye yazılmış kullanıcı adları */
  users?:     string[]
  /** Pars: yönetim ekranı için hizmet id'si (satır id'si sentetik) */
  parsServiceId?: number
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> }
) {
  // "companies" yetkisi yeterli: bu liste Erişim Bilgileri modal'ının
  // "Web Hizmetleri" bölümünü de besliyor ve o modal, firma detayını
  // göremeyen (rol: kullanıcı) kişilere de açık. İçerik zaten IIS listesiyle
  // aynı sınıfta — şifre/kimlik bilgisi içermiyor.
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { firkod } = await params
  try {
    const sb = await getSupabaseServer()
    const [{ data: wpa }, { data: ws }, { data: iis }, { data: parsRows }] = await Promise.all([
      sb.schema("hub").from("wizard_port_assignments").select("id, service_id, port, site_name, assigned_at").eq("company_id", firkod),
      sb.schema("hub").from("wizard_services").select("id, name, category, type, config"),
      sb.schema("hub").from("iis_sites").select("name, server, status, app_pool").eq("firma", firkod),
      sb.schema("hub").from("company_pars_users").select("id, service_id, username, tipi, created_at").eq("company_id", firkod).order("created_at"),
    ])
    const wsById = new Map(((ws ?? []) as { id: number; name: string; category: string | null; type: string; config: string | null }[]).map((s) => [s.id, s]))
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

    // Pars: hizmet başına tek satır, kullanıcılar alt bilgi
    const parsByService = new Map<number, { users: string[]; ilk: string }>()
    for (const r of ((parsRows ?? []) as { service_id: number; username: string; tipi: number; created_at: string }[])) {
      const g = parsByService.get(r.service_id) ?? { users: [], ilk: r.created_at }
      g.users.push(r.tipi === 1 ? `${r.username} (admin)` : r.username)
      parsByService.set(r.service_id, g)
    }
    if (parsByService.size > 0) {
      // Pars: sunucu ve port hizmet ayarından (mobil sunucu DNS'i + bağlantı portu)
      const cfgById = new Map<number, ParsConfig>()
      for (const [serviceId] of parsByService) {
        const cfg = parseConfig(wsById.get(serviceId)?.config ?? null) as ParsConfig | null
        if (cfg) cfgById.set(serviceId, cfg)
      }
      const srvIds = [...new Set([...cfgById.values()].map((c) => c.serverId).filter(Boolean))]
      const srvById = new Map<string, { name: string; ip: string; dns: string | null }>()
      if (srvIds.length > 0) {
        const { data: srvs } = await sb.schema("hub").from("servers").select("id, name, ip, dns").in("id", srvIds)
        for (const s of ((srvs ?? []) as { id: string; name: string; ip: string; dns: string | null }[])) {
          srvById.set(s.id, { name: s.name, ip: s.ip, dns: s.dns })
        }
      }
      for (const [serviceId, g] of parsByService) {
        const s = wsById.get(serviceId)
        if (!s) continue
        const cfg = cfgById.get(serviceId)
        const srv = cfg ? srvById.get(cfg.serverId) : undefined
        services.push({
          id: 1_000_000 + serviceId, name: s.name, category: s.category ?? "", type: s.type,
          port: cfg?.port ?? null,
          siteName: g.users.join(", "),
          server: srv ? (srv.dns?.trim() || srv.ip) : "",
          status: "", appPool: "",
          assignedAt: g.ilk ? g.ilk.slice(0, 19).replace("T", " ") : "",
          users: g.users,
          parsServiceId: serviceId,
        })
      }
    }

    services.sort((a, b) => a.name.localeCompare(b.name))
    const resp = NextResponse.json(services)
    resp.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/services]", err)
    return NextResponse.json({ error: "Hizmet verisi alınamadı" }, { status: 500 })
  }
}
