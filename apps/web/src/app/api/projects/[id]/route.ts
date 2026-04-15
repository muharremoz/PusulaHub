import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"

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

interface ProjectRow {
  Id: string; Name: string; Description: string | null
  Status: string; Color: string; CompanyId: string | null; CompanyName: string | null
}
interface ColRow {
  Id: string; Name: string; Color: string; Position: number; WipLimit: number | null
}
interface TaskRow {
  Id: string; ColumnId: string; Title: string; Description: string | null
  Priority: string; AssignedTo: string | null; DueDate: string | null
  Labels: string | null; Position: number; CreatedAt: string; CommentCount: number
  SubtaskTotal: number; SubtaskDone: number
  EstimatedHours: number | null; ActualHours: number | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const [projects, cols, tasks] = await Promise.all([
      query<ProjectRow[]>`
        SELECT p.Id, p.Name, p.Description, p.Status, p.Color, p.CompanyId, c.Name AS CompanyName
        FROM Projects p
        LEFT JOIN Companies c ON c.Id = p.CompanyId
        WHERE p.Id = ${id}
      `,
      query<ColRow[]>`
        SELECT Id, Name, Color, Position, WipLimit
        FROM ProjectColumns WHERE ProjectId = ${id} ORDER BY Position
      `,
      query<TaskRow[]>`
        SELECT t.Id, t.ColumnId, t.Title, t.Description, t.Priority, t.AssignedTo,
               CONVERT(NVARCHAR(10), t.DueDate, 23) AS DueDate,
               t.Labels, t.Position,
               CONVERT(NVARCHAR(30), t.CreatedAt, 120) AS CreatedAt,
               ISNULL((SELECT COUNT(*) FROM ProjectTaskComments cm WHERE cm.TaskId = t.Id), 0) AS CommentCount,
               ISNULL((SELECT COUNT(*) FROM ProjectSubtasks s WHERE s.TaskId = t.Id), 0) AS SubtaskTotal,
               ISNULL((SELECT COUNT(*) FROM ProjectSubtasks s WHERE s.TaskId = t.Id AND s.Completed = 1), 0) AS SubtaskDone,
               t.EstimatedHours, t.ActualHours
        FROM ProjectTasks t WHERE t.ProjectId = ${id} ORDER BY t.Position
      `,
    ])

    if (!projects.length) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 404 })

    const p = projects[0]
    const board: BoardData = {
      id: p.Id, name: p.Name, description: p.Description,
      status: p.Status as BoardData["status"],
      color: p.Color, companyId: p.CompanyId, companyName: p.CompanyName,
      columns: cols.map((col) => ({
        id: col.Id, name: col.Name, color: col.Color,
        position: col.Position, wipLimit: col.WipLimit,
        tasks: tasks
          .filter((t) => t.ColumnId === col.Id)
          .map((t) => ({
            id: t.Id, columnId: t.ColumnId, title: t.Title,
            description: t.Description,
            priority: t.Priority as BoardTask["priority"],
            assignedTo: t.AssignedTo, dueDate: t.DueDate,
            labels: t.Labels ? t.Labels.split(",").map((l) => l.trim()).filter(Boolean) : [],
            position: t.Position, createdAt: t.CreatedAt,
            commentCount: t.CommentCount,
            subtaskTotal: t.SubtaskTotal,
            subtaskDone: t.SubtaskDone,
            estimatedHours: t.EstimatedHours,
            actualHours: t.ActualHours,
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
    await execute`
      UPDATE Projects
      SET Name        = COALESCE(${name ?? null}, Name),
          Description = COALESCE(${description ?? null}, Description),
          Status      = COALESCE(${status ?? null}, Status),
          Color       = COALESCE(${color ?? null}, Color),
          UpdatedAt   = GETDATE()
      WHERE Id = ${id}
    `
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
    await execute`DELETE FROM Projects WHERE Id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/projects/[id]]", err)
    return NextResponse.json({ error: "Proje silinemedi" }, { status: 500 })
  }
}
