import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { parsHedefYukle, parsKatalogOku } from "@/lib/pars-service"

/**
 * GET /api/setup/pars/catalog?serviceId=<pars hizmet id>[&refresh=true]
 *
 * Sihirbazın Hizmetler adımı için Pars kataloğu: program tipleri, bağlı
 * datalar, rapor/görev listesi ve mevcut kullanıcı adları (çakışma kontrolü).
 * Mobil sunucudaki Ayar.mdb canlı okunur (1 dk önbellek).
 */
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const gate = await requirePermission("services", "read")
  if (gate) return gate
  const serviceId = Number(req.nextUrl.searchParams.get("serviceId"))
  if (!Number.isFinite(serviceId) || serviceId <= 0) {
    return NextResponse.json({ error: "serviceId zorunlu" }, { status: 400 })
  }
  const taze = req.nextUrl.searchParams.get("refresh") === "true"
  try {
    const h = await parsHedefYukle(serviceId)
    if (!h.ok) return NextResponse.json({ error: h.error }, { status: 400 })
    const k = await parsKatalogOku(h.hedef, taze)
    if (!k.ok) return NextResponse.json({ error: k.error }, { status: 502 })
    return NextResponse.json(k.katalog)
  } catch (err) {
    console.error("[GET /api/setup/pars/catalog]", err)
    return NextResponse.json({ error: "Pars kataloğu alınamadı" }, { status: 500 })
  }
}
