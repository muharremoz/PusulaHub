import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { parsFirmaSifreleri } from "@/lib/pars-service"
import type { HubSorguIstemcisi } from "@/lib/hub-servers"

/**
 * GET /api/companies/[firkod]/pars-sifreler
 *
 * Firmanın Pars kullanıcılarının şifreleri — firma detayındaki Hizmetler
 * listesi için. `/api/hub/firma-pars-users`'ın (CRM, x-internal-key) oturumlu
 * karşılığı; aynı `parsFirmaSifreleri`'ni kullanır (Ayar.mdb agent üzerinden
 * canlı okunur, Hub şifre saklamaz).
 *
 * Yetki `companies:read` — Erişim sekmesinin Users.xml şifrelerini döndüren
 * `/web-users` ile aynı seviye. Oturum kapısı geçildikten sonra admin istemcisi
 * şart: `company_pars_users` session istemcisinde RLS yüzünden boş döner.
 *
 * DİKKAT: yanıt DÜZ METİN ŞİFRE içerir; önbelleğe alınmaz.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate

  const { firkod } = await params
  try {
    const veri = await parsFirmaSifreleri(getSupabaseAdmin() as unknown as HubSorguIstemcisi, firkod)
    return NextResponse.json(veri, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/pars-sifreler]", err)
    return NextResponse.json({ error: "Pars şifreleri alınamadı" }, { status: 500 })
  }
}
