import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import {
  addWebUser,
  deleteWebUser,
  listWebUsers,
  updateWebUser,
  type WriteBody,
} from "@/lib/web-users-ops"

/**
 * Firmanın web hizmetlerindeki uygulama-içi kullanıcılar (`Config\Users.xml`).
 *
 * Bu dosya yalnız KAPI: oturum + modül yetkisi. İşin kendisi
 * `@/lib/web-users-ops` içinde — aynı mantık `/api/hub/firma-web-users`
 * üzerinden alt uygulamalara da (CRM) x-internal-key ile açılıyor.
 *
 * ŞİFRE İÇERİR: "Erişim Bilgileri" ile aynı sınıf veri, aynı yetki.
 */

export type { WebServiceUsersDto } from "@/lib/web-users-ops"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  // "Erişim Bilgileri" modal'ı ile aynı yetki — firma detayını göremeyen
  // (rol: kullanıcı) kişiler de bu modal'dan bağlantı bilgisi alabiliyor.
  const gate = await requirePermission("companies", "read")
  if (gate) return gate

  const { firkod } = await params
  try {
    const sb = await getSupabaseServer()
    return NextResponse.json(await listWebUsers(sb, firkod))
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/web-users]", err)
    return NextResponse.json({ error: "Users.xml bilgisi alınamadı" }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  // Okumadan farklı: sunucudaki dosyayı DEĞİŞTİRİYOR — firma detayı yazma yetkisi.
  const gate = await requirePermission("company-detail", "write")
  if (gate) return gate

  const { firkod } = await params
  try {
    const sb = await getSupabaseServer()
    return await addWebUser(sb, firkod, (await req.json()) as WriteBody)
  } catch (err) {
    console.error("[POST /api/companies/[firkod]/web-users]", err)
    return NextResponse.json({ error: "Kullanıcı eklenemedi" }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("company-detail", "write")
  if (gate) return gate

  const { firkod } = await params
  try {
    const sb = await getSupabaseServer()
    return await updateWebUser(sb, firkod, (await req.json()) as WriteBody)
  } catch (err) {
    console.error("[PUT /api/companies/[firkod]/web-users]", err)
    return NextResponse.json({ error: "Kullanıcı güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("company-detail", "write")
  if (gate) return gate

  const { firkod } = await params
  try {
    const sb = await getSupabaseServer()
    return await deleteWebUser(sb, firkod, (await req.json()) as WriteBody)
  } catch (err) {
    console.error("[DELETE /api/companies/[firkod]/web-users]", err)
    return NextResponse.json({ error: "Kullanıcı silinemedi" }, { status: 500 })
  }
}
