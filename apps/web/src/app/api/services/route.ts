import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"

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
  id:            number
  name:          string
  category:      string
  type:          string
  config:        string | null
  display_order: number
  is_active:     boolean
}

const SVC_COLS = "id, name, category, type, config, display_order, is_active"

function rowToDto(r: Row): WizardServiceDto {
  let parsed: ServiceConfig | null = null
  if (r.config) {
    try { parsed = JSON.parse(r.config) as ServiceConfig } catch { parsed = null }
  }
  return {
    id:           r.id,
    name:         r.name,
    category:     r.category,
    type:         (r.type as ServiceType) ?? "pusula-program",
    config:       parsed,
    displayOrder: r.display_order,
    isActive:     !!r.is_active,
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
  const gate = await requirePermission("services", "read")
  if (gate) return gate
  try {
    const onlyActive = req.nextUrl.searchParams.get("onlyActive") === "true"
    const sb = await getSupabaseServer()
    let rq = sb.schema("hub").from("wizard_services").select(SVC_COLS)
      .order("display_order", { ascending: true }).order("name", { ascending: true })
    if (onlyActive) rq = rq.eq("is_active", true)
    const { data: rows } = await rq

    return NextResponse.json(((rows ?? []) as unknown as Row[]).map(rowToDto))
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
  const gate = await requirePermission("services", "write")
  if (gate) return gate
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
    const sb = await getSupabaseServer()
    const { data: created, error } = await sb.schema("hub").from("wizard_services").insert({
      name, category, type, config: configJson, display_order: displayOrder, is_active: isActive,
    }).select(SVC_COLS).single()
    if (error) throw error
    return NextResponse.json(rowToDto(created as unknown as Row), { status: 201 })
  } catch (err) {
    console.error("[POST /api/services]", err)
    return NextResponse.json({ error: "Hizmet eklenemedi" }, { status: 500 })
  }
}
