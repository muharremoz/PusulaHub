import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import {
  addWebUser,
  deleteWebUser,
  listWebUsers,
  updateWebUser,
  type OpsClient,
  type WriteBody,
} from "@/lib/web-users-ops"

/**
 * /api/hub/firma-web-users?firkod=2312
 *
 * Web hizmetlerinin `Config\Users.xml` kullanıcıları — alt uygulamalar (CRM)
 * için. Aynı iş `/api/companies/[firkod]/web-users` üzerinden Hub oturumuyla da
 * yapılıyor; mantık tek yerde (`@/lib/web-users-ops`), burası yalnız kapı.
 *
 * Auth: x-internal-key (middleware `/api/hub/*` yolunu oturum kapısından muaf
 * tutar). Kullanıcı yetkilendirmesini ÇAĞIRAN uygulama yapar — CRM tarafında
 * `firma_erisim_bilgileri` yetkisiyle korunuyor.
 *
 * DİKKAT: yanıt DÜZ METİN ŞİFRE içerir; POST/PUT/DELETE müşteri sunucusundaki
 * canlı dosyayı değiştirir.
 *
 * Oturum YOK → admin istemcisi şart: session client `hub` şemasında RLS
 * yüzünden boş döner ve firma "kayıtsız" gibi görünür.
 */

function keyGate(req: NextRequest): NextResponse | null {
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) {
    return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  }
  if (req.headers.get("x-internal-key") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  return null
}

/** firkod: GET'te query, yazma uçlarında gövde. */
function firkodQuery(req: NextRequest): string {
  return (req.nextUrl.searchParams.get("firkod") ?? "").trim()
}

const admin = () => getSupabaseAdmin() as unknown as OpsClient

export async function GET(req: NextRequest) {
  const gate = keyGate(req)
  if (gate) return gate

  const firkod = firkodQuery(req)
  if (!firkod) return NextResponse.json({ error: "firkod zorunludur." }, { status: 400 })

  try {
    const veri = await listWebUsers(admin(), firkod)
    return NextResponse.json(veri, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    console.error("[GET /api/hub/firma-web-users]", err)
    return NextResponse.json({ error: "Users.xml bilgisi alınamadı" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = keyGate(req)
  if (gate) return gate
  try {
    const body = (await req.json()) as WriteBody & { firkod?: string }
    const firkod = (body?.firkod ?? firkodQuery(req)).trim()
    if (!firkod) return NextResponse.json({ error: "firkod zorunludur." }, { status: 400 })
    return await addWebUser(admin(), firkod, body)
  } catch (err) {
    console.error("[POST /api/hub/firma-web-users]", err)
    return NextResponse.json({ error: "Kullanıcı eklenemedi" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const gate = keyGate(req)
  if (gate) return gate
  try {
    const body = (await req.json()) as WriteBody & { firkod?: string }
    const firkod = (body?.firkod ?? firkodQuery(req)).trim()
    if (!firkod) return NextResponse.json({ error: "firkod zorunludur." }, { status: 400 })
    return await updateWebUser(admin(), firkod, body)
  } catch (err) {
    console.error("[PUT /api/hub/firma-web-users]", err)
    return NextResponse.json({ error: "Kullanıcı güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = keyGate(req)
  if (gate) return gate
  try {
    const body = (await req.json()) as WriteBody & { firkod?: string }
    const firkod = (body?.firkod ?? firkodQuery(req)).trim()
    if (!firkod) return NextResponse.json({ error: "firkod zorunludur." }, { status: 400 })
    return await deleteWebUser(admin(), firkod, body)
  } catch (err) {
    console.error("[DELETE /api/hub/firma-web-users]", err)
    return NextResponse.json({ error: "Kullanıcı silinemedi" }, { status: 500 })
  }
}
