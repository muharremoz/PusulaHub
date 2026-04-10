import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"
import { deriveDataName } from "@/lib/demo-database-naming"
import type { DemoDatabaseDto } from "../route"

/**
 * /api/demo-databases/[id]
 *   PATCH  → Demo veritabanını günceller (alanlar opsiyonel).
 *   DELETE → Demo veritabanını kalıcı olarak siler.
 */

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

interface PatchPayload {
  name?:         string
  locationType?: string
  locationPath?: string | null
  description?:  string | null
  displayOrder?: number
  isActive?:     boolean
  serviceIds?:   number[]
}

const ALLOWED_LOCATION_TYPES = ["Yerel", "Şablon", "Uzak"]

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

    const current = await query<Row[]>`
      SELECT Id, Name, DataName, LocationType, LocationPath, Description, DisplayOrder, IsActive
      FROM DemoDatabases WHERE Id = ${numericId}
    `
    if (!current.length) {
      return NextResponse.json({ error: "Demo veritabanı bulunamadı" }, { status: 404 })
    }
    const cur = current[0]

    const nextName         = body.name         !== undefined ? body.name.trim()         : cur.Name
    const nextLocationType = body.locationType !== undefined ? body.locationType.trim() : cur.LocationType
    const nextLocationPath = body.locationPath !== undefined ? (body.locationPath ? String(body.locationPath).trim() : null) : cur.LocationPath
    const nextDescription  = body.description  !== undefined ? (body.description  ? String(body.description).trim()  : null) : cur.Description
    const nextDisplayOrder = body.displayOrder !== undefined ? Number(body.displayOrder) : cur.DisplayOrder
    const nextIsActive     = body.isActive     !== undefined ? (body.isActive ? 1 : 0)   : (cur.IsActive ? 1 : 0)

    if (!nextName) return NextResponse.json({ error: "name boş olamaz" }, { status: 400 })

    // Ad değişmişse teknik ismi yeniden türet; aksi halde mevcut değeri koru.
    const nextDataName = body.name !== undefined ? deriveDataName(nextName) : cur.DataName
    if (!nextDataName) {
      return NextResponse.json(
        { error: "Görünen addan teknik isim türetilemedi" },
        { status: 400 },
      )
    }

    if (!ALLOWED_LOCATION_TYPES.includes(nextLocationType)) {
      return NextResponse.json(
        { error: `locationType geçersiz (${ALLOWED_LOCATION_TYPES.join(" | ")})` },
        { status: 400 },
      )
    }

    const result = await execute`
      UPDATE DemoDatabases SET
        Name         = ${nextName},
        DataName     = ${nextDataName},
        LocationType = ${nextLocationType},
        LocationPath = ${nextLocationPath},
        Description  = ${nextDescription},
        DisplayOrder = ${nextDisplayOrder},
        IsActive     = ${nextIsActive},
        UpdatedAt    = SYSDATETIME()
      OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.DataName, INSERTED.LocationType,
             INSERTED.LocationPath, INSERTED.Description, INSERTED.DisplayOrder, INSERTED.IsActive
      WHERE Id = ${numericId}
    `

    // Junction — yalnızca serviceIds gönderildiyse güncelle
    let finalServiceIds: number[]
    if (Array.isArray(body.serviceIds)) {
      const newIds = body.serviceIds
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)

      await execute`DELETE FROM DemoDatabaseServices WHERE DemoDatabaseId = ${numericId}`
      for (const sid of newIds) {
        try {
          await execute`
            INSERT INTO DemoDatabaseServices (DemoDatabaseId, ServiceId)
            VALUES (${numericId}, ${sid})
          `
        } catch (e) {
          console.warn("[PATCH /api/demo-databases/[id]] junction insert hatası", e)
        }
      }
      finalServiceIds = newIds
    } else {
      const existing = await query<JunctionRow[]>`
        SELECT DemoDatabaseId, ServiceId FROM DemoDatabaseServices WHERE DemoDatabaseId = ${numericId}
      `
      finalServiceIds = existing.map((j) => j.ServiceId)
    }

    const rows = result.recordset as Row[]
    return NextResponse.json(rowToDto(rows[0], finalServiceIds))
  } catch (err) {
    console.error("[PATCH /api/demo-databases/[id]]", err)
    return NextResponse.json({ error: "Demo veritabanı güncellenemedi" }, { status: 500 })
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

    const result = await execute`DELETE FROM DemoDatabases WHERE Id = ${numericId}`
    if (result.rowsAffected[0] === 0) {
      return NextResponse.json({ error: "Demo veritabanı bulunamadı" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/demo-databases/[id]]", err)
    return NextResponse.json({ error: "Demo veritabanı silinemedi" }, { status: 500 })
  }
}
