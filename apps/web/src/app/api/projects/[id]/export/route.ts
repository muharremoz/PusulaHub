import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { resolveCreators } from "@/lib/hub-users"

const PRIORITY_MAP: Record<string, string> = {
  low: "Düşük", medium: "Orta", high: "Yüksek", critical: "Kritik",
}

function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return ""
  const str = String(value)
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return ""
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return ""
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}.${d.getFullYear()}`
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const format = new URL(req.url).searchParams.get("format")
  if (format !== "csv") {
    return NextResponse.json({ error: "Sadece format=csv desteklenmektedir" }, { status: 400 })
  }

  try {
    const sb = await getSupabaseServer()
    const { data: project } = await sb.schema("hub").from("projects").select("name").eq("id", projectId).maybeSingle()
    if (!project) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 404 })

    const [{ data: colData }, { data: taskData }] = await Promise.all([
      sb.schema("hub").from("project_columns").select("id, name").eq("project_id", projectId).order("position"),
      sb.schema("hub").from("project_tasks")
        .select("title, column_id, priority, assigned_to, due_date, labels, created_at")
        .eq("project_id", projectId).order("column_id").order("position"),
    ])

    const columnMap = new Map(((colData ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
    const tasks = (taskData ?? []) as {
      title: string; column_id: string; priority: string | null
      assigned_to: string | null; due_date: string | null; labels: string | null; created_at: string | null
    }[]
    const creators = await resolveCreators(sb, tasks.map(t => t.assigned_to))

    const header = ["Görev", "Kolon", "Öncelik", "Atanan", "Bitiş Tarihi", "Etiketler", "Oluşturulma"]
      .map(escapeCsvField).join(",")

    const rows = tasks.map((task) => {
      const columnName = columnMap.get(task.column_id) ?? ""
      const priority = PRIORITY_MAP[task.priority ?? ""] ?? (task.priority ?? "")
      const labels = task.labels ? task.labels.split(",").map(l => l.trim()).join("; ") : ""
      const assignee = task.assigned_to ? (creators.get(task.assigned_to) ?? "") : ""
      return [
        task.title, columnName, priority, assignee,
        formatDate(task.due_date), labels, formatDate(task.created_at),
      ].map(escapeCsvField).join(",")
    })

    const csv = "﻿" + [header, ...rows].join("\r\n")
    const filename = `${slugify((project as { name: string }).name)}-export.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error("[GET /api/projects/[id]/export]", err)
    return NextResponse.json({ error: "Dışa aktarma başarısız oldu" }, { status: 500 })
  }
}
