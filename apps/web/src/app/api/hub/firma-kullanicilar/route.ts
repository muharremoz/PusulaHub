import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { listCompanyUsers, type UsersClient } from "@/lib/company-users"

/**
 * GET /api/hub/firma-kullanicilar?firkod=2312
 *
 * Firmanın AD kullanıcıları — alt uygulamalar (CRM) için. Liste agent
 * raporlarından üretiliyor; DB'de firma bazlı kullanıcı tablosu olmadığı için
 * bu veri yalnız Hub sürecinden alınabiliyor.
 *
 * Auth: x-internal-key (middleware `/api/hub/*` yolunu muaf tutar).
 * Kullanıcı yetkilendirmesini çağıran uygulama yapar.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  }
  if (req.headers.get("x-internal-key") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const firkod = (req.nextUrl.searchParams.get("firkod") ?? "").trim()
  if (!firkod) return NextResponse.json({ error: "firkod zorunludur." }, { status: 400 })

  try {
    // Oturum yok → admin istemcisi (hub şemasında RLS okumayı boş döndürür).
    const users = await listCompanyUsers(getSupabaseAdmin() as unknown as UsersClient, firkod)
    return NextResponse.json(users, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    console.error("[GET /api/hub/firma-kullanicilar]", err)
    return NextResponse.json({ error: "Kullanıcı verisi alınamadı" }, { status: 500 })
  }
}
