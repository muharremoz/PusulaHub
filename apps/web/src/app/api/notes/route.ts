import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"

export interface NoteItem {
  id:        string
  title:     string
  excerpt:   string
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

function excerpt(content: string | null): string {
  if (!content) return ""
  return content.replace(/\n+/g, " ").trim().slice(0, 120)
}

export async function GET() {
  try {
    const rows = await query<NoteRow[]>`
      SELECT Id, Title, Content, Tags, Color, Pinned, CreatedBy,
             CONVERT(NVARCHAR(30), CreatedAt, 120) AS CreatedAt,
             CONVERT(NVARCHAR(30), UpdatedAt, 120) AS UpdatedAt
      FROM Notes
      ORDER BY Pinned DESC, UpdatedAt DESC
    `
    return NextResponse.json(rows.map((r): NoteItem => ({
      id:        r.Id,
      title:     r.Title,
      excerpt:   excerpt(r.Content),
      tags:      r.Tags ? r.Tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      color:     r.Color,
      pinned:    !!r.Pinned,
      createdBy: r.CreatedBy,
      createdAt: r.CreatedAt,
      updatedAt: r.UpdatedAt,
    })))
  } catch (err) {
    console.error("[GET /api/notes]", err)
    return NextResponse.json({ error: "Notlar alınamadı" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const id        = crypto.randomUUID()
    const title     = body.title?.trim() || "Yeni Not"
    const createdBy = body.createdBy?.trim() || "Admin"
    await execute`
      INSERT INTO Notes (Id, Title, Content, Tags, Color, CreatedBy)
      VALUES (${id}, ${title}, ${body.content ?? null}, ${body.tags ?? null}, ${body.color ?? "#ffffff"}, ${createdBy})
    `
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/notes]", err)
    return NextResponse.json({ error: "Not oluşturulamadı" }, { status: 500 })
  }
}
