import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { encrypt } from "@/lib/crypto"
import { requirePermission } from "@/lib/require-permission"

/* PATCH /api/vault/[id] — güncelle (şifre değişince history + PasswordChangedAt) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePermission("vault", "write")
  if (gate) return gate
  const { id } = await params
  try {
    const { category, title, username, password, host, url, notes } = await req.json()
    const sb = await getSupabaseServer()

    // Şifre değiştiyse eski şifreyi history'ye
    if (password) {
      const { data: old } = await sb.schema("hub").from("vault_entries").select("password").eq("id", id).maybeSingle()
      const oldPwd = (old as { password: string } | null)?.password
      if (oldPwd) {
        await sb.schema("hub").from("vault_password_history").insert({ vault_entry_id: id, password: oldPwd })
      }
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (category != null) patch.category = category
    if (title    != null) patch.title    = title
    if (username != null) patch.username = username
    patch.host  = host  || null
    patch.url   = url   || null
    patch.notes = notes || null
    if (password) {
      patch.password = encrypt(password)
      patch.password_changed_at = new Date().toISOString()
    }

    const { error } = await sb.schema("hub").from("vault_entries").update(patch).eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/vault/[id]]", err)
    return NextResponse.json({ error: "Giriş güncellenemedi" }, { status: 500 })
  }
}

/* DELETE /api/vault/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePermission("vault", "write")
  if (gate) return gate
  const { id } = await params
  try {
    // hub FK on delete cascade → history + access log otomatik silinir.
    const sb = await getSupabaseServer()
    const { error } = await sb.schema("hub").from("vault_entries").delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/vault/[id]]", err)
    return NextResponse.json({ error: "Giriş silinemedi" }, { status: 500 })
  }
}
