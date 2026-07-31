import { NextRequest, NextResponse } from "next/server"
import { pollSingleAgent } from "@/lib/agent-poller"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import { listCompanyUsers } from "@/lib/company-users"

/**
 * GET /api/companies/[firkod]/users
 *
 * Firmanın AD kullanıcıları. Kapı burada; liste `@/lib/company-users` içinde —
 * aynı liste `/api/hub/firma-kullanicilar` ile alt uygulamalara da (CRM) açık.
 */

export type { CompanyUserDto } from "@/lib/company-users"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> }
) {
  // Erişim Bilgileri modal'ı bu endpoint'i çağırıyor — "company-detail"
  // yetkisi olmayan ama "companies" yetkisi olan (rol: kullanıcı) kişilere
  // de açık. Modal admin/kullanıcı arasında aynı görünmeli.
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { firkod } = await params
  try {
    const sb = await getSupabaseServer()
    if (req.nextUrl.searchParams.get("refresh") === "1") {
      const { data: comp } = await sb.schema("hub").from("companies")
        .select("ad_server_id").eq("company_id", firkod).maybeSingle()
      const adId = (comp as { ad_server_id: string | null } | null)?.ad_server_id
      if (adId) { try { await pollSingleAgent(adId) } catch {} }
    }

    const users = await listCompanyUsers(sb, firkod)
    const resp = NextResponse.json(users)
    resp.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/users]", err)
    return NextResponse.json({ error: "Kullanıcı verisi alınamadı" }, { status: 500 })
  }
}
