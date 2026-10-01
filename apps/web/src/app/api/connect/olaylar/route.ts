/** GET /api/connect/olaylar?firma=&cihaz=&limit=&once= — Connect olay kaydı (yeniden eskiye). */
import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { connectOlaylar } from "@/lib/connect-yonetim"

export async function GET(req: NextRequest) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const q = req.nextUrl.searchParams
  try {
    return NextResponse.json(await connectOlaylar({
      firma: q.get("firma") ?? undefined,
      cihaz: q.get("cihaz") ?? undefined,
      limit: Number(q.get("limit")) || 300,
      once: Number(q.get("once")) || undefined,
    }))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
