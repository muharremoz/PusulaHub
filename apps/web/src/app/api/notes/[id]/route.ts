import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"

export interface NoteDetail {
  id:        string
  title:     string
  content:   string
  tags:      string[]
  color:     string
  pinned:    boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface NoteRow {
  Id: string; Title: string; Content: string | null
  Tags: string | null; Color: string; Pinned: boolean
  CreatedBy: string; CreatedAt: string; UpdatedAt: string
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const rows = await query<NoteRow[]>`
      SELECT Id, Title, Content, Tags, Color, Pinned, CreatedBy,
             CONVERT(NVARCHAR(30), CreatedAt, 120) AS CreatedAt,
             CONVERT(NVARCHAR(30), UpdatedAt, 120) AS UpdatedAt
      FROM Notes WHERE Id = ${id}
    `
    if (!rows.length) return NextResponse.json({ error: "Not bulunamadı" }, { status: 404 })
    const r = rows[0]
    return NextResponse.json({
      id:        r.Id,
      title:     r.Title,
      content:   r.Content ?? "",
      tags:      r.Tags ? r.Tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      color:     r.Color,
      pinned:    !!r.Pinned,
      createdBy: r.CreatedBy,
      createdAt: r.CreatedAt,
      updatedAt: r.UpdatedAt,
    } satisfies NoteDetail)
  } catch (err) {
    console.error("[GET /api/notes/[id]]", err)
    return NextResponse.json({ error: "Not alınamadı" }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { title, content, tags, color, pinned } = await req.json()
    const tagsStr = Array.isArray(tags) ? tags.join(",") : null
    await execute`
      UPDATE Notes SET
        Title     = COALESCE(${title   ?? null}, Title),
        Content   = COALESCE(${content ?? null}, Content),
        Tags      = COALESCE(${tagsStr ?? null}, Tags),
        Color     = COALESCE(${color   ?? null}, Color),
        Pinned    = COALESCE(${pinned  ?? null}, Pinned),
        UpdatedAt = GETDATE()
      WHERE Id = ${id}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/notes/[id]]", err)
    return NextResponse.json({ error: "Not güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await execute`DELETE FROM Notes WHERE Id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/notes/[id]]", err)
    return NextResponse.json({ error: "Not silinemedi" }, { status: 500 })
  }
}
