import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import {
  getTemplate,
  updateTemplate,
  deleteTemplate,
  type UpdateTemplateInput,
  type TplType,
  type TplPriority,
} from "@/lib/templates-db"

const VALID_TYPES:      TplType[]     = ["info", "warning", "urgent"]
const VALID_PRIORITIES: TplPriority[] = ["normal", "high", "urgent"]

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const gate = await requirePermission("messages", "read")
  if (gate) return gate

  const { id } = await ctx.params
  const t = await getTemplate(id)
  if (!t) return NextResponse.json({ error: "Şablon bulunamadı" }, { status: 404 })
  return NextResponse.json(t)
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requirePermission("messages", "write")
  if (gate) return gate

  const { id } = await ctx.params
  const existing = await getTemplate(id)
  if (!existing) return NextResponse.json({ error: "Şablon bulunamadı" }, { status: 404 })
  if (existing.builtIn) {
    return NextResponse.json(
      { error: "Sistem şablonları düzenlenemez. Kopyalayıp yeni şablon oluşturun." },
      { status: 403 },
    )
  }

  try {
    const body = (await req.json()) as Partial<UpdateTemplateInput>
    if (body.type     && !VALID_TYPES.includes(body.type as TplType))         return NextResponse.json({ error: "Geçersiz tip" }, { status: 400 })
    if (body.priority && !VALID_PRIORITIES.includes(body.priority as TplPriority)) return NextResponse.json({ error: "Geçersiz öncelik" }, { status: 400 })

    const ok = await updateTemplate(id, {
      title:       body.title?.trim(),
      description: body.description?.trim(),
      subject:     body.subject?.trim(),
      body:        body.body?.trim(),
      type:        body.type as TplType | undefined,
      priority:    body.priority as TplPriority | undefined,
    })
    if (!ok) return NextResponse.json({ error: "Güncellenemedi" }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/messages/templates/:id]", err)
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const gate = await requirePermission("messages", "write")
  if (gate) return gate

  const { id } = await ctx.params
  const existing = await getTemplate(id)
  if (!existing) return NextResponse.json({ error: "Şablon bulunamadı" }, { status: 404 })
  if (existing.builtIn) {
    return NextResponse.json(
      { error: "Sistem şablonları silinemez." },
      { status: 403 },
    )
  }

  const ok = await deleteTemplate(id)
  if (!ok) return NextResponse.json({ error: "Silinemedi" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
