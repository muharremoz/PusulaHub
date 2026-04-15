import { NextRequest, NextResponse } from "next/server"
import { execute, query } from "@/lib/db"

interface ActivityRow {
  Id: string
  TaskId: string | null
  UserId: string | null
  UserName: string | null
  Action: string
  Detail: string | null
  CreatedAt: string
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const { searchParams } = req.nextUrl
  const taskId = searchParams.get("taskId") ?? null
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 500)

  try {
    let rows: ActivityRow[]

    if (taskId) {
      rows = await query<ActivityRow[]>`
        SELECT TOP (${limit})
          Id, TaskId, UserId, UserName, Action, Detail,
          CONVERT(NVARCHAR(30), CreatedAt, 120) AS CreatedAt
        FROM ProjectActivityLog
        WHERE ProjectId = ${projectId}
          AND TaskId = ${taskId}
        ORDER BY CreatedAt DESC
      `
    } else {
      rows = await query<ActivityRow[]>`
        SELECT TOP (${limit})
          Id, TaskId, UserId, UserName, Action, Detail,
          CONVERT(NVARCHAR(30), CreatedAt, 120) AS CreatedAt
        FROM ProjectActivityLog
        WHERE ProjectId = ${projectId}
        ORDER BY CreatedAt DESC
      `
    }

    return NextResponse.json(
      rows.map((r) => ({
        id: r.Id,
        taskId: r.TaskId,
        userId: r.UserId,
        userName: r.UserName,
        action: r.Action,
        detail: r.Detail,
        createdAt: r.CreatedAt,
      }))
    )
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

    if (!action?.trim()) {
      return NextResponse.json({ error: "action zorunlu" }, { status: 400 })
    }

    const id = crypto.randomUUID()

    await execute`
      INSERT INTO ProjectActivityLog (Id, ProjectId, TaskId, UserId, UserName, Action, Detail)
      VALUES (
        ${id},
        ${projectId},
        ${taskId ?? null},
        ${userId ?? null},
        ${userName ?? null},
        ${action.trim()},
        ${detail ?? null}
      )
    `

    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/projects/[id]/activity]", err)
    return NextResponse.json({ error: "Aktivite kaydedilemedi" }, { status: 500 })
  }
}
