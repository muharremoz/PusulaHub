import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"

/* GET /api/projects/[id]/charts — grafik verileri (burndown + velocity) */

interface TaskDateRow {
  CreatedAt: string
  CompletedAt: string | null
  ColumnName: string
}

interface ActivityCountRow {
  WeekStart: string
  TasksCreated: number
  TasksCompleted: number
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    // 1) Tüm görevlerin oluşturma tarihi ve kolon bilgisi
    const tasks = await query<TaskDateRow[]>`
      SELECT CONVERT(NVARCHAR(10), t.CreatedAt, 23) AS CreatedAt,
             CASE WHEN c.Name IN ('Tamamland'+NCHAR(305), 'Done', 'Bitti')
                  THEN CONVERT(NVARCHAR(10), t.UpdatedAt, 23)
                  ELSE NULL END AS CompletedAt,
             c.Name AS ColumnName
      FROM ProjectTasks t
      JOIN ProjectColumns c ON c.Id = t.ColumnId
      WHERE t.ProjectId = ${id}
      ORDER BY t.CreatedAt
    `

    // 2) Haftalık velocity: her hafta oluşturulan ve tamamlanan görev sayısı
    const velocity = await query<ActivityCountRow[]>`
      SELECT CONVERT(NVARCHAR(10), DATEADD(DAY, 1-DATEPART(WEEKDAY, t.CreatedAt), t.CreatedAt), 23) AS WeekStart,
             COUNT(*) AS TasksCreated,
             SUM(CASE WHEN c.Name IN ('Tamamland'+NCHAR(305), 'Done', 'Bitti') THEN 1 ELSE 0 END) AS TasksCompleted
      FROM ProjectTasks t
      JOIN ProjectColumns c ON c.Id = t.ColumnId
      WHERE t.ProjectId = ${id}
      GROUP BY CONVERT(NVARCHAR(10), DATEADD(DAY, 1-DATEPART(WEEKDAY, t.CreatedAt), t.CreatedAt), 23)
      ORDER BY WeekStart
    `

    // --- Burndown hesaplama ---
    // Her gün için toplam açık görev sayısını hesapla
    const totalTasks = tasks.length
    const completedNames = ["Tamamlandı", "Done", "Bitti"]
    const doneTasks = tasks.filter((t) => completedNames.includes(t.ColumnName)).length

    // Tüm tarihleri topla
    const dateSet = new Set<string>()
    for (const t of tasks) {
      if (t.CreatedAt) dateSet.add(t.CreatedAt)
      if (t.CompletedAt) dateSet.add(t.CompletedAt)
    }
    const allDates = [...dateSet].sort()

    // Her tarih için kümülatif oluşturulan ve tamamlanan sayısı
    let cumCreated = 0
    let cumCompleted = 0
    const burndown = allDates.map((date) => {
      cumCreated += tasks.filter((t) => t.CreatedAt === date).length
      cumCompleted += tasks.filter((t) => t.CompletedAt === date).length
      return {
        date,
        remaining: cumCreated - cumCompleted,
        ideal: 0, // sonra hesaplanacak
      }
    })

    // İdeal çizgi: ilk günden son güne doğrusal düşüş
    if (burndown.length > 1) {
      const maxRemaining = burndown[0].remaining
      const steps = burndown.length - 1
      burndown.forEach((b, i) => {
        b.ideal = Math.round(maxRemaining - (maxRemaining / steps) * i)
      })
    }

    return NextResponse.json({
      summary: { totalTasks, doneTasks },
      burndown,
      velocity: velocity.map((v) => ({
        week: v.WeekStart,
        created: v.TasksCreated,
        completed: v.TasksCompleted,
      })),
    })
  } catch (err) {
    console.error("[GET /api/projects/[id]/charts]", err)
    return NextResponse.json({ error: "Grafik verileri alınamadı" }, { status: 500 })
  }
}
