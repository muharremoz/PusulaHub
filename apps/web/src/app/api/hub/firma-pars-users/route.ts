import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { parsFirmaSifreleri } from "@/lib/pars-service"
import type { HubSorguIstemcisi } from "@/lib/hub-servers"

/**
 * /api/hub/firma-pars-users?firkod=6399
 *
 * Firmanın Pars (mobil raporlama) kullanıcılarının ŞİFRELERİ — alt uygulamalar
 * (CRM Erişim sekmesi) için. Hub şifreyi saklamadığından mobil sunucudaki
 * Ayar.mdb agent üzerinden canlı okunur; yalnız bu firmaya kayıtlı
 * kullanıcıların ID'leri sorgulanır.
 *
 * Auth: x-internal-key (middleware `/api/hub/*` yolunu oturum kapısından muaf
 * tutar). Kullanıcı yetkilendirmesini ÇAĞIRAN uygulama yapar — CRM tarafında
 * `firma_erisim_bilgileri` yetkisiyle korunuyor.
 *
 * DİKKAT: yanıt DÜZ METİN ŞİFRE içerir.
 *
 * Oturum YOK → admin istemcisi şart (session client `hub` şemasında RLS
 * yüzünden boş döner).
 */

export async function GET(req: NextRequest) {
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  }
  if (req.headers.get("x-internal-key") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const firkod = (req.nextUrl.searchParams.get("firkod") ?? "").trim()
  if (!firkod) return NextResponse.json({ error: "firkod zorunludur." }, { status: 400 })

  try {
    const veri = await parsFirmaSifreleri(getSupabaseAdmin() as unknown as HubSorguIstemcisi, firkod)
    return NextResponse.json(veri, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    console.error("[GET /api/hub/firma-pars-users]", err)
    return NextResponse.json({ error: "Pars şifreleri alınamadı" }, { status: 500 })
  }
}
