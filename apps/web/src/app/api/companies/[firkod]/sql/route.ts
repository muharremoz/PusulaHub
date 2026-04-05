import { NextResponse } from "next/server"
import { query } from "@/lib/db"

interface SQLDatabaseRow {
  Id:         string
  Name:       string
  Server:     string
  FirmaNo:    string | null
  SizeMB:     number
  Status:     string
  LastBackup: string | null
  Tables:     number
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const rows = await query<SQLDatabaseRow[]>`
      SELECT Id, Name, Server, FirmaNo, SizeMB, Status,
             CONVERT(NVARCHAR(30), LastBackup, 120) AS LastBackup, Tables
      FROM SQLDatabases
      WHERE FirmaNo = ${firkod}
      ORDER BY Server, Name
    `
    return NextResponse.json(rows)
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/sql]", err)
    return NextResponse.json({ error: "SQL verisi alınamadı" }, { status: 500 })
  }
}
