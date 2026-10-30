import { NextRequest } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { serverAgentById, sqlServerById, serversWithRole } from "@/lib/hub-servers"
import { execOnAgent } from "@/lib/agent-poller"
import { hubSenkronuBaslat } from "@/lib/hub-senkron-isi"
import { resimKlasorGecerli, resimSiteAdi } from "@/lib/resim-site"
import { decrypt } from "@/lib/crypto"
import { withSqlConnection } from "@/lib/sql-external"
import { resolveFirmaSqlTarget } from "@/lib/sql-company-target"
import { restoreBackupOnServer, attachDatabaseOnServer, firmaDataDir } from "@/lib/sql-restore"
import { buildCopyAttachFiles } from "@/lib/sql-backup-powershell"
import { ensureSqlLogin, denyViewAnyDatabase, setDbOwner, grantSirketAccess } from "@/lib/sql-firma-login"
import { apiKullaniciAdi, sqlLoginAdi } from "@/lib/firma-adlandirma"
import { saveCompanyUserPassword, saveCompanyUserSqlPassword } from "@/lib/firma-credentials"
import { insertGuvenlikRow } from "@/lib/sirket-guvenlik"
import { AKSAM_YEDEK_PROGRAMLARI, YEDEK_MENU_ID, yedekMenusunuGizle, yedekMenusuMesaji } from "@/lib/program-yedek"
import { deriveDataName } from "@/lib/demo-database-naming"
import { adKullaniciAdiHatasi } from "@/lib/ad-kullanici-adi"
import { BILKAR_KULLANICILARI, bilkarFirmasiMi, bilkarMasaustu } from "@/lib/bilkar"
import {
  buildEnsureFirmalarOu,
  buildEnsureFirmaOu,
  buildEnsureGroup,
  buildCreateUser,
  buildAddGroupMember,
  buildAddOfficeMember,
  OFFICE_GRUBU,
} from "@/lib/ad-powershell"
import {
  buildCreateDir,
  buildCopyFolder,
  buildSetNtfsPermissions,
  buildUpdateParamTxt,
  buildUpdateDataKoduXml,
  buildWriteDesktopIni,
  buildYedekSormaTxt,
  buildWriteFirmanoBak,
  buildPusulaXFileXml,
  buildCopyDesktopFolderToUser,
} from "@/lib/setup-fileops"
import {
  buildReplaceInFile,
  buildCreateIisSite,
  buildPatchWebConfig,
  buildPatchUsersXml,
  buildCopyIisConfigFromSibling,
  buildSetApiKullanici,
  apiKimlikHatasi,
  buildListIisUsedPorts,
  buildGetIisSitePort,
  buildCreateIisResimSite,
  buildListIisSiteNames,
  benzersizSiteAdi,
} from "@/lib/setup-iisops"
import {
  buildCreateShortcut,
  sanitizeWindowsName,
} from "@/lib/setup-shortcuts"
import type {
  ServiceType,
  ServiceConfig,
  PusulaProgramConfig,
  IisSiteConfig,
  IisResimConfig,
} from "@/app/api/services/route"
import { parsHedefYukle, parsKatalogOku, parsKatalogOnbellekTemizle, parsKullanicilariKaydet } from "@/lib/pars-service"
import { buildParsKullaniciYaz, parsJsonAyikla } from "@/lib/setup-parsops"
import { parsTipFromProgramCode } from "@/lib/pars-katalog"
import { pusulaXResimYolu, yazPusulaXResimYolu, yazPusulaXEntegrasyon } from "@/lib/pusulax-resim-yolu"

/**
 * POST /api/setup/run
 *
 * Firma kurulum sihirbazının "Çalıştır" adımı. AD sunucusunda OU + güvenlik
 * grubu + kullanıcılar + grup üyeliklerini oluşturur. İlerlemeyi SSE
 * (text/event-stream) olarak akıtır.
 *
 * Event tipleri:
 *   - step  { stepId, label, status: "running"|"done"|"error", output?, error? }
 *   - done  { ok: true, summary }
 *   - error { message }                    (toplam akışı bozan hata)
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface RunUser {
  username:    string
  displayName: string
  email:       string
  phone:       string
  password:    string
}

interface RunService {
  id:     number
  name:   string
  type:   ServiceType
  config: ServiceConfig | null
  /** API hizmeti (iis-site) için elle girilen uygulama kullanıcısı → Users.xml'de tek kullanıcı */
  appUser?: { username: string; password: string }
  /** Sihirbaz API adımı: Users.xml'e yazılacak uygulama kullanıcıları (ali, veli… — RDP kullanıcıları DEĞİL).
   *  Verilirse (boş liste dahil) firma kullanıcıları Users.xml'e yazılmaz. */
  apiUsers?: { username: string; password: string }[]
  /** Sihirbaz API adımı: Users.xml <DB> ve kullanıcı Data listesi (varsayılan güncel data) */
  apiDbler?: string[]
  /** Resim hizmeti (iis-resim): Depo'da D:\Resimler\<firmaId> altındaki klasör adı (firma detayından
   *  eklenirken seçilir). Verilirse site o klasörü yayınlar ve adı <firmaId>_RESIM_<KLASOR> olur —
   *  bir firmada birden çok resim sitesi açılabilsin. Verilmezse eski davranış: <firmaId>_RESIM. */
  resimKlasor?: string
}

/** Pattern içindeki {firmaKod} / {port} placeholder'larını değiştirir. */
function expandPattern(pattern: string, firmaId: string, port?: number): string {
  return pattern
    .replace(/\{firmaKod\}/gi, firmaId)
    .replace(/\{firmaId\}/gi,  firmaId)
    .replace(/\{port\}/gi,     port !== undefined ? String(port) : "")
}

/**
 * Verilen aralıktaki ilk boş portu bulup WizardPortAssignments'a ekler.
 * UNIQUE constraint sayesinde race-safe: çakışma olursa bir sonraki portu dener.
 */
async function allocatePort(
  rangeId:   number,
  serviceId: number,
  companyId: string,
  siteName:  string,
  /** IIS'te canlı olarak kullanılan portlar — sayaç (WizardPortAssignments)
   *  dışında elle kurulmuş siteleri de dışlamak için. Bkz: 26003 çakışması. */
  liveUsedPorts?: ReadonlySet<number>,
  /** "first-free": aralıktaki ilk boş port (varsayılan).
   *  "after-max":  aralıkta kullanılan en yüksek portun bir sonrası — RESIM
   *  siteleri elle 20001'den sırayla açılmış; aradaki/baştaki boşluğa
   *  (örn 20000) düşmek yerine sırayı sürdürür. */
  strategy: "first-free" | "after-max" = "first-free",
  /** Verilirse yeni satır eklenmez, bu kayıt yeni porta güncellenir — IIS'te
   *  sitesi olmayan (yarım kalmış) eski bir atamayı yeniden kullanmak için.
   *  Kaydın kendi eski portu "kullanılan" sayılmaz. */
  replaceRowId?: number,
): Promise<{ ok: true; port: number } | { ok: false; error: string }> {
  const sb = await getSupabaseServer()
  const { data: range } = await sb.schema("hub").from("wizard_port_ranges")
    .select("port_start, port_end, is_active").eq("id", rangeId).maybeSingle()
  if (!range)            return { ok: false, error: "Port aralığı bulunamadı" }
  if (!range.is_active)  return { ok: false, error: "Port aralığı pasif" }

  const { data: used } = await sb.schema("hub").from("wizard_port_assignments")
    .select("id, port").eq("port_range_id", rangeId)
  const usedSet = new Set(((used ?? []) as { id: number; port: number }[])
    .filter((u) => u.id !== replaceRowId).map((u) => u.port))

  let start = range.port_start
  if (strategy === "after-max") {
    let max = -1
    for (const p of [...usedSet, ...(liveUsedPorts ?? [])]) {
      if (p >= range.port_start && p <= range.port_end && p > max) max = p
    }
    if (max >= 0) start = max + 1
  }

  for (let p = start; p <= range.port_end; p++) {
    if (usedSet.has(p)) continue
    if (liveUsedPorts?.has(p)) continue
    // UNIQUE(port_range_id, port) sayesinde race-safe: çakışma → sıradaki portu dene
    const { error } = replaceRowId
      ? await sb.schema("hub").from("wizard_port_assignments")
          .update({ port: p, site_name: siteName, assigned_at: new Date().toISOString() }).eq("id", replaceRowId)
      : await sb.schema("hub").from("wizard_port_assignments").insert({
          port_range_id: rangeId, service_id: serviceId, company_id: companyId, port: p, site_name: siteName,
        })
    if (!error) return { ok: true, port: p }
  }
  return { ok: false, error: "Aralıkta boş port kalmadı" }
}

/**
 * Belirli bir portu firmaya kaydeder — IIS'te zaten kurulu olan ve portu
 * KORUNMASI gereken site için (dışarıdaki port yönlendirmesi ona bağlı).
 * Port aynı firmaya zaten kayıtlıysa sorun yok; başka firmadaysa hata.
 */
async function claimPort(
  rangeId:   number,
  serviceId: number,
  companyId: string,
  port:      number,
  siteName:  string,
): Promise<{ ok: true; port: number } | { ok: false; error: string }> {
  const sb = await getSupabaseServer()
  const { data: taken } = await sb.schema("hub").from("wizard_port_assignments")
    .select("company_id").eq("port_range_id", rangeId).eq("port", port).limit(1).maybeSingle()
  if (taken) {
    const owner = (taken as { company_id: string }).company_id
    return owner === companyId ? { ok: true, port } : { ok: false, error: `Port ${port} başka bir firmaya kayıtlı (${owner})` }
  }
  const { error } = await sb.schema("hub").from("wizard_port_assignments").insert({
    port_range_id: rangeId, service_id: serviceId, company_id: companyId, port, site_name: siteName,
  })
  return error ? { ok: false, error: error.message } : { ok: true, port }
}

interface RunBackupFile {
  /** Kaynak .bak dosya adı (backupFolderPath altında) — kind="bak" için */
  fileName:     string
  /** Hedef DB adı — kullanıcı sheet'te düzenledi (firma prefix yok) */
  databaseName: string
  /** Bu .bak hangi pusula-program servisine ait (sirket.guvenlik.prgtur için).
   *  Birden fazla pusula programı seçildiğinde her .bak'ı bir programa bağlamak için
   *  kullanıcı UI'da seçer. Tek program varsa wizard otomatik atar. null ise client
   *  taraf eski olabilir → backend ilk pusula servisinin koduna fallback yapar. */
  programServiceId?: number | null
  /** "bak" → RESTORE · "attach" → kopyala + CREATE DATABASE FOR ATTACH.
   *  Eski client'larda olmayabilir → "bak" default. */
  kind?:        "bak" | "attach"
  /** kind="attach" için ham .mdf dosya adı (backupFolderPath altında). */
  mdfFileName?: string
  /** kind="attach" için ham .ldf dosya adı — yoksa ATTACH_REBUILD_LOG. */
  ldfFileName?: string
  /** Otomatik yedeklemeye dahil mi (`guvenlik.YedekAl`). Eski client'larda yok → true. */
  yedekAl?:     boolean
}

interface RunPayload {
  /** AD sunucusu — OU/grup/kullanıcı adımları (1-4) bu agent'a gider. */
  serverId:         string
  /** Windows/RDP sunucusu — pusula-program klasör/copy/param/NTFS adımları bu agent'a gider. */
  windowsServerId?: string
  /** IIS sunucusu — iis-site klasör/copy/port/config/site adımları bu agent'a gider. */
  iisServerId?:     string
  /** Depo sunucusu — D:\Resimler\<firmaId> klasörü + NTFS yetkisi bu agent'a gider. */
  depoServerId?:    string
  firmaId:          string
  firmaName:        string
  users:            RunUser[]
  /** Opsiyonel: hizmet kopyalama adımları. Boş ise sadece AD akışı çalışır. */
  services?:        RunService[]

