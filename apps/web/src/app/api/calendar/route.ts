import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { resolveCreators } from "@/lib/hub-users"
import { auth } from "@/auth"

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

/** hub timestamptz ("...T..+00:00") → mssql-uyumlu "YYYY-MM-DD HH:MM:SS". */
function fmt(ts: string | null): string {
  return ts ? ts.slice(0, 19).replace("T", " ") : ""
}

/* Tekrarlayan etkinliği belirtilen aralığa genişlet */
function expandRecurring(base: CalendarEvent, rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  if (!base.recurrenceType || base.recurrenceType === "none") return [base]
  const results: CalendarEvent[] = []
  const start  = new Date(base.startDate.replace(" ", "T"))
  const end    = new Date(base.endDate.replace(" ", "T"))
  const durMs  = end.getTime() - start.getTime()
  const recEnd = base.recurrenceEnd ? new Date(base.recurrenceEnd + "T23:59:59") : rangeEnd
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
      case "daily":   next.setDate(next.getDate() + 1);         break
      case "weekly":  next.setDate(next.getDate() + 7);         break
      case "monthly": next.setMonth(next.getMonth() + 1);       break
      case "yearly":  next.setFullYear(next.getFullYear() + 1); break
      default:        cur = new Date(rangeEnd.getTime() + 1); continue
    }
    cur = next
    if (idx > 500) break
  }
  return results
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "#ef4444", critical: "#ef4444", high: "#f97316", medium: "#f59e0b",
}

// GET /api/calendar?start=&end=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const now = new Date()
  const startStr = searchParams.get("start") ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const endStr   = searchParams.get("end")   ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()
  const rangeStart = new Date(startStr)
  const rangeEnd   = new Date(endStr)

  try {
    const sb = await getSupabaseServer()
    const [{ data: evData }, { data: taskData }, { data: noteData }] = await Promise.all([
      // Etkinlikler — hepsi (küçük veri); tekrarlayan/aralık filtresi JS'te.
      sb.schema("hub").from("calendar_events")
        .select("id, title, description, start_date, end_date, all_day, color, type, recurrence_type, recurrence_end, created_by"),
      // Proje görevleri — due_date aralıkta
      sb.schema("hub").from("project_tasks")
        .select("id, title, description, priority, due_date, created_at")
        .not("due_date", "is", null).gte("due_date", startStr.slice(0, 10)).lte("due_date", endStr.slice(0, 10)),
      // Notlar — created_at aralıkta
      sb.schema("hub").from("notes")
        .select("id, title, content, color, created_by, created_at")
        .gte("created_at", startStr).lte("created_at", endStr),
    ])

    const events = (evData ?? []) as {
      id: string; title: string; description: string | null; start_date: string; end_date: string
      all_day: boolean; color: string; type: string; recurrence_type: string | null
      recurrence_end: string | null; created_by: string | null
    }[]
    const tasks = (taskData ?? []) as { id: string; title: string; description: string | null; priority: string; due_date: string; created_at: string }[]
    const notes = (noteData ?? []) as { id: string; title: string; content: string | null; color: string; created_by: string | null; created_at: string }[]

    const creators = await resolveCreators(sb, [...events.map(e => e.created_by), ...notes.map(n => n.created_by)])
    const nameOf = (id: string | null) => (id ? (creators.get(id) ?? "—") : "Admin")

    const all: CalendarEvent[] = []

    // 1) Etkinlikler (tekrarlayan olanları genişlet; aralık filtresi)
    for (const e of events) {
      const recurring = !!e.recurrence_type && e.recurrence_type !== "none"
      const s = new Date(fmt(e.start_date).replace(" ", "T"))
      const en = new Date(fmt(e.end_date).replace(" ", "T"))
      if (!recurring && !(s <= rangeEnd && en >= rangeStart)) continue
      const base: CalendarEvent = {
        id: e.id, title: e.title, description: e.description ?? "",
        startDate: fmt(e.start_date), endDate: fmt(e.end_date),
        allDay: !!e.all_day, color: e.color, type: e.type as CalendarEvent["type"],
        refId: null,
        recurrenceType: (e.recurrence_type as CalendarEvent["recurrenceType"]) ?? null,
        recurrenceEnd: e.recurrence_end ?? null,
        createdBy: nameOf(e.created_by), createdAt: fmt(e.start_date),
      }
      all.push(...expandRecurring(base, rangeStart, rangeEnd))
    }

    // 2) Proje görevleri
    for (const t of tasks) {
      const dt = `${t.due_date} 00:00:00`
      all.push({
        id: t.id, title: t.title, description: t.description ?? "",
        startDate: dt, endDate: dt, allDay: true,
        color: PRIORITY_COLOR[t.priority] ?? "#6b7280",
        type: "task", refId: t.id, recurrenceType: null, recurrenceEnd: null,
        createdBy: "Admin", createdAt: fmt(t.created_at),
      })
    }

    // 3) Notlar
    for (const n of notes) {
      const dt = fmt(n.created_at)
      all.push({
        id: n.id, title: n.title, description: n.content ?? "",
        startDate: dt, endDate: dt, allDay: true,
        color: n.color && n.color !== "#ffffff" ? n.color : "#eab308",
        type: "note", refId: n.id, recurrenceType: null, recurrenceEnd: null,
        createdBy: nameOf(n.created_by), createdAt: dt,
      })
    }

    return NextResponse.json(all)
  } catch (e) {
    console.error("[GET /api/calendar]", e)
    return NextResponse.json({ error: "Sorgu hatası" }, { status: 500 })
  }
}

// POST /api/calendar
export async function POST(req: NextRequest) {
  try {
    const body    = await req.json()
    const session = await auth()
    const sb = await getSupabaseServer()

    const { data, error } = await sb.schema("hub").from("calendar_events").insert({
      title:           body.title?.trim() || "Yeni Etkinlik",
      description:     body.description ?? null,
      start_date:      body.startDate,
      end_date:        body.endDate ?? body.startDate,
      all_day:         !!body.allDay,
      color:           body.color ?? "#3b82f6",
      type:            body.type ?? "event",
      created_by:      session?.user?.authUserId ?? null,
      recurrence_type: body.recurrenceType ?? null,
      recurrence_end:  body.recurrenceEnd ?? null,
    }).select("id").single()
    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (e) {
    console.error("[POST /api/calendar]", e)
    return NextResponse.json({ error: "Oluşturulamadı" }, { status: 500 })
  }
}
