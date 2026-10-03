/**
 * GET /api/hub/connect/profil?firma=&kullanici=
 *
 * Connect servisinin (services/pusula-connect) sorduğu GÜNCEL profil: VPN + RDP hedefi + domain
 * (Hub'da firmanın sunucusu değişince buradan yansır) ve kullanıcının şifre sürümü (şifre değişti mi).
 * Şifrenin kendisi DÖNMEZ (bkz. /api/hub/connect/sifre).
 * Auth: X-Service-Key = TRANSFER_SERVICE_KEY.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { SupabaseLike } from "@/lib/firma-credentials"
import { connectProfili } from "@/lib/connect-kodu"
import { kullaniciSifreKaydi, servisAnahtariDogru } from "@/lib/connect-hub-ic"

export async function GET(req: NextRequest) {
  if (!servisAnahtariDogru(req.headers.get("x-service-key"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const firma = (req.nextUrl.searchParams.get("firma") ?? "").trim()
  const kullanici = (req.nextUrl.searchParams.get("kullanici") ?? "").trim()
  if (!firma || !kullanici) return NextResponse.json({ error: "firma ve kullanici zorunlu" }, { status: 400 })
  try {
    const [p, sifre] = await Promise.all([
      connectProfili(firma, getSupabaseAdmin() as unknown as SupabaseLike),
      kullaniciSifreKaydi(firma, kullanici),
    ])
    if (!p.ok) return NextResponse.json({ error: p.hata }, { status: p.kod })
    return NextResponse.json({ profil: p.profil, sifreSurumu: sifre?.surum ?? null }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
