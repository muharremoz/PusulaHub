import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

type Params = { params: Promise<{ id: string }> }

// PATCH /api/calendar/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body   = await req.json()
  try {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.title          != null) patch.title           = body.title
    if (body.description    != null) patch.description     = body.description
    if (body.startDate      != null) patch.start_date      = body.startDate
    if (body.endDate        != null) patch.end_date        = body.endDate
    if (body.allDay         != null) patch.all_day         = !!body.allDay
    if (body.color          != null) patch.color           = body.color
    if (body.type           != null) patch.type            = body.type
    if (body.recurrenceType != null) patch.recurrence_type = body.recurrenceType
    if (body.recurrenceEnd  != null) patch.recurrence_end  = body.recurrenceEnd

    const sb = await getSupabaseServer()
    const { error } = await sb.schema("hub").from("calendar_events").update(patch).eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[PATCH /api/calendar/[id]]", e)
    return NextResponse.json({ error: "Güncellenemedi" }, { status: 500 })
  }
}

// DELETE /api/calendar/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    const sb = await getSupabaseServer()
    const { error } = await sb.schema("hub").from("calendar_events").delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[DELETE /api/calendar/[id]]", e)
    return NextResponse.json({ error: "Silinemedi" }, { status: 500 })
  }
}
