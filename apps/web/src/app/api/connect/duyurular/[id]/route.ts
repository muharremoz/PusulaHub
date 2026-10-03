/**
 * GET  /api/connect/duyurular/[id]   hedefteki cihazlar ve okuma zamanları
 * POST /api/connect/duyurular/[id]   yayından kaldır (yapan kişi olay kaydına yazılır)
 */
import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { auth } from "@/auth"
import { connectDuyuruKaldir, connectDuyuruOkuyanlar } from "@/lib/connect-yonetim"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { id } = await params
  try {
    return NextResponse.json(await connectDuyuruOkuyanlar(id))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { id } = await params
  const session = await auth()
  try {
    await connectDuyuruKaldir(id, session?.user?.username ?? session?.user?.email ?? null)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
