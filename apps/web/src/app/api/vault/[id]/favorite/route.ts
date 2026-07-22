import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

/* PATCH /api/vault/[id]/favorite — favori toggle */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const sb = await getSupabaseServer()
    const { data: cur } = await sb.schema("hub").from("vault_entries").select("is_favorite").eq("id", id).maybeSingle()
    const next = !((cur as { is_favorite: boolean } | null)?.is_favorite)
    const { error } = await sb.schema("hub").from("vault_entries").update({ is_favorite: next }).eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/vault/[id]/favorite]", err)
    return NextResponse.json({ error: "Favori güncellenemedi" }, { status: 500 })
  }
}
