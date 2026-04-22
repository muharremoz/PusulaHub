import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { MODULES, HUB_APP_ID, type ModuleDef } from "@/lib/permissions"
import { requireAuth } from "@/lib/require-permission"

/**
 * GET /api/permissions/modules?appId=hub|spareflow
 *
 * Hub modülleri koddan, diğer app'lerin modülleri dbo.Apps.ModulesJson
 * kolonundan okunur. App'in kendisi modül listesini seed etmemişse boş döner.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if (gate) return gate

  const appId = req.nextUrl.searchParams.get("appId") ?? HUB_APP_ID

  if (appId === HUB_APP_ID) {
    return NextResponse.json(MODULES)
  }

  const rows = await query<{ ModulesJson: string | null }[]>`
    SELECT ModulesJson FROM dbo.Apps WHERE Id = ${appId}
  `
  if (!rows.length) return NextResponse.json([], { status: 200 })

  const raw = rows[0].ModulesJson
  if (!raw) return NextResponse.json([])

  try {
    const parsed = JSON.parse(raw) as ModuleDef[]
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json([])
  }
}
