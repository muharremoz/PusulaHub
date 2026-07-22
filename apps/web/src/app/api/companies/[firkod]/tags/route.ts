/**
 * Firma Etiketleri — /api/companies/[firkod]/tags (hub.company_tags, company_id=firkod)
 * GET → { tags, allTags } · POST { tag } → ekle · DELETE ?tag= → sil
 */
import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ firkod: string }> }) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { firkod } = await params
  try {
    const sb = await getSupabaseServer()
    const [{ data: own }, { data: all }] = await Promise.all([
      sb.schema("hub").from("company_tags").select("tag").eq("company_id", firkod).order("tag"),
      sb.schema("hub").from("company_tags").select("tag").order("tag"),
    ])
    return NextResponse.json({
      tags: ((own ?? []) as { tag: string }[]).map((r) => r.tag),
      allTags: [...new Set(((all ?? []) as { tag: string }[]).map((r) => r.tag))],
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ firkod: string }> }) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { firkod } = await params
  let tag = ""
  try { tag = ((await req.json()) as { tag?: string }).tag?.trim() ?? "" }
  catch { return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 }) }
  if (!tag) return NextResponse.json({ error: "Etiket boş olamaz" }, { status: 400 })
  if (tag.length > 50) tag = tag.slice(0, 50)

  try {
    const sb = await getSupabaseServer()
    const { data: existing } = await sb.schema("hub").from("company_tags")
      .select("id").eq("company_id", firkod).eq("tag", tag).limit(1).maybeSingle()
    if (!existing) {
      await sb.schema("hub").from("company_tags").insert({ company_id: firkod, tag })
    }
    return NextResponse.json({ ok: true, tag })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ firkod: string }> }) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { firkod } = await params
  const tag = (req.nextUrl.searchParams.get("tag") ?? "").trim()
  if (!tag) return NextResponse.json({ error: "Etiket belirtilmedi" }, { status: 400 })
  try {
    const sb = await getSupabaseServer()
    await sb.schema("hub").from("company_tags").delete().eq("company_id", firkod).eq("tag", tag)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 })
  }
}
