import { NextRequest, NextResponse } from "next/server"
import { hubSenkronIsi } from "@/lib/hub-senkron-isi"
import { requirePermission } from "@/lib/require-permission"

/**
 * GET /api/setup/senkron?id=a,b — kurulum sonrası arka plan Hub senkronunun
 * durumu (HubSenkronWidget yoklar). Bilinmeyen kimlik `null` döner: süreç
 * yeniden başladıysa iş bellekten gitmiştir.
 */
export async function GET(req: NextRequest) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const idler = (req.nextUrl.searchParams.get("id") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20)
  return NextResponse.json(
    { isler: Object.fromEntries(idler.map((id) => [id, hubSenkronIsi(id)])) },
    { headers: { "Cache-Control": "no-store" } },
  )
}