  /* ── 4. adım: SQL ─────────────────────────────────────────────
   * Tamamen opsiyonel. `sqlServerId` yoksa SQL akışı tamamen atlanır.
   * Aksi halde seçili mod'a göre yedekten yükleme veya demo DB restore'u
   * çalıştırılır ve (addToSirketDb ? → sirket.dbo.guvenlik) kayıt eklenir.
   */
  sqlServerId?:      string
  /** 0: Yedekten Yükle  1: Demo Veritabanı */
  sqlMode?:          0 | 1
  /** Mode 0 için: backupFolderPath altındaki seçili .bak dosyaları */
  backupFolderPath?: string
  backupFiles?:      RunBackupFile[]
  /** Mode 1 için: seçili demo DB id'leri (DemoDatabases tablosundan okunacak) */
  selectedDemoDbIds?: number[]
  /** Mode 1 için: sihirbazda düzenlenen hedef DB adı (firma öneki YOK) ve
   *  yedek kutusu. Yol/kaynak yine sunucudaki katalogdan okunur; buradan
   *  yalnız ad + YedekAl alınır. Eski client'larda yok → katalog adı + true. */
  demoAyarlari?:     Array<{ id: number; dataName: string; yedekAl: boolean }>
  /** Her iki mod için: firma ID prefix ekle (`{firmaId}_{dbName}`) */
  addFirmaPrefix?:   boolean
  /** sirket.dbo.guvenlik tablosuna kayıt eklensin mi */
  addToSirketDb?:    boolean
  /** true → depo (resim klasörü / NTFS / desktop.ini) adımları atlanır.
   *  Tekil kullanıcı ekleme gibi depo ile ilgisiz akışlar için. */
  skipDepo?:         boolean
  /** Hedef DB adı → guvenlik.KOD (sihirbaz SQL adımı). Verilmeyen DB'ye firma ID yazılır. */
  kodlar?:           Record<string, number>

  /* ── Pars (mobil raporlama) ────────────────────────────────────
   * Hizmetler adımında Pars hizmeti seçildiyse gelir. Hizmet config'i
   * (mobil sunucu, Ayar.mdb yolu, şifre) istemciye güvenilmeden DB'den
   * yüklenir; istemci yalnız kullanıcıları ve izinli rapor listesini verir.
   * Bağlanacak veritabanları SQL adımında restore edilenlerdir.
   */
  pars?: {
    serviceId:        number
    /** allowedReportIds: kullanıcı başına izinli raporlar (Pars'ta yetki kullanıcı başına);
     *  verilmezse üstteki ortak liste geçerli (eski istemciler). */
    users:            { username: string; password: string; admin: boolean; allowedReportIds?: number[] }[]
    allowedReportIds: number[]
    /** SQL adımı çalışmadığında (firma detayından ekleme) bağlanacak mevcut DB'ler.
     *  Restore edilenlerle birleştirilir. */
    datalar?:         { data: string; tipId: number }[]
  }
}

interface AgentTarget {
  ip:        string
  port:      number
  apiKey:    string
}

interface SqlTarget {
  id:       string
  name:     string
  ip:       string
  username: string
  password: string
  /** SQL sunucusunun PusulaAgent'ı — ATTACH için .mdf/.ldf kopyalamada kullanılır. */
  agent:    AgentTarget | null
}

/** Demo DB tablosundan run akışı için gerekli alanlar. */
interface DemoDbRow {
  Id:           number
  Name:         string
  DataName:     string
  LocationType: string
  LocationPath: string | null
}

