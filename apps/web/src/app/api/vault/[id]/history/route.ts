import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { decrypt } from "@/lib/crypto"

/* GET /api/vault/[id]/history — şifre geçmişi */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb.schema("hub").from("vault_password_history")
      .select("id, password, changed_at").eq("vault_entry_id", id).order("changed_at", { ascending: false })
    if (error) throw error
    return NextResponse.json(((data ?? []) as { id: string; password: string; changed_at: string }[]).map(r => ({
      id: r.id, password: decrypt(r.password) ?? "***", changedAt: r.changed_at,
    })))
  } catch (err) {
    console.error("[GET /api/vault/[id]/history]", err)
    return NextResponse.json({ error: "Şifre geçmişi alınamadı" }, { status: 500 })
  }
}
