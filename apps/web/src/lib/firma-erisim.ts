import "server-only"

import { getSupabaseServer } from "@/lib/supabase/server"
import { getCompanyCredentials, type SupabaseLike } from "@/lib/firma-credentials"

/**
 * Firma erişim bilgileri — sunucular + kullanıcı şifreleri.
 *
 * Hem Hub'ın kendi "Erişim Bilgileri" modal'ı hem de alt uygulamalar
 * (CRM, x-internal-key ile) aynı veriyi kullansın diye buraya çıkarıldı.
 * İki yerde ayrı sorgu tutmak, biri değişince diğerinin sessizce bayatlaması
 * demekti.
 *
 * ŞİFRE İÇERİR: çağıran taraf yetkilendirmeyi kendisi yapmak zorunda.
 */

export interface FirmaErisimBilgisi {
  firmaId: string

  /** AD sunucusu — domain bilgisi için */
  ad?: {
    name: string
    ip: string
    domain: string | null
  } | null

  /** Windows/RDP sunucusu — RDP hedefi için */
  windows?: {
    name: string
    ip: string
    dns: string | null
    rdpPort: number | null
  } | null

  /** IIS sunucusu — WAN'dan erişilebilen DNS için */
  iis?: {
    name: string
    ip: string
    dns: string | null
  } | null

  /** Tam kullanıcı adı ("2507.vefa1") → düz şifre. */
  credentials: Record<string, string>
}

interface ServerRow {
  id: string
  name: string
  ip: string
  dns: string | null
  domain: string | null
  rdp_port: number | null
}
const SRV_COLS = "id, name, ip, dns, domain, rdp_port"

/** Firma bulunamazsa `null` döner. */
export async function getFirmaErisim(
  firkod: string,
  client?: SupabaseLike,
): Promise<FirmaErisimBilgisi | null> {
  // Oturumsuz (servis-servis) cagrilarda admin istemcisi ZORUNLU: hub semasinda
  // RLS var, oturumsuz okuma bos doner ve firma "bulunamadi" gibi gorunur.
  const sb = client ?? (await getSupabaseServer())

  const { data: c } = await sb
    .schema("hub")
    .from("companies")
    .select("company_id, ad_server_id, windows_server_id")
    .eq("company_id", firkod)
    .maybeSingle()
  if (!c) return null
  const comp = c as { company_id: string; ad_server_id: string | null; windows_server_id: string | null }

  const fetchServer = async (id: string | null): Promise<ServerRow | null> => {
    if (!id) return null
    const { data } = await sb.schema("hub").from("servers").select(SRV_COLS).eq("id", id).maybeSingle()
    return (data as ServerRow | null) ?? null
  }

  const fetchIisServer = async (): Promise<ServerRow | null> => {
    const { data: iis } = await sb
      .schema("hub")
      .from("iis_sites")
      .select("server")
      .eq("firma", firkod)
      .not("server", "is", null)
      .order("name")
      .limit(1)
      .maybeSingle()
    const name = (iis as { server: string | null } | null)?.server
    if (!name) return null
    const { data } = await sb.schema("hub").from("servers").select(SRV_COLS).eq("name", name).limit(1).maybeSingle()
    return (data as ServerRow | null) ?? null
  }

  const [adRow, winRow, iisRow, credentials] = await Promise.all([
    fetchServer(comp.ad_server_id),
    fetchServer(comp.windows_server_id),
    fetchIisServer(),
    getCompanyCredentials(firkod, sb),
  ])

  return {
    firmaId: comp.company_id,
    ad: adRow ? { name: adRow.name, ip: adRow.ip, domain: adRow.domain ?? null } : null,
    windows: winRow
      ? { name: winRow.name, ip: winRow.ip, dns: winRow.dns ?? null, rdpPort: winRow.rdp_port ?? null }
      : null,
    iis: iisRow ? { name: iisRow.name, ip: iisRow.ip, dns: iisRow.dns ?? null } : null,
    credentials,
  }
}
