import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { deriveDataName } from "@/lib/demo-database-naming"

/**
 * /api/demo-databases
 *   GET  → Tüm demo veritabanlarını döner. `?onlyActive=true` ile filtre.
 *   POST → Yeni demo veritabanı ekler.
 *
 * Firma kurulum sihirbazı 5. adım "Demo Veritabanı" modu için katalog.
 * Mock data yerine burası tek doğruluk noktasıdır.
 *
 * Her demo DB, bir veya birden fazla "pusula-program" tipi WizardServices
 * kaydına bağlanabilir (DemoDatabaseServices junction).
 */

export interface DemoDatabaseDto {
  id:           number
  name:         string
  dataName:     string
  locationType: string
  locationPath: string | null
  description:  string | null
  displayOrder: number
  isActive:     boolean
  serviceIds:   number[]
}

interface Row {
  id:            number
  name:          string
  data_name:     string
  location_type: string
  location_path: string | null
  description:   string | null
  display_order: number
  is_active:     boolean
}

function rowToDto(r: Row, serviceIds: number[]): DemoDatabaseDto {
  return {
    id:           r.id,
    name:         r.name,
    dataName:     r.data_name,
    locationType: r.location_type,
    locationPath: r.location_path,
    description:  r.description,
    displayOrder: r.display_order,
    isActive:     !!r.is_active,
    serviceIds,
  }
}

const DEMO_COLS = "id, name, data_name, location_type, location_path, description, display_order, is_active"

/* ── GET ──────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const onlyActive = req.nextUrl.searchParams.get("onlyActive") === "true"
    const sb = await getSupabaseServer()

    let rq = sb.schema("hub").from("demo_databases").select(DEMO_COLS)
      .order("display_order", { ascending: true }).order("name", { ascending: true })
    if (onlyActive) rq = rq.eq("is_active", true)
    const { data: rows } = await rq

    const { data: junction } = await sb.schema("hub").from("demo_database_services").select("demo_database_id, service_id")
    const serviceMap = new Map<number, number[]>()
    for (const j of (junction ?? []) as { demo_database_id: number; service_id: number }[]) {
      const list = serviceMap.get(j.demo_database_id) ?? []
      list.push(j.service_id); serviceMap.set(j.demo_database_id, list)
    }

    return NextResponse.json(((rows ?? []) as unknown as Row[]).map((r) => rowToDto(r, serviceMap.get(r.id) ?? [])))
  } catch (err) {
    console.error("[GET /api/demo-databases]", err)
    return NextResponse.json({ error: "Demo veritabanları alınamadı" }, { status: 500 })
  }
}

/* ── POST ─────────────────────────────────────────────── */
interface CreatePayload {
  name?:         string
  locationType?: string
  locationPath?: string | null
  description?:  string | null
  displayOrder?: number
  isActive?:     boolean
  serviceIds?:   number[]
}

const ALLOWED_LOCATION_TYPES = ["Yerel", "Şablon", "Uzak"]

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreatePayload

    const name         = (body.name     ?? "").trim()
    const locationType = (body.locationType ?? "Yerel").trim()
    const locationPath = body.locationPath ? String(body.locationPath).trim() : null
    const description  = body.description  ? String(body.description).trim()  : null
    const displayOrder = Number.isFinite(body.displayOrder) ? Number(body.displayOrder) : 0
    const isActive     = body.isActive !== false
    const serviceIds   = Array.isArray(body.serviceIds)
      ? body.serviceIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : []

    if (!name) return NextResponse.json({ error: "name zorunlu" }, { status: 400 })

    const dataName = deriveDataName(name)
    if (!dataName) {
      return NextResponse.json(
        { error: "Görünen addan teknik isim türetilemedi (yalnız harf/rakam içeren bir ad deneyin)" },
        { status: 400 },
      )
    }

    if (!ALLOWED_LOCATION_TYPES.includes(locationType)) {
      return NextResponse.json(
        { error: `locationType geçersiz (${ALLOWED_LOCATION_TYPES.join(" | ")})` },
        { status: 400 },
      )
    }

    const sb = await getSupabaseServer()
    const { data: created, error } = await sb.schema("hub").from("demo_databases").insert({
      name, data_name: dataName, location_type: locationType, location_path: locationPath,
      description, display_order: displayOrder, is_active: isActive,
    }).select(DEMO_COLS).single()
    if (error) throw error
    const row = created as unknown as Row

    if (serviceIds.length) {
      const { error: jErr } = await sb.schema("hub").from("demo_database_services")
        .insert(serviceIds.map((sid) => ({ demo_database_id: row.id, service_id: sid })))
      if (jErr) console.warn("[POST /api/demo-databases] junction insert hatası", jErr)
    }

    return NextResponse.json(rowToDto(row, serviceIds), { status: 201 })
  } catch (err) {
    console.error("[POST /api/demo-databases]", err)
    return NextResponse.json({ error: "Demo veritabanı eklenemedi" }, { status: 500 })
  }
}
