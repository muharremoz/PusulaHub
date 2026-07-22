import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

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

export async function GET() {
  try {
    const sb = await getSupabaseServer()
    const [{ data: comps }, { data: adu }] = await Promise.all([
      sb.schema("hub").from("companies").select("company_id, name")
        .not("company_id", "is", null).not("ad_server_id", "is", null).order("company_id"),
      sb.schema("hub").from("ad_users").select("ou"),
    ])
    const cnt = new Map<string, number>()
    for (const a of (adu ?? []) as { ou: string }[]) cnt.set(a.ou, (cnt.get(a.ou) ?? 0) + 1)

    const children: ADOUDto[] = ((comps ?? []) as { company_id: string; name: string }[]).map((c) => ({
      name:      `${c.company_id} — ${c.name}`,
      path:      c.company_id,
      userCount: cnt.get(c.company_id) ?? 0,
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
