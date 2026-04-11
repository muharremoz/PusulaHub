import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"

export interface CalendarEvent {
  id:             string
  title:          string
  description:    string
  startDate:      string
  endDate:        string
  allDay:         boolean
  color:          string
  type:           "event" | "task" | "note" | "reminder"
  refId:          string | null
  recurrenceType: "none" | "daily" | "weekly" | "monthly" | "yearly" | null
  recurrenceEnd:  string | null
  createdBy:      string
  createdAt:      string
}

interface EventRow {
  Id: string; Title: string; Description: string | null
  StartDate: string; EndDate: string; AllDay: boolean
  Color: string; Type: string; RefId: string | null
  RecurrenceType: string | null; RecurrenceEnd: string | null
  CreatedBy: string; CreatedAt: string
}

/* Tekrarlayan etkinliği belirtilen aralığa genişlet */
function expandRecurring(base: CalendarEvent, rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  if (!base.recurrenceType || base.recurrenceType === "none") return [base]

  const results: CalendarEvent[] = []
  const start   = new Date(base.startDate.replace(" ", "T"))
  const end     = new Date(base.endDate.replace(" ", "T"))
  const durMs   = end.getTime() - start.getTime()
  const recEnd  = base.recurrenceEnd ? new Date(base.recurrenceEnd + "T23:59:59") : rangeEnd

  let cur = new Date(start)
  let idx = 0

  while (cur <= rangeEnd && cur <= recEnd) {
    if (cur >= rangeStart) {
      const occEnd = new Date(cur.getTime() + durMs)
      results.push({
        ...base,
        id:        `${base.id}_${idx}`,
        startDate: cur.toISOString().slice(0, 19).replace("T", " "),
        endDate:   occEnd.toISOString().slice(0, 19).replace("T", " "),
      })
    }
    idx++
    const next = new Date(cur)
    switch (base.recurrenceType) {
      case "daily":   next.setDate(next.getDate() + 1);             break
      case "weekly":  next.setDate(next.getDate() + 7);             break
      case "monthly": next.setMonth(next.getMonth() + 1);           break
      case "yearly":  next.setFullYear(next.getFullYear() + 1);     break
      default:        cur = new Date(rangeEnd.getTime() + 1); continue
    }
    cur = next
    if (idx > 500) break  // güvenlik limiti
  }
  return results
}

// GET /api/calendar?start=&end=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const startStr = searchParams.get("start") ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const endStr   = searchParams.get("end")   ?? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString()
  const rangeStart = new Date(startStr)
  const rangeEnd   = new Date(endStr)

  try {
    // 1. Manuel etkinlikler — tekrarlayan olanlar için aralık genişletildi
    const events = await query<EventRow[]>`
      SELECT Id, Title, ISNULL(Description,'') AS Description,
             CONVERT(NVARCHAR(30), StartDate, 120) AS StartDate,
             CONVERT(NVARCHAR(30), EndDate,   120) AS EndDate,
             AllDay, Color, Type, NULL AS RefId,
             RecurrenceType, RecurrenceEnd,
             CreatedBy, CONVERT(NVARCHAR(30), CreatedAt, 120) AS CreatedAt
      FROM CalendarEvents
      WHERE (RecurrenceType IS NOT NULL AND RecurrenceType != 'none')
         OR (StartDate <= ${endStr} AND EndDate >= ${startStr})
    `

    // 2. Proje görevleri
    const tasks = await query<EventRow[]>`
      SELECT t.Id, t.Title,
        ISNULL(t.Description,'') AS Description,
        CONVERT(NVARCHAR(30), CAST(t.DueDate AS DATETIME2), 120) AS StartDate,
        CONVERT(NVARCHAR(30), CAST(t.DueDate AS DATETIME2), 120) AS EndDate,
        1 AS AllDay,
        CASE t.Priority
          WHEN 'urgent' THEN '#ef4444' WHEN 'high'   THEN '#f97316'
          WHEN 'medium' THEN '#f59e0b' ELSE               '#6b7280'
        END AS Color,
        'task' AS Type, t.Id AS RefId,
        NULL AS RecurrenceType, NULL AS RecurrenceEnd,
        'Admin' AS CreatedBy,
        CONVERT(NVARCHAR(30), t.CreatedAt, 120) AS CreatedAt
      FROM ProjectTasks t
      WHERE t.DueDate IS NOT NULL
        AND t.DueDate <= ${endStr} AND t.DueDate >= ${startStr}
    `

    // 3. Notlar
    const notes = await query<EventRow[]>`
      SELECT n.Id, n.Title,
        LEFT(ISNULL(n.Content,''), 120) AS Description,
        CONVERT(NVARCHAR(30), n.CreatedAt, 120) AS StartDate,
        CONVERT(NVARCHAR(30), n.CreatedAt, 120) AS EndDate,
        1 AS AllDay,
        ISNULL(NULLIF(n.Color,'#ffffff'), '#fef9c3') AS Color,
        'note' AS Type, n.Id AS RefId,
        NULL AS RecurrenceType, NULL AS RecurrenceEnd,
        ISNULL(n.CreatedBy,'Admin') AS CreatedBy,
        CONVERT(NVARCHAR(30), n.CreatedAt, 120) AS CreatedAt
      FROM Notes n
      WHERE n.CreatedAt <= ${endStr} AND n.CreatedAt >= ${startStr}
    `

    const toEvent = (r: EventRow): CalendarEvent => ({
      id:             r.Id,
      title:          r.Title,
      description:    r.Description ?? "",
      startDate:      r.StartDate,
      endDate:        r.EndDate,
      allDay:         !!r.AllDay,
      color:          r.Color,
      type:           r.Type as CalendarEvent["type"],
      refId:          r.RefId ?? null,
      recurrenceType: (r.RecurrenceType as CalendarEvent["recurrenceType"]) ?? null,
      recurrenceEnd:  r.RecurrenceEnd ?? null,
      createdBy:      r.CreatedBy,
      createdAt:      r.CreatedAt,
    })

    const all: CalendarEvent[] = [
      ...events.flatMap(r => expandRecurring(toEvent(r), rangeStart, rangeEnd)),
      ...tasks.map(toEvent),
      ...notes.map(toEvent),
    ]

    return NextResponse.json(all)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Sorgu hatası" }, { status: 500 })
  }
}

// POST /api/calendar
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const id   = crypto.randomUUID()

    await execute`
      INSERT INTO CalendarEvents
        (Id, Title, Description, StartDate, EndDate, AllDay, Color, Type, CreatedBy, RecurrenceType, RecurrenceEnd)
      VALUES (
        ${id},
        ${body.title?.trim() || "Yeni Etkinlik"},
        ${body.description ?? null},
        ${body.startDate},
        ${body.endDate ?? body.startDate},
        ${body.allDay ? 1 : 0},
        ${body.color  ?? "#3b82f6"},
        ${body.type   ?? "event"},
        ${body.createdBy ?? "Admin"},
        ${body.recurrenceType ?? null},
        ${body.recurrenceEnd  ?? null}
      )
    `
    return NextResponse.json({ id }, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: "Oluşturulamadı" }, { status: 500 })
  }
}
