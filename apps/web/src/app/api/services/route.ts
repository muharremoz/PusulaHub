import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"

/**
 * /api/services
 *   GET  → WizardServices kataloğu (default: hepsi). ?onlyActive=true ile filtre.
 *   POST → Yeni hizmet ekler.
 *
 * Tek doğruluk noktası: Hem /services yönetim ekranı, hem firma kurulum
 * sihirbazı 4. adımı, hem IIS/port range sheet'leri buradan beslenir.
 *
 * Hizmet türleri (Type):
 *   - "pusula-program": RDP sunucusunda klasör + param.txt
 *   - "iis-site":       IIS sunucusunda klasör + config + IIS site + port havuzundan port
 *
 * Type-specific alanlar Config kolonunda JSON olarak tutulur. Şema TS tarafında.
 */

export type ServiceType = "pusula-program" | "iis-site"

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

export type ServiceConfig = PusulaProgramConfig | IisSiteConfig

export interface WizardServiceDto {
  id:           number
  name:         string
  category:     string
  type:         ServiceType
  config:       ServiceConfig | null
  displayOrder: number
  isActive:     boolean
}

interface Row {
  Id:           number
  Name:         string
  Category:     string
  Type:         string
  Config:       string | null
  DisplayOrder: number
  IsActive:     boolean
}

function rowToDto(r: Row): WizardServiceDto {
  let parsed: ServiceConfig | null = null
  if (r.Config) {
    try { parsed = JSON.parse(r.Config) as ServiceConfig } catch { parsed = null }
  }
  return {
    id:           r.Id,
    name:         r.Name,
    category:     r.Category,
    type:         (r.Type as ServiceType) ?? "pusula-program",
    config:       parsed,
    displayOrder: r.DisplayOrder,
    isActive:     !!r.IsActive,
  }
}

/* ── Type-aware validation ────────────────────────────── */
function validateConfig(type: ServiceType, raw: unknown):
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

  return { ok: false, error: "Bilinmeyen type" }
}

/* ── GET ──────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const onlyActive = req.nextUrl.searchParams.get("onlyActive") === "true"

    const rows = onlyActive
      ? await query<Row[]>`
          SELECT Id, Name, Category, Type, Config, DisplayOrder, IsActive
          FROM WizardServices
          WHERE IsActive = 1
          ORDER BY DisplayOrder ASC, Name ASC
        `
      : await query<Row[]>`
          SELECT Id, Name, Category, Type, Config, DisplayOrder, IsActive
          FROM WizardServices
          ORDER BY DisplayOrder ASC, Name ASC
        `

    return NextResponse.json(rows.map(rowToDto))
  } catch (err) {
    console.error("[GET /api/services]", err)
    return NextResponse.json({ error: "Hizmetler alınamadı" }, { status: 500 })
  }
}

/* ── POST ─────────────────────────────────────────────── */
interface CreatePayload {
  name?:         string
  category?:     string
  type?:         ServiceType
  config?:       unknown
  displayOrder?: number
  isActive?:     boolean
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreatePayload

    const name         = (body.name     ?? "").trim()
    const category     = (body.category ?? "").trim()
    const type         = body.type
    const displayOrder = Number.isFinite(body.displayOrder) ? Number(body.displayOrder) : 0
    const isActive     = body.isActive !== false

    if (!name)     return NextResponse.json({ error: "name zorunlu" },     { status: 400 })
    if (!category) return NextResponse.json({ error: "category zorunlu" }, { status: 400 })
    if (type !== "pusula-program" && type !== "iis-site") {
      return NextResponse.json({ error: "type zorunlu (pusula-program | iis-site)" }, { status: 400 })
    }

    const v = validateConfig(type, body.config)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const configJson = JSON.stringify(v.config)

    const result = await execute`
      INSERT INTO WizardServices (Name, Category, Type, Config, DisplayOrder, IsActive)
      OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Category, INSERTED.Type, INSERTED.Config,
             INSERTED.DisplayOrder, INSERTED.IsActive
      VALUES (${name}, ${category}, ${type}, ${configJson}, ${displayOrder}, ${isActive ? 1 : 0})
    `

    const created = (result.recordset as Row[])[0]
    return NextResponse.json(rowToDto(created), { status: 201 })
  } catch (err) {
    console.error("[POST /api/services]", err)
    return NextResponse.json({ error: "Hizmet eklenemedi" }, { status: 500 })
  }
}
