import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { resolveCreators } from "@/lib/hub-users"

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
  id: string; title: string; content: string | null
  tags: string | null; color: string; pinned: boolean
  created_by: string | null; created_at: string; updated_at: string
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb
      .schema("hub")
      .from("notes")
      .select("id, title, content, tags, color, pinned, created_by, created_at, updated_at")
      .eq("id", id)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: "Not bulunamadı" }, { status: 404 })

    const r = data as NoteRow
    const creators = await resolveCreators(sb, [r.created_by])
    return NextResponse.json({
      id:        r.id,
      title:     r.title,
      content:   r.content ?? "",
      tags:      r.tags ? r.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      color:     r.color,
      pinned:    !!r.pinned,
      createdBy: r.created_by ? (creators.get(r.created_by) ?? "—") : "—",
      createdAt: r.created_at,
      updatedAt: r.updated_at,
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

    // Sadece gönderilen alanları güncelle (mssql COALESCE davranışının karşılığı).
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (title   != null) patch.title   = title
    if (content != null) patch.content = content
    if (tags    != null) patch.tags    = Array.isArray(tags) ? tags.join(",") : tags
    if (color   != null) patch.color   = color
    if (pinned  != null) patch.pinned  = pinned

    const sb = await getSupabaseServer()
    const { error } = await sb.schema("hub").from("notes").update(patch).eq("id", id)
    if (error) throw error

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
    const sb = await getSupabaseServer()
    const { error } = await sb.schema("hub").from("notes").delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/notes/[id]]", err)
    return NextResponse.json({ error: "Not silinemedi" }, { status: 500 })
  }
}
