import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { SupabaseLike } from "@/lib/firma-credentials"
import { connectKoduUret } from "@/lib/connect-kodu"

/**
 * POST /api/hub/connect/kod  { firkod, kullanici, olusturan? }
 *
 * Pusula Connect kurulum kodu — alt uygulamalar (CRM Erişim sekmesi) için.
 * Hub'ın firma sayfasındaki "Connect Kurulum Kodu" ile AYNI koddan üretilir
 * (lib/connect-kodu.ts). Kod yalnız bu yanıtta döner.
 *
 * Auth: x-internal-key (middleware `/api/hub/*` yolunu muaf tutar).
 * Kullanıcı yetkilendirmesini ÇAĞIRAN uygulama yapar.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  if (req.headers.get("x-internal-key") !== expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as { firkod?: string; kullanici?: string; olusturan?: string }
  const firkod = String(b.firkod ?? "").trim()
  const kullanici = String(b.kullanici ?? "").trim()
  if (!firkod || !kullanici) return NextResponse.json({ error: "firkod ve kullanici zorunludur." }, { status: 400 })

  // Oturum YOK → admin istemcisi; oturum tabanlı istemciyle hub şemasındaki RLS boş döner.
  const admin = getSupabaseAdmin()
  const { data: firma } = await admin.schema("hub").from("companies").select("name").eq("company_id", firkod).maybeSingle()
  try {
    const sonuc = await connectKoduUret(
      firkod,
      (firma as { name?: string } | null)?.name ?? firkod,
      kullanici,
      b.olusturan?.trim() || "CRM",
      admin as unknown as SupabaseLike,
    )
    if (!sonuc.ok) return NextResponse.json({ error: sonuc.hata }, { status: sonuc.kod })
    return NextResponse.json({ kod: sonuc.kod, indir: sonuc.indir })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 })
  }
}
