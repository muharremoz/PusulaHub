import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { testResimSitesi } from "@/lib/resim-site-test"
import type { OpsClient } from "@/lib/web-users-ops"

/**
 * GET /api/hub/firma-resim-test?firkod=6572&siteName=6572_RESIM_CADDE
 *
 * Resim sitesinin dış (DNS) + iç (IP) erişimini örnek bir resim dosyasıyla
 * dener, resmi data URL olarak döner — CRM Erişim sekmesi için.
 * Yalnız okur. Auth: x-internal-key.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  }
  if (req.headers.get("x-internal-key") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const firkod   = req.nextUrl.searchParams.get("firkod")?.trim() ?? ""
  const siteName = req.nextUrl.searchParams.get("siteName")?.trim() ?? ""
  if (!firkod || !siteName) return NextResponse.json({ error: "firkod ve siteName zorunludur." }, { status: 400 })

  try {
    const r = await testResimSitesi(getSupabaseAdmin() as unknown as OpsClient, firkod, siteName)
    if (!r.ok) return NextResponse.json({ error: r.hata }, { status: r.kod })
    return NextResponse.json(r.veri)
  } catch (err) {
    console.error("[GET /api/hub/firma-resim-test]", err)
    return NextResponse.json({ error: "Resim sitesi testi yapılamadı" }, { status: 500 })
  }
}
