import { NextResponse } from "next/server"
import { query } from "@/lib/db"

/**
 * GET /api/ad/users
 * ADUsers tablosundan tüm AD kullanıcılarını döner.
 * Tablo, agent raporlarından agent-poller tarafından doldurulur.
 */

export interface ADUserDto {
  id:          string
  username:    string
  displayName: string
  email:       string
  ou:          string
  enabled:     boolean
  lastLogin:   string
  createdAt:   string
  server:      string
}

interface Row {
  Id:          string
  Server:      string | null
  Username:    string
  DisplayName: string
  Email:       string
  OU:          string
  Enabled:     boolean
  LastLogin:   string | null
  CreatedAt:   string
}

export async function GET() {
  try {
    const rows = await query<Row[]>`
      SELECT
        Id,
        Server,
        Username,
        DisplayName,
        Email,
        OU,
        Enabled,
        CONVERT(NVARCHAR(16), LastLogin, 120) AS LastLogin,
        CONVERT(NVARCHAR(10), CreatedAt, 23)  AS CreatedAt
      FROM ADUsers
      ORDER BY DisplayName
    `

    const users: ADUserDto[] = rows.map((r) => ({
      id:          r.Id,
      username:    r.Username,
      displayName: r.DisplayName,
      email:       r.Email,
      ou:          r.OU,
      enabled:     !!r.Enabled,
      lastLogin:   r.LastLogin ?? "",
      createdAt:   r.CreatedAt,
      server:      r.Server ?? "",
    }))

    const resp = NextResponse.json(users)
    resp.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/ad/users]", err)
    return NextResponse.json({ error: "AD kullanıcıları alınamadı" }, { status: 500 })
  }
}
