import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; colId: string }> }
) {
  const { id: projectId, colId } = await params
  try {
    const body = await req.json()
    const { name, color, wipLimit, position } = body

    const patch: Record<string, unknown> = {}
    if (position !== undefined) patch.position = position
    if (name     != null)       patch.name     = name
    if (color    != null)       patch.color    = color
    if (wipLimit != null)       patch.wip_limit = wipLimit

    const sb = await getSupabaseServer()
    const { error } = await sb.schema("hub").from("project_columns")
      .update(patch).eq("id", colId).eq("project_id", projectId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/projects/[id]/columns/[colId]]", err)
    return NextResponse.json({ error: "Kolon güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; colId: string }> }
) {
  const { id: projectId, colId } = await params
  try {
    const sb = await getSupabaseServer()

    // Görevleri kaybetme: başka kolon varsa görevleri oraya taşı, sonra kolonu sil.
    // (hub FK on delete cascade — taşımadan silinirse görevler de silinirdi.)
    const { data: firstCol } = await sb.schema("hub").from("project_columns")
      .select("id").eq("project_id", projectId).neq("id", colId)
      .order("position", { ascending: true }).limit(1).maybeSingle()

    if (firstCol) {
      const { error: mvErr } = await sb.schema("hub").from("project_tasks")
        .update({ column_id: (firstCol as { id: string }).id })
        .eq("column_id", colId).eq("project_id", projectId)
      if (mvErr) throw mvErr
    }

    const { error } = await sb.schema("hub").from("project_columns")
      .delete().eq("id", colId).eq("project_id", projectId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/projects/[id]/columns/[colId]]", err)
    return NextResponse.json({ error: "Kolon silinemedi" }, { status: 500 })
  }
}
