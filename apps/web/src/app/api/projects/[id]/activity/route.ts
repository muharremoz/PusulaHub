import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { asUuidOrNull } from "@/lib/hub-users"

interface ActivityRow {
  id: string; task_id: string | null; user_id: string | null; user_name: string | null
  action: string; detail: string | null; created_at: string
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const { searchParams } = req.nextUrl
  const taskId = searchParams.get("taskId")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 500)

  try {
    const sb = await getSupabaseServer()
    let q = sb.schema("hub").from("project_activity_log")
      .select("id, task_id, user_id, user_name, action, detail, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (taskId) q = q.eq("task_id", taskId)

    const { data, error } = await q
    if (error) throw error
    return NextResponse.json(((data ?? []) as ActivityRow[]).map(r => ({
      id: r.id, taskId: r.task_id, userId: r.user_id, userName: r.user_name,
      action: r.action, detail: r.detail, createdAt: r.created_at,
    })))
  } catch (err) {
    console.error("[GET /api/projects/[id]/activity]", err)
    return NextResponse.json({ error: "Aktivite listesi alınamadı" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  try {
    const { taskId, userId, userName, action, detail } = await req.json()
    if (!action?.trim()) return NextResponse.json({ error: "action zorunlu" }, { status: 400 })

    const sb = await getSupabaseServer()
    const { data, error } = await sb.schema("hub").from("project_activity_log").insert({
      project_id: projectId,
      task_id:    taskId ?? null,
      user_id:    asUuidOrNull(userId),
      user_name:  userName ?? "Sistem",
      action:     action.trim(),
      detail:     detail ?? null,
    }).select("id").single()
    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/projects/[id]/activity]", err)
    return NextResponse.json({ error: "Aktivite kaydedilemedi" }, { status: 500 })
  }
}
