/**
 * GET  /api/connect/cihazlar/[id]/gunluk   son yüklenen günlük { zaman, metin, istendi }
 * POST /api/connect/cihazlar/[id]/gunluk   uygulamadan günlük iste — bir sonraki nabızda (~1 dk) yüklenir
 * Günlük destek amaçlı; şifre içermez (uygulama yazmaz). Yapan kişi olay kaydına yazılır.
 */
import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { auth } from "@/auth"
import { connectGunluk, connectGunlukIste } from "@/lib/connect-yonetim"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { id } = await params
  try {
    return NextResponse.json(await connectGunluk(id), { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { id } = await params
  const session = await auth()
  try {
    await connectGunlukIste(id, session?.user?.username ?? session?.user?.email ?? null)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
