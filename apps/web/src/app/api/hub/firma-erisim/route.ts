import { NextRequest, NextResponse } from "next/server"
import { getFirmaErisim } from "@/lib/firma-erisim"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { SupabaseLike } from "@/lib/firma-credentials"

/**
 * GET /api/hub/firma-erisim?firkod=2312
 *
 * Firma erişim bilgileri — alt uygulamalar (CRM) için.
 * Auth: x-internal-key (Hub middleware `/api/hub/*` yolunu kapıdan muaf tutar).
 *
 * DİKKAT: yanıt DÜZ METİN ŞİFRE içerir. Bu uç yalnız servis-servis çağrı
 * içindir; kullanıcı yetkilendirmesini ÇAĞIRAN uygulama yapar. CRM tarafında
 * `firma_erisim_bilgileri` yetkisiyle korunur ve her açılış audit_logs'a
 * yazılır.
 */
export async function GET(req: NextRequest) {
  const sentKey = req.headers.get("x-internal-key")
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  if (!sentKey || sentKey !== expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const firkod = (req.nextUrl.searchParams.get("firkod") ?? "").trim()
  if (!firkod) return NextResponse.json({ error: "firkod zorunludur." }, { status: 400 })

  try {
    // Oturum YOK (servis-servis) → admin istemcisi şart; oturum tabanlı
    // istemciyle hub şemasındaki RLS okumayı boş döndürür ve firma
    // "bulunamadı" gibi görünür.
    const data = await getFirmaErisim(firkod, getSupabaseAdmin() as unknown as SupabaseLike)
    if (!data) return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 })
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
