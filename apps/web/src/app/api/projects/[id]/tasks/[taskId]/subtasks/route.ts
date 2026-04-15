import { NextRequest, NextResponse } from "next/server"
import { execute, query } from "@/lib/db"

interface SubtaskRow { Id: string; Title: string; Completed: boolean; Position: number }

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { taskId } = await params
  try {
    const rows = await query<SubtaskRow[]>`
      SELECT Id, Title, Completed, Position
      FROM ProjectSubtasks WHERE TaskId = ${taskId} ORDER BY Position
    `
    return NextResponse.json(rows.map((r) => ({
      id: r.Id,
      title: r.Title,
      completed: !!r.Completed,
      position: r.Position,
    })))
  } catch (err) {
    console.error("[GET subtasks]", err)
    return NextResponse.json({ error: "Alt görevler alınamadı" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { taskId } = await params
  try {
    const { title } = await req.json()
    if (!title || !String(title).trim()) {
      return NextResponse.json({ error: "Başlık gerekli" }, { status: 400 })
    }

    interface MaxRow { MaxPos: number | null }
    const [maxRow] = await query<MaxRow[]>`
      SELECT MAX(Position) AS MaxPos FROM ProjectSubtasks WHERE TaskId = ${taskId}
    `
    const nextPos = (maxRow?.MaxPos ?? -1) + 1
    const newId = crypto.randomUUID()

    await execute`
      INSERT INTO ProjectSubtasks (Id, TaskId, Title, Position)
      VALUES (${newId}, ${taskId}, ${String(title).trim()}, ${nextPos})
    `
    return NextResponse.json({ id: newId }, { status: 201 })
  } catch (err) {
    console.error("[POST subtask]", err)
    return NextResponse.json({ error: "Alt görev oluşturulamadı" }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  await params
  try {
    const { subtasks } = await req.json() as {
      subtasks: { id: string; completed?: boolean; position?: number; title?: string }[]
    }
    if (!Array.isArray(subtasks) || subtasks.length === 0) {
      return NextResponse.json({ error: "subtasks dizisi gerekli" }, { status: 400 })
    }

    for (const s of subtasks) {
      if (!s.id) continue
      await execute`
        UPDATE ProjectSubtasks
        SET
          Title     = COALESCE(${s.title     !== undefined ? String(s.title).trim() : null}, Title),
          Completed = COALESCE(${s.completed !== undefined ? (s.completed ? 1 : 0) : null}, Completed),
          Position  = COALESCE(${s.position  !== undefined ? s.position : null}, Position)
        WHERE Id = ${s.id}
      `
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH subtasks]", err)
    return NextResponse.json({ error: "Alt görevler güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  await params
  try {
    const { subtaskId } = await req.json()
    if (!subtaskId) {
      return NextResponse.json({ error: "subtaskId gerekli" }, { status: 400 })
    }
    await execute`DELETE FROM ProjectSubtasks WHERE Id = ${subtaskId}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE subtask]", err)
    return NextResponse.json({ error: "Alt görev silinemedi" }, { status: 500 })
  }
}
