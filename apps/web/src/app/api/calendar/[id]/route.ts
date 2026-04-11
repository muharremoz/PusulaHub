import { NextRequest, NextResponse } from "next/server"
import { execute } from "@/lib/db"

type Params = { params: Promise<{ id: string }> }

// PATCH /api/calendar/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body   = await req.json()

  try {
    await execute`
      UPDATE CalendarEvents SET
        Title          = COALESCE(${body.title       ?? null}, Title),
        Description    = COALESCE(${body.description ?? null}, Description),
        StartDate      = COALESCE(${body.startDate   ?? null}, StartDate),
        EndDate        = COALESCE(${body.endDate     ?? null}, EndDate),
        AllDay         = COALESCE(${body.allDay != null ? (body.allDay ? 1 : 0) : null}, AllDay),
        Color          = COALESCE(${body.color          ?? null}, Color),
        Type           = COALESCE(${body.type           ?? null}, Type),
        RecurrenceType = COALESCE(${body.recurrenceType ?? null}, RecurrenceType),
        RecurrenceEnd  = COALESCE(${body.recurrenceEnd  ?? null}, RecurrenceEnd),
        UpdatedAt      = GETDATE()
      WHERE Id = ${id}
    `
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Güncellenemedi" }, { status: 500 })
  }
}

// DELETE /api/calendar/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    await execute`DELETE FROM CalendarEvents WHERE Id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Silinemedi" }, { status: 500 })
  }
}
