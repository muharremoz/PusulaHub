import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { deriveDataName } from "@/lib/demo-database-naming"
import type { DemoDatabaseDto } from "../route"

/** /api/demo-databases/[id] — PATCH güncelle, DELETE sil. */

interface Row {
  id: number; name: string; data_name: string; location_type: string
  location_path: string | null; description: string | null; display_order: number; is_active: boolean
}
const DEMO_COLS = "id, name, data_name, location_type, location_path, description, display_order, is_active"

function rowToDto(r: Row, serviceIds: number[]): DemoDatabaseDto {
  return {
    id: r.id, name: r.name, dataName: r.data_name, locationType: r.location_type,
    locationPath: r.location_path, description: r.description, displayOrder: r.display_order,
    isActive: !!r.is_active, serviceIds,
  }
}

interface PatchPayload {
  name?: string; locationType?: string; locationPath?: string | null
  description?: string | null; displayOrder?: number; isActive?: boolean; serviceIds?: number[]
}
const ALLOWED_LOCATION_TYPES = ["Yerel", "Şablon", "Uzak"]

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const numericId = Number(id)
    if (!Number.isFinite(numericId)) return NextResponse.json({ error: "Geçersiz id" }, { status: 400 })

    const body = (await req.json()) as PatchPayload
    const sb = await getSupabaseServer()

    const { data: cur } = await sb.schema("hub").from("demo_databases").select(DEMO_COLS).eq("id", numericId).maybeSingle()
    if (!cur) return NextResponse.json({ error: "Demo veritabanı bulunamadı" }, { status: 404 })
    const c = cur as unknown as Row

    const nextName         = body.name         !== undefined ? body.name.trim()         : c.name
    const nextLocationType = body.locationType !== undefined ? body.locationType.trim() : c.location_type
    const nextLocationPath = body.locationPath !== undefined ? (body.locationPath ? String(body.locationPath).trim() : null) : c.location_path
    const nextDescription  = body.description  !== undefined ? (body.description  ? String(body.description).trim()  : null) : c.description
    const nextDisplayOrder = body.displayOrder !== undefined ? Number(body.displayOrder) : c.display_order
    const nextIsActive     = body.isActive     !== undefined ? body.isActive : c.is_active

    if (!nextName) return NextResponse.json({ error: "name boş olamaz" }, { status: 400 })
    const nextDataName = body.name !== undefined ? deriveDataName(nextName) : c.data_name
    if (!nextDataName) return NextResponse.json({ error: "Görünen addan teknik isim türetilemedi" }, { status: 400 })
    if (!ALLOWED_LOCATION_TYPES.includes(nextLocationType)) {
      return NextResponse.json({ error: `locationType geçersiz (${ALLOWED_LOCATION_TYPES.join(" | ")})` }, { status: 400 })
    }

    const { data: updated, error } = await sb.schema("hub").from("demo_databases").update({
      name: nextName, data_name: nextDataName, location_type: nextLocationType, location_path: nextLocationPath,
      description: nextDescription, display_order: nextDisplayOrder, is_active: nextIsActive, updated_at: new Date().toISOString(),
    }).eq("id", numericId).select(DEMO_COLS).single()
    if (error) throw error

    let finalServiceIds: number[]
    if (Array.isArray(body.serviceIds)) {
      const newIds = body.serviceIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      await sb.schema("hub").from("demo_database_services").delete().eq("demo_database_id", numericId)
      if (newIds.length) {
        const { error: jErr } = await sb.schema("hub").from("demo_database_services")
          .insert(newIds.map((sid) => ({ demo_database_id: numericId, service_id: sid })))
        if (jErr) console.warn("[PATCH /api/demo-databases/[id]] junction insert hatası", jErr)
      }
      finalServiceIds = newIds
    } else {
      const { data: existing } = await sb.schema("hub").from("demo_database_services").select("service_id").eq("demo_database_id", numericId)
      finalServiceIds = ((existing ?? []) as { service_id: number }[]).map((j) => j.service_id)
    }

    return NextResponse.json(rowToDto(updated as unknown as Row, finalServiceIds))
  } catch (err) {
    console.error("[PATCH /api/demo-databases/[id]]", err)
    return NextResponse.json({ error: "Demo veritabanı güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const numericId = Number(id)
    if (!Number.isFinite(numericId)) return NextResponse.json({ error: "Geçersiz id" }, { status: 400 })
    const sb = await getSupabaseServer()
    const { data, error } = await sb.schema("hub").from("demo_databases").delete().eq("id", numericId).select("id")
    if (error) throw error
    if (!data?.length) return NextResponse.json({ error: "Demo veritabanı bulunamadı" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/demo-databases/[id]]", err)
    return NextResponse.json({ error: "Demo veritabanı silinemedi" }, { status: 500 })
  }
}
