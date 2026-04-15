import { NextResponse } from "next/server"
import { query } from "@/lib/db"

interface UserLookupRow { Id: string; Username: string; FullName: string | null }

// GET /api/users/lookup  — aktif kullanıcılar (atanan seçici için hafif endpoint)
export async function GET() {
  const rows = await query<UserLookupRow[]>`
    SELECT Id, Username, FullName FROM AppUsers WHERE IsActive = 1 ORDER BY FullName, Username
  `
  return NextResponse.json(rows.map(r => ({
    id: r.Id,
    username: r.Username,
    fullName: r.FullName,
  })))
}
