import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"
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
  Id:           number
  Name:         string
  DataName:     string
  LocationType: string
  LocationPath: string | null
  Description:  string | null
  DisplayOrder: number
  IsActive:     boolean
}

interface JunctionRow {
  DemoDatabaseId: number
  ServiceId:      number
}

function rowToDto(r: Row, serviceIds: number[]): DemoDatabaseDto {
  return {
    id:           r.Id,
    name:         r.Name,
    dataName:     r.DataName,
    locationType: r.LocationType,
    locationPath: r.LocationPath,
    description:  r.Description,
    displayOrder: r.DisplayOrder,
    isActive:     !!r.IsActive,
    serviceIds,
  }
}

/* ── GET ──────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const onlyActive = req.nextUrl.searchParams.get("onlyActive") === "true"

    const rows = onlyActive
      ? await query<Row[]>`
          SELECT Id, Name, DataName, LocationType, LocationPath, Description, DisplayOrder, IsActive
          FROM DemoDatabases
          WHERE IsActive = 1
          ORDER BY DisplayOrder ASC, Name ASC
        `
      : await query<Row[]>`
          SELECT Id, Name, DataName, LocationType, LocationPath, Description, DisplayOrder, IsActive
          FROM DemoDatabases
          ORDER BY DisplayOrder ASC, Name ASC
        `

    // Junction'ları tek sorguda çek, map'le
    const junction = await query<JunctionRow[]>`
      SELECT DemoDatabaseId, ServiceId FROM DemoDatabaseServices
    `
    const serviceMap = new Map<number, number[]>()
    for (const j of junction) {
      const list = serviceMap.get(j.DemoDatabaseId) ?? []
      list.push(j.ServiceId)
      serviceMap.set(j.DemoDatabaseId, list)
    }

    return NextResponse.json(rows.map((r) => rowToDto(r, serviceMap.get(r.Id) ?? [])))
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

    const result = await execute`
      INSERT INTO DemoDatabases (Name, DataName, LocationType, LocationPath, Description, DisplayOrder, IsActive)
      OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.DataName, INSERTED.LocationType,
             INSERTED.LocationPath, INSERTED.Description, INSERTED.DisplayOrder, INSERTED.IsActive
      VALUES (${name}, ${dataName}, ${locationType}, ${locationPath}, ${description}, ${displayOrder}, ${isActive ? 1 : 0})
    `

    const created = (result.recordset as Row[])[0]

    // Junction ekle
    for (const sid of serviceIds) {
      try {
        await execute`
          INSERT INTO DemoDatabaseServices (DemoDatabaseId, ServiceId)
          VALUES (${created.Id}, ${sid})
        `
      } catch (e) {
        // FK hatası veya duplicate → sessiz geç
        console.warn("[POST /api/demo-databases] junction insert hatası", e)
      }
    }

    return NextResponse.json(rowToDto(created, serviceIds), { status: 201 })
  } catch (err) {
    console.error("[POST /api/demo-databases]", err)
    return NextResponse.json({ error: "Demo veritabanı eklenemedi" }, { status: 500 })
  }
}
