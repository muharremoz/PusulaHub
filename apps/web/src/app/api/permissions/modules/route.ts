import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
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

  const sb = await getSupabaseServer()
  const { data } = await sb.from("apps").select("modules").eq("id", appId).maybeSingle()
  const modules = (data as { modules: unknown } | null)?.modules
  if (!modules) return NextResponse.json([])

  // public.apps.modules jsonb — string ise parse et, array ise doğrudan
  if (Array.isArray(modules)) return NextResponse.json(modules as ModuleDef[])
  if (typeof modules === "string") {
    try { return NextResponse.json(JSON.parse(modules) as ModuleDef[]) } catch { return NextResponse.json([]) }
  }
  return NextResponse.json([])
}
