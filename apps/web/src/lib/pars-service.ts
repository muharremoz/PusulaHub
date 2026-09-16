import "server-only"
import { getSupabaseServer } from "@/lib/supabase/server"
import { serverAgentById } from "@/lib/hub-servers"
import { decrypt } from "@/lib/crypto"
import { execOnAgent } from "@/lib/agent-poller"
import { parseConfig, type ParsConfig } from "@/lib/wizard-service-config"
import { buildParsKatalogOku, parsJsonAyikla, parsKatalogNormalize } from "@/lib/setup-parsops"
import type { ParsKatalog } from "@/lib/pars-katalog"

/**
 * Pars hizmeti — sunucu tarafı ortak işler.
 *
 * Config DB'de şifreli; istemciye giden DTO'da şifre yok. Bu yüzden katalog
 * okuma ve kullanıcı yazma adımları hizmeti ID ile buradan yükler.
 */

export interface ParsHedef {
  serviceId: number
  name:      string
  dbPath:    string
  password:  string
  agent:     { ip: string; port: number; apiKey: string }
}

/** Hizmeti yükler, şifreyi çözer, agent bilgisini bulur. Sorunları mesajla döner. */
export async function parsHedefYukle(serviceId: number): Promise<{ ok: true; hedef: ParsHedef } | { ok: false; error: string }> {
  const sb = await getSupabaseServer()
  const { data } = await sb.schema("hub").from("wizard_services")
    .select("id, name, type, config, is_active").eq("id", serviceId).maybeSingle()
  const row = data as { id: number; name: string; type: string; config: string | null; is_active: boolean } | null
  if (!row)                  return { ok: false, error: "Pars hizmeti bulunamadı" }
  if (row.type !== "pars")   return { ok: false, error: "Hizmet Pars tipinde değil" }
  const cfg = parseConfig(row.config) as ParsConfig | null
  if (!cfg?.serverId || !cfg.dbPath) return { ok: false, error: "Pars hizmet config'i eksik (sunucu / Ayar.mdb yolu)" }
  const password = decrypt(cfg.dbPassword ?? "")
  if (!password) return { ok: false, error: "Ayar.mdb şifresi çözülemedi — hizmet ayarlarından yeniden girin" }
  const srv = await serverAgentById(cfg.serverId)
  if (!srv?.agent_port || !srv.api_key) return { ok: false, error: "Mobil sunucunun agent bilgisi eksik (ApiKey/AgentPort)" }
  return {
    ok: true,
    hedef: {
      serviceId: row.id,
      name:      row.name,
      dbPath:    cfg.dbPath,
      password,
      agent:     { ip: srv.ip, port: srv.agent_port, apiKey: srv.api_key },
    },
  }
}

const KATALOG_TTL_MS = 60_000
const katalogCache = new Map<number, { t: number; katalog: ParsKatalog }>()

/** Ayar.mdb'den kataloğu okur (1 dk önbellek — sihirbazda adımlar arası gidip gelmede tekrar okumasın). */
export async function parsKatalogOku(hedef: ParsHedef, taze = false): Promise<{ ok: true; katalog: ParsKatalog } | { ok: false; error: string }> {
  const c = katalogCache.get(hedef.serviceId)
  if (!taze && c && Date.now() - c.t < KATALOG_TTL_MS) return { ok: true, katalog: c.katalog }

  const r = await execOnAgent(hedef.agent.ip, hedef.agent.port, hedef.agent.apiKey, buildParsKatalogOku(hedef.dbPath, hedef.password), 60)
  const raw = parsJsonAyikla(r.stdout ?? "")
  if (!raw) {
    const neden = (r.stderr || r.stdout || `exit ${r.exitCode}`).trim().slice(0, 400)
    return { ok: false, error: `Ayar.mdb okunamadı: ${neden}` }
  }
  const katalog = parsKatalogNormalize(raw)
  katalogCache.set(hedef.serviceId, { t: Date.now(), katalog })
  return { ok: true, katalog }
}

export function parsKatalogOnbellekTemizle(serviceId: number) {
  katalogCache.delete(serviceId)
}
