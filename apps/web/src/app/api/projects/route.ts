import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"
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

interface ProjectRow {
  Id:          string
  Name:        string
  Description: string | null
  Status:      string
  Color:       string
  CompanyId:   string | null
  CompanyName: string | null
  TaskCount:   number
  DoneCount:   number
  CreatedAt:   string
}

export async function GET(req: NextRequest) {
  const gate = await requirePermission("projects", "read")
  if (gate) return gate
  const includeArchived = new URL(req.url).searchParams.get("archived") === "1"
  try {
    const rows = includeArchived
      ? await query<ProjectRow[]>`
          SELECT
            p.Id, p.Name, p.Description, p.Status, p.Color, p.CompanyId,
            c.Name AS CompanyName,
            ISNULL((SELECT COUNT(*) FROM ProjectTasks t WHERE t.ProjectId = p.Id), 0) AS TaskCount,
            ISNULL((
              SELECT COUNT(*) FROM ProjectTasks t
              JOIN ProjectColumns col ON col.Id = t.ColumnId
              WHERE t.ProjectId = p.Id AND col.Name IN ('Tamamlandı', 'Done', 'Bitti')
            ), 0) AS DoneCount,
            CONVERT(NVARCHAR(30), p.CreatedAt, 120) AS CreatedAt
          FROM Projects p
          LEFT JOIN Companies c ON c.Id = p.CompanyId
          ORDER BY p.CreatedAt DESC
        `
      : await query<ProjectRow[]>`
          SELECT
            p.Id, p.Name, p.Description, p.Status, p.Color, p.CompanyId,
            c.Name AS CompanyName,
            ISNULL((SELECT COUNT(*) FROM ProjectTasks t WHERE t.ProjectId = p.Id), 0) AS TaskCount,
            ISNULL((
              SELECT COUNT(*) FROM ProjectTasks t
              JOIN ProjectColumns col ON col.Id = t.ColumnId
              WHERE t.ProjectId = p.Id AND col.Name IN ('Tamamlandı', 'Done', 'Bitti')
            ), 0) AS DoneCount,
            CONVERT(NVARCHAR(30), p.CreatedAt, 120) AS CreatedAt
          FROM Projects p
          LEFT JOIN Companies c ON c.Id = p.CompanyId
          WHERE p.Status != 'archived'
          ORDER BY p.CreatedAt DESC
        `
    return NextResponse.json(rows.map((r) => ({
      id:          r.Id,
      name:        r.Name,
      description: r.Description,
      status:      r.Status as "active" | "completed" | "archived",
      color:       r.Color,
      companyId:   r.CompanyId,
      companyName: r.CompanyName,
      taskCount:   r.TaskCount,
      doneCount:   r.DoneCount,
      createdAt:   r.CreatedAt,
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

    const id = crypto.randomUUID()

    await execute`
      INSERT INTO Projects (Id, Name, Description, Color, CompanyId)
      VALUES (${id}, ${name.trim()}, ${description ?? null}, ${color}, ${companyId ?? null})
    `

    // Varsayılan kolonları oluştur
    const defaultColumns = [
      { name: "Backlog",      color: "#6b7280", pos: 0 },
      { name: "Yapılacak",    color: "#3b82f6", pos: 1 },
      { name: "Devam Ediyor", color: "#f59e0b", pos: 2 },
      { name: "İncelemede",   color: "#8b5cf6", pos: 3 },
      { name: "Tamamlandı",   color: "#10b981", pos: 4 },
    ]
    for (const col of defaultColumns) {
      await execute`
        INSERT INTO ProjectColumns (Id, ProjectId, Name, Color, Position)
        VALUES (${crypto.randomUUID()}, ${id}, ${col.name}, ${col.color}, ${col.pos})
      `
    }

    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/projects]", err)
    return NextResponse.json({ error: "Proje oluşturulamadı" }, { status: 500 })
  }
}
