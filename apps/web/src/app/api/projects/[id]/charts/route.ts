import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

/* GET /api/projects/[id]/charts — grafik verileri (burndown + velocity) */

const DONE_COLUMNS = new Set(["Tamamlandı", "Done", "Bitti"])

/** Verilen tarihin (YYYY-MM-DD) haftasının Pazar başlangıcı (mssql DATEFIRST=7 ile aynı). */
function weekStartSunday(d: string): string {
  const dt = new Date(d + "T00:00:00Z")
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay())
  return dt.toISOString().slice(0, 10)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const sb = await getSupabaseServer()
    const [{ data: taskData, error: tErr }, { data: colData }] = await Promise.all([
      sb.schema("hub").from("project_tasks").select("created_at, updated_at, column_id").eq("project_id", id).order("created_at"),
      sb.schema("hub").from("project_columns").select("id, name").eq("project_id", id),
    ])
    if (tErr) throw tErr

    const colName = new Map(((colData ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
    const tasks = ((taskData ?? []) as { created_at: string | null; updated_at: string | null; column_id: string }[]).map(t => {
      const cn = colName.get(t.column_id) ?? ""
      return {
        CreatedAt:   (t.created_at ?? "").slice(0, 10),
        CompletedAt: DONE_COLUMNS.has(cn) ? (t.updated_at ?? "").slice(0, 10) : null,
        ColumnName:  cn,
      }
    })

    const totalTasks = tasks.length
    const doneTasks = tasks.filter(t => DONE_COLUMNS.has(t.ColumnName)).length

    // Burndown — her tarih için kümülatif kalan
    const dateSet = new Set<string>()
    for (const t of tasks) {
      if (t.CreatedAt) dateSet.add(t.CreatedAt)
      if (t.CompletedAt) dateSet.add(t.CompletedAt)
    }
    const allDates = [...dateSet].sort()
    let cumCreated = 0, cumCompleted = 0
    const burndown = allDates.map((date) => {
      cumCreated   += tasks.filter(t => t.CreatedAt === date).length
      cumCompleted += tasks.filter(t => t.CompletedAt === date).length
      return { date, remaining: cumCreated - cumCompleted, ideal: 0 }
    })
    if (burndown.length > 1) {
      const maxRemaining = burndown[0].remaining
      const steps = burndown.length - 1
      burndown.forEach((b, i) => { b.ideal = Math.round(maxRemaining - (maxRemaining / steps) * i) })
    }

    // Velocity — haftalık oluşturulan/tamamlanan
    const weekMap = new Map<string, { created: number; completed: number }>()
    for (const t of tasks) {
      if (!t.CreatedAt) continue
      const ws = weekStartSunday(t.CreatedAt)
      const w = weekMap.get(ws) ?? { created: 0, completed: 0 }
      w.created++
      if (DONE_COLUMNS.has(t.ColumnName)) w.completed++
      weekMap.set(ws, w)
    }
    const velocity = [...weekMap.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([week, v]) => ({ week, created: v.created, completed: v.completed }))

    return NextResponse.json({ summary: { totalTasks, doneTasks }, burndown, velocity })
  } catch (err) {
    console.error("[GET /api/projects/[id]/charts]", err)
    return NextResponse.json({ error: "Grafik verileri alınamadı" }, { status: 500 })
  }
}
