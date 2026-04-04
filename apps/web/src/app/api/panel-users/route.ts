import { NextResponse } from "next/server"
import { query } from "@/lib/db"

interface PanelUserRow {
  Id: string
  Name: string
  Email: string
  Role: string
}

export async function GET() {
  try {
    const rows = await query<PanelUserRow[]>`
      SELECT Id, Name, Email, Role
      FROM PanelUsers
      ORDER BY Name
    `
    return NextResponse.json(rows)
  } catch (err) {
    console.error("[GET /api/panel-users]", err)
    return NextResponse.json({ error: "Kullanıcılar alınamadı" }, { status: 500 })
  }
}
