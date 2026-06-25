import { NextResponse } from "next/server"
import { getBandwidth } from "@/lib/bandwidth"

/**
 * GET /api/tv/bandwidth
 *
 * API sunucusunun (ens192) anlık + günlük + aylık bant genişliğini döner.
 * Token harici servise server-side gider, tarayıcıya sızmaz (bkz: lib/bandwidth.ts).
 * Auth yok — /tv kiosk ekranı (oturumsuz) tüketir, /api/domains/expiry ile aynı.
 */
export async function GET() {
  const data = await getBandwidth()
  if (!data) return NextResponse.json({ ok: false }, { status: 200 })
  return NextResponse.json(data)
}
