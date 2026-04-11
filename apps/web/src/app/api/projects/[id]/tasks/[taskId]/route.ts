import { NextRequest, NextResponse } from "next/server"
import { execute, query } from "@/lib/db"

interface CommentRow { Id: string; Author: string; Content: string; CreatedAt: string }

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { taskId } = await params
  try {
    const rows = await query<CommentRow[]>`
      SELECT Id, Author, Content, CONVERT(NVARCHAR(30), CreatedAt, 120) AS CreatedAt
      FROM ProjectTaskComments WHERE TaskId = ${taskId} ORDER BY CreatedAt
    `
    return NextResponse.json(rows.map((r) => ({
      id: r.Id, author: r.Author, content: r.Content, createdAt: r.CreatedAt,
    })))
  } catch (err) {
    console.error("[GET task comments]", err)
    return NextResponse.json({ error: "Yorumlar alınamadı" }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { taskId } = await params
  try {
    const body = await req.json()
    const { title, description, priority, assignedTo, dueDate, labels, columnId, position, comment } = body

    // Yorum ekle
    if (comment !== undefined) {
      await execute`
        INSERT INTO ProjectTaskComments (Id, TaskId, Author, Content)
        VALUES (${crypto.randomUUID()}, ${taskId}, ${comment.author ?? "Admin"}, ${comment.content})
      `
      return NextResponse.json({ ok: true })
    }

    // Taşıma (sürükle-bırak): columnId + position
    if (columnId !== undefined && position !== undefined) {
      await execute`
        UPDATE ProjectTasks
        SET ColumnId = ${columnId}, Position = ${position}, UpdatedAt = GETDATE()
        WHERE Id = ${taskId}
      `
      return NextResponse.json({ ok: true })
    }

    // Genel güncelleme
    const labelsStr = Array.isArray(labels) ? labels.join(",") : null
    await execute`
      UPDATE ProjectTasks
      SET
        Title       = COALESCE(${title       ?? null}, Title),
        Description = COALESCE(${description ?? null}, Description),
        Priority    = COALESCE(${priority    ?? null}, Priority),
        AssignedTo  = ${assignedTo !== undefined ? (assignedTo ?? null) : null},
        DueDate     = ${dueDate    !== undefined ? (dueDate    ?? null) : null},
        Labels      = COALESCE(${labelsStr   ?? null}, Labels),
        UpdatedAt   = GETDATE()
      WHERE Id = ${taskId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH task]", err)
    return NextResponse.json({ error: "Görev güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { taskId } = await params
  try {
    await execute`DELETE FROM ProjectTasks WHERE Id = ${taskId}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE task]", err)
    return NextResponse.json({ error: "Görev silinemedi" }, { status: 500 })
  }
}
