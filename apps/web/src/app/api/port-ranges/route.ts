import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"

/**
 * /api/port-ranges
 *   GET  → Tüm port aralıkları + her birinin kullanım sayısı (atanmış port sayısı)
 *   POST → Yeni port aralığı ekler
 *
 * Port aralıkları bağımsız entity. Hizmet (iis-site) tanımlanırken bir aralık seçer.
 * Sihirbaz çalıştığında havuzdaki sıradaki boş port atanır → WizardPortAssignments.
 */

export type PortProtocol = "TCP" | "UDP" | "TCP/UDP"

export interface PortRangeDto {
  id:          number
  name:        string
  portStart:   number
  portEnd:     number
  protocol:    PortProtocol
  description: string | null
  isActive:    boolean
  totalPorts:  number
  usedCount:   number     // o aralıkta kaç port atanmış
}

interface Row {
  Id:          number
  Name:        string
  PortStart:   number
  PortEnd:     number
  Protocol:    string
  Description: string | null
  IsActive:    boolean
  UsedCount:   number
}

function rowToDto(r: Row): PortRangeDto {
  return {
    id:          r.Id,
    name:        r.Name,
    portStart:   r.PortStart,
    portEnd:     r.PortEnd,
    protocol:    (r.Protocol as PortProtocol) ?? "TCP",
    description: r.Description,
    isActive:    !!r.IsActive,
    totalPorts:  r.PortEnd - r.PortStart + 1,
    usedCount:   r.UsedCount ?? 0,
  }
}

/* ── GET ──────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const onlyActive = req.nextUrl.searchParams.get("onlyActive") === "true"

    const rows = onlyActive
      ? await query<Row[]>`
          SELECT r.Id, r.Name, r.PortStart, r.PortEnd, r.Protocol, r.Description, r.IsActive,
                 (SELECT COUNT(*) FROM WizardPortAssignments a WHERE a.PortRangeId = r.Id) AS UsedCount
          FROM WizardPortRanges r
          WHERE r.IsActive = 1
          ORDER BY r.PortStart ASC
        `
      : await query<Row[]>`
          SELECT r.Id, r.Name, r.PortStart, r.PortEnd, r.Protocol, r.Description, r.IsActive,
                 (SELECT COUNT(*) FROM WizardPortAssignments a WHERE a.PortRangeId = r.Id) AS UsedCount
          FROM WizardPortRanges r
          ORDER BY r.PortStart ASC
        `

    return NextResponse.json(rows.map(rowToDto))
  } catch (err) {
    console.error("[GET /api/port-ranges]", err)
    return NextResponse.json({ error: "Port aralıkları alınamadı" }, { status: 500 })
  }
}

/* ── POST ─────────────────────────────────────────────── */
interface CreatePayload {
  name?:        string
  portStart?:   number
  portEnd?:     number
  protocol?:    PortProtocol
  description?: string | null
  isActive?:    boolean
}

const VALID_PROTOCOLS: PortProtocol[] = ["TCP", "UDP", "TCP/UDP"]

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreatePayload

    const name        = (body.name ?? "").trim()
    const portStart   = Number(body.portStart)
    const portEnd     = Number(body.portEnd)
    const protocol    = body.protocol ?? "TCP"
    const description = body.description?.trim() || null
    const isActive    = body.isActive !== false

    if (!name) return NextResponse.json({ error: "name zorunlu" }, { status: 400 })
    if (!Number.isFinite(portStart) || portStart < 1 || portStart > 65535) {
      return NextResponse.json({ error: "portStart 1-65535 olmalı" }, { status: 400 })
    }
    if (!Number.isFinite(portEnd) || portEnd < 1 || portEnd > 65535) {
      return NextResponse.json({ error: "portEnd 1-65535 olmalı" }, { status: 400 })
    }
    if (portEnd < portStart) {
      return NextResponse.json({ error: "portEnd, portStart'tan küçük olamaz" }, { status: 400 })
    }
    if (!VALID_PROTOCOLS.includes(protocol)) {
      return NextResponse.json({ error: "Geçersiz protocol" }, { status: 400 })
    }

    // Çakışma kontrolü: aynı protocol'de aralık çakışıyorsa reddet
    const overlap = await query<{ Id: number; Name: string }[]>`
      SELECT Id, Name FROM WizardPortRanges
      WHERE Protocol = ${protocol}
        AND PortStart <= ${portEnd}
        AND PortEnd   >= ${portStart}
    `
    if (overlap.length > 0) {
      return NextResponse.json(
        { error: `Aralık başka bir tanımla çakışıyor: ${overlap[0].Name}` },
        { status: 409 },
      )
    }

    const result = await execute`
      INSERT INTO WizardPortRanges (Name, PortStart, PortEnd, Protocol, Description, IsActive)
      OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.PortStart, INSERTED.PortEnd,
             INSERTED.Protocol, INSERTED.Description, INSERTED.IsActive
      VALUES (${name}, ${portStart}, ${portEnd}, ${protocol}, ${description}, ${isActive ? 1 : 0})
    `
    const created = result.recordset[0] as Row
    created.UsedCount = 0
    return NextResponse.json(rowToDto(created), { status: 201 })
  } catch (err) {
    console.error("[POST /api/port-ranges]", err)
    return NextResponse.json({ error: "Port aralığı eklenemedi" }, { status: 500 })
  }
}
