import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"

/**
 * Hedef uygulamada "admin" rolüne sahip + 2FA kurulu yöneticilerin listesi.
 * Alt uygulamaların 2-admin onay UI'ı için.
 *
 * Query: ?appId=spareflow
 * Auth:  x-internal-key
 * Yanıt: [{ id, fullName, email }]
 */

interface Row {
  Id:        string
  FullName:  string | null
  Email:     string
}

export async function GET(req: NextRequest) {
  const sentKey  = req.headers.get("x-internal-key")
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  }
  if (!sentKey || sentKey !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const appId = (req.nextUrl.searchParams.get("appId") ?? "").trim()
  if (!appId) {
    return NextResponse.json({ error: "appId zorunludur." }, { status: 400 })
  }

  // Global admin VEYA app başına admin olanlar (aktif + 2FA kurulu)
  const rows = await query<Row[]>`
    SELECT DISTINCT u.Id, u.FullName, u.Email
    FROM AppUsers u
    LEFT JOIN UserApps ua ON ua.UserId = u.Id AND ua.AppId = ${appId}
    WHERE u.IsActive = 1
      AND u.TwoFactorEnabled = 1
      AND u.TwoFactorSecret IS NOT NULL
      AND (u.[Role] = 'admin' OR ua.[Role] = 'admin')
    ORDER BY u.FullName
  `

  return NextResponse.json(rows.map(r => ({
    id:       r.Id,
    fullName: r.FullName ?? r.Email,
    email:    r.Email,
  })))
}
