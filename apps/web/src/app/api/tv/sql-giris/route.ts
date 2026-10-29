import { NextResponse } from "next/server"
import { sqlGirisOzetiHazirla } from "@/lib/sql-giris-ozet"

/**
 * GET /api/tv/sql-giris — TV panosu SQL hatalı giriş kartı ve uyarısı (29.10.2026).
 * Oturum middleware'de doğrulanıyor (TV agent kiosk'u oturumlu). Veri mobil
 * Güvenlik sekmesiyle aynı (lib/sql-giris-ozet.ts). TV yeni denemeyi satırların
 * `son` zamanından yakaladığı için daha çok satır alır (300).
 */
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(await sqlGirisOzetiHazirla(300), { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
