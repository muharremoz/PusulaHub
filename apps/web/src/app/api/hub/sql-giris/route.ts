import { NextRequest, NextResponse } from "next/server"
import { icAnahtarKapisi } from "@/lib/hub-ic-anahtar"
import { sqlGirisOzetiHazirla } from "@/lib/sql-giris-ozet"

/**
 * GET /api/hub/sql-giris — CRM mobil "Sunucular → Güvenlik" sekmesi (29.10.2026).
 * SQL hatalı giriş özeti: son 24 saat (kaynak + kullanıcı + neden başına) ve
 * son 7 gün günlük seviye sayıları. Hesap lib/sql-giris-ozet.ts'te (TV ile ortak).
 */
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const kapi = icAnahtarKapisi(req)
  if (kapi) return kapi
  try {
    return NextResponse.json(await sqlGirisOzetiHazirla(), { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
