import { NextRequest, NextResponse } from "next/server"
import { execute, query } from "@/lib/db"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  try {
    const { columnId, title, description, priority = "medium", assignedTo, startDate, dueDate, labels } = await req.json()
    if (!columnId || !title?.trim()) {
      return NextResponse.json({ error: "columnId ve title zorunlu" }, { status: 400 })
    }

    // Kolon son position'ını al
    interface PosRow { MaxPos: number | null }
    const posRows = await query<PosRow[]>`
      SELECT MAX(Position) AS MaxPos FROM ProjectTasks WHERE ColumnId = ${columnId}
    `
    const nextPos = (posRows[0]?.MaxPos ?? -1) + 1
    const taskId = crypto.randomUUID()

    await execute`
      INSERT INTO ProjectTasks (Id, ProjectId, ColumnId, Title, Description, Priority, AssignedTo, StartDate, DueDate, Labels, Position)
      VALUES (
        ${taskId}, ${projectId}, ${columnId}, ${title.trim()},
        ${description ?? null}, ${priority}, ${assignedTo ?? null},
        ${startDate ?? null}, ${dueDate ?? null}, ${labels ? labels.join(",") : null}, ${nextPos}
      )
    `
    return NextResponse.json({ id: taskId }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/projects/[id]/tasks]", err)
    return NextResponse.json({ error: "Görev oluşturulamadı" }, { status: 500 })
  }
}
