import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import {
  SERVICE_TYPES, WIZARD_SERVICE_COLS, parseConfig, validateConfig, wizardServiceRowToDto,
  type ServiceType, type WizardServiceRow,
} from "@/lib/wizard-service-config"

/**
 * /api/services/[id]
 *   PATCH  → Hizmeti günceller (alanlar opsiyonel; yalnız gönderilen alanlar değişir)
 *   DELETE → Hizmeti tamamen siler. Soft delete istenirse PATCH ile isActive=false kullanılabilir.
 *
 * Type değişimi destekleniyor — yeni type için config tam set verilmek zorunda.
 */

interface PatchPayload {
  name?:         string
  category?:     string
  type?:         ServiceType
  config?:       unknown
  displayOrder?: number
  isActive?:     boolean
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params
    const numericId = Number(id)
    if (!Number.isFinite(numericId)) {
      return NextResponse.json({ error: "Geçersiz id" }, { status: 400 })
    }

    const body = (await req.json()) as PatchPayload
    const sb = await getSupabaseServer()

    const { data: current } = await sb.schema("hub").from("wizard_services").select(WIZARD_SERVICE_COLS).eq("id", numericId).maybeSingle()
    if (!current) return NextResponse.json({ error: "Hizmet bulunamadı" }, { status: 404 })
    const cur = current as unknown as WizardServiceRow

    const nextName     = body.name     !== undefined ? body.name.trim()     : cur.name
    const nextCategory = body.category !== undefined ? body.category.trim() : cur.category
    const nextType: ServiceType = (body.type ?? (cur.type as ServiceType))
    const nextDisplayOrder = body.displayOrder !== undefined ? Number(body.displayOrder) : cur.display_order
    const nextIsActive = body.isActive !== undefined ? body.isActive : cur.is_active

    if (!nextName)     return NextResponse.json({ error: "name boş olamaz" },     { status: 400 })
    if (!nextCategory) return NextResponse.json({ error: "category boş olamaz" }, { status: 400 })
    if (!SERVICE_TYPES.includes(nextType)) {
      return NextResponse.json({ error: "type geçersiz" }, { status: 400 })
    }

    // Mevcut (ham) config — aynı tipte kalınıyorsa gizli alanlar (Pars şifresi) buradan korunur.
    const curConfig = nextType === cur.type ? parseConfig(cur.config) : null

    // Config: yeni payload geldiyse tam validate; gelmediyse mevcut config'i al.
    // Type değiştiyse config payload zorunlu (eski config yeni type'a uymaz).
    let nextConfigJson: string
    if (body.config !== undefined) {
      const v = validateConfig(nextType, body.config, curConfig)
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      nextConfigJson = JSON.stringify(v.config)
    } else {
      if (body.type && body.type !== cur.type) {
        return NextResponse.json(
          { error: "type değiştiğinde config payload da gönderilmeli" },
          { status: 400 },
        )
      }
      // Mevcut config'i parse + re-validate (eski şema kalıntısı için).
      const v = validateConfig(nextType, curConfig, curConfig)
      if (!v.ok) {
        return NextResponse.json(
          { error: `Mevcut config geçersiz: ${v.error}. Lütfen config alanlarını da gönderin.` },
          { status: 400 },
        )
      }
      nextConfigJson = JSON.stringify(v.config)
    }

    const { data: updated, error } = await sb.schema("hub").from("wizard_services").update({
      name: nextName, category: nextCategory, type: nextType, config: nextConfigJson,
      display_order: nextDisplayOrder, is_active: nextIsActive, updated_at: new Date().toISOString(),
    }).eq("id", numericId).select(WIZARD_SERVICE_COLS).single()
    if (error) throw error
    return NextResponse.json(wizardServiceRowToDto(updated as unknown as WizardServiceRow))
  } catch (err) {
    console.error("[PATCH /api/services/[id]]", err)
    return NextResponse.json({ error: "Hizmet güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params
    const numericId = Number(id)
    if (!Number.isFinite(numericId)) {
      return NextResponse.json({ error: "Geçersiz id" }, { status: 400 })
    }

    const sb = await getSupabaseServer()
    const { data, error } = await sb.schema("hub").from("wizard_services").delete().eq("id", numericId).select("id")
    if (error) throw error
    if (!data?.length) return NextResponse.json({ error: "Hizmet bulunamadı" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/services/[id]]", err)
    return NextResponse.json({ error: "Hizmet silinemedi" }, { status: 500 })
  }
}
