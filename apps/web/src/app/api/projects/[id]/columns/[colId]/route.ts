import { NextRequest, NextResponse } from "next/server"
import { execute, query } from "@/lib/db"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; colId: string }> }
) {
  const { id: projectId, colId } = await params
  try {
    const body = await req.json()
    const { name, color, wipLimit, position } = body

    if (position !== undefined) {
      await execute`
        UPDATE ProjectColumns
        SET Position = ${position}
        WHERE Id = ${colId} AND ProjectId = ${projectId}
      `
      return NextResponse.json({ ok: true })
    }

    await execute`
      UPDATE ProjectColumns
      SET
        Name     = COALESCE(${name     ?? null}, Name),
        Color    = COALESCE(${color    ?? null}, Color),
        WipLimit = COALESCE(${wipLimit ?? null}, WipLimit)
      WHERE Id = ${colId} AND ProjectId = ${projectId}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/projects/[id]/columns/[colId]]", err)
    return NextResponse.json({ error: "Kolon güncellenemedi" }, { status: 500 })
  }
}

interface FirstColRow { Id: string }

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; colId: string }> }
) {
  const { id: projectId, colId } = await params
  try {
    const firstCols = await query<FirstColRow[]>`
      SELECT TOP 1 Id
      FROM ProjectColumns
      WHERE ProjectId = ${projectId} AND Id != ${colId}
      ORDER BY Position ASC
    `

    if (firstCols.length > 0) {
      await execute`
        UPDATE ProjectTasks
        SET ColumnId = ${firstCols[0].Id}
        WHERE ColumnId = ${colId} AND ProjectId = ${projectId}
      `
    }

    await execute`
      DELETE FROM ProjectColumns
      WHERE Id = ${colId} AND ProjectId = ${projectId}
    `

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/projects/[id]/columns/[colId]]", err)
    return NextResponse.json({ error: "Kolon silinemedi" }, { status: 500 })
  }
}
