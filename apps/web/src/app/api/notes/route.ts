import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { resolveCreators } from "@/lib/hub-users"
import { auth } from "@/auth"

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
  id: string; title: string; content: string | null
  tags: string | null; color: string; pinned: boolean
  created_by: string | null; created_at: string; updated_at: string
}

/** HTML etiketlerini temizleyip (Tiptap çıktıları için) kısa önizleme döndür. */
function excerpt(content: string | null): string {
  if (!content) return ""
  return content
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
}

export async function GET() {
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb
      .schema("hub")
      .from("notes")
      .select("id, title, content, tags, color, pinned, created_by, created_at, updated_at")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
    if (error) throw error

    const rows = (data ?? []) as NoteRow[]
    const creators = await resolveCreators(sb, rows.map(r => r.created_by))

    return NextResponse.json(rows.map((r): NoteItem => ({
      id:        r.id,
      title:     r.title,
      excerpt:   excerpt(r.content),
      tags:      r.tags ? r.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      color:     r.color,
      pinned:    !!r.pinned,
      createdBy: r.created_by ? (creators.get(r.created_by) ?? "—") : "—",
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })))
  } catch (err) {
    console.error("[GET /api/notes]", err)
    return NextResponse.json({ error: "Notlar alınamadı" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const session = await auth()
    const sb = await getSupabaseServer()

    const tags = Array.isArray(body.tags) ? body.tags.join(",") : (body.tags ?? null)
    const { data, error } = await sb
      .schema("hub")
      .from("notes")
      .insert({
        title:      body.title?.trim() || "Yeni Not",
        content:    body.content ?? null,
        tags,
        color:      body.color ?? "#ffffff",
        created_by: session?.user?.authUserId ?? null,
      })
      .select("id")
      .single()
    if (error) throw error

    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/notes]", err)
    return NextResponse.json({ error: "Not oluşturulamadı" }, { status: 500 })
  }
}
