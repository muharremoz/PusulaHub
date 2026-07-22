import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { resolveCompanyNames } from "@/lib/hub-companies"
import { requirePermission } from "@/lib/require-permission"

export interface ProjectListItem {
  id:          string
  name:        string
  description: string | null
  status:      "active" | "completed" | "archived"
  color:       string
  companyId:   string | null
  companyName: string | null
  taskCount:   number
  doneCount:   number
  createdAt:   string
}

// Kolon adı "tamamlandı" sayılan kümesi (doneCount için).
const DONE_COLUMNS = new Set(["Tamamlandı", "Done", "Bitti"])

export async function GET(req: NextRequest) {
  const gate = await requirePermission("projects", "read")
  if (gate) return gate
  const includeArchived = new URL(req.url).searchParams.get("archived") === "1"
  try {
    const sb = await getSupabaseServer()

    let pq = sb
      .schema("hub")
      .from("projects")
      .select("id, name, description, status, color, company_id, created_at")
      .order("created_at", { ascending: false })
    if (!includeArchived) pq = pq.neq("status", "archived")

    const { data: projects, error } = await pq
    if (error) throw error
    const rows = (projects ?? []) as {
      id: string; name: string; description: string | null
      status: string; color: string; company_id: string | null; created_at: string
    }[]

    const projIds = rows.map(p => p.id)
    const counts = new Map<string, { total: number; done: number }>()
    if (projIds.length) {
      const [{ data: cols }, { data: tasks }] = await Promise.all([
        sb.schema("hub").from("project_columns").select("id, name, project_id").in("project_id", projIds),
        sb.schema("hub").from("project_tasks").select("project_id, column_id").in("project_id", projIds),
      ])
      const colName = new Map(((cols ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
      for (const t of (tasks ?? []) as { project_id: string; column_id: string }[]) {
        const c = counts.get(t.project_id) ?? { total: 0, done: 0 }
        c.total++
        if (DONE_COLUMNS.has(colName.get(t.column_id) ?? "")) c.done++
        counts.set(t.project_id, c)
      }
    }

    const companyNames = await resolveCompanyNames(rows.map(p => p.company_id))

    return NextResponse.json(rows.map((r): ProjectListItem => ({
      id:          r.id,
      name:        r.name,
      description: r.description,
      status:      r.status as ProjectListItem["status"],
      color:       r.color,
      companyId:   r.company_id,
      companyName: r.company_id ? (companyNames.get(r.company_id) ?? null) : null,
      taskCount:   counts.get(r.id)?.total ?? 0,
      doneCount:   counts.get(r.id)?.done ?? 0,
      createdAt:   r.created_at,
    })))
  } catch (err) {
    console.error("[GET /api/projects]", err)
    return NextResponse.json({ error: "Projeler alınamadı" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission("projects", "write")
  if (gate) return gate
  try {
    const body = await req.json()
    const { name, description, color = "#3b82f6", companyId } = body
    if (!name?.trim()) return NextResponse.json({ error: "Proje adı zorunlu" }, { status: 400 })

    const sb = await getSupabaseServer()
    const { data: proj, error } = await sb
      .schema("hub")
      .from("projects")
      .insert({ name: name.trim(), description: description ?? null, color, company_id: companyId ?? null })
      .select("id")
      .single()
    if (error) throw error

    // Varsayılan kolonlar
    const defaultColumns = [
      { name: "Backlog",      color: "#6b7280", position: 0 },
      { name: "Yapılacak",    color: "#3b82f6", position: 1 },
      { name: "Devam Ediyor", color: "#f59e0b", position: 2 },
      { name: "İncelemede",   color: "#8b5cf6", position: 3 },
      { name: "Tamamlandı",   color: "#10b981", position: 4 },
    ].map(c => ({ ...c, project_id: proj.id }))
    const { error: colErr } = await sb.schema("hub").from("project_columns").insert(defaultColumns)
    if (colErr) throw colErr

    return NextResponse.json({ id: proj.id }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/projects]", err)
    return NextResponse.json({ error: "Proje oluşturulamadı" }, { status: 500 })
  }
}
