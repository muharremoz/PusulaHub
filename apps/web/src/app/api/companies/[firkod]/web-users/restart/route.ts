import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import { restartWebService } from "@/lib/web-users-ops"

/**
 * POST /api/companies/[firkod]/web-users/restart
 * Body: { siteName: string }
 *
 * Users.xml değiştikten sonra hizmeti yeniden başlatır (app pool recycle + site
 * stop/start). Kapı burada; iş `@/lib/web-users-ops` içinde.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  // Sunucuda servis durdurup başlatıyor — yazma yetkisi.
  const gate = await requirePermission("company-detail", "write")
  if (gate) return gate

  const { firkod } = await params
  try {
    const body = (await req.json()) as { siteName?: string }
    const sb = await getSupabaseServer()
    return await restartWebService(sb, firkod, body?.siteName ?? "")
  } catch (err) {
    console.error("[POST /api/companies/[firkod]/web-users/restart]", err)
    return NextResponse.json({ error: "Hizmet yeniden başlatılamadı" }, { status: 500 })
  }
}
