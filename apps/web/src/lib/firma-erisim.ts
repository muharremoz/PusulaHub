import "server-only"

import { getSupabaseServer } from "@/lib/supabase/server"
import { getCompanyCredentials, type SupabaseLike } from "@/lib/firma-credentials"
import { decrypt } from "@/lib/crypto"

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

  /**
   * SQL sunucusu — bağlanmak için gereken kimlik bilgisi.
   *
   * Veritabanı listesi/boyutları BİLEREK yok: o veri firmanın SQL sunucusuna
   * canlı bağlanmayı gerektiriyor (yavaş, ağa bağlı) ve "erişim bilgisi"
   * değil operasyonel detay. Gerekirse Hub'ın SQL sekmesinden bakılır.
   */
  sql?: {
    name: string
    ip: string
    port: number
    username: string | null
    password: string | null
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
const SQL_COLS = "id, name, ip, sql_username, sql_password"

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
    .select("company_id, ad_server_id, windows_server_id, sql_server_id")
    .eq("company_id", firkod)
    .maybeSingle()
  if (!c) return null
  const comp = c as {
    company_id: string
    ad_server_id: string | null
    windows_server_id: string | null
    sql_server_id: string | null
  }

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

  /** SQL sunucusu — şifre AES ile saklanıyor, burada çözülür. */
  const fetchSqlServer = async (): Promise<FirmaErisimBilgisi["sql"]> => {
    if (!comp.sql_server_id) return null
    const { data } = await sb
      .schema("hub")
      .from("servers")
      .select(SQL_COLS)
      .eq("id", comp.sql_server_id)
      .maybeSingle()
    const s = data as
      | { name: string; ip: string; sql_username: string | null; sql_password: string | null }
      | null
    if (!s) return null
    let sifre: string | null = null
    if (s.sql_password) {
      // Şifreleme anahtarı değişmişse çöz edilemez — bilgiyi bastırma, boş bırak.
      try {
        sifre = decrypt(s.sql_password) ?? null
      } catch {
        sifre = null
      }
    }
    return { name: s.name, ip: s.ip, port: 1433, username: s.sql_username ?? null, password: sifre }
  }

  const [adRow, winRow, iisRow, sql, credentials] = await Promise.all([
    fetchServer(comp.ad_server_id),
    fetchServer(comp.windows_server_id),
    fetchIisServer(),
    fetchSqlServer(),
    getCompanyCredentials(firkod, sb),
  ])

  return {
    firmaId: comp.company_id,
    ad: adRow ? { name: adRow.name, ip: adRow.ip, domain: adRow.domain ?? null } : null,
    windows: winRow
      ? { name: winRow.name, ip: winRow.ip, dns: winRow.dns ?? null, rdpPort: winRow.rdp_port ?? null }
      : null,
    iis: iisRow ? { name: iisRow.name, ip: iisRow.ip, dns: iisRow.dns ?? null } : null,
    sql,
    credentials,
  }
}
