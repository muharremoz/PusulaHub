/**
 * GET /api/companies/[firkod]/access-info
 *
 * Firma detay sayfasındaki "Erişim Bilgileri" modal'ı için ek sunucu
 * bilgilerini döner (frontend zaten tabUsers/tabIIS/tabSQL'e sahip).
 * Şifreler DB'de tutulmaz — döndürülmez.
 */

import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
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

interface ServerRow {
  id: string; name: string; ip: string; dns: string | null; domain: string | null; rdp_port: number | null
}
const SRV_COLS = "id, name, ip, dns, domain, rdp_port"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  // Erişim Bilgileri modal'ı: "company-detail" yetkisi olmayan ama
  // "companies" yetkisi olan (rol: kullanıcı) kişilere de açık. Bu kişiler
  // firma detayını göremez ama firmaya bağlanmak için gerekli credential'ları
  // görebilirler.
  const gate = await requirePermission("companies", "read")
  if (gate) return gate

  const { firkod } = await params

  try {
    const sb = await getSupabaseServer()
    const { data: c } = await sb.schema("hub").from("companies")
      .select("company_id, ad_server_id, windows_server_id").eq("company_id", firkod).maybeSingle()
    if (!c) return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 })
    const comp = c as { company_id: string; ad_server_id: string | null; windows_server_id: string | null }

    const fetchServer = async (id: string | null): Promise<ServerRow | null> => {
      if (!id) return null
      const { data } = await sb.schema("hub").from("servers").select(SRV_COLS).eq("id", id).maybeSingle()
      return (data as ServerRow | null) ?? null
    }
    const fetchIisServer = async (): Promise<ServerRow | null> => {
      const { data: iis } = await sb.schema("hub").from("iis_sites")
        .select("server").eq("firma", firkod).not("server", "is", null).order("name").limit(1).maybeSingle()
      const name = (iis as { server: string | null } | null)?.server
      if (!name) return null
      const { data } = await sb.schema("hub").from("servers").select(SRV_COLS).eq("name", name).limit(1).maybeSingle()
      return (data as ServerRow | null) ?? null
    }

    const [adRow, winRow, iisRow, credentials] = await Promise.all([
      fetchServer(comp.ad_server_id),
      fetchServer(comp.windows_server_id),
      fetchIisServer(),
      getCompanyCredentials(firkod),
    ])

    const response: AccessInfoResponse = {
      firmaId:   comp.company_id,
      ad:       adRow  ? { name: adRow.name,  ip: adRow.ip,  domain: adRow.domain ?? null } : null,
      windows:  winRow ? { name: winRow.name, ip: winRow.ip, dns: winRow.dns ?? null, rdpPort: winRow.rdp_port ?? null } : null,
      iis:      iisRow ? { name: iisRow.name, ip: iisRow.ip, dns: iisRow.dns ?? null } : null,
      credentials,
    }
    return NextResponse.json(response)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
