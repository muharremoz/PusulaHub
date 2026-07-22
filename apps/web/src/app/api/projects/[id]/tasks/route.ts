import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { asUuidOrNull } from "@/lib/hub-users"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  try {
    const { columnId, title, description, priority = "medium", assignedTo, startDate, dueDate, labels } = await req.json()
    if (!columnId || !title?.trim()) {
      return NextResponse.json({ error: "columnId ve title zorunlu" }, { status: 400 })
    }

    const sb = await getSupabaseServer()
    const { data: last } = await sb.schema("hub").from("project_tasks")
      .select("position").eq("column_id", columnId).order("position", { ascending: false }).limit(1).maybeSingle()
    const nextPos = ((last as { position: number } | null)?.position ?? -1) + 1

    const { data, error } = await sb.schema("hub").from("project_tasks").insert({
      project_id:  projectId,
      column_id:   columnId,
      title:       title.trim(),
      description: description ?? null,
      priority,
      assigned_to: asUuidOrNull(assignedTo),
      start_date:  startDate ?? null,
      due_date:    dueDate ?? null,
      labels:      Array.isArray(labels) ? labels.join(",") : (labels ?? null),
      position:    nextPos,
    }).select("id").single()
    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/projects/[id]/tasks]", err)
    return NextResponse.json({ error: "Görev oluşturulamadı" }, { status: 500 })
  }
}
