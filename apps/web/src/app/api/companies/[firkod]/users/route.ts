import { NextResponse } from "next/server"
import { query } from "@/lib/db"

interface ADUserRow {
  Username:    string
  DisplayName: string
  Email:       string
  OU:          string
  Enabled:     boolean
  LastLogin:   string | null
  Server:      string | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const rows = await query<ADUserRow[]>`
      SELECT Username, DisplayName, Email, OU, Enabled, Server,
             CONVERT(NVARCHAR(30), LastLogin, 120) AS LastLogin
      FROM ADUsers
      WHERE OU = ${firkod}
      ORDER BY Username
    `
    return NextResponse.json(rows.map((r) => ({
      username:    r.Username,
      displayName: r.DisplayName,
      email:       r.Email,
      ou:          r.OU,
      enabled:     !!r.Enabled,
      lastLogin:   r.LastLogin ?? "",
      groups:      [],
    })))
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/users]", err)
    return NextResponse.json({ error: "Kullanıcı verisi alınamadı" }, { status: 500 })
  }
}
