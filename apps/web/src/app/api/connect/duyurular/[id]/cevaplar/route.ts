/**
 * GET /api/connect/duyurular/[id]/cevaplar   anketli duyurunun yanıtları (Connect servisinde tutulur)
 */
import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { connectDuyuruCevaplar } from "@/lib/connect-yonetim"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { id } = await params
  try {
    return NextResponse.json(await connectDuyuruCevaplar(id))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
