import "server-only"
import { getSupabaseServer } from "@/lib/supabase/server"
import { serverAgentById, type HubSorguIstemcisi } from "@/lib/hub-servers"
import { decrypt } from "@/lib/crypto"
import { execOnAgent } from "@/lib/agent-poller"
import { parseConfig, type ParsConfig } from "@/lib/wizard-service-config"
import { buildParsKatalogOku, buildParsSifreOku, parsJsonAyikla, parsKatalogNormalize } from "@/lib/setup-parsops"
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

/**
 * Hizmeti yükler, şifreyi çözer, agent bilgisini bulur. Sorunları mesajla döner.
 * `istemci`: oturumsuz uçlardan admin istemcisi (bkz. serverAgentById).
 */
export async function parsHedefYukle(serviceId: number, istemci?: HubSorguIstemcisi): Promise<{ ok: true; hedef: ParsHedef } | { ok: false; error: string }> {
  const sb = istemci ?? await getSupabaseServer()
  const { data } = await sb.schema("hub").from("wizard_services")
    .select("id, name, type, config, is_active").eq("id", serviceId).maybeSingle()
  const row = data as { id: number; name: string; type: string; config: string | null; is_active: boolean } | null
  if (!row)                  return { ok: false, error: "Pars hizmeti bulunamadı" }
  if (row.type !== "pars")   return { ok: false, error: "Hizmet Pars tipinde değil" }
  const cfg = parseConfig(row.config) as ParsConfig | null
  if (!cfg?.serverId || !cfg.dbPath) return { ok: false, error: "Pars hizmet config'i eksik (sunucu / Ayar.mdb yolu)" }
  const password = decrypt(cfg.dbPassword ?? "")
  if (!password) return { ok: false, error: "Ayar.mdb şifresi çözülemedi — hizmet ayarlarından yeniden girin" }
  const srv = await serverAgentById(cfg.serverId, istemci)
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

/** Ayar.mdb'ye yazılan kullanıcıları Hub'a kaydeder (firma Hizmetler sekmesi). Şifre saklanmaz. */
export async function parsKullanicilariKaydet(
  companyId: string,
  serviceId: number,
  users: { username: string; tipi: 0 | 1; parsUserId: number | null }[],
  dataNames: string[],
): Promise<void> {
  if (!users.length) return
  const sb = await getSupabaseServer()
  const { error } = await sb.schema("hub").from("company_pars_users").insert(users.map((u) => ({
    company_id:   companyId,
    service_id:   serviceId,
    username:     u.username,
    tipi:         u.tipi,
    pars_user_id: u.parsUserId,
    data_names:   dataNames.length ? dataNames.join(",") : null,
  })))
  if (error) throw new Error(error.message)
}

export interface ParsFirmaSifreleri {
  serviceId: number
  /** Kullanıcı başına şifre; Ayar.mdb'de o ID yoksa kayıt dönmez. */
  users:     { parsUserId: number; username: string; password: string | null }[]
  /** Bu hizmet için okuma yapılamadıysa sebebi (agent kapalı, şifre çözülemedi…). */
  error?:    string
}

/**
 * Firmanın Pars kullanıcılarının şifreleri — Ayar.mdb'den CANLI okunur.
 *
 * Hub şifreyi saklamıyor (bkz. company_pars_users migration'ı); tek kaynak
 * mobil sunucudaki Ayar.mdb. Yalnız bu firmaya kayıtlı `pars_user_id`'ler
 * sorgulanır. Hizmet başına ayrı sonuç: biri okunamazsa diğerleri gelir.
 *
 * `istemci` admin olmalı — çağıran internal uç oturumsuz.
 */
export async function parsFirmaSifreleri(istemci: HubSorguIstemcisi, firkod: string): Promise<ParsFirmaSifreleri[]> {
  const { data } = await istemci.schema("hub").from("company_pars_users")
    .select("service_id, pars_user_id").eq("company_id", firkod)
  const satirlar = (data ?? []) as { service_id: number; pars_user_id: number | null }[]

  const hizmetBasi = new Map<number, number[]>()
  for (const r of satirlar) {
    if (r.pars_user_id == null) continue
    const l = hizmetBasi.get(r.service_id) ?? []
    l.push(r.pars_user_id)
    hizmetBasi.set(r.service_id, l)
  }

  return Promise.all([...hizmetBasi.entries()].map(async ([serviceId, ids]): Promise<ParsFirmaSifreleri> => {
    const h = await parsHedefYukle(serviceId, istemci)
    if (!h.ok) return { serviceId, users: [], error: h.error }
    const { hedef } = h
    const r = await execOnAgent(hedef.agent.ip, hedef.agent.port, hedef.agent.apiKey, buildParsSifreOku(hedef.dbPath, hedef.password, ids), 30)
    const raw = parsJsonAyikla<{ users?: unknown }>(r.stdout ?? "")
    if (!raw) {
      const neden = r.timedOut ? "mobil sunucu yanıt vermedi" : (r.stderr || r.stdout || `exit ${r.exitCode}`).trim().slice(0, 200)
      return { serviceId, users: [], error: `Ayar.mdb okunamadı: ${neden}` }
    }
    // ConvertTo-Json tek elemanlı diziyi nesneye çevirebiliyor → ikisini de kabul et.
    const liste = Array.isArray(raw.users) ? raw.users : raw.users ? [raw.users] : []
    return {
      serviceId,
      users: (liste as Record<string, unknown>[])
        .map((x) => ({
          parsUserId: Number(x.ID),
          username:   String(x.Adi ?? ""),
          password:   x.sifre == null ? null : String(x.sifre),
        }))
        .filter((x) => Number.isInteger(x.parsUserId)),
    }
  }))
}
