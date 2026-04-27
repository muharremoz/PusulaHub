import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { auth } from "@/auth"
import {
  listTemplates,
  createTemplate,
  type CreateTemplateInput,
  type TplType,
  type TplPriority,
} from "@/lib/templates-db"

/**
 * GET    /api/messages/templates  → tüm şablonlar (built-in + kullanıcı)
 * POST   /api/messages/templates  → yeni kullanıcı şablonu ekle
 */

const VALID_TYPES:      TplType[]     = ["info", "warning", "urgent"]
const VALID_PRIORITIES: TplPriority[] = ["normal", "high", "urgent"]

export async function GET() {
  const gate = await requirePermission("messages", "read")
  if (gate) return gate

  try {
    const items = await listTemplates()
    return NextResponse.json({ templates: items })
  } catch (err) {
    console.error("[GET /api/messages/templates]", err)
    return NextResponse.json({ error: "Şablonlar alınamadı" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission("messages", "write")
  if (gate) return gate

  try {
    const session = await auth()
    const createdBy = session?.user?.fullName ?? session?.user?.username ?? null
    const body = (await req.json()) as Partial<CreateTemplateInput>

    // Doğrulama
    if (!body.title?.trim())   return NextResponse.json({ error: "Başlık zorunlu" }, { status: 400 })
    if (!body.subject?.trim()) return NextResponse.json({ error: "Konu zorunlu" }, { status: 400 })
    if (!body.body?.trim())    return NextResponse.json({ error: "Mesaj metni zorunlu" }, { status: 400 })
    if (!body.type     || !VALID_TYPES.includes(body.type as TplType))         return NextResponse.json({ error: "Geçersiz tip" }, { status: 400 })
    if (!body.priority || !VALID_PRIORITIES.includes(body.priority as TplPriority)) return NextResponse.json({ error: "Geçersiz öncelik" }, { status: 400 })

    const id = await createTemplate({
      title:       body.title.trim(),
      description: body.description?.trim() || undefined,
      subject:     body.subject.trim(),
      body:        body.body.trim(),
      type:        body.type as TplType,
      priority:    body.priority as TplPriority,
      createdBy,
    })

    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/messages/templates]", err)
    return NextResponse.json({ error: "Şablon eklenemedi" }, { status: 500 })
  }
}
