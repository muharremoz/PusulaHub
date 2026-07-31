import "server-only"

import { getSupabaseServer } from "@/lib/supabase/server"

/**
 * Firmanın web hizmetleri (IIS siteleri) — Erişim sekmesindeki Users.xml
 * okuma/yazma uçlarının ortak site çözümlemesi.
 */

export type SiteRow = {
  name: string
  server: string
  physical_path: string | null
  /** "http://*:26001" veya "*:26001:host" — port bu alandan çıkarılır */
  binding: string | null
}
type Sb = Awaited<ReturnType<typeof getSupabaseServer>>

/** Binding metninden ilk port numarasını çıkarır. */
export function bindingPort(binding: string | null | undefined): number | null {
  const m = (binding ?? "").match(/:(\d+)/)
  return m ? Number(m[1]) : null
}

/** PowerShell single-quoted string için ' karakterini '' yapar. */
export function psQuote(s: string): string {
  return (s ?? "").replace(/'/g, "''")
}

/**
 * Firmaya ait IIS siteleri — hem `iis_sites.firma` üzerinden hem de sihirbazın
 * atadığı hizmetlerin site adlarından. Site kaydının `firma` kolonu boş/farklı
 * olabildiği için ad ile ikinci bir arama yapılıyor.
 *
 * Anahtar: site adının küçük harfli hali.
 */
export async function resolveCompanySites(sb: Sb, firkod: string): Promise<Map<string, SiteRow>> {
  const [{ data: firmaSites }, { data: assignments }] = await Promise.all([
    sb.schema("hub").from("iis_sites").select("name, server, physical_path, binding").eq("firma", firkod),
    sb.schema("hub").from("wizard_port_assignments").select("site_name").eq("company_id", firkod),
  ])

  const sites = new Map<string, SiteRow>()
  for (const s of (firmaSites ?? []) as SiteRow[]) sites.set(s.name.toLowerCase(), s)

  const missing = ((assignments ?? []) as { site_name: string | null }[])
    .map((a) => a.site_name?.trim())
    .filter((n): n is string => !!n && !sites.has(n.toLowerCase()))

  if (missing.length > 0) {
    const { data: extra } = await sb
      .schema("hub").from("iis_sites").select("name, server, physical_path, binding").in("name", missing)
    for (const s of (extra ?? []) as SiteRow[]) sites.set(s.name.toLowerCase(), s)
  }
  return sites
}

/** Sitenin sunucusunun agent bağlantı bilgileri + dışarıdan erişim DNS'i. */
export async function siteAgent(
  sb: Sb,
  serverName: string,
): Promise<{ ip: string; dns: string | null; agent_port: number | null; api_key: string | null } | null> {
  const { data } = await sb
    .schema("hub").from("servers").select("ip, dns, agent_port, api_key").eq("name", serverName).maybeSingle()
  return (data as { ip: string; dns: string | null; agent_port: number | null; api_key: string | null } | null) ?? null
}
