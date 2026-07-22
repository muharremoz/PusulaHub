import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb
      .schema("hub")
      .from("project_columns")
      .select("id, name, color, position, wip_limit")
      .eq("project_id", projectId)
      .order("position", { ascending: true })
    if (error) throw error
    return NextResponse.json(((data ?? []) as { id: string; name: string; color: string | null; position: number; wip_limit: number | null }[]).map(c => ({
      id: c.id, name: c.name, color: c.color, position: c.position, wipLimit: c.wip_limit,
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
    if (!name?.trim()) return NextResponse.json({ error: "name zorunlu" }, { status: 400 })

    const sb = await getSupabaseServer()
    const { data: last } = await sb.schema("hub").from("project_columns")
      .select("position").eq("project_id", projectId).order("position", { ascending: false }).limit(1).maybeSingle()
    const nextPos = ((last as { position: number } | null)?.position ?? -1) + 1

    const { data, error } = await sb.schema("hub").from("project_columns")
      .insert({ project_id: projectId, name: name.trim(), color: color ?? "#6b7280", position: nextPos, wip_limit: wipLimit ?? null })
      .select("id").single()
    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/projects/[id]/columns]", err)
    return NextResponse.json({ error: "Kolon oluşturulamadı" }, { status: 500 })
  }
}
