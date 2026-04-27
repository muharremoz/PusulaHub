import { NextResponse } from "next/server"
import { query } from "@/lib/db"

/**
 * GET /api/ad/ous
 * AD OU ağacını döner. Bu sistemde:
 *   Root: "Firmalar" (OU=Firmalar)
 *   Alt düğümler: Her bir Companies kaydı (CompanyId alanı OU adı olarak kullanılır)
 * userCount, ADUsers.OU = Companies.CompanyId eşleşmesi ile sayılır.
 */

export interface ADOUDto {
  name:      string
  path:      string
  userCount: number
  children:  ADOUDto[]
}

interface Row {
  CompanyId: string
  Name:      string
  UserCount: number
}

export async function GET() {
  try {
    const rows = await query<Row[]>`
      SELECT
        c.CompanyId,
        c.Name,
        ISNULL((SELECT COUNT(*) FROM ADUsers a WHERE a.OU = c.CompanyId), 0) AS UserCount
      FROM Companies c
      WHERE c.CompanyId IS NOT NULL AND c.AdServerId IS NOT NULL
      ORDER BY c.CompanyId
    `

    const children: ADOUDto[] = rows.map((r) => ({
      name:      `${r.CompanyId} — ${r.Name}`,
      path:      r.CompanyId,
      userCount: r.UserCount,
      children:  [],
    }))

    const totalUsers = children.reduce((s, c) => s + c.userCount, 0)

    const tree: ADOUDto[] = [
      {
        name:      "Firmalar",
        path:      "Firmalar",
        userCount: totalUsers,
        children,
      },
    ]

    const resp = NextResponse.json(tree)
    resp.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60")
    return resp
  } catch (err) {
    console.error("[GET /api/ad/ous]", err)
    return NextResponse.json({ error: "OU ağacı alınamadı" }, { status: 500 })
  }
}
