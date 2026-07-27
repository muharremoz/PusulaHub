/**
 * GET /api/companies/[firkod]/access-info
 *
 * Firma detay sayfasındaki "Erişim Bilgileri" modal'ı için ek sunucu
 * bilgilerini döner (frontend zaten tabUsers/tabIIS/tabSQL'e sahip).
 *
 * Sorgu mantığı `@/lib/firma-erisim`'e taşındı — alt uygulamalar (CRM)
 * `/api/hub/firma-erisim` üzerinden AYNI veriyi kullanıyor. İki yerde ayrı
 * sorgu tutmak, biri değişince diğerinin sessizce bayatlaması demekti.
 */

import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { getFirmaErisim, type FirmaErisimBilgisi } from "@/lib/firma-erisim"

export type AccessInfoResponse = FirmaErisimBilgisi

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  // Erişim Bilgileri modal'ı: "company-detail" yetkisi olmayan ama
  // "companies" yetkisi olan (rol: kullanıcı) kişilere de açık. Bu kişiler
  // firma detayını göremez ama firmaya bağlanmak için gerekli credential'ları
  // görebilirler.
  const gate = await requirePermission("companies", "read")
  if (gate) return gate

  const { firkod } = await params

  try {
    const data = await getFirmaErisim(firkod)
    if (!data) return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 })
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
