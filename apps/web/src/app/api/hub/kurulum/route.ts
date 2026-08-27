import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { SupabaseLike } from "@/lib/firma-credentials"
import { kurulumPaketiUret } from "@/lib/kurulum-paketi"

/**
 * GET /api/hub/kurulum?firkod=2312&kullanici=ahmet
 *
 * Kullanıcıya özel VPN/RDP kurulum paketi (.zip) — alt uygulamalar (CRM) için.
 * Auth: x-internal-key (Hub middleware `/api/hub/*` yolunu kapıdan muaf tutar).
 *
 * Paketin içeriği Hub'ın kendi firma sayfasındakiyle AYNI koddan üretiliyor
 * (lib/kurulum-paketi.ts) — iki uygulamanın müşteriye farklı paket vermesi
 * ihtimali kalmasın.
 *
 * Kullanıcı yetkilendirmesini ÇAĞIRAN uygulama yapar; CRM tarafında
 * `firma_erisim_bilgileri` yetkisi aranıyor.
 */
export async function GET(req: NextRequest) {
  const sentKey = req.headers.get("x-internal-key")
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) {
    return NextResponse.json(
      { error: "INTERNAL_APP_KEY Hub'da tanımlı değil." },
      { status: 500 },
    )
  }
  if (!sentKey || sentKey !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const firkod = (req.nextUrl.searchParams.get("firkod") ?? "").trim()
  const kullanici = (req.nextUrl.searchParams.get("kullanici") ?? "").trim()
  if (!firkod) return NextResponse.json({ error: "firkod zorunludur." }, { status: 400 })

  try {
    // Oturum YOK (servis-servis) → admin istemcisi şart; oturum tabanlı
    // istemciyle hub şemasındaki RLS okumayı boş döndürür.
    const sonuc = await kurulumPaketiUret(
      firkod,
      kullanici,
      getSupabaseAdmin() as unknown as SupabaseLike,
    )
    if (!sonuc.ok) {
      return NextResponse.json({ error: sonuc.hata }, { status: sonuc.kod })
    }
    return new NextResponse(Buffer.from(sonuc.zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${sonuc.dosyaAdi}"`,
        "Content-Length": String(sonuc.zip.length),
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
