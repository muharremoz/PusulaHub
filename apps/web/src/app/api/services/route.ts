import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import {
  SERVICE_TYPES, WIZARD_SERVICE_COLS, validateConfig, wizardServiceRowToDto,
  type ServiceType, type WizardServiceRow,
} from "@/lib/wizard-service-config"

/**
 * /api/services
 *   GET  → WizardServices kataloğu (default: hepsi). ?onlyActive=true ile filtre.
 *   POST → Yeni hizmet ekler.
 *
 * Tek doğruluk noktası: Hem /services yönetim ekranı, hem firma kurulum
 * sihirbazı 4. adımı, hem IIS/port range sheet'leri buradan beslenir.
 *
 * Hizmet türleri ve config şemaları: `@/lib/wizard-service-config`.
 */

export type {
  ServiceType, ServiceConfig, WizardServiceDto,
  PusulaProgramConfig, IisSiteConfig, IisResimConfig, ParsConfig,
} from "@/lib/wizard-service-config"

/* ── GET ──────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const gate = await requirePermission("services", "read")
  if (gate) return gate
  try {
    const onlyActive = req.nextUrl.searchParams.get("onlyActive") === "true"
    const sb = await getSupabaseServer()
    let rq = sb.schema("hub").from("wizard_services").select(WIZARD_SERVICE_COLS)
      .order("display_order", { ascending: true }).order("name", { ascending: true })
    if (onlyActive) rq = rq.eq("is_active", true)
    const { data: rows } = await rq

    return NextResponse.json(((rows ?? []) as unknown as WizardServiceRow[]).map(wizardServiceRowToDto))
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
    if (!type || !SERVICE_TYPES.includes(type)) {
      return NextResponse.json({ error: `type zorunlu (${SERVICE_TYPES.join(" | ")})` }, { status: 400 })
    }

    const v = validateConfig(type, body.config)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const configJson = JSON.stringify(v.config)
    const sb = await getSupabaseServer()
    const { data: created, error } = await sb.schema("hub").from("wizard_services").insert({
      name, category, type, config: configJson, display_order: displayOrder, is_active: isActive,
    }).select(WIZARD_SERVICE_COLS).single()
    if (error) throw error
    return NextResponse.json(wizardServiceRowToDto(created as unknown as WizardServiceRow), { status: 201 })
  } catch (err) {
    console.error("[POST /api/services]", err)
    return NextResponse.json({ error: "Hizmet eklenemedi" }, { status: 500 })
  }
}
