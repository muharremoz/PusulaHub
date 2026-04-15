import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"

interface ProjectRow {
  Id: string
  Name: string
}

interface ColumnRow {
  Id: string
  Name: string
}

interface TaskRow {
  Id: string
  Title: string
  ColumnId: string
  Priority: string | null
  AssignedTo: string | null
  DueDate: Date | string | null
  Labels: string | null
  CreatedAt: Date | string | null
}

const PRIORITY_MAP: Record<string, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
  critical: "Kritik",
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
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const { searchParams } = new URL(req.url)
  const format = searchParams.get("format")

  if (format !== "csv") {
    return NextResponse.json({ error: "Sadece format=csv desteklenmektedir" }, { status: 400 })
  }

  try {
    const projects = await query<ProjectRow[]>`
      SELECT Id, Name FROM Projects WHERE Id = ${projectId}
    `
    if (!projects.length) {
      return NextResponse.json({ error: "Proje bulunamadı" }, { status: 404 })
    }
    const project = projects[0]

    const columns = await query<ColumnRow[]>`
      SELECT Id, Name FROM ProjectColumns WHERE ProjectId = ${projectId} ORDER BY Position
    `

    const tasks = await query<TaskRow[]>`
      SELECT Id, Title, ColumnId, Priority, AssignedTo, DueDate, Labels, CreatedAt
      FROM ProjectTasks
      WHERE ProjectId = ${projectId}
      ORDER BY ColumnId, Position
    `

    const columnMap: Record<string, string> = {}
    for (const col of columns) {
      columnMap[col.Id] = col.Name
    }

    const header = ["Görev", "Kolon", "Öncelik", "Atanan", "Bitiş Tarihi", "Etiketler", "Oluşturulma"]
      .map(escapeCsvField)
      .join(",")

    const rows = tasks.map((task) => {
      const columnName = columnMap[task.ColumnId] ?? ""
      const priority = PRIORITY_MAP[task.Priority ?? ""] ?? (task.Priority ?? "")
      const labels = task.Labels
        ? task.Labels.split(",").map((l) => l.trim()).join("; ")
        : ""
      const fields = [
        task.Title,
        columnName,
        priority,
        task.AssignedTo,
        formatDate(task.DueDate),
        labels,
        formatDate(task.CreatedAt),
      ]
      return fields.map(escapeCsvField).join(",")
    })

    const csv = "\uFEFF" + [header, ...rows].join("\r\n")
    const filename = `${slugify(project.Name)}-export.csv`

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
