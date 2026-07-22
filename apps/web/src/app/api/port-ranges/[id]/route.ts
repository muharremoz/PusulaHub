import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import type { PortRangeDto, PortProtocol } from "../route"

/** /api/port-ranges/[id] — PATCH güncelle, DELETE sil. */

interface Row {
  id: number; name: string; port_start: number; port_end: number
  protocol: string; description: string | null; is_active: boolean; UsedCount: number
}
const PR_COLS = "id, name, port_start, port_end, protocol, description, is_active"

function rowToDto(r: Row): PortRangeDto {
  return {
    id: r.id, name: r.name, portStart: r.port_start, portEnd: r.port_end,
    protocol: (r.protocol as PortProtocol) ?? "TCP", description: r.description,
    isActive: !!r.is_active, totalPorts: r.port_end - r.port_start + 1, usedCount: r.UsedCount ?? 0,
  }
}

const VALID_PROTOCOLS: PortProtocol[] = ["TCP", "UDP", "TCP/UDP"]

interface PatchPayload {
  name?: string; portStart?: number; portEnd?: number
  protocol?: PortProtocol; description?: string | null; isActive?: boolean
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const numericId = Number(id)
    if (!Number.isFinite(numericId)) return NextResponse.json({ error: "Geçersiz id" }, { status: 400 })

    const body = (await req.json()) as PatchPayload
    const sb = await getSupabaseServer()

    const { data: cur } = await sb.schema("hub").from("wizard_port_ranges").select(PR_COLS).eq("id", numericId).maybeSingle()
    if (!cur) return NextResponse.json({ error: "Port aralığı bulunamadı" }, { status: 404 })
    const c = cur as unknown as Row
    const { count: usedCount } = await sb.schema("hub").from("wizard_port_assignments")
      .select("id", { count: "exact", head: true }).eq("port_range_id", numericId)

    const nextName        = body.name        !== undefined ? body.name.trim()        : c.name
    const nextPortStart   = body.portStart   !== undefined ? Number(body.portStart)  : c.port_start
    const nextPortEnd     = body.portEnd     !== undefined ? Number(body.portEnd)    : c.port_end
    const nextProtocol    = body.protocol    !== undefined ? body.protocol           : (c.protocol as PortProtocol)
    const nextDescription = body.description !== undefined ? (body.description?.trim() || null) : c.description
    const nextIsActive    = body.isActive    !== undefined ? body.isActive : c.is_active

    if (!nextName) return NextResponse.json({ error: "name boş olamaz" }, { status: 400 })
    if (!Number.isFinite(nextPortStart) || nextPortStart < 1 || nextPortStart > 65535) return NextResponse.json({ error: "portStart 1-65535 olmalı" }, { status: 400 })
    if (!Number.isFinite(nextPortEnd) || nextPortEnd < 1 || nextPortEnd > 65535) return NextResponse.json({ error: "portEnd 1-65535 olmalı" }, { status: 400 })
    if (nextPortEnd < nextPortStart) return NextResponse.json({ error: "portEnd, portStart'tan küçük olamaz" }, { status: 400 })
    if (!VALID_PROTOCOLS.includes(nextProtocol)) return NextResponse.json({ error: "Geçersiz protocol" }, { status: 400 })

    const { data: outOfRange } = await sb.schema("hub").from("wizard_port_assignments")
      .select("port").eq("port_range_id", numericId).or(`port.lt.${nextPortStart},port.gt.${nextPortEnd}`)
    if (outOfRange && outOfRange.length > 0) {
      return NextResponse.json({ error: `Atanmış ${outOfRange.length} port yeni aralığın dışında kalıyor. Aralığı genişletin veya önce atamaları temizleyin.` }, { status: 409 })
    }

    const { data: overlap } = await sb.schema("hub").from("wizard_port_ranges")
      .select("id, name").neq("id", numericId).eq("protocol", nextProtocol).lte("port_start", nextPortEnd).gte("port_end", nextPortStart)
    if (overlap && overlap.length > 0) {
      return NextResponse.json({ error: `Aralık başka bir tanımla çakışıyor: ${(overlap[0] as { name: string }).name}` }, { status: 409 })
    }

    const { data: updated, error } = await sb.schema("hub").from("wizard_port_ranges").update({
      name: nextName, port_start: nextPortStart, port_end: nextPortEnd, protocol: nextProtocol,
      description: nextDescription, is_active: nextIsActive, updated_at: new Date().toISOString(),
    }).eq("id", numericId).select(PR_COLS).single()
    if (error) throw error

    return NextResponse.json(rowToDto({ ...(updated as unknown as Row), UsedCount: usedCount ?? 0 }))
  } catch (err) {
    console.error("[PATCH /api/port-ranges/[id]]", err)
    return NextResponse.json({ error: "Port aralığı güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const numericId = Number(id)
    if (!Number.isFinite(numericId)) return NextResponse.json({ error: "Geçersiz id" }, { status: 400 })
    const sb = await getSupabaseServer()

    const { count: used } = await sb.schema("hub").from("wizard_port_assignments")
      .select("id", { count: "exact", head: true }).eq("port_range_id", numericId)
    if ((used ?? 0) > 0) {
      return NextResponse.json({ error: `Aralıkta ${used} atanmış port var. Önce atamaları temizleyin.` }, { status: 409 })
    }

    const { data: refs } = await sb.schema("hub").from("wizard_services")
      .select("id, name").eq("type", "iis-site").ilike("config", `%"portRangeId":${numericId}%`)
    if (refs && refs.length > 0) {
      return NextResponse.json({ error: `${refs.length} hizmet bu aralığı kullanıyor (örn: ${(refs[0] as { name: string }).name}). Önce hizmetleri başka aralığa taşıyın.` }, { status: 409 })
    }

    const { data, error } = await sb.schema("hub").from("wizard_port_ranges").delete().eq("id", numericId).select("id")
    if (error) throw error
    if (!data?.length) return NextResponse.json({ error: "Port aralığı bulunamadı" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/port-ranges/[id]]", err)
    return NextResponse.json({ error: "Port aralığı silinemedi" }, { status: 500 })
  }
}
