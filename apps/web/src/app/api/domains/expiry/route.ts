import { NextResponse } from "next/server"
import { getDomainExpiries } from "@/lib/domain-expiry"

/**
 * GET /api/domains/expiry
 *
 * Kuma monitörlerinden çıkarılan domain'lerin RDAP yenileme tarihlerini döner.
 * Auth yok — /tv kiosk ekranı (oturumsuz) tüketir, /api/monitoring ile aynı.
 * Veri hassas değil (public WHOIS/RDAP bilgisi). 12 saat cache.
 */
export async function GET() {
  const domains = await getDomainExpiries()
  return NextResponse.json({ ok: true, domains })
}
