/**
 * GET /api/connect/olaylar/ara?tur=a,b&kaynak=&firma=&kullanici=&makine=&q=&bas=&bit=&limit=&offset=
 * Olay kaydı — servis tarafında filtreli ve sayfalı (son 500 sınırı yok). → { liste, toplam, turler }
 */
import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { connectOlayAra } from "@/lib/connect-yonetim"

export async function GET(req: NextRequest) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const q = req.nextUrl.searchParams
  const liste = (k: string) => (q.get(k) ?? "").split(",").map((x) => x.trim()).filter(Boolean)
  try {
    return NextResponse.json(await connectOlayAra({
      tur: liste("tur"), kaynak: liste("kaynak"),
      firma: q.get("firma") ?? undefined, kullanici: q.get("kullanici") ?? undefined,
      makine: q.get("makine") ?? undefined, q: q.get("q") ?? undefined,
      bas: q.get("bas") ?? undefined, bit: q.get("bit") ?? undefined,
      limit: Number(q.get("limit")) || 50, offset: Number(q.get("offset")) || 0,
    }), { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
