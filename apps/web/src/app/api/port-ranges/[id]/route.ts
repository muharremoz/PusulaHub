import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"
import type { PortRangeDto, PortProtocol } from "../route"

/**
 * /api/port-ranges/[id]
 *   PATCH  → Aralık günceller
 *   DELETE → Aralık siler (atanmış portu varsa reddet)
 */

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

const VALID_PROTOCOLS: PortProtocol[] = ["TCP", "UDP", "TCP/UDP"]

interface PatchPayload {
  name?:        string
  portStart?:   number
  portEnd?:     number
  protocol?:    PortProtocol
  description?: string | null
  isActive?:    boolean
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

    const current = await query<Row[]>`
      SELECT r.Id, r.Name, r.PortStart, r.PortEnd, r.Protocol, r.Description, r.IsActive,
             (SELECT COUNT(*) FROM WizardPortAssignments a WHERE a.PortRangeId = r.Id) AS UsedCount
      FROM WizardPortRanges r WHERE r.Id = ${numericId}
    `
    if (!current.length) {
      return NextResponse.json({ error: "Port aralığı bulunamadı" }, { status: 404 })
    }
    const cur = current[0]

    const nextName        = body.name        !== undefined ? body.name.trim()        : cur.Name
    const nextPortStart   = body.portStart   !== undefined ? Number(body.portStart)  : cur.PortStart
    const nextPortEnd     = body.portEnd     !== undefined ? Number(body.portEnd)    : cur.PortEnd
    const nextProtocol    = body.protocol    !== undefined ? body.protocol           : (cur.Protocol as PortProtocol)
    const nextDescription = body.description !== undefined ? (body.description?.trim() || null) : cur.Description
    const nextIsActive    = body.isActive    !== undefined ? (body.isActive ? 1 : 0) : (cur.IsActive ? 1 : 0)

    if (!nextName) return NextResponse.json({ error: "name boş olamaz" }, { status: 400 })
    if (!Number.isFinite(nextPortStart) || nextPortStart < 1 || nextPortStart > 65535) {
      return NextResponse.json({ error: "portStart 1-65535 olmalı" }, { status: 400 })
    }
    if (!Number.isFinite(nextPortEnd) || nextPortEnd < 1 || nextPortEnd > 65535) {
      return NextResponse.json({ error: "portEnd 1-65535 olmalı" }, { status: 400 })
    }
    if (nextPortEnd < nextPortStart) {
      return NextResponse.json({ error: "portEnd, portStart'tan küçük olamaz" }, { status: 400 })
    }
    if (!VALID_PROTOCOLS.includes(nextProtocol)) {
      return NextResponse.json({ error: "Geçersiz protocol" }, { status: 400 })
    }

    // Aralık daraltılıyorsa, atanmış portlar yeni aralığa uyuyor mu?
    const outOfRange = await query<{ Port: number }[]>`
      SELECT Port FROM WizardPortAssignments
      WHERE PortRangeId = ${numericId}
        AND (Port < ${nextPortStart} OR Port > ${nextPortEnd})
    `
    if (outOfRange.length > 0) {
      return NextResponse.json(
        { error: `Atanmış ${outOfRange.length} port yeni aralığın dışında kalıyor. Aralığı genişletin veya önce atamaları temizleyin.` },
        { status: 409 },
      )
    }

    // Çakışma kontrolü (kendisi hariç)
    const overlap = await query<{ Id: number; Name: string }[]>`
      SELECT Id, Name FROM WizardPortRanges
      WHERE Id != ${numericId}
        AND Protocol = ${nextProtocol}
        AND PortStart <= ${nextPortEnd}
        AND PortEnd   >= ${nextPortStart}
    `
    if (overlap.length > 0) {
      return NextResponse.json(
        { error: `Aralık başka bir tanımla çakışıyor: ${overlap[0].Name}` },
        { status: 409 },
      )
    }

    const result = await execute`
      UPDATE WizardPortRanges SET
        Name        = ${nextName},
        PortStart   = ${nextPortStart},
        PortEnd     = ${nextPortEnd},
        Protocol    = ${nextProtocol},
        Description = ${nextDescription},
        IsActive    = ${nextIsActive},
        UpdatedAt   = SYSDATETIME()
      OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.PortStart, INSERTED.PortEnd,
             INSERTED.Protocol, INSERTED.Description, INSERTED.IsActive
      WHERE Id = ${numericId}
    `

    const updated = result.recordset[0] as Row
    updated.UsedCount = cur.UsedCount
    return NextResponse.json(rowToDto(updated))
  } catch (err) {
    console.error("[PATCH /api/port-ranges/[id]]", err)
    return NextResponse.json({ error: "Port aralığı güncellenemedi" }, { status: 500 })
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

    // Atanmış portu varsa silinemez
    const used = await query<{ Cnt: number }[]>`
      SELECT COUNT(*) AS Cnt FROM WizardPortAssignments WHERE PortRangeId = ${numericId}
    `
    if ((used[0]?.Cnt ?? 0) > 0) {
      return NextResponse.json(
        { error: `Aralıkta ${used[0].Cnt} atanmış port var. Önce atamaları temizleyin.` },
        { status: 409 },
      )
    }

    // Hizmet referans veriyorsa? — JSON içinde portRangeId, FK yok. Soft check:
    const refs = await query<{ Id: number; Name: string }[]>`
      SELECT Id, Name FROM WizardServices
      WHERE Type = 'iis-site' AND Config LIKE ${`%"portRangeId":${numericId}%`}
    `
    if (refs.length > 0) {
      return NextResponse.json(
        { error: `${refs.length} hizmet bu aralığı kullanıyor (örn: ${refs[0].Name}). Önce hizmetleri başka aralığa taşıyın.` },
        { status: 409 },
      )
    }

    const result = await execute`DELETE FROM WizardPortRanges WHERE Id = ${numericId}`
    if (result.rowsAffected[0] === 0) {
      return NextResponse.json({ error: "Port aralığı bulunamadı" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/port-ranges/[id]]", err)
    return NextResponse.json({ error: "Port aralığı silinemedi" }, { status: 500 })
  }
}
