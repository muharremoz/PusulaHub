/**
 * hub.wizard_services — hizmet türleri, config şemaları ve doğrulama.
 *
 * /api/services (GET/POST) ve /api/services/[id] (PATCH) aynı doğrulamayı
 * kullanır; route dosyaları yalnız HTTP handler export edebildiği için
 * ortak mantık burada.
 *
 * Hizmet türleri (type):
 *   - "pusula-program": RDP sunucusunda klasör + param.txt
 *   - "iis-site":       IIS sunucusunda klasör + config + IIS site + port havuzundan port
 *   - "iis-resim":      IIS sunucusunda Depo'daki \\<depo>\Resimler\<firmaId> paylaşımını
 *                       port havuzundan bir portla yayınlayan site (klasör kopyalanmaz)
 *   - "pars":           Mobil sunucudaki Ayar.mdb'ye (PUSULA GOREV) Pars kullanıcısı +
 *                       rapor/veritabanı yetkisi yazar. Tek kayıt yeter.
 *
 * Type-specific alanlar Config kolonunda JSON olarak tutulur.
 */

import { encrypt } from "@/lib/crypto"

export type ServiceType = "pusula-program" | "iis-site" | "iis-resim" | "pars"
export const SERVICE_TYPES: ServiceType[] = ["pusula-program", "iis-site", "iis-resim", "pars"]

export interface PusulaProgramConfig {
  sourceFolderPath: string
  paramFileName:    string | null   // null → param dosyası yok
  programCode:      string | null
  /** Masaüstü kısayolunda hedef alınacak .exe adı (örn pusulax.exe). null → kısayol oluşturulmaz. */
  exeName:          string | null
}

export interface IisSiteConfig {
  sourceFolderPath: string          // Kaynak (sunucudaki klasör)
  configFileName:   string | null   // Hedefte güncellenecek dosya (örn appsettings.json)
  siteNamePattern:  string | null   // IIS site adı pattern (örn RFID_{firmaKod}); null → pattern yok
  portRangeId:      number          // WizardPortRanges.Id
  // Hedef yol sabittir: C:\Pusula\Service\<name>_<firmaKod>
}

export interface IisResimConfig {
  portRangeId: number                // WizardPortRanges.Id (RESIM aralığı)
  /** Resimler\<firmaId> altındaki alt klasör (örn "PUSULAX"); null → firma klasörünün kendisi */
  subFolder:   string | null
  // Site adı sabittir: <firmaKod>_RESIM — Mobil'deki elle kurulmuş sitelerle aynı düzen
}

export interface ParsConfig {
  /** Ayar.mdb'nin bulunduğu (agent kurulu) mobil sunucu — hub.servers.id */
  serverId:     string
  /** Sunucudaki tam yol, örn C:\Pusula\Pusula Gorev\Ayar.mdb */
  dbPath:       string
  /**
   * Pars mobil uygulamasının bağlandığı port (örn 8888). Hizmete ait — tek
   * mobil sunucu, tek Ayar.mdb; firmaya değil. Eskiden hiç tutulmuyordu, CRM
   * Erişim sekmesi bağlantı adresini eksik gösteriyordu (16.09.2026).
   */
  port?:        number | null
  /** DB'de: encrypt() ile şifreli. DTO'da hiç dönmez — yerine hasPassword. */
  dbPassword?:  string
  /** Yalnız DTO'da: şifre kayıtlı mı */
  hasPassword?: boolean
}

export type ServiceConfig = PusulaProgramConfig | IisSiteConfig | IisResimConfig | ParsConfig

export interface WizardServiceDto {
  id:           number
  name:         string
  category:     string
  type:         ServiceType
  config:       ServiceConfig | null
  displayOrder: number
  isActive:     boolean
}

export interface WizardServiceRow {
  id:            number
  name:          string
  category:      string
  type:          string
  config:        string | null
  display_order: number
  is_active:     boolean
}

export const WIZARD_SERVICE_COLS = "id, name, category, type, config, display_order, is_active"

export function parseConfig(raw: string | null): ServiceConfig | null {
  if (!raw) return null
  try { return JSON.parse(raw) as ServiceConfig } catch { return null }
}

/** DTO'ya giderken gizli alanları ayıklar (Pars DB şifresi istemciye gitmez). */
export function maskConfig(type: string, cfg: ServiceConfig | null): ServiceConfig | null {
  if (!cfg || type !== "pars") return cfg
  const p = cfg as ParsConfig
  return { serverId: p.serverId, dbPath: p.dbPath, port: p.port ?? null, hasPassword: !!p.dbPassword }
}

export function wizardServiceRowToDto(r: WizardServiceRow): WizardServiceDto {
  return {
    id:           r.id,
    name:         r.name,
    category:     r.category,
    type:         (r.type as ServiceType) ?? "pusula-program",
    config:       maskConfig(r.type, parseConfig(r.config)),
    displayOrder: r.display_order,
    isActive:     !!r.is_active,
  }
}

