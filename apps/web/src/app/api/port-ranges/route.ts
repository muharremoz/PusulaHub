import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

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
  id: number; name: string; port_start: number; port_end: number
  protocol: string; description: string | null; is_active: boolean; UsedCount: number
}
const PR_COLS = "id, name, port_start, port_end, protocol, description, is_active"

function rowToDto(r: Row): PortRangeDto {
  return {
    id: r.id, name: r.name, portStart: r.port_start, portEnd: r.port_end,
    protocol: (r.protocol as PortProtocol) ?? "TCP",
    description: r.description, isActive: !!r.is_active,
    totalPorts: r.port_end - r.port_start + 1, usedCount: r.UsedCount ?? 0,
  }
}

/* ── GET ──────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const onlyActive = req.nextUrl.searchParams.get("onlyActive") === "true"
    const sb = await getSupabaseServer()

    let rq = sb.schema("hub").from("wizard_port_ranges").select(PR_COLS).order("port_start", { ascending: true })
    if (onlyActive) rq = rq.eq("is_active", true)
    const rows = (((await rq).data ?? []) as unknown as Row[]).map((r) => ({ ...r, UsedCount: 0 }))

    const [{ data: assigns }, { data: iisRows }] = await Promise.all([
      sb.schema("hub").from("wizard_port_assignments").select("port_range_id, port"),
      sb.schema("hub").from("iis_sites").select("binding").not("binding", "is", null),
    ])

    const iisPorts: number[] = []
    const portRe = /:(\d+)(?=$|[,\s/])/g
    for (const r of (iisRows ?? []) as { binding: string | null }[]) {
      if (!r.binding) continue
      let m: RegExpExecArray | null
      while ((m = portRe.exec(r.binding)) !== null) {
        const p = Number(m[1])
        if (Number.isFinite(p) && p > 0 && p <= 65535) iisPorts.push(p)
      }
    }

    const perRange = new Map<number, Set<number>>()
    for (const r of rows) perRange.set(r.id, new Set<number>())
    for (const a of (assigns ?? []) as { port_range_id: number; port: number }[]) perRange.get(a.port_range_id)?.add(a.port)
    for (const r of rows) {
      const set = perRange.get(r.id)!
      for (const p of iisPorts) if (p >= r.port_start && p <= r.port_end) set.add(p)
      r.UsedCount = set.size
    }

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

    const sb = await getSupabaseServer()
    // Çakışma kontrolü: aynı protocol'de aralık çakışıyorsa reddet
    const { data: overlap } = await sb.schema("hub").from("wizard_port_ranges")
      .select("id, name").eq("protocol", protocol).lte("port_start", portEnd).gte("port_end", portStart)
    if (overlap && overlap.length > 0) {
      return NextResponse.json({ error: `Aralık başka bir tanımla çakışıyor: ${(overlap[0] as { name: string }).name}` }, { status: 409 })
    }

    const { data: created, error } = await sb.schema("hub").from("wizard_port_ranges").insert({
      name, port_start: portStart, port_end: portEnd, protocol, description, is_active: isActive,
    }).select(PR_COLS).single()
    if (error) throw error
    return NextResponse.json(rowToDto({ ...(created as unknown as Row), UsedCount: 0 }), { status: 201 })
  } catch (err) {
    console.error("[POST /api/port-ranges]", err)
    return NextResponse.json({ error: "Port aralığı eklenemedi" }, { status: 500 })
  }
}
