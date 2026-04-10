import { NextResponse } from "next/server"
import { pollSingleAgent } from "@/lib/agent-poller"

/**
 * POST /api/servers/[id]/refresh
 * Belirtilen sunucunun ajanına o anda (senkron) poll atar,
 * agent-store'u günceller ve sonucu döner.
 * UI'daki "Yenile" butonu bunu çağırır → anlık taze metrik.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const ok = await pollSingleAgent(id)
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Ajana ulaşılamadı veya sunucu bulunamadı" },
        { status: 502 }
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[POST /api/servers/:id/refresh]", err)
    return NextResponse.json(
      { ok: false, error: "Yenileme başarısız" },
      { status: 500 }
    )
  }
}
