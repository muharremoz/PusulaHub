import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { resolveCreators, asUuidOrNull } from "@/lib/hub-users"
import { auth } from "@/auth"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { taskId } = await params
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb.schema("hub").from("project_task_comments")
      .select("id, author, content, created_at").eq("task_id", taskId).order("created_at")
    if (error) throw error
    const rows = (data ?? []) as { id: string; author: string | null; content: string; created_at: string }[]
    const creators = await resolveCreators(sb, rows.map(r => r.author))
    return NextResponse.json(rows.map(r => ({
      id: r.id,
      author: r.author ? (creators.get(r.author) ?? "—") : "—",
      content: r.content,
      createdAt: r.created_at,
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
    const sb = await getSupabaseServer()

    // Yorum ekle
    if (body.comment !== undefined) {
      const session = await auth()
      const { error } = await sb.schema("hub").from("project_task_comments").insert({
        task_id: taskId,
        author:  session?.user?.authUserId ?? null,
        content: body.comment.content,
      })
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    // Taşıma (sürükle-bırak)
    if (body.columnId !== undefined && body.position !== undefined) {
      const { error } = await sb.schema("hub").from("project_tasks")
        .update({ column_id: body.columnId, position: body.position, updated_at: new Date().toISOString() })
        .eq("id", taskId)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    // Genel güncelleme — yalnız gönderilen alanlar
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.title       != null) patch.title       = body.title
    if (body.description != null) patch.description = body.description
    if (body.priority    != null) patch.priority    = body.priority
    if (body.labels      != null) patch.labels      = Array.isArray(body.labels) ? body.labels.join(",") : body.labels
    if ("assignedTo"     in body) patch.assigned_to     = asUuidOrNull(body.assignedTo)
    if ("startDate"      in body) patch.start_date      = body.startDate ?? null
    if ("dueDate"        in body) patch.due_date        = body.dueDate ?? null
    if ("estimatedHours" in body) patch.estimated_hours = body.estimatedHours ?? null
    if ("actualHours"    in body) patch.actual_hours    = body.actualHours ?? null

    const { error } = await sb.schema("hub").from("project_tasks").update(patch).eq("id", taskId)
    if (error) throw error
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
    // hub FK on delete cascade → alt-görev + yorum otomatik silinir.
    const sb = await getSupabaseServer()
    const { error } = await sb.schema("hub").from("project_tasks").delete().eq("id", taskId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE task]", err)
    return NextResponse.json({ error: "Görev silinemedi" }, { status: 500 })
  }
}
