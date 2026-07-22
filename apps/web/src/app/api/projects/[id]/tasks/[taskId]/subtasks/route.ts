import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { taskId } = await params
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb.schema("hub").from("project_subtasks")
      .select("id, title, completed, position").eq("task_id", taskId).order("position")
    if (error) throw error
    return NextResponse.json(((data ?? []) as { id: string; title: string; completed: boolean; position: number }[]).map(r => ({
      id: r.id, title: r.title, completed: !!r.completed, position: r.position,
    })))
  } catch (err) {
    console.error("[GET subtasks]", err)
    return NextResponse.json({ error: "Alt görevler alınamadı" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { taskId } = await params
  try {
    const { title } = await req.json()
    if (!title || !String(title).trim()) {
      return NextResponse.json({ error: "Başlık gerekli" }, { status: 400 })
    }

    const sb = await getSupabaseServer()
    const { data: last } = await sb.schema("hub").from("project_subtasks")
      .select("position").eq("task_id", taskId).order("position", { ascending: false }).limit(1).maybeSingle()
    const nextPos = ((last as { position: number } | null)?.position ?? -1) + 1

    const { data, error } = await sb.schema("hub").from("project_subtasks")
      .insert({ task_id: taskId, title: String(title).trim(), position: nextPos })
      .select("id").single()
    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    console.error("[POST subtask]", err)
    return NextResponse.json({ error: "Alt görev oluşturulamadı" }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  await params
  try {
    const { subtasks } = await req.json() as {
      subtasks: { id: string; completed?: boolean; position?: number; title?: string }[]
    }
    if (!Array.isArray(subtasks) || subtasks.length === 0) {
      return NextResponse.json({ error: "subtasks dizisi gerekli" }, { status: 400 })
    }

    const sb = await getSupabaseServer()
    for (const s of subtasks) {
      if (!s.id) continue
      const patch: Record<string, unknown> = {}
      if (s.title     !== undefined) patch.title     = String(s.title).trim()
      if (s.completed !== undefined) patch.completed = !!s.completed
      if (s.position  !== undefined) patch.position  = s.position
      if (!Object.keys(patch).length) continue
      const { error } = await sb.schema("hub").from("project_subtasks").update(patch).eq("id", s.id)
      if (error) throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH subtasks]", err)
    return NextResponse.json({ error: "Alt görevler güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  await params
  try {
    const { subtaskId } = await req.json()
    if (!subtaskId) return NextResponse.json({ error: "subtaskId gerekli" }, { status: 400 })
    const sb = await getSupabaseServer()
    const { error } = await sb.schema("hub").from("project_subtasks").delete().eq("id", subtaskId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE subtask]", err)
    return NextResponse.json({ error: "Alt görev silinemedi" }, { status: 500 })
  }
}
