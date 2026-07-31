import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { testWebUser, type OpsClient } from "@/lib/web-users-ops"

/**
 * POST /api/hub/firma-web-users/test
 * Body: { firkod, siteName, username, password, database?, via? }
 *
 * Kullanıcının hizmete gerçekten giriş yapıp yapamadığını dener — alt
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
    const body = (await req.json()) as {
      firkod?: string
      siteName?: string
      username?: string
      password?: string
      database?: string
      via?: "lan" | "wan"
    }
    const firkod = (body?.firkod ?? req.nextUrl.searchParams.get("firkod") ?? "").trim()
    if (!firkod) return NextResponse.json({ error: "firkod zorunludur." }, { status: 400 })
    return await testWebUser(getSupabaseAdmin() as unknown as OpsClient, firkod, body)
  } catch (err) {
    console.error("[POST /api/hub/firma-web-users/test]", err)
    return NextResponse.json({ error: "Erişim testi yapılamadı" }, { status: 500 })
  }
}