/* ── Type-aware validation ────────────────────────────── */
/**
 * @param mevcut  PATCH'te mevcut (ham, DB'deki) config — Pars şifresi boş
 *                gönderilirse kayıtlı şifre korunur; düzenleme formu şifreyi göstermez.
 */
export function validateConfig(type: ServiceType, raw: unknown, mevcut?: ServiceConfig | null):
  { ok: true; config: ServiceConfig } | { ok: false; error: string }
{
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "config zorunlu" }
  }
  const c = raw as Record<string, unknown>

  if (type === "pusula-program") {
    const sourceFolderPath = typeof c.sourceFolderPath === "string" ? c.sourceFolderPath.trim() : ""
    if (!sourceFolderPath) return { ok: false, error: "config.sourceFolderPath zorunlu" }
    return {
      ok: true,
      config: {
        sourceFolderPath,
        paramFileName: typeof c.paramFileName === "string" && c.paramFileName.trim() ? c.paramFileName.trim() : null,
        programCode:   typeof c.programCode   === "string" && c.programCode.trim()   ? c.programCode.trim()   : null,
        exeName:       typeof c.exeName       === "string" && c.exeName.trim()       ? c.exeName.trim()       : null,
      },
    }
  }

  if (type === "iis-site") {
    const sourceFolderPath = typeof c.sourceFolderPath === "string" ? c.sourceFolderPath.trim() : ""
    const siteNamePattern  = typeof c.siteNamePattern  === "string" ? c.siteNamePattern.trim()  : ""
    const portRangeId      = Number(c.portRangeId)
    if (!sourceFolderPath) return { ok: false, error: "config.sourceFolderPath zorunlu" }
    if (!Number.isFinite(portRangeId) || portRangeId <= 0) {
      return { ok: false, error: "config.portRangeId zorunlu" }
    }
    return {
      ok: true,
      config: {
        sourceFolderPath,
        configFileName: typeof c.configFileName === "string" && c.configFileName.trim() ? c.configFileName.trim() : null,
        siteNamePattern: siteNamePattern || null,
        portRangeId,
      },
    }
  }

  if (type === "iis-resim") {
    const portRangeId = Number(c.portRangeId)
    if (!Number.isFinite(portRangeId) || portRangeId <= 0) {
      return { ok: false, error: "config.portRangeId zorunlu" }
    }
    const subFolder = cleanSubFolder(c.subFolder)
    if (subFolder === false) return { ok: false, error: "config.subFolder geçersiz (.., : ve özel karakter kullanılamaz)" }
    return { ok: true, config: { portRangeId, subFolder } }
  }

  if (type === "pars") {
    const serverId = typeof c.serverId === "string" ? c.serverId.trim() : ""
    const dbPath   = typeof c.dbPath   === "string" ? c.dbPath.trim()   : ""
    if (!serverId) return { ok: false, error: "config.serverId zorunlu (Ayar.mdb'nin olduğu mobil sunucu)" }
    if (!dbPath || !/\.mdb$/i.test(dbPath)) return { ok: false, error: "config.dbPath .mdb dosya yolu olmalı" }
    const yeniSifre = typeof c.dbPassword === "string" ? c.dbPassword : ""
    const eskiSifre = (mevcut as ParsConfig | null | undefined)?.dbPassword ?? ""
    const dbPassword = yeniSifre ? (encrypt(yeniSifre) ?? "") : eskiSifre
    if (!dbPassword) return { ok: false, error: "config.dbPassword zorunlu (Ayar.mdb şifresi)" }
    // Port isteğe bağlı. Payload'da hiç yoksa mevcut değer korunur (PATCH'in
    // config'siz yolu mevcut config'i yeniden doğruluyor — port düşmesin).
    const portHam = "port" in c ? c.port : (mevcut as ParsConfig | null | undefined)?.port
    let port: number | null = null
    if (portHam !== null && portHam !== undefined && portHam !== "") {
      const n = Number(portHam)
      if (!Number.isInteger(n) || n < 1 || n > 65535) return { ok: false, error: "config.port 1-65535 arasında tam sayı olmalı" }
      port = n
    }
    return { ok: true, config: { serverId, dbPath, dbPassword, port } }
  }

  return { ok: false, error: "Bilinmeyen type" }
}

/** Alt klasör yolunu normalize eder: baş/son ayraçlar atılır, / → \. Geçersizse false. */
export function cleanSubFolder(raw: unknown): string | null | false {
  if (typeof raw !== "string") return null
  const s = raw.trim().replace(/\//g, "\\").replace(/^\\+|\\+$/g, "")
  if (!s) return null
  if (/[:*?"<>|']/.test(s)) return false
  if (s.split("\\").some((p) => !p.trim() || p === "." || p === "..")) return false
  return s
}
