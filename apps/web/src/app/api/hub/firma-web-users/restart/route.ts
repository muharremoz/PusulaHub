import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { restartWebService, type OpsClient } from "@/lib/web-users-ops"

/**
 * POST /api/hub/firma-web-users/restart
 * Body: { firkod, siteName }
 *
 * Hizmeti yeniden başlatır (app pool recycle + site stop/start) — alt
 * uygulamalar (CRM) için. Auth: x-internal-key.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  }
  if (req.headers.get("x-internal-key") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    const body = (await req.json()) as { firkod?: string; siteName?: string }
    const firkod = (body?.firkod ?? req.nextUrl.searchParams.get("firkod") ?? "").trim()
    if (!firkod) return NextResponse.json({ error: "firkod zorunludur." }, { status: 400 })
    return await restartWebService(
      getSupabaseAdmin() as unknown as OpsClient,
      firkod,
      body?.siteName ?? "",
    )
  } catch (err) {
    console.error("[POST /api/hub/firma-web-users/restart]", err)
    return NextResponse.json({ error: "Hizmet yeniden başlatılamadı" }, { status: 500 })
  }
}
