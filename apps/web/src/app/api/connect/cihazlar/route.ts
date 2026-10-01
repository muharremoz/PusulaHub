/** GET /api/connect/cihazlar?firma= — Pusula Connect izleme merkezi: tüm cihazlar + canlı durum + yayındaki sürüm. */
import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { connectSurum, connectTumCihazlar } from "@/lib/connect-yonetim"

export async function GET(req: NextRequest) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  try {
    const [cihazlar, surum] = await Promise.all([
      connectTumCihazlar(req.nextUrl.searchParams.get("firma") ?? undefined),
      connectSurum(),
    ])
    return NextResponse.json({ cihazlar, sonSurum: surum.son, minSurum: surum.min })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
