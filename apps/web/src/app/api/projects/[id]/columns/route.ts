import { NextRequest, NextResponse } from "next/server"
import { execute, query } from "@/lib/db"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  try {
    interface ColumnRow {
      Id: string
      ProjectId: string
      Name: string
      Color: string | null
      Position: number
      WipLimit: number | null
    }
    const columns = await query<ColumnRow[]>`
      SELECT Id, ProjectId, Name, Color, Position, WipLimit
      FROM ProjectColumns
      WHERE ProjectId = ${projectId}
      ORDER BY Position ASC
    `
    return NextResponse.json(columns.map((c) => ({
      id: c.Id,
      name: c.Name,
      color: c.Color,
      position: c.Position,
      wipLimit: c.WipLimit,
    })))
  } catch (err) {
    console.error("[GET /api/projects/[id]/columns]", err)
    return NextResponse.json({ error: "Kolonlar yüklenemedi" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  try {
    const { name, color, wipLimit } = await req.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: "name zorunlu" }, { status: 400 })
    }

    interface PosRow { MaxPos: number | null }
    const posRows = await query<PosRow[]>`
      SELECT MAX(Position) AS MaxPos FROM ProjectColumns WHERE ProjectId = ${projectId}
    `
    const nextPos = (posRows[0]?.MaxPos ?? -1) + 1
    const columnId = crypto.randomUUID()

    await execute`
      INSERT INTO ProjectColumns (Id, ProjectId, Name, Color, Position, WipLimit)
      VALUES (
        ${columnId}, ${projectId}, ${name.trim()},
        ${color ?? null}, ${nextPos}, ${wipLimit ?? null}
      )
    `
    return NextResponse.json({ id: columnId }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/projects/[id]/columns]", err)
    return NextResponse.json({ error: "Kolon oluşturulamadı" }, { status: 500 })
  }
}
