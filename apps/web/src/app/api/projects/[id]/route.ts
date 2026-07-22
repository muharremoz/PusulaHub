import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { resolveCreators } from "@/lib/hub-users"
import { resolveCompanyNames } from "@/lib/hub-companies"

export interface BoardColumn {
  id:       string
  name:     string
  color:    string
  position: number
  wipLimit: number | null
  tasks:    BoardTask[]
}

export interface BoardTask {
  id:            string
  columnId:      string
  title:         string
  description:   string | null
  priority:      "low" | "medium" | "high" | "critical"
  assignedTo:    string | null
  startDate:     string | null
  dueDate:       string | null
  labels:        string[]
  position:      number
  createdAt:     string
  commentCount:  number
  subtaskTotal:  number
  subtaskDone:   number
  estimatedHours:number | null
  actualHours:   number | null
}

export interface BoardData {
  id:          string
  name:        string
  description: string | null
  status:      "active" | "completed" | "archived"
  color:       string
  companyId:   string | null
  companyName: string | null
  columns:     BoardColumn[]
}

interface ColRow { id: string; name: string; color: string; position: number; wip_limit: number | null }
interface TaskRow {
  id: string; column_id: string; title: string; description: string | null
  priority: string; assigned_to: string | null; start_date: string | null; due_date: string | null
  labels: string | null; position: number; created_at: string
  estimated_hours: number | null; actual_hours: number | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const sb = await getSupabaseServer()

    const [{ data: proj, error: pErr }, { data: colData }, { data: taskData }] = await Promise.all([
      sb.schema("hub").from("projects")
        .select("id, name, description, status, color, company_id").eq("id", id).maybeSingle(),
      sb.schema("hub").from("project_columns")
        .select("id, name, color, position, wip_limit").eq("project_id", id).order("position"),
      sb.schema("hub").from("project_tasks")
        .select("id, column_id, title, description, priority, assigned_to, start_date, due_date, labels, position, created_at, estimated_hours, actual_hours")
        .eq("project_id", id).order("position"),
    ])
    if (pErr) throw pErr
    if (!proj) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 404 })

    const cols  = (colData ?? []) as ColRow[]
    const tasks = (taskData ?? []) as TaskRow[]
    const taskIds = tasks.map(t => t.id)

    // Yorum + alt-görev sayıları (küçük veri → ayrı çek, JS'te grupla)
    const commentCount = new Map<string, number>()
    const subTotal     = new Map<string, number>()
    const subDone      = new Map<string, number>()
    if (taskIds.length) {
      const [{ data: comments }, { data: subtasks }] = await Promise.all([
        sb.schema("hub").from("project_task_comments").select("task_id").in("task_id", taskIds),
        sb.schema("hub").from("project_subtasks").select("task_id, completed").in("task_id", taskIds),
      ])
      for (const c of (comments ?? []) as { task_id: string }[]) {
        commentCount.set(c.task_id, (commentCount.get(c.task_id) ?? 0) + 1)
      }
      for (const s of (subtasks ?? []) as { task_id: string; completed: boolean }[]) {
        subTotal.set(s.task_id, (subTotal.get(s.task_id) ?? 0) + 1)
        if (s.completed) subDone.set(s.task_id, (subDone.get(s.task_id) ?? 0) + 1)
      }
    }

    const p = proj as { id: string; name: string; description: string | null; status: string; color: string; company_id: string | null }
    const creators = await resolveCreators(sb, tasks.map(t => t.assigned_to))
    const companyNames = await resolveCompanyNames([p.company_id])

    const board: BoardData = {
      id: p.id, name: p.name, description: p.description,
      status: p.status as BoardData["status"], color: p.color,
      companyId: p.company_id,
      companyName: p.company_id ? (companyNames.get(p.company_id) ?? null) : null,
      columns: cols.map((col) => ({
        id: col.id, name: col.name, color: col.color,
        position: col.position, wipLimit: col.wip_limit,
        tasks: tasks.filter(t => t.column_id === col.id).map((t): BoardTask => ({
          id: t.id, columnId: t.column_id, title: t.title, description: t.description,
          priority: t.priority as BoardTask["priority"],
          assignedTo: t.assigned_to ? (creators.get(t.assigned_to) ?? null) : null,
          startDate: t.start_date, dueDate: t.due_date,
          labels: t.labels ? t.labels.split(",").map(l => l.trim()).filter(Boolean) : [],
          position: t.position, createdAt: t.created_at,
          commentCount: commentCount.get(t.id) ?? 0,
          subtaskTotal: subTotal.get(t.id) ?? 0,
          subtaskDone:  subDone.get(t.id) ?? 0,
          estimatedHours: t.estimated_hours, actualHours: t.actual_hours,
        })),
      })),
    }
    return NextResponse.json(board)
  } catch (err) {
    console.error("[GET /api/projects/[id]]", err)
    return NextResponse.json({ error: "Board alınamadı" }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { name, description, status, color } = await req.json()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name        != null) patch.name        = name
    if (description != null) patch.description = description
    if (status      != null) patch.status      = status
    if (color       != null) patch.color       = color

    const sb = await getSupabaseServer()
    const { error } = await sb.schema("hub").from("projects").update(patch).eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/projects/[id]]", err)
    return NextResponse.json({ error: "Proje güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    // hub FK'leri on delete cascade → kolon/görev/alt-görev/yorum/aktivite otomatik silinir.
    const sb = await getSupabaseServer()
    const { error } = await sb.schema("hub").from("projects").delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/projects/[id]]", err)
    return NextResponse.json({ error: "Proje silinemedi" }, { status: 500 })
  }
}