export async function POST(req: NextRequest) {
  let payload: RunPayload
  try {
    payload = (await req.json()) as RunPayload
  } catch {
    return new Response(JSON.stringify({ error: "Geçersiz JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!payload.firmaId || !Array.isArray(payload.users)) {
    return new Response(JSON.stringify({ error: "firmaId, users zorunlu" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  /* Kullanıcı adları AD kuralına uymuyorsa (20 karakter, yasak karakter)
   * hiçbir adıma başlama — OU/grup açılıp kullanıcıda yarıda kalmasın.  */
  const adHatalari = payload.users
    .map((u) => {
      const tam = `${payload.firmaId}.${(u.username ?? "").trim()}`
      const h = adKullaniciAdiHatasi(tam)
      return h ? `${tam}: ${h}` : null
    })
    .filter(Boolean)
  if (adHatalari.length) {
    return new Response(JSON.stringify({ error: `Geçersiz kullanıcı adı — ${adHatalari.join("; ")}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  /* Yalnız Pars: kullanıcı yok, Pars dışında hizmet yok, SQL işi yok.
   * AD'ye (OU / grup / senkron) hiç dokunulmaz; AD sunucusu istenmez. */
  const parsOnly =
    payload.users.length === 0 &&
    (payload.services ?? []).length > 0 &&
    (payload.services ?? []).every((s) => s.type === "pars") &&
    !payload.sqlServerId

  /* AD adımları (Firmalar OU / firma OU / güvenlik grubu / kullanıcılar) yalnız
   * gerektiğinde: kullanıcı açılıyorsa, program klasörü kuruluyorsa (NTFS yetkisi
   * firma grubuna verilir) ya da SQL işi varsa (sihirbaz). Firma detayından yalnız
   * API / Resim hizmeti eklerken grup zaten var, bu adımlar gereksizdi (30.10.2026).
   * AD sunucusu yine istenir: Resim sitesinin "Connect as" kimliği onun kaydından. */
  const adAdimlari =
    !parsOnly &&
    (payload.users.length > 0 ||
      (payload.services ?? []).some((s) => s.type === "pusula-program") ||
      !!payload.sqlServerId)

  if (!payload.serverId && !parsOnly) {
    return new Response(JSON.stringify({ error: "serverId zorunlu" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // AD sunucusu (1-4. adımlar) — yalnız Pars akışında yok
  let adAgent: AgentTarget | null = null
  if (payload.serverId) {
    const adSrv = await serverAgentById(payload.serverId)
    if (!adSrv || !adSrv.api_key || !adSrv.agent_port) {
      return new Response(JSON.stringify({ error: "AD sunucu bilgisi eksik (ApiKey/AgentPort)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    adAgent = { ip: adSrv.ip, port: adSrv.agent_port, apiKey: adSrv.api_key }
  }

  // Hizmetleri tipine göre ayır
  const services       = payload.services ?? []
  /** Yeni Hizmet penceresi (mevcut firmaya hizmet ekleme) — kullanıcı listesi hep boş gelir.
   *  Bu akışta API hizmetlerinin Users.xml kullanıcıları yalnız pencerede girilenlerdir (7d). */
  const hizmetEkleme   = (payload.users ?? []).length === 0
  const pusulaServices = services.filter((s) => s.type === "pusula-program")
  const iisServices    = services.filter((s) => s.type === "iis-site")
  const resimServices  = services.filter((s) => s.type === "iis-resim")

  // Windows/RDP sunucusu — yalnızca pusula-program varsa zorunlu
  let winAgent: AgentTarget | null = null
  if (pusulaServices.length > 0) {
    if (!payload.windowsServerId) {
      return new Response(JSON.stringify({ error: "Pusula programları için windowsServerId zorunlu" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    const winSrv = await serverAgentById(payload.windowsServerId)
    if (!winSrv || !winSrv.api_key || !winSrv.agent_port) {
      return new Response(JSON.stringify({ error: "Windows sunucu bilgisi eksik (ApiKey/AgentPort)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    winAgent = {
      ip:     winSrv.ip,
      port:   winSrv.agent_port,
      apiKey: winSrv.api_key,
    }
  }

  // IIS sunucusu — yalnızca iis-site / iis-resim varsa zorunlu
  let iisAgent: AgentTarget | null = null
  /** IIS sunucusunun dış adresi (DNS, yoksa IP) — Pusula X EntegrasyonResimYolu için */
  let iisDisAdres: string | null = null
  if (iisServices.length > 0 || resimServices.length > 0) {
    if (!payload.iisServerId) {
      return new Response(JSON.stringify({ error: "IIS hizmetleri için iisServerId zorunlu" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    const iisSrv = await serverAgentById(payload.iisServerId)
    if (!iisSrv || !iisSrv.api_key || !iisSrv.agent_port) {
      return new Response(JSON.stringify({ error: "IIS sunucu bilgisi eksik (ApiKey/AgentPort)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    iisAgent = {
      ip:     iisSrv.ip,
      port:   iisSrv.agent_port,
      apiKey: iisSrv.api_key,
    }
    iisDisAdres = iisSrv.dns?.trim() || iisSrv.ip
  }

  // Depo sunucusu — sihirbazda Pusula programı seçilmişse payload.depoServerId
  // gelir; aksi halde sistemdeki ilk Role='Depo' sunucusu fallback olarak kullanılır.
  let depoAgent: AgentTarget | null = null
  let depoSrv: { ip: string; agent_port: number | null; api_key: string | null } | null = null
  if (!payload.skipDepo) {
    if (payload.depoServerId) {
      depoSrv = await serverAgentById(payload.depoServerId)
    } else {
      const fileSrvs = await serversWithRole("File", "ip, agent_port, api_key")
      depoSrv = (fileSrvs[0] as unknown as typeof depoSrv) ?? null
    }
  }
  if (depoSrv && depoSrv.agent_port && depoSrv.api_key) {
    depoAgent = {
      ip:     depoSrv.ip,
      port:   depoSrv.agent_port,
      apiKey: depoSrv.api_key,
    }
  }

  // Resim paylaşımı — site Depo'daki \\<depo>\Resimler\<firmaId> paylaşımını
  // yayınlar. Paylaşıma DOMAIN hesabıyla ("Connect as") erişilir: kullanıcı ve
  // şifre AD sunucusunun kaydından (pusuladc\alusup) — Depo kaydındaki şifre
  // domain şifresiyle aynı değil, onunla IIS 500 veriyor. Depo'dan yalnız IP alınır.
  // skipDepo'dan bağımsız: firma detayından yalnız Resim eklenirken klasör
  // adımları atlanır ama paylaşımın adresi ve kimliği yine gerekir.
  let resimDepo: { ip: string; user: string; password: string } | null = null
  if (resimServices.length > 0) {
    const sb = await getSupabaseServer()
    let depoIp: string | null = null
    if (payload.depoServerId) {
      const { data } = await sb.schema("hub").from("servers").select("ip").eq("id", payload.depoServerId).maybeSingle()
      depoIp = (data as { ip: string } | null)?.ip ?? null
    } else {
      depoIp = ((await serversWithRole("File", "ip"))[0] as { ip?: string } | undefined)?.ip ?? null
    }
    type Cred = { username: string | null; password: string | null; domain: string | null }
    const { data: adData } = await sb.schema("hub").from("servers")
      .select("username, password, domain").eq("id", payload.serverId).maybeSingle()
    const ad = adData as Cred | null
    if (!depoIp) {
      return new Response(JSON.stringify({ error: "Resim hizmeti için Depo sunucusu gerekli (yayınlanan paylaşım orada)." }),
        { status: 400, headers: { "Content-Type": "application/json" } })
    }
    if (!ad?.username || !ad.password) {
      return new Response(JSON.stringify({
        error: "Resim hizmeti için AD sunucusunun kullanıcı adı/şifresi kayıtlı olmalı (paylaşıma bu domain hesabıyla 'Connect as' erişilir). Sunucu ayarlarından ekleyin.",
      }), { status: 400, headers: { "Content-Type": "application/json" } })
    }
    const pw = decrypt(ad.password)
    if (!pw) {
      return new Response(JSON.stringify({ error: "AD şifresi çözülemedi. ENCRYPTION_KEY'i kontrol edin." }),
        { status: 500, headers: { "Content-Type": "application/json" } })
    }
    // Mevcut RESIM siteleri "pusuladc\alusup" kullanıyor — domain kısa adı + kullanıcı
    const domainShort = (ad.domain ?? "").split(".")[0]?.trim() ?? ""
    const user = ad.username.includes("\\") || !domainShort ? ad.username : `${domainShort}\\${ad.username}`
    resimDepo = { ip: depoIp, user, password: pw }
  }

  // SQL sunucusu — 4. adımda seçildiyse. Tamamen opsiyonel; seçilmemişse
  // SQL akışı sessizce atlanır.
  let sqlTarget: SqlTarget | null = null
  let demoDbsForRun: DemoDbRow[] = []
  const runSqlMode     = payload.sqlMode === 1 ? 1 : 0
  const runAddPrefix   = payload.addFirmaPrefix !== false
  const runAddSirket   = payload.addToSirketDb === true
  const runBackupFiles = Array.isArray(payload.backupFiles) ? payload.backupFiles : []
  const runBackupFolder = (payload.backupFolderPath ?? "").trim().replace(/[\\/]+$/, "")
  const runDemoDbIds   = Array.isArray(payload.selectedDemoDbIds) ? payload.selectedDemoDbIds : []
  // Demo DB başına istemci ayarı (hedef ad + YedekAl). Ad SQL-güvenli değilse
  // yok sayılır → katalog adına düşülür.
  const runDemoAyarlari = new Map<number, { dataName: string | null; yedekAl: boolean }>()
  if (Array.isArray(payload.demoAyarlari)) {
    for (const a of payload.demoAyarlari as unknown[]) {
      if (!a || typeof a !== "object") continue
      const { id, dataName, yedekAl } = a as { id?: unknown; dataName?: unknown; yedekAl?: unknown }
      if (typeof id !== "number" || !Number.isFinite(id)) continue
      const ad = typeof dataName === "string" ? dataName.trim() : ""
      runDemoAyarlari.set(id, {
        dataName: /^[A-Za-z0-9_]+$/.test(ad) ? ad : null,
        yedekAl:  typeof yedekAl === "boolean" ? yedekAl : true,
      })
    }
  }

  const hasSqlWork =
    !!payload.sqlServerId &&
    ((runSqlMode === 0 && runBackupFiles.length > 0) ||
     (runSqlMode === 1 && runDemoDbIds.length > 0))

  if (hasSqlWork) {
    const row = await sqlServerById(payload.sqlServerId!)
    if (!row) {
      return new Response(JSON.stringify({ error: "SQL sunucusu bulunamadı veya SQL rolü atanmamış" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    if (!row.sql_username || !row.sql_password) {
      return new Response(JSON.stringify({
        error: `${row.name} sunucusu için SA kullanıcı adı/şifresi tanımlanmamış. Sunucu ayarlarından ekleyin.`,
      }), { status: 400, headers: { "Content-Type": "application/json" } })
    }
    const decrypted = decrypt(row.sql_password)
    if (!decrypted) {
      return new Response(JSON.stringify({
        error: "SA şifresi çözülemedi. ENCRYPTION_KEY'i kontrol edin.",
      }), { status: 500, headers: { "Content-Type": "application/json" } })
    }
    sqlTarget = {
      id:       row.id,
      name:     row.name,
      ip:       row.ip,
      username: row.sql_username,
      password: decrypted,
      // ATTACH akışı için SQL sunucusunun agent'ı (varsa). Yoksa attach
      // adımında net hata verilir; .bak restore agent gerektirmez.
      agent: (row.api_key && row.agent_port)
        ? { ip: row.ip, port: row.agent_port, apiKey: row.api_key }
        : null,
    }

    // Mode 1: demo DB bilgilerini DB'den çek (client'a güvenmiyoruz; kaynak/yol
    // sunucu tarafında gerçek olmalı).
    if (runSqlMode === 1 && runDemoDbIds.length > 0) {
      const ids = runDemoDbIds.map((id) => Number(id)).filter((n) => Number.isFinite(n))
      if (ids.length > 0) {
        const sb = await getSupabaseServer()
        const { data: rows } = await sb.schema("hub").from("demo_databases")
          .select("id, name, data_name, location_type, location_path")
          .eq("is_active", true).in("id", ids)
        demoDbsForRun = ((rows ?? []) as { id: number; name: string; data_name: string; location_type: string; location_path: string | null }[])
          .map((r) => ({ Id: r.id, Name: r.name, DataName: r.data_name, LocationType: r.location_type, LocationPath: r.location_path }))
      }
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      const runStep = async (
        agent:   AgentTarget,
        stepId:  string,
        label:   string,
        command: string,
      ): Promise<boolean> => {
        send("step", { stepId, label, status: "running" })

        const result = await execOnAgent(agent.ip, agent.port, agent.apiKey, command, 60)

        // PowerShell hata: exitCode != 0 VEYA stderr doluysa
        const stderr = (result.stderr ?? "").trim()
        if (result.exitCode !== 0 || stderr) {
          send("step", {
            stepId,
            label,
            status: "error",
            error:  stderr || result.stdout || `exit ${result.exitCode}`,
          })
          return false
        }

        send("step", {
          stepId,
          label,
          status: "done",
          output: (result.stdout ?? "").trim(),
        })
        return true
      }

      /**
       * Canlı IIS port envanteri — sayaç (WizardPortAssignments) dışında elle
       * kurulmuş siteler de port kullanıyor olabilir. Tahsis edilen portun
       * IIS'te gerçekten boş olduğunu garantiler. IIS ve Resim blokları
       * paylaşır; bir kez taranır.
       */
      let livePortsCache: Set<number> | null = null
      const scanLivePorts = async (agent: AgentTarget): Promise<Set<number>> => {
        if (livePortsCache) return livePortsCache
        const liveUsedPorts = new Set<number>()
        send("step", { stepId: "iis_ports_scan", label: "IIS port envanteri alınıyor", status: "running" })
        const portRes = await execOnAgent(agent.ip, agent.port, agent.apiKey, buildListIisUsedPorts(), 60)
        const m = (portRes.stdout ?? "").match(/PORTS:([\d,]*)/)
        if (portRes.exitCode === 0 && m) {
          for (const seg of m[1].split(",")) {
            const n = parseInt(seg, 10)
            if (Number.isFinite(n)) liveUsedPorts.add(n)
          }
          send("step", {
            stepId: "iis_ports_scan",
            label:  "IIS port envanteri alınıyor",
            status: "done",
            output: `${liveUsedPorts.size} port kullanımda: ${[...liveUsedPorts].sort((a, b) => a - b).join(", ")}`,
          })
        } else {
          // Canlı envanter alınamadı — kurulumu kesme ama net uyar.
          // Sayaç (WizardPortAssignments) yine de devrede.
          send("step", {
            stepId: "iis_ports_scan",
            label:  "IIS port envanteri alınamadı — yalnızca sayaç kullanılacak",
            status: "done",
            output: (portRes.stderr || portRes.stdout || `exit ${portRes.exitCode}`).slice(0, 200),
          })
        }
        livePortsCache = liveUsedPorts
        return liveUsedPorts
      }

      /** SQL bloğunda kullanılacak — async task'ı sarmalar, hata → step error. */
      const runSqlStep = async (
        stepId: string,
        label:  string,
        fn:     () => Promise<string | void>,
      ): Promise<boolean> => {
        send("step", { stepId, label, status: "running" })
        try {
          const output = await fn()
          send("step", {
            stepId,
            label,
            status: "done",
            output: typeof output === "string" ? output : undefined,
          })
          return true
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          send("step", { stepId, label, status: "error", error: msg })
          return false
        }
      }

      try {
        // ── 1-4) AD adımları → AD agent (yalnız Pars akışında atlanır) ──
        let createdCount = 0
        // Bilkar (alt bayi) müşterisi mi — CRM temsilci/ek temsilci. Bilkar
        // kullanıcısı firma grubuna ve masaüstüne eklenir (aşağıda).
        const bilkar = adAdimlari && (await bilkarFirmasiMi(payload.firmaId).catch(() => false))
        if (adAgent && adAdimlari) {
        // 1) Firmalar root OU
        if (!(await runStep(
          adAgent,
          "ou_root",
          "'Firmalar' OU kontrolü",
          buildEnsureFirmalarOu(),
        ))) { controller.close(); return }

        // 2) Firma OU
        if (!(await runStep(
          adAgent,
          "ou_firma",
          `OU oluşturuluyor: Firmalar\\${payload.firmaId}`,
          buildEnsureFirmaOu(payload.firmaId),
        ))) { controller.close(); return }

        // 3) Güvenlik grubu
        if (!(await runStep(
          adAgent,
          "group",
          `Güvenlik grubu: ${payload.firmaId}_users`,
          buildEnsureGroup(payload.firmaId),
        ))) { controller.close(); return }

        // 4) Kullanıcılar (her biri için: oluştur + gruba ekle)
        for (const u of payload.users) {
          const fullUsername = `${payload.firmaId}.${u.username.trim()}`

          const userOk = await runStep(
            adAgent,
            `user_${u.username}`,
            `Kullanıcı oluşturuluyor: ${fullUsername}`,
            buildCreateUser(payload.firmaId, {
              username:    fullUsername,
              password:    u.password,
              displayName: u.displayName || fullUsername,
              email:       u.email,
              phone:       u.phone,
              office:      payload.firmaName,
            }),
          )
          if (!userOk) { controller.close(); return }

          const memberOk = await runStep(
            adAgent,
            `member_${u.username}`,
            `Gruba ekleniyor: ${fullUsername} → ${payload.firmaId}_users`,
            buildAddGroupMember(payload.firmaId, fullUsername),
          )
          if (!memberOk) { controller.close(); return }

          /*  Office yetkisi — yeni kullanıcılara VARSAYILAN olarak veriliyor.
           *  Kritik değil: başarısız olursa kurulum durmaz, yetki firma
           *  detayındaki kullanıcı menüsünden sonradan verilebilir. Bu yüzden
           *  dönüş değeri kontrol edilmiyor — hata adım olarak raporlanır.   */
          await runStep(
            adAgent,
            `office_${u.username}`,
            `Office yetkisi veriliyor: ${fullUsername} → ${OFFICE_GRUBU}`,
            buildAddOfficeMember(fullUsername),
          )

          // Şifreyi encrypted olarak sakla — firma detayındaki "Erişim
          // Bilgileri" modal'ında okunabilsin. Hata kurulumu bozmasın.
          try {
            await saveCompanyUserPassword(payload.firmaId, fullUsername, u.password)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            send("step", {
              stepId: `cred_save_${u.username}`,
              label:  `Şifre saklama atlandı: ${fullUsername}`,
              status: "error",
              error:  msg,
            })
          }

          createdCount++
        }

        // Bilkar müşterisi → Bilkar kullanıcıları firma grubuna (C:\MUSTERI\<firma>
        // NTFS yetkisi gruptan gelir). Kritik değil, hata kurulumu durdurmaz.
        if (bilkar) {
          for (const kullanici of BILKAR_KULLANICILARI) {
            await runStep(
              adAgent,
              `bilkar_member_${kullanici}`,
              `Bilkar: ${kullanici} → ${payload.firmaId}_users`,
              buildAddGroupMember(payload.firmaId, kullanici),
            )
          }
        }
        } // adAgent && adAdimlari

        // ── 4b) Depo sunucusu — resim klasörü (opsiyonel, non-critical) ──
        if (depoAgent) {
          const depoPath = `D:\\Resimler\\${payload.firmaId}`
          // Klasör oluştur — hata olursa kurulum durmaz
          await runStep(
            depoAgent,
            "depo_dir",
            `Depo: resim klasörü oluşturuluyor: ${depoPath}`,
            buildCreateDir(depoPath),
          )
          // NTFS yetkileri — hata olursa kurulum durmaz
          await runStep(
            depoAgent,
            "depo_ntfs",
            `Depo: NTFS yetkileri: ${depoPath} → ${payload.firmaId}_users`,
            buildSetNtfsPermissions(depoPath, `${payload.firmaId}_users`),
          )
          // desktop.ini — klasör tooltip'i firma adı, Gezgin'de görünen ad "<firmaNo> - <firma adı>"
          // (klasörün gerçek adı firma no kalır: SQL resim yolu, IIS ve kısayollar bunu kullanıyor)
          await runStep(
            depoAgent,
            "depo_tooltip",
            `Depo: klasör açıklaması (desktop.ini): ${payload.firmaId} - ${payload.firmaName}`,
            buildWriteDesktopIni(depoPath, payload.firmaName, `${payload.firmaId} - ${payload.firmaName}`),
          )
        } else if (pusulaServices.length > 0) {
          send("step", {
            stepId: "depo_skip",
            label:  "Depo: resim klasörü atlandı — Depo sunucusu seçilmedi",
            status: "error",
            error:  "D:\\Resimler\\<firmaId> klasörü oluşturulamadı. Hizmetler adımında bir Depo sunucusu seçin veya /servers sayfasından bir sunucuya 'Depo' rolü atayın.",
          })
        }

        // ── 5) Pusula programları → Windows/RDP agent ───────────────
        let servicesInstalled = 0
        const firmaRoot = `C:\\MUSTERI\\${payload.firmaId}`

        if (pusulaServices.length > 0 && winAgent) {
          // 5a) Firma root klasörü
          if (!(await runStep(
            winAgent,
            "firma_root",
            `Firma klasörü oluşturuluyor: ${firmaRoot}`,
            buildCreateDir(firmaRoot),
          ))) { controller.close(); return }

          // 5b) Her hizmet: klasör + kopya + (varsa) parametre TXT
          for (const s of pusulaServices) {
            const cfg = s.config as PusulaProgramConfig | null
            if (!cfg || !cfg.sourceFolderPath) {
              send("step", {
                stepId: `svc_skip_${s.id}`,
                label:  `Hizmet config eksik: ${s.name}`,
                status: "error",
                error:  "config.sourceFolderPath tanımlı değil",
              })
              controller.close()
              return
            }

            const hizmetPath = `${firmaRoot}\\${s.name}`

            if (!(await runStep(
              winAgent,
              `svc_dir_${s.id}`,
              `Hizmet klasörü: ${s.name}`,
              buildCreateDir(hizmetPath),
            ))) { controller.close(); return }

            if (!(await runStep(
              winAgent,
              `svc_copy_${s.id}`,
              `Dosyalar kopyalanıyor: ${s.name}`,
              buildCopyFolder(cfg.sourceFolderPath, hizmetPath),
            ))) { controller.close(); return }

            if (cfg.paramFileName && cfg.paramFileName.trim()) {
              const paramFile = `${hizmetPath}\\${cfg.paramFileName.trim()}`
              // Perakende (programCode 909) istisnası: data kodu [DATA KODU]
              // satırı yerine <DATAKODU> bloğuyla yazılır. Değer yine firmaId.
              const isPerakende = (cfg.programCode ?? "").trim() === "909"
              // Toptan/Üretim/StokCari: programın akşam yedeği kapalı (lib/program-yedek)
              const aksamYedekKapat = AKSAM_YEDEK_PROGRAMLARI.has((cfg.programCode ?? "").trim())
              // Parametre TXT adımı kritik değil — hata devam ettirir
              await runStep(
                winAgent,
                `svc_param_${s.id}`,
                isPerakende
                  ? `Parametre güncelleniyor (Perakende · DATAKODU): ${cfg.paramFileName}`
                  : `Parametre güncelleniyor (DATA KODU${aksamYedekKapat ? " · akşam yedeği kapalı" : ""}): ${cfg.paramFileName}`,
                isPerakende
                  ? buildUpdateDataKoduXml(paramFile, payload.firmaId)
                  : buildUpdateParamTxt(paramFile, payload.firmaId, aksamYedekKapat),
              )
            }

            // Perakende: exe'nin yanına boş yedeksorma.txt → program yedek sormaz (lib/program-yedek).
            // Yalnız Aurum_SQL.exe olan klasöre yazılır; Pusula X aynı kodu taşısa da exe'si farklı.
            if ((cfg.programCode ?? "").trim() === "909") {
              await runStep(
                winAgent,
                `svc_yedeksorma_${s.id}`,
                `yedeksorma.txt (Perakende): ${s.name}`,
                buildYedekSormaTxt(hizmetPath),
              )
            }

            // firmano.bak — eskiden Firmano.exe ile elle üretiliyordu.
            // Sürücünün birim seri numarasına bağlı olduğu için hedef
            // sunucuda üretilmeli; program bu dosya olmadan açılmıyor.
            if (!(await runStep(
              winAgent,
              `svc_firmano_${s.id}`,
              `firmano.bak yazılıyor: ${s.name}`,
              buildWriteFirmanoBak(hizmetPath, payload.firmaId),
            ))) { controller.close(); return }

            // Pusula X klasörüne boş file.xml (yalnız PusulaX.exe varsa; varsa dokunulmaz).
            // Kritik değil — hata kurulumu durdurmaz.
            await runStep(
              winAgent,
              `svc_filexml_${s.id}`,
              `file.xml (Pusula X): ${s.name}`,
              buildPusulaXFileXml(hizmetPath),
            )

            servicesInstalled++
          }

          // 5c) NTFS yetkileri — firma root'una tek seferde
          if (!(await runStep(
            winAgent,
            "ntfs",
            `NTFS yetkileri: ${firmaRoot} → ${payload.firmaId}_users`,
            buildSetNtfsPermissions(firmaRoot, `${payload.firmaId}_users`),
          ))) { controller.close(); return }

          // 5c-2) desktop.ini — C:\MUSTERI altında klasörler firma ID'siyle
          // duruyor; üzerine gelince firma adı görünsün (Depo'daki Resimler ve
          // Eski Datalar klasörleriyle aynı). Kritik değil, hata devam ettirir.
          await runStep(
            winAgent,
            "firma_root_tooltip",
            `Firma klasörü açıklaması (desktop.ini): ${payload.firmaName}`,
            buildWriteDesktopIni(firmaRoot, payload.firmaName, `${payload.firmaId} - ${payload.firmaName}`),
          )

          // 5d) Masaüstü MUSTERILER klasörü + kısayollar (non-critical, hata devam ettirir)
          // Sadece Administrator masaüstüne — Public\Desktop tüm kullanıcılara yansırdı.
          // Klasör adı "<firmaNo> - <firma adı>" (07.10.2026) — masaüstünde firma numarasıyla sıralı/aranır
          const safeFirmaName    = sanitizeWindowsName(`${payload.firmaId} - ${payload.firmaName}`) || payload.firmaId
          const mustelierSubdir  = `C:\\Users\\Administrator\\Desktop\\MUSTERILER\\${safeFirmaName}`

          await runStep(
            winAgent,
            "desktop_dir",
            `Masaüstü: MUSTERILER\\${safeFirmaName} klasörü`,
            buildCreateDir(mustelierSubdir),
          )

          // Klasör adı firma adı olduğu için tooltip'te firma ID'si gösterilir
          // (Depo'daki Resimler klasörünün tersi: orada klasör ID, tooltip ad).
          await runStep(
            winAgent,
            "desktop_ini",
            `Masaüstü: klasör açıklaması → ${payload.firmaId}`,
            buildWriteDesktopIni(mustelierSubdir, payload.firmaId),
          )

          // Her pusula servisi için exe kısayolu
          for (const s of pusulaServices) {
            const cfg = s.config as PusulaProgramConfig | null
            const exeName = cfg?.exeName?.trim() ?? ""
            if (!exeName) continue

            const lnkName     = sanitizeWindowsName(s.name)
            const shortcutPath = `${mustelierSubdir}\\${lnkName}.lnk`
            const targetPath   = `${firmaRoot}\\${s.name}\\${exeName}`

            await runStep(
              winAgent,
              `shortcut_exe_${s.id}`,
              `Kısayol: ${s.name} → ${exeName}`,
              buildCreateShortcut(shortcutPath, targetPath),
            )
          }

          // Resimler kısayolu → Depo sunucusundaki Resimler SMB share'i
          // (D$ admin share değil — paylaşılan klasör adı doğrudan 'Resimler')
          if (depoAgent) {
            const resimlerTarget = `\\\\${depoAgent.ip}\\Resimler\\${payload.firmaId}`
            const resimlerLnk    = `${mustelierSubdir}\\Resimler.lnk`

            await runStep(
              winAgent,
              "shortcut_resim",
              `Kısayol: Resimler → Depo (${depoAgent.ip})`,
              buildCreateShortcut(resimlerLnk, resimlerTarget),
            )
          }

          // Bilkar müşterisi → aynı klasör Bilkar kullanıcılarının masaüstüne de
          // (onların MUSTERILER'inde yalnız kendi müşterileri olur). Kullanıcı bu
          // sunucuda hiç oturum açmadıysa profil yok → SKIPPED, elle kopyalanır.
          if (bilkar) {
            for (const kullanici of BILKAR_KULLANICILARI) {
              await runStep(
                winAgent,
                `bilkar_desktop_${kullanici}`,
                `Bilkar masaüstü (${kullanici}): MUSTERILER\\${safeFirmaName}`,
                buildCopyDesktopFolderToUser(mustelierSubdir, bilkarMasaustu(kullanici)),
              )
            }
          }
        }

        // ── 6) IIS siteleri → IIS agent ─────────────────────────────
        // Users.xml patch'i SQL restore'dan sonra çalışır — bu yüzden
        // burada her başarılı IIS hizmetinin destPath'ini topluyoruz.
        const installedIisServices: Array<{
          id: number; name: string; destPath: string; keepUsers: boolean
          /** Şablon klasörü (cfg.sourceFolderPath) */
          sablonPath: string
          /** Web.config bağlantı dizesi sihirbazın SQL kullanıcısıyla yazıldı */
          webSql: boolean
          /** Users.xml SQL restore sonrası yazıldı */
          usersXml: boolean
          /** Elle girilen uygulama kullanıcısı — 7d'de Users.xml'e yazılır */
          appUser?: { username: string; password: string }
          /** Sihirbaz API adımı — Users.xml kullanıcıları ve datası (verilmezse eski davranış: firma kullanıcıları + tüm DB'ler) */
          apiUsers?: { username: string; password: string }[]
          apiDbler?: string[]
        }> = []

        if (iisServices.length > 0 && iisAgent) {
          // 6a) Firma root klasörü — C:\Pusula\Service\<firmaKod>
          const iisFirmaRoot = `C:\\Pusula\\Service\\${payload.firmaId}`
          if (!(await runStep(
            iisAgent,
            "iis_firma_root",
            `IIS firma klasörü oluşturuluyor: ${iisFirmaRoot}`,
            buildCreateDir(iisFirmaRoot),
          ))) { controller.close(); return }

          // 6a.5) Canlı IIS port envanteri — bkz. scanLivePorts
          const liveUsedPorts = await scanLivePorts(iisAgent)

          // 6a.6) Kullanılan site adları — aynı hizmet firmaya ikinci kez
          // kurulursa site ve klasör _2, _3 ekiyle ayrı açılır. Canlı IIS +
          // firmanın port kayıtları (Türkçe adlar konsoldan bozuk gelebilir).
          const kullanilanSiteler = new Set<string>()
          {
            const r = await execOnAgent(iisAgent.ip, iisAgent.port, iisAgent.apiKey, buildListIisSiteNames(), 60)
            const m = (r.stdout ?? "").match(/SITES:(.*)/)
            if (m) for (const ad of m[1].split("|")) if (ad.trim()) kullanilanSiteler.add(ad.trim().toLowerCase())
            const { data: atamalar } = await (await getSupabaseServer()).schema("hub").from("wizard_port_assignments")
              .select("site_name").eq("company_id", payload.firmaId)
            for (const a of (atamalar ?? []) as { site_name: string | null }[]) {
              if (a.site_name?.trim()) kullanilanSiteler.add(a.site_name.trim().toLowerCase())
            }
          }

          for (const s of iisServices) {
            const cfg = s.config as IisSiteConfig | null
            if (!cfg) {
              send("step", {
                stepId: `svc_skip_${s.id}`,
                label:  `Hizmet config eksik: ${s.name}`,
                status: "error",
                error:  "iis-site config tanımlı değil",
              })
              controller.close()
              return
            }

            // siteNamePattern opsiyonel — yoksa "{firmaKod}_<servis adı>".
            // Firma kodu BAŞTA: IIS site listesi ada göre sıralandığı için aynı
            // firmanın siteleri yan yana geliyor (4646_RESIM, 4646_Pusula MOBIL…).
            const tabanSiteAdi = expandPattern(
              cfg.siteNamePattern && cfg.siteNamePattern.trim()
                ? cfg.siteNamePattern
                : `{firmaKod}_${s.name}`,
              payload.firmaId,
            )
            // Ad doluysa _2, _3… — klasör de aynı eki alır, yoksa ikinci kurulum
            // ilkinin klasörünü ezip aynı siteye binding ekliyordu.
            const siteName = benzersizSiteAdi(tabanSiteAdi, kullanilanSiteler)
            kullanilanSiteler.add(siteName.toLowerCase())
            const ek = siteName.slice(tabanSiteAdi.length)
            // IIS hedef yolu: C:\Pusula\Service\<firmaKod>\<serviceName>[_n]
            const destPath = `${iisFirmaRoot}\\${sanitizeWindowsName(s.name)}${ek}`

            // i) Hedef klasör
            if (!(await runStep(
              iisAgent,
              `iis_dir_${s.id}`,
              `IIS hedef klasörü: ${destPath}`,
              buildCreateDir(destPath),
            ))) { controller.close(); return }

            // ii) Robocopy kaynak → hedef
            if (!(await runStep(
              iisAgent,
              `iis_copy_${s.id}`,
              `Dosyalar kopyalanıyor: ${s.name}`,
              buildCopyFolder(cfg.sourceFolderPath, destPath),
            ))) { controller.close(); return }

            // iii) Port ata (DB tarafında, agent çağrısı yok)
            send("step", {
              stepId: `iis_port_${s.id}`,
              label:  `Port atanıyor: ${siteName}`,
              status: "running",
            })
            const alloc = await allocatePort(cfg.portRangeId, s.id, payload.firmaId, siteName, liveUsedPorts)
            if (!alloc.ok) {
              send("step", {
                stepId: `iis_port_${s.id}`,
                label:  `Port atanıyor: ${siteName}`,
                status: "error",
                error:  alloc.error,
              })
              controller.close()
              return
            }
            send("step", {
              stepId: `iis_port_${s.id}`,
              label:  `Port atandı: ${siteName} → ${alloc.port}`,
              status: "done",
            })

            // iv) Config dosyası placeholder replace (varsa)
            if (cfg.configFileName && cfg.configFileName.trim()) {
              const configPath = `${destPath}\\${cfg.configFileName.trim()}`
              if (!(await runStep(
                iisAgent,
                `iis_cfg_${s.id}`,
                `Config güncelleniyor: ${cfg.configFileName}`,
                buildReplaceInFile(configPath, {
                  "{firmaKod}": payload.firmaId,
                  "{firmaId}":  payload.firmaId,
                  "{port}":     String(alloc.port),
                  "{siteName}": siteName,
                }),
              ))) { controller.close(); return }
            }

            // iv.b) Web.config patch — connection string (SQL IP + firma user)
            //       ve httpRuntime/@maxRequestLength = 51200.
            //       SQL parametreleri varsa connection string güncellenir;
            //       maxRequestLength her zaman uygulanır. Dosya yoksa SKIP.
            const firstUser    = payload.users[0]
            const hasSqlForCfg = !!sqlTarget && !!firstUser?.username && !!firstUser?.password
            {
              const webCfgPath = `${destPath}\\Web.config`
              if (!(await runStep(
                iisAgent,
                `iis_webcfg_${s.id}`,
                hasSqlForCfg
                  ? `Web.config güncelleniyor: ${s.name} (SQL + maxRequestLength)`
                  : `Web.config güncelleniyor: ${s.name} (maxRequestLength)`,
                buildPatchWebConfig({
                  configPath:  webCfgPath,
                  sqlIp:       hasSqlForCfg ? sqlTarget!.ip : undefined,
                  // User Id = SQL girisi (asagida sqlLoginAdi ile olusturulan,
                  // NOKTALI "4950.ertap1"). Users.xml'deki alt cizgili ad
                  // (apiKullaniciAdi) uygulama kullanicisidir, SQL'de yoktur —
                  // onu yazmak hizmeti 18456 ile dusurur.
                  sqlUserId:   hasSqlForCfg ? sqlLoginAdi(payload.firmaId, firstUser!.username) : undefined,
                  sqlPassword: hasSqlForCfg ? firstUser!.password : undefined,
                }),
              ))) { controller.close(); return }
            }

            // v) IIS sitesi oluştur + başlat
            if (!(await runStep(
              iisAgent,
              `iis_site_${s.id}`,
              `IIS sitesi: ${siteName} (port ${alloc.port})`,
              buildCreateIisSite(siteName, destPath, alloc.port),
            ))) { controller.close(); return }

            // Users.xml patch'i için listeye ekle — SQL restore sonrası işlenecek
            installedIisServices.push({
              id: s.id, name: s.name, destPath, keepUsers: cfg.usersXmlKeepUsers === true,
              sablonPath: cfg.sourceFolderPath,
              webSql: hasSqlForCfg, usersXml: false,
              appUser: s.type === "iis-site" && s.appUser?.username?.trim() && s.appUser.password
                && !apiKimlikHatasi(s.appUser.username, s.appUser.password)
                ? { username: s.appUser.username.trim(), password: s.appUser.password }
                : undefined,
              apiUsers: s.type === "iis-site" && Array.isArray(s.apiUsers)
                ? s.apiUsers
                    .map((u) => ({ username: String(u?.username ?? "").trim(), password: String(u?.password ?? "") }))
                    .filter((u) => u.username && !apiKimlikHatasi(u.username, u.password))
                : undefined,
              apiDbler: s.type === "iis-site" && Array.isArray(s.apiDbler) ? s.apiDbler.map(String) : undefined,
            })

            servicesInstalled++
          }
        }

        // ── 6b) Resim paylaşımı siteleri → IIS agent ────────────────
        // Klasör kopyalanmaz: site Depo'daki \\<depo>\Resimler\<firmaId>
        // paylaşımını yayınlar. Site önceden (elle) kurulmuşsa portu korunur —
        // dışarıdaki port yönlendirmesi o porta bağlı.
        /** Kurulan RESIM sitesinin portu — Pusula X Sabitler.ImagePort / EntegrasyonResimYolu (7. adım) */
        let resimSitePortu: number | null = null
        if (resimServices.length > 0 && iisAgent && resimDepo) {
          const liveUsedPorts = await scanLivePorts(iisAgent)
          for (const s of resimServices) {
            const cfg = s.config as IisResimConfig | null
            if (!cfg?.portRangeId) {
              send("step", {
                stepId: `svc_skip_${s.id}`,
                label:  `Hizmet config eksik: ${s.name}`,
                status: "error",
                error:  "iis-resim config'inde port aralığı tanımlı değil",
              })
              controller.close()
              return
            }

            /*  30.10.2026: firma detayından eklenirken klasör seçilebiliyor (6572: ALTINOVA/CADDE/CIGLI…).
             *  Seçilen klasör ayrı bir site olur; site adı sabit kalsaydı ikinci ekleme mevcut
             *  <firmaId>_RESIM'i bulup "zaten var" deyip geçiyordu.                               */
            const klasor = s.resimKlasor?.trim() ?? ""
            if (klasor && !resimKlasorGecerli(klasor)) {
              send("step", { stepId: `svc_skip_${s.id}`, label: `Resim klasörü geçersiz: ${klasor}`, status: "error", error: "Klasör adı yol ayırıcı veya özel karakter içeremez" })
              controller.close()
              return
            }
            const siteName = resimSiteAdi(payload.firmaId, klasor)
            const sub      = klasor || (cfg.subFolder?.trim() ?? "")
            const uncPath  = `\\\\${resimDepo.ip}\\Resimler\\${payload.firmaId}${sub ? `\\${sub}` : ""}`
            const portStep = `resim_port_${s.id}`

            // i) Port — IIS'te site varsa portu korunur; yoksa aralıktaki sıradaki
            //    port (en yüksek + 1). Sitesi olmayan eski bir kayıt (yarım kalmış
            //    deneme) yeni satır açılmadan sıradaki porta güncellenir.
            send("step", { stepId: portStep, label: `Port atanıyor: ${siteName}`, status: "running" })
            const probe = await execOnAgent(iisAgent.ip, iisAgent.port, iisAgent.apiKey, buildGetIisSitePort(siteName), 60)
            if (probe.exitCode !== 0 || !/EXISTS:|NONE/.test(probe.stdout ?? "")) {
              // Site var mı bilemiyorsak port atamayız: var olan bir siteyi
              // yeni porta taşıyıp yönlendirmeyi koparabiliriz.
              send("step", {
                stepId: portStep, label: `Port atanıyor: ${siteName}`, status: "error",
                error: `IIS'te mevcut site kontrol edilemedi: ${(probe.stderr || probe.stdout || `exit ${probe.exitCode}`).slice(0, 200)}`,
              })
              controller.close()
              return
            }
            const existingPort = Number((probe.stdout ?? "").match(/EXISTS:(\d+)/)?.[1] ?? NaN)
            const sbRes = await getSupabaseServer()
            const { data: prev } = await sbRes.schema("hub").from("wizard_port_assignments")
              .select("id, port").eq("company_id", payload.firmaId).eq("service_id", s.id).eq("site_name", siteName).limit(1).maybeSingle()
            const prevRow = prev as { id: number; port: number | null } | null

            let alloc: { ok: true; port: number } | { ok: false; error: string }
            let note = ""
            if (Number.isFinite(existingPort)) {
              alloc = await claimPort(cfg.portRangeId, s.id, payload.firmaId, existingPort, siteName)
              note  = " (site zaten vardı, portu korundu)"
            } else {
              alloc = await allocatePort(cfg.portRangeId, s.id, payload.firmaId, siteName, liveUsedPorts, "after-max", prevRow?.id)
              if (prevRow && alloc.ok && prevRow.port !== alloc.port) note = ` (eski yarım kayıt ${prevRow.port} → güncellendi)`
            }
            if (!alloc.ok) {
              send("step", { stepId: portStep, label: `Port atanıyor: ${siteName}`, status: "error", error: alloc.error })
              controller.close()
              return
            }
            send("step", { stepId: portStep, label: `Port atandı: ${siteName} → ${alloc.port}${note}`, status: "done" })

            // ii) Site + havuz + Connect as + erişim testi
            if (!(await runStep(
              iisAgent,
              `resim_site_${s.id}`,
              `Resim sitesi: ${siteName} (port ${alloc.port}) → ${uncPath}`,
              buildCreateIisResimSite({
                siteName,
                physicalPath: uncPath,
                port:         alloc.port,
                userName:     resimDepo.user,
                password:     resimDepo.password,
              }),
            ))) { controller.close(); return }
            resimSitePortu = alloc.port

            servicesInstalled++
          }
        }

        // ── 7) SQL — veritabanı restore + guvenlik insert ───────────
        let sqlRestored  = 0
        let sqlGuvenlik  = 0
        /* Pars'a bağlanacak DB'ler: başarıyla restore/attach edilenler,
         * program koduyla birlikte (Datalar.TipID buradan türer). */
        const parsDatalar: { data: string; programCode: string | null }[] = []
        if (sqlTarget) {
          // Mod 0 veya 1'e göre restore edilecek (bakPath, targetDbName, programCode) listesi
          interface RestoreTask {
            /** "bak" → RESTORE FROM DISK · "attach" → kopyala + CREATE DATABASE FOR ATTACH */
            kind:         "bak" | "attach"
            /** kind="bak": kaynak .bak yolu */
            bakPath:      string
            /** kind="attach": kaynak .mdf yolu + (varsa) .ldf yolu */
            srcMdf:       string
            srcLdf:       string | null
            dbName:       string
            /** guvenlik.srkadi için firma prefix'siz ham data/şirket adı */
            srkAdi:       string
            /** Bu DB için guvenlik kaydında kullanılacak program kodu (null → insert atlanır) */
            programCode:  string | null
            /** guvenlik.YedekAl — sihirbazda kullanıcı kapatabilir (eski yıl datası). */
            yedekAl:      boolean
            /** Data Pusula X programına mı bağlı (hizmet exe'si pusulax.exe) — Perakende de 909 kullandığı için koddan değil hizmetten */
            pusulaX:      boolean
          }
          const tasks: RestoreTask[] = []

          const prefix = runAddPrefix ? `${payload.firmaId}_` : ""

          if (runSqlMode === 0) {
            // Mod 0: her .bak için programServiceId → programCode lookup.
            // programServiceId yoksa (eski client) ilk pusula servisinin koduna fallback.
            const codeByServiceId = new Map<number, string | null>()
            for (const s of pusulaServices) {
              const cfg = s.config as PusulaProgramConfig | null
              codeByServiceId.set(s.id, cfg?.programCode?.trim() || null)
            }
            const pxHizmet = (id: number | null | undefined) => {
              const sv = id != null ? pusulaServices.find((x) => x.id === id) : pusulaServices.length === 1 ? pusulaServices[0] : undefined
              return ((sv?.config as PusulaProgramConfig | null)?.exeName ?? "").trim().toLowerCase() === "pusulax.exe"
            }
            const firstPusulaProgramCode = pusulaServices
              .map((s) => (s.config as PusulaProgramConfig | null)?.programCode ?? null)
              .find((c) => !!c) ?? null

            const joinFolder = (name: string) =>
              runBackupFolder ? `${runBackupFolder}\\${name}` : name

            for (const bf of runBackupFiles) {
              const dbName = (bf.databaseName ?? "").trim()
              if (!dbName) continue
              const programCode = bf.programServiceId != null
                ? (codeByServiceId.get(bf.programServiceId) ?? null)
                : firstPusulaProgramCode

              if (bf.kind === "attach") {
                // ATTACH: ham .mdf (+ varsa .ldf) — kopyala + CREATE DATABASE FOR ATTACH
                const mdf = (bf.mdfFileName ?? bf.fileName ?? "").trim()
                if (!mdf) continue
                const ldf = (bf.ldfFileName ?? "").trim()
                tasks.push({
                  kind:        "attach",
                  bakPath:     "",
                  srcMdf:      joinFolder(mdf),
                  srcLdf:      ldf ? joinFolder(ldf) : null,
                  dbName:      `${prefix}${dbName}`,
                  srkAdi:      dbName,
                  programCode,
                  yedekAl:     bf.yedekAl !== false,
                  pusulaX:     pxHizmet(bf.programServiceId),
                })
              } else {
                const fileName = (bf.fileName ?? "").trim()
                if (!fileName) continue
                tasks.push({
                  kind:        "bak",
                  bakPath:     joinFolder(fileName),
                  srcMdf:      "",
                  srcLdf:      null,
                  dbName:      `${prefix}${dbName}`,
                  srkAdi:      dbName,
                  programCode,
                  yedekAl:     bf.yedekAl !== false,
                  pusulaX:     pxHizmet(bf.programServiceId),
                })
              }
            }
          } else {
            // Mod 1: demo DB'lerin locationPath'inden .bak restore; programCode
            // demo DB ↔ serviceIds junction'ından ilk pusula servisinin kodu
            // Önce junction'ı tek sorguda çek
            const dbIds = demoDbsForRun.map((d) => d.Id)
            if (dbIds.length > 0) {
              const sb = await getSupabaseServer()
              const { data: junctions } = await sb.schema("hub").from("demo_database_services")
                .select("demo_database_id, service_id")
              const junctionMap = new Map<number, number[]>()
              for (const j of ((junctions ?? []) as { demo_database_id: number; service_id: number }[])) {
                if (!dbIds.includes(j.demo_database_id)) continue
                const list = junctionMap.get(j.demo_database_id) ?? []
                list.push(j.service_id)
                junctionMap.set(j.demo_database_id, list)
              }
              // Pusula program kodlarını çek (tek sorguda)
              const { data: pusulaCatalog } = await sb.schema("hub").from("wizard_services")
                .select("id, config").eq("type", "pusula-program").eq("is_active", true)
              const codeById = new Map<number, string | null>()
              for (const row of ((pusulaCatalog ?? []) as { id: number; config: string | null }[])) {
                let code: string | null = null
                if (row.config) {
                  try {
                    const parsed = JSON.parse(row.config) as { programCode?: string | null }
                    code = parsed?.programCode && parsed.programCode.trim() ? parsed.programCode.trim() : null
                  } catch { /* noop */ }
                }
                codeById.set(row.id, code)
              }

              for (const demo of demoDbsForRun) {
                const bakPath = (demo.LocationPath ?? "").trim()
                if (!bakPath) {
                  // Path yok → restore yapılamaz (ör. "Şablon" modu), sessizce atla
                  send("step", {
                    stepId: `sql_skip_${demo.Id}`,
                    label:  `Demo DB atlandı (yol yok): ${demo.Name}`,
                    status: "done",
                  })
                  continue
                }
                const linkedServiceIds = junctionMap.get(demo.Id) ?? []
                let programCode: string | null = null
                for (const sid of linkedServiceIds) {
                  const code = codeById.get(sid) ?? null
                  if (code) { programCode = code; break }
                }
                // Hedef ad: sihirbazda görünen/düzenlenen ad — veriler/kodlar ve API
                // Users.xml anahtarlarıyla (`${prefix}${dataName}`) birebir aynı olmalı.
                // Eski client (ayar yok / geçersiz ad) → katalog adından türetilir.
                const ayar = runDemoAyarlari.get(demo.Id)
                const rawName = ayar?.dataName || deriveDataName(demo.Name) || demo.DataName || demo.Name
                tasks.push({
                  kind:        "bak",
                  bakPath,
                  srcMdf:      "",
                  srcLdf:      null,
                  dbName:      `${prefix}${rawName}`,
                  srkAdi:      rawName,
                  programCode,
                  yedekAl:     ayar ? ayar.yedekAl : true,   // demo DB güncel data, varsayılan yedeğe girer
                  pusulaX:     linkedServiceIds.some((sid) => ((pusulaServices.find((x) => x.id === sid)?.config as PusulaProgramConfig | null)?.exeName ?? "").trim().toLowerCase() === "pusulax.exe"),
                })
              }
            }
          }

          if (tasks.length > 0) {
            // Tüm restore + guvenlik işleri tek bir SQL pool üzerinden yapılsın.
            // Hata olursa kurulum durmaz — eski davranışla uyumlu; her task ayrı
            // step olarak raporlanır.
            try {
              await withSqlConnection(
                {
                  server:   sqlTarget.ip,
                  port:     1433,
                  user:     sqlTarget.username,
                  password: sqlTarget.password,
                  database: "master",
                },
                async (masterPool) => {
                  const restoredDbNames: string[] = []
                  /** Geri yüklenen ve Pusula X programına bağlı datalar — resim yolu / entegrasyon yalnız bunlara */
                  const pusulaXDbler: string[] = []
                  for (const t of tasks) {
                    if (t.kind === "attach") {
                      // ATTACH: ham .mdf/.ldf → D:\SQLData\{firmaId}'ye agent ile
                      // kopyala, sonra CREATE DATABASE FOR ATTACH.
                      const ok = await runSqlStep(
                        `sql_attach_${t.dbName}`,
                        `Veritabanı attach ediliyor: ${t.dbName}`,
                        async () => {
                          if (!sqlTarget!.agent) {
                            throw new Error("ATTACH için SQL sunucusunda PusulaAgent gerekli (ApiKey/AgentPort eksik)")
                          }
                          const destDir = firmaDataDir(payload.firmaId)
                          const copyCmd = buildCopyAttachFiles({
                            srcMdf:  t.srcMdf,
                            srcLdf:  t.srcLdf ?? undefined,
                            destDir,
                            destMdf: `${t.dbName}.mdf`,
                            destLdf: t.srcLdf ? `${t.dbName}.ldf` : undefined,
                          })
                          const cp = await execOnAgent(
                            sqlTarget!.agent.ip, sqlTarget!.agent.port, sqlTarget!.agent.apiKey, copyCmd, 600,
                          )
                          if (cp.exitCode !== 0) {
                            throw new Error(cp.stderr?.trim() || `Dosya kopyalama başarısız (exit=${cp.exitCode})`)
                          }
                          await attachDatabaseOnServer(masterPool, payload.firmaId, t.dbName, !!t.srcLdf)
                          sqlRestored++
                          return `${t.srcMdf}${t.srcLdf ? " + .ldf" : ""} → [${t.dbName}] (ATTACH)`
                        },
                      )
                      if (ok) { restoredDbNames.push(t.dbName); if (t.pusulaX) pusulaXDbler.push(t.dbName); parsDatalar.push({ data: t.dbName, programCode: t.programCode }) }
                    } else {
                      const restoreStepId = `sql_restore_${t.dbName}`
                      const restoreLabel  = `Veritabanı restore ediliyor: ${t.dbName}`
                      const ok = await runSqlStep(
                        restoreStepId,
                        restoreLabel,
                        async () => {
                          await restoreBackupOnServer(masterPool, t.bakPath, t.dbName, {
                            firmaId: payload.firmaId,
                            // Canlı yüzde — aynı stepId ile "running" güncellemesi gönder,
                            // frontend label'ı upsert eder. Büyük DB'lerde adımın
                            // arka planda ilerlediği net görünür.
                            onProgress: (pct) => {
                              send("step", { stepId: restoreStepId, label: `${restoreLabel} — %${pct}`, status: "running" })
                            },
                          })
                          sqlRestored++
                          return `${t.bakPath} → [${t.dbName}]`
                        },
                      )
                      if (ok) { restoredDbNames.push(t.dbName); if (t.pusulaX) pusulaXDbler.push(t.dbName); parsDatalar.push({ data: t.dbName, programCode: t.programCode }) }
                    }
                  }

                  // ── SQLData klasörü görünen adı (07.10.2026) ──
                  // D:\SQLData\{firmaId} Gezgin'de "<firmaNo> - <firma adı>" görünsün (Depo Resimler/Eski
                  // Datalar ile aynı). Klasör adı değişmez. Kritik değil, hata kurulumu durdurmaz.
                  if (restoredDbNames.length > 0 && sqlTarget!.agent) {
                    await runStep(
                      sqlTarget!.agent,
                      "sql_data_tooltip",
                      `SQL veri klasörü açıklaması (desktop.ini): ${payload.firmaId} - ${payload.firmaName}`,
                      buildWriteDesktopIni(firmaDataDir(payload.firmaId), payload.firmaName, `${payload.firmaId} - ${payload.firmaName}`),
                    )
                  }

                  // ── Programın kendi yedek menüsü gizlenir (30.10.2026, lib/program-yedek) ──
                  // Program COPY_ONLY'siz tam yedek alıp SpareBackup zincirini bozuyordu.
                  // Pusula X datalarında YanM yok → atlanır. Kritik değil, kurulumu durdurmaz.
                  for (const d of parsDatalar) {
                    if (!d.programCode || !YEDEK_MENU_ID[d.programCode.trim()] || pusulaXDbler.includes(d.data)) continue
                    await runSqlStep(
                      `sql_yedekmenu_${d.data}`,
                      `Program yedek menüsü gizleniyor: [${d.data}]`,
                      async () => yedekMenusuMesaji(await yedekMenusunuGizle(masterPool, d.data, d.programCode)),
                    )
                  }

                  // ── Pusula X resim yolu ──
                  // Pusula X resim yolunu guvenlik'te değil kendi Sabitler.ImagePath'inde tutar.
                  // Yanlış/eski yol (ulaşılamayan paylaşım) programı açılışta ve içeride
                  // ağ zaman aşımı kadar dondurur (~22 sn; donma şikâyetlerinin çoğu bu).
                  // Pusula X ile Perakende aynı program kodunu (909) kullandığı için hizmet
                  // exe adından tanınır; yalnız ImagePath sütunu olan DB'ye yazılır.
                  // Yalnız Pusula X programına bağlı datalar (Perakende de Sabitler taşıyabilir — ona yazılmaz).
                  // Resim hizmeti kurulduysa entegrasyon adresi de: http://<IIS DNS>:<RESIM portu>/ + ImagePort.
                  // Depo adımı atlanmışsa (skipDepo) resim paylaşımı için bulunan Depo adresi
                  const resimDepoIp = depoSrv?.ip ?? resimDepo?.ip ?? null
                  if (resimDepoIp && pusulaXDbler.length > 0) {
                    const resimYolu = pusulaXResimYolu(resimDepoIp, payload.firmaId)
                    for (const dbName of pusulaXDbler) {
                      await runSqlStep(
                        `sql_resimyolu_${dbName}`,
                        `Pusula X resim yolu: [${dbName}]`,
                        async () => {
                          const n = await yazPusulaXResimYolu(masterPool, dbName, resimYolu)
                          if (n < 0) return "Sabitler.ImagePath yok — atlandı"
                          let ek = ""
                          if (resimSitePortu && iisDisAdres) {
                            await yazPusulaXEntegrasyon(masterPool, dbName, iisDisAdres, resimSitePortu)
                            ek = ` · EntegrasyonResimYolu = http://${iisDisAdres}:${resimSitePortu}/ · ImagePort = ${resimSitePortu}`
                          }
                          return `Sabitler.ImagePath = ${resimYolu}${ek}`
                        },
                      )
                    }
                  }

                  // ── Firma 1. kullanıcısı için SQL Authentication login + user mapping ──
                  // Şart: en az 1 başarılı restore + payload.users[0] mevcut
                  const firstUser = payload.users[0]
                  if (restoredDbNames.length > 0 && firstUser && firstUser.username && firstUser.password) {
                    // Ad kurali tek kaynaktan: lib/firma-adlandirma.
                    // NOKTA ile uretiliyor — AD/RDP kullanici adiyla ayni
                    // olsun diye (eskiden alt cizgiydi ve karisiyordu).
                    const loginName = sqlLoginAdi(payload.firmaId, firstUser.username)

                    const loginOk = await runSqlStep(
                      `sql_login_${loginName}`,
                      `SQL login oluşturuluyor: ${loginName}`,
                      async () => {
                        const { created } = await ensureSqlLogin(masterPool, loginName, firstUser.password)
                        /*  SQL sifresi AYRI kolona da yaziliyor. Su an AD
                         *  sifresiyle ayni, ama ikisi ayri hesap: AD tarafi
                         *  degistiginde bu deger oldugu gibi kalmali ki
                         *  ekran SQL icin yanlis sifre gostermesin.        */
                        // Kimlik satirlari TAM AD adiyla saklaniyor
                        // ("2311.iremtoptan1"), kisa adla degil.
                        await saveCompanyUserSqlPassword(
                          payload.firmaId,
                          `${payload.firmaId}.${firstUser.username}`,
                          firstUser.password,
                          loginName)
                        return created
                          ? `CREATE LOGIN [${loginName}]`
                          : `ALTER LOGIN [${loginName}] (mevcut — şifre güncellendi)`
                      },
                    )

                    if (loginOk) {
                      // Sunucu seviyesinde DENY VIEW ANY DATABASE → kullanıcı
                      // sadece owner'ı olduğu DB'leri görür.
                      await runSqlStep(
                        `sql_deny_view_${loginName}`,
                        `DENY VIEW ANY DATABASE: ${loginName}`,
                        async () => {
                          await denyViewAnyDatabase(masterPool, loginName)
                          return `DENY VIEW ANY DATABASE TO [${loginName}]`
                        },
                      )

                      // Restore edilen her DB'nin owner'ını bu login'e devret.
                      // Owner otomatik olarak dbo olur → ayrıca rol vermeye gerek yok.
                      for (const dbName of restoredDbNames) {
                        await runSqlStep(
                          `sql_dbowner_${dbName}`,
                          `DB owner ayarlanıyor: [${dbName}] → ${loginName}`,
                          async () => {
                            await setDbOwner(masterPool, dbName, loginName)
                            return `ALTER AUTHORIZATION ON DATABASE::[${dbName}] TO [${loginName}]`
                          },
                        )
                      }

                      // Paylaşımlı sirket DB'sine okuma+yazma erişimi — Pusula
                      // programı açılırken sirket.dbo.guvenlik'i bu kullanıcıyla
                      // okur. DENY VIEW ANY DATABASE diğer firma DB'lerini gizler;
                      // sirket'te USER + db_datareader/datawriter olduğu için bu
                      // paylaşımlı DB erişilebilir kalır (owner değil → şema güvenli).
                      await runSqlStep(
                        `sql_sirket_access_${loginName}`,
                        `sirket DB erişimi: ${loginName} (okuma+yazma)`,
                        async () => {
                          await grantSirketAccess(masterPool, loginName)
                          return `[sirket] db_datareader + db_datawriter → ${loginName}`
                        },
                      )
                    }
                  }

                  // ── IIS hizmetlerinin Users.xml'lerini güncelle ──
                  // Restore edilen DB adlarını ve tüm firma kullanıcılarını
                  // her IIS hizmetinin Config\Users.xml'ine yazar.
                  if (
                    iisAgent &&
                    installedIisServices.length > 0 &&
                    restoredDbNames.length > 0 &&
                    payload.users.length > 0
                  ) {
                    const xmlUsers = payload.users
                      .filter((u) => u.username && u.password)
                      .map((u) => ({
                        // Uygulama-ici kimlik, SQL girisi DEGIL — alt cizgi
                        // bilerek (Users.xml bicimi). Bkz. apiKullaniciAdi.
                        username: apiKullaniciAdi(payload.firmaId, u.username),
                        password: u.password,
                      }))

                    for (const svc of installedIisServices) {
                      // Sihirbaz API adımı: yalnız elle girilen uygulama kullanıcıları + seçilen data
                      // (kurulan DB'lerle kesişim). Kullanıcı girilmediyse yalnız DB listesi yazılır.
                      const apiAkisi = Array.isArray(svc.apiUsers)
                      const dbler = apiAkisi && svc.apiDbler
                        ? svc.apiDbler.filter((d) => restoredDbNames.includes(d))
                        : restoredDbNames
                      const kullanicilar = apiAkisi ? svc.apiUsers! : xmlUsers
                      if (apiAkisi && dbler.length === 0) continue
                      const ok = await runStep(
                        iisAgent,
                        `iis_usersxml_${svc.id}`,
                        apiAkisi
                          ? `Users.xml güncelleniyor: ${svc.name} (${kullanicilar.length ? kullanicilar.map((k) => k.username).join(", ") : "kullanıcısız"} · ${dbler.join(", ")})`
                          : `Users.xml güncelleniyor: ${svc.name}`,
                        buildPatchUsersXml({
                          configPath: `${svc.destPath}\\Config\\Users.xml`,
                          users:      kullanicilar,
                          dbNames:    dbler,
                          keepUsers:  apiAkisi ? false : svc.keepUsers,
                          bosKullaniciIzinli: apiAkisi,
                        }),
                      )
                      // Şifreli kullanıcı yoksa komut SKIP_EMPTY döner — yazılmış sayılmaz (API akışında DB listesi yazıldıysa sayılır)
                      svc.usersXml = ok && (apiAkisi || svc.keepUsers || xmlUsers.length > 0)
                    }
                  }
                },
              )
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              send("step", {
                stepId: "sql_connect",
                label:  `SQL sunucusuna bağlanılamadı: ${sqlTarget.name}`,
                status: "error",
                error:  msg,
              })
            }

            // Guvenlik insert'leri ayrı bağlantı (sirket DB) üzerinden
            // Blok atlanıyorsa nedenini görünür kıl
            if (!runAddSirket) {
              send("step", {
                stepId: "sql_guvenlik_skip_toggle",
                label:  "Güvenlik kaydı atlandı — 'Şirket veritabanına ekle' kapalı",
                status: "done",
                output: `addToSirketDb=${payload.addToSirketDb}`,
              })
            } else if (sqlRestored === 0) {
              send("step", {
                stepId: "sql_guvenlik_skip_restore",
                label:  "Güvenlik kaydı atlandı — hiçbir DB restore edilmedi",
                status: "error",
                error:  "sqlRestored=0; restore adımı başarılı olmadığı için güvenlik kaydı yapılmadı.",
              })
            }

            if (runAddSirket && sqlRestored > 0) {
              const withCode    = tasks.filter((t) => !!t.programCode)
              const withoutCode = tasks.filter((t) => !t.programCode)

              // programCode yoksa kullanıcıya net uyarı ver — sessizce atlama
              if (withoutCode.length > 0) {
                send("step", {
                  stepId: "sql_guvenlik_skip",
                  label:  `Güvenlik kaydı atlandı (${withoutCode.length} DB) — Pusula program kodu yok`,
                  status: "error",
                  error:
                    "Seçili Pusula program servislerinin config'inde 'programCode' tanımlı değil. " +
                    "3. adımda (Servisler) en az bir Pusula Program servisi seç ve servis config'ine " +
                    "programCode ekle (011=Toptan, 909=Perakende, 111=StokCari, 016=Uretim). " +
                    `Atlanan DB'ler: ${withoutCode.map((t) => t.dbName).join(", ")}`,
                })
              }

              if (withCode.length > 0) {
                try {
                  await withSqlConnection(
                    {
                      server:   sqlTarget.ip,
                      port:     1433,
                      user:     sqlTarget.username,
                      password: sqlTarget.password,
                      database: "sirket",
                    },
                    async (sirketPool) => {
                      for (const t of withCode) {
                        await runSqlStep(
                          `sql_guvenlik_${t.dbName}`,
                          `Güvenlik kaydı: ${t.dbName} (${t.programCode})`,
                          async () => {
                            await insertGuvenlikRow(sirketPool, {
                              dbName:      t.dbName,
                              srkAdi:      t.srkAdi,
                              firmaId:     payload.firmaId,
                              programCode: t.programCode!,
                              yedekAl:     t.yedekAl,
                              kod:         payload.kodlar?.[t.dbName],
                            })
                            sqlGuvenlik++
                          },
                        )
                      }
                    },
                  )
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err)
                  send("step", {
                    stepId: "sql_sirket_connect",
                    label:  `sirket veritabanına bağlanılamadı: ${sqlTarget.name}`,
                    status: "error",
                    error:  msg,
                  })
                }
              }
            }
          }
        }

        // ── 7c) Hizmet ekleme — SQL ayarlarını mevcut hizmetten al ─────
        // Mevcut firmaya yalnız IIS hizmeti eklenince (restore yok / yeni
        // kullanıcı yok) Web.config ve Users.xml şablon değerleriyle kalıyordu
        // (4819 Kivi, 14.10.2026). Firmanın Mobil'deki başka bir hizmetinden
        // (önce Pusula MOBIL) okunup yazılır. Kritik değil: kaynak yoksa adım
        // kırmızı kalır, elle düzeltilir.
        if (iisAgent) {
          // Firmanın SQL'de {firmaId}_ önekli veritabanı var mı — yalnız kaynak bulunamazsa, bir kez sorulur.
          // null → kontrol edilemedi (SQL hedefi yok / bağlantı hatası).
          let dataVar: boolean | null | undefined
          const firmaSqlDataVarMi = async (): Promise<boolean | null> => {
            if (dataVar !== undefined) return dataVar
            try {
              const hedef = await resolveFirmaSqlTarget(payload.firmaId)
              if (!hedef) return (dataVar = null)
              const n = await withSqlConnection(
                { server: hedef.ip, user: hedef.username, password: hedef.password, database: "master", requestTimeout: 30000 },
                async (pool) => (await pool.request().input("p", `${payload.firmaId}[_]%`)
                  .query<{ n: number }>("SELECT COUNT(*) AS n FROM sys.databases WHERE name LIKE @p")).recordset[0]?.n ?? 0,
              )
              return (dataVar = n > 0)
            } catch {
              return (dataVar = null)
            }
          }
          const kurulanYollar = installedIisServices.map((s) => s.destPath)
          for (const svc of installedIisServices) {
            if (svc.webSql && svc.usersXml) continue
            const stepId = `iis_kaynak_${svc.id}`
            const label  = `SQL ayarları mevcut hizmetten alınıyor: ${svc.name}`
            send("step", { stepId, label, status: "running" })
            const r = await execOnAgent(iisAgent.ip, iisAgent.port, iisAgent.apiKey, buildCopyIisConfigFromSibling({
              firmaRoot: `C:\\Pusula\\Service\\${payload.firmaId}`,
              destPath:  svc.destPath,
              exclude:   kurulanYollar.filter((p) => p !== svc.destPath),
              sablonPath: svc.sablonPath,
              webConfig: !svc.webSql,
              usersXml:  !svc.usersXml,
              // Hizmet ekleme: kullanıcılar 7d'de silinip pencerede girilenle yazılır —
              // burada yalnız DB listesi önemli, Kivi'nin şablon kullanıcısını korumaya gerek yok
              keepUsers: hizmetEkleme ? false : svc.keepUsers,
            }), 60)
            const out    = (r.stdout ?? "").trim()
            const stderr = (r.stderr ?? "").trim()
            if (r.exitCode !== 0 || stderr) {
              send("step", { stepId, label, status: "error", error: stderr || out || `exit ${r.exitCode}` })
              continue
            }
            // WEB:NONE / XML:NONE → firmada değerleri alınabilecek hizmet yok
            const eksik: string[] = []
            if (/WEB:NONE/.test(out)) eksik.push("Web.config bağlantı dizesi")
            if (/XML:NONE/.test(out)) eksik.push("Users.xml DB listesi")
            if (eksik.length) {
              // Firmanın SQL'de hiç datası yoksa yazılacak değer de yok: hata değil uyarı (4397, 22.10.2026).
              // Data varsa (ya da kontrol edilemediyse) değerler kopyalanamamış demektir — hata kalır.
              if ((await firmaSqlDataVarMi()) === false) {
                send("step", {
                  stepId, label, status: "warning",
                  error: `Firmanın SQL'de datası yok — Web.config ve Users.xml şablon değerinde kaldı. ` +
                    `Firma detayından veritabanı ekleyip ayarları sonra yazın (${svc.destPath}).`,
                })
                continue
              }
              send("step", {
                stepId, label, status: "error",
                error: `Kaynak hizmet bulunamadı — ${eksik.join(" ve ")} şablon değerinde kaldı, elle düzeltin ` +
                  `(${svc.destPath}). Çıktı: ${out}`,
              })
              continue
            }
            send("step", { stepId, label, status: "done", output: out })
          }
        }

        // ── 7d) Yeni Hizmet penceresi — Users.xml kullanıcıları ─────────
        // Mevcut firmaya eklenen API hizmetinde Users.xml yalnız pencerede
        // girilen kullanıcıyı içerir; girilmediyse kullanıcısız kalır. Şablon
        // ve kardeş hizmetten gelen kullanıcılar (Kivi'ninki dahil) silinir.
        // DB listesi 7c'de yazılan <DB>'den alınır, bu yüzden en sonda. Kritik değil.
        // Kullanıcı Users.xml'e, Users.xml'i olmayan hizmette (SarrafPro) Web.config
        // appSettings User/Pass'e yazılır. Girildiği hâlde ikisi de yoksa adım kırmızı.
        if (iisAgent) {
          for (const svc of installedIisServices) {
            if (!hizmetEkleme && !svc.appUser) continue
            const stepId = `iis_appuser_${svc.id}`
            const label  = svc.appUser
              ? `Uygulama kullanıcısı yazılıyor: ${svc.name} (${svc.appUser.username})`
              : `Şablon kullanıcıları temizleniyor: ${svc.name}`
            send("step", { stepId, label, status: "running" })
            const r = await execOnAgent(iisAgent.ip, iisAgent.port, iisAgent.apiKey, buildSetApiKullanici({
              hizmetYolu: svc.destPath,
              user:       svc.appUser,
            }), 60)
            const out    = (r.stdout ?? "").trim()
            const stderr = (r.stderr ?? "").trim()
            if (r.exitCode !== 0 || stderr) {
              send("step", { stepId, label, status: "error", error: stderr || out || `exit ${r.exitCode}` })
              continue
            }
            if (svc.appUser && !/XML:UPDATED/.test(out) && !/WEB:UPDATED/.test(out)) {
              send("step", {
                stepId, label, status: "error",
                error: `Kullanıcının yazılacağı yer bulunamadı — ne Config\\Users.xml ne Web.config ` +
                  `appSettings User/Pass var, elle ekleyin (${svc.destPath}). Çıktı: ${out}`,
              })
              continue
            }
            send("step", { stepId, label, status: "done", output: out })
          }
        }

        // ── 8) Pars — Ayar.mdb'ye kullanıcı + yetki (non-critical) ──────
        // Kritik değil: mobil sunucuya ulaşılamazsa kurulum durmaz, adım
        // kırmızı kalır ve "Elle Yapılacak Adımlar" kullanıcıları listeler.
        let parsUsersCreated = 0
        if (payload.pars && payload.pars.users.length > 0) {
          const p = payload.pars
          const okuLabel = "Pars: Ayar.mdb okunuyor"
          send("step", { stepId: "pars_oku", label: okuLabel, status: "running" })

          const hedefSonuc = await parsHedefYukle(Number(p.serviceId))
          if (!hedefSonuc.ok) {
            send("step", { stepId: "pars_oku", label: okuLabel, status: "error", error: hedefSonuc.error })
          } else {
            const hedef = hedefSonuc.hedef
            const katalogSonuc = await parsKatalogOku(hedef, true)
            if (!katalogSonuc.ok) {
              send("step", { stepId: "pars_oku", label: okuLabel, status: "error", error: katalogSonuc.error })
            } else {
              const katalog = katalogSonuc.katalog
              const mevcut = new Set(katalog.users.map((u) => u.adi.trim().toLocaleLowerCase("tr-TR")))
              const cakisan = p.users.filter((u) => mevcut.has(u.username.trim().toLocaleLowerCase("tr-TR"))).map((u) => u.username)
              const gecerliRapor = new Set(katalog.scripts.map((s) => s.id))
              const izinli = p.allowedReportIds.map(Number).filter((id) => gecerliRapor.has(id))

              // Datalar.TipID: DB'nin program kodundan; yoksa seçili ilk Pusula programından
              const yedekTip = pusulaServices
                .map((s) => parsTipFromProgramCode((s.config as PusulaProgramConfig | null)?.programCode))
                .find((t) => t !== null) ?? null
              const datalar: { data: string; tipId: number }[] = []
              const tipsizler: string[] = []
              for (const d of parsDatalar) {
                const tip = parsTipFromProgramCode(d.programCode) ?? yedekTip
                if (tip === null) { tipsizler.push(d.data); continue }
                datalar.push({ data: d.data, tipId: tip })
              }
              // Firma detayından ekleme: mevcut DB'ler istemciden tipiyle gelir
              for (const d of (p.datalar ?? [])) {
                const data = String(d.data ?? "").trim()
                const tip = Number(d.tipId)
                if (!data || !Number.isFinite(tip) || tip === 0) continue
                if (datalar.some((x) => x.data.toLowerCase() === data.toLowerCase())) continue
                datalar.push({ data, tipId: tip })
              }

              send("step", {
                stepId: "pars_oku", label: okuLabel, status: "done",
                output: `${katalog.scripts.length} rapor, ${katalog.datalar.length} data, ${katalog.users.length} kullanıcı · izinli ${izinli.length} rapor · bağlanacak ${datalar.length} DB`,
              })

              if (cakisan.length > 0) {
                send("step", {
                  stepId: "pars_yaz", label: "Pars: kullanıcılar yazılıyor", status: "error",
                  error: `Pars'ta zaten kayıtlı: ${cakisan.join(", ")}. Hizmetler adımında farklı ad verin.`,
                })
              } else {
                if (tipsizler.length > 0) {
                  send("step", {
                    stepId: "pars_tipsiz", label: `Pars: ${tipsizler.length} DB bağlanamadı — program tipi belirsiz`, status: "error",
                    error: `Program kodu Pars tipine eşlenemedi (909/011/016/111 bekleniyor): ${tipsizler.join(", ")}`,
                  })
                }
                if (datalar.length === 0) {
                  send("step", {
                    stepId: "pars_datasiz", label: "Pars: bağlanacak veritabanı yok — kullanıcı rapor göremeyecek", status: "done",
                    output: "SQL adımında DB restore edilmedi; Datalar kaydı yazılmadı. Sonradan Pusula Görev'den bağlanabilir.",
                  })
                }

                const yazLabel = `Pars: ${p.users.length} kullanıcı yazılıyor`
                send("step", { stepId: "pars_yaz", label: yazLabel, status: "running" })
                /*  Firmanın Ayar.mdb'de zaten olan Pars kullanıcıları: yeni
                 *  data onlara yasaklanmasın, aksine açılsın.             */
                let mevcutFirmaKullanicilari: number[] = []
                try {
                  const sb = await getSupabaseServer()
                  const { data: eski } = await sb.schema("hub").from("company_pars_users")
                    .select("pars_user_id").eq("company_id", payload.firmaId).eq("service_id", hedef.serviceId)
                  mevcutFirmaKullanicilari = ((eski ?? []) as { pars_user_id: number | null }[])
                    .map((x) => Number(x.pars_user_id)).filter((n) => Number.isInteger(n) && n > 0)
                } catch { /* kayıt okunamazsa en kötü yeni data eskiye kapalı kalır */ }

                const cmd = buildParsKullaniciYaz(hedef.dbPath, hedef.password, {
                  datalar,
                  users: p.users.map((u) => ({
                    adi: u.username.trim(), tipi: u.admin ? 1 : 0, sifre: u.password,
                    ...(Array.isArray(u.allowedReportIds)
                      ? { izinli: u.allowedReportIds.map(Number).filter((id) => gecerliRapor.has(id)) }
                      : {}),
                  })),
                  izinliRaporlar: izinli,
                  mevcutFirmaKullanicilari,
                })
                const r = await execOnAgent(hedef.agent.ip, hedef.agent.port, hedef.agent.apiKey, cmd, 90)
                const sonuc = parsJsonAyikla<{ ok: boolean; error?: string; users?: { adi: string; id: number }[]; datalar?: { data: string; did: number; yeni: boolean }[]; yasakliData?: number; yasakliRapor?: number; eskiyeYasak?: number; eskidenAcilan?: number }>(r.stdout ?? "")
                parsKatalogOnbellekTemizle(hedef.serviceId)
                if (!sonuc || !sonuc.ok) {
                  send("step", {
                    stepId: "pars_yaz", label: yazLabel, status: "error",
                    error: sonuc?.error ?? (r.stderr || r.stdout || `exit ${r.exitCode}`).trim().slice(0, 400),
                  })
                } else {
                  parsUsersCreated = sonuc.users?.length ?? 0
                  const yeniData = (sonuc.datalar ?? []).filter((d) => d.yeni).map((d) => d.data)
                  // Hub'a iz: firma Hizmetler sekmesi bu kayıtları listeler. Hata kurulumu bozmaz.
                  try {
                    const idByName = new Map((sonuc.users ?? []).map((u) => [u.adi.toLowerCase(), u.id]))
                    await parsKullanicilariKaydet(
                      payload.firmaId, hedef.serviceId,
                      p.users.map((u) => ({ username: u.username.trim(), tipi: u.admin ? 1 : 0, parsUserId: idByName.get(u.username.trim().toLowerCase()) ?? null })),
                      datalar.map((d) => d.data),
                    )
                  } catch (err) {
                    send("step", { stepId: "pars_kayit", label: "Pars: Hub kaydı yazılamadı (Ayar.mdb tamam)", status: "error", error: err instanceof Error ? err.message : String(err) })
                  }
                  send("step", {
                    stepId: "pars_yaz", label: yazLabel, status: "done",
                    output: [
                      `${parsUsersCreated} kullanıcı: ${(sonuc.users ?? []).map((u) => `${u.adi} (ID ${u.id})`).join(", ")}`,
                      yeniData.length ? `Datalar'a eklendi: ${yeniData.join(", ")}` : (datalar.length ? "Datalar zaten kayıtlıydı" : "Data bağlanmadı"),
                      `kullanıcı başına ${sonuc.yasakliData ?? "?"} data ve ortalama ${sonuc.yasakliRapor ?? "?"} rapor yasaklandı`,
                      ...(sonuc.eskiyeYasak ? [`yeni data firma dışı ${sonuc.eskiyeYasak} kullanıcıya yasaklandı`] : []),
                      ...(sonuc.eskidenAcilan ? [`firmanın eski kullanıcılarına ${sonuc.eskidenAcilan} data açıldı`] : []),
                    ].join(" · "),
                  })
                }
              }
            }
          }
        }

        /*  Sunucu atamasını hub.companies'e yaz — YALNIZ bu çalıştırmada
         *  gerçekten kullanılan sunucular.
         *
         *  Eskiden dört alan da `?? null` ile yazılıyordu: firma detayından
         *  tek hizmet/kullanıcı eklemek (payload'da windowsServerId yok)
         *  firmanın kayıtlı RDP sunucusunu SİLİYORDU. 6399'da yaşandı —
         *  firma Terminal 3'te kurulu ama kayıt boşaldı. Gönderilmeyen alana
         *  dokunulmaz.                                                     */
        try {
          const atama: Record<string, string> = {}
          if (payload.windowsServerId) atama.windows_server_id = payload.windowsServerId
          if (payload.serverId)        atama.ad_server_id      = payload.serverId
          if (payload.sqlServerId)     atama.sql_server_id     = payload.sqlServerId
          if (payload.depoServerId)    atama.file_server_id    = payload.depoServerId
          if (Object.keys(atama).length > 0) {
            const sb = await getSupabaseServer()
            await sb.schema("hub").from("companies").update(atama).eq("company_id", payload.firmaId)
          }
        } catch { /* hub.companies'te kayıt yoksa sessizce geç */ }

        // ── Senkron: agent onbellegini zorla yenile + hub'a hemen yaz ──
        // Agent AD/IIS/SQL listelerini 5 dk cache'ler, poller SQL'i ayrica
        // 5 dk ritimle yazar; sihirbaz bitince kullanici/DB en kotu 10 dk
        // sonra gorunuyordu. Ilgili sunucular force ile yoklanir, ardindan
        // firma sayaclari yeniden hesaplanir.
        // 30.10.2026: ~30 sn+ suruyordu ve kurulum ekranini bekletiyordu —
        // artik arka plan isi (lib/hub-senkron-isi.ts); kurulum hemen biter,
        // ekrandaki HubSenkronWidget durumu gosterir. Hata kurulumu bozmaz.
        const senkronHedefleri: { id: string | null | undefined; etiket: string }[] = parsOnly ? [] : [
          // AD'ye dokunulmadıysa AD yoklaması da gereksiz
          { id: adAdimlari ? payload.serverId : null, etiket: "Active Directory" },
          { id: payload.sqlServerId,     etiket: "SQL" },
          { id: payload.windowsServerId, etiket: "IIS / Terminal" },
        ]
        const senkronlanan = new Set<string>()
        const hedefler = senkronHedefleri.filter((h): h is { id: string; etiket: string } => {
          if (!h.id || senkronlanan.has(h.id)) return false
          senkronlanan.add(h.id)
          return true
        })
        const senkronId = hubSenkronuBaslat(payload.firmaId, payload.firmaName, hedefler)
        if (senkronId) {
          send("step", {
            stepId: "sync_arka_plan", label: "Hub senkronu arka planda başladı",
            status: "done", output: "Durumu sağ alttaki karttan izlenir",
          })
        }

        send("done", {
          ok: true,
          senkronId,
          summary: {
            firmaId:           payload.firmaId,
            usersCreated:      createdCount,
            servicesInstalled,
            sqlRestored,
            sqlGuvenlik,
            parsUsersCreated,
          },
        })
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : String(err),
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
