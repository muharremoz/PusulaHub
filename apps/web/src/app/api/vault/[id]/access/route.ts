import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

/* POST /api/vault/[id]/access — erişim logu kaydet */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { action } = await req.json()
    const sb = await getSupabaseServer()
    const { error } = await sb.schema("hub").from("vault_access_log")
      .insert({ vault_entry_id: id, action: action ?? "view" })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[POST /api/vault/[id]/access]", err)
    return NextResponse.json({ error: "Erişim kaydedilemedi" }, { status: 500 })
  }
}

/* GET /api/vault/[id]/access — erişim logları (son 50) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb.schema("hub").from("vault_access_log")
      .select("id, action, created_at").eq("vault_entry_id", id)
      .order("created_at", { ascending: false }).limit(50)
    if (error) throw error
    return NextResponse.json(((data ?? []) as { id: string; action: string; created_at: string }[]).map(r => ({
      id: r.id, action: r.action, createdAt: r.created_at,
    })))
  } catch (err) {
    console.error("[GET /api/vault/[id]/access]", err)
    return NextResponse.json({ error: "Erişim logları alınamadı" }, { status: 500 })
  }
}
