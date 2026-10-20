import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { kurApiAyarlar, kurApiGunluk, kurApiSaglik, KurApiHatasi } from "@/lib/kur-api"

/**
 * GET /api/kur-api?seviye=warn
 *
 * Kur API sayfasının tek çağrısı: sağlık (/health) + ayarlar (/admin/config) + günlük (/admin/logs).
 * Üçü bağımsız çekilir; biri düşerse diğerleri yine döner, düşenin hatası `hatalar`a yazılır.
 */
export async function GET(req: NextRequest) {
  const gate = await requirePermission("kur-api", "read")
  if (gate) return gate

  const s = req.nextUrl.searchParams.get("seviye")
  const seviye = s === "info" || s === "error" ? s : "warn"

  const [saglik, ayarlar, gunluk] = await Promise.allSettled([kurApiSaglik(), kurApiAyarlar(), kurApiGunluk(seviye)])
  const hata = (r: PromiseSettledResult<unknown>) =>
    r.status === "rejected" ? (r.reason instanceof KurApiHatasi || r.reason instanceof Error ? r.reason.message : String(r.reason)) : null

  return NextResponse.json({
    saglik: saglik.status === "fulfilled" ? saglik.value : null,
    ayarlar: ayarlar.status === "fulfilled" ? ayarlar.value : null,
    gunluk: gunluk.status === "fulfilled" ? gunluk.value.kayitlar : null,
    hatalar: { saglik: hata(saglik), ayarlar: hata(ayarlar), gunluk: hata(gunluk) },
    zaman: new Date().toISOString(),
  })
}
