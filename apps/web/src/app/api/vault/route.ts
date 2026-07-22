import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { encrypt, decrypt } from "@/lib/crypto"
import { requirePermission } from "@/lib/require-permission"

interface VaultRow {
  id: string; category: string; title: string; username: string; password: string
  host: string | null; url: string | null; notes: string | null
  is_favorite: boolean; password_changed_at: string | null; created_at: string; updated_at: string
}

/* GET /api/vault — tüm girişler (şifreler çözülmüş) */
export async function GET() {
  const gate = await requirePermission("vault", "read")
  if (gate) return gate
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb.schema("hub").from("vault_entries")
      .select("id, category, title, username, password, host, url, notes, is_favorite, password_changed_at, created_at, updated_at")
      .order("title")
    if (error) throw error
    return NextResponse.json(((data ?? []) as VaultRow[]).map(r => ({
      id: r.id, category: r.category, title: r.title, username: r.username,
      password: decrypt(r.password) ?? "",
      host: r.host, url: r.url, notes: r.notes, isFavorite: !!r.is_favorite,
      passwordChangedAt: r.password_changed_at, createdAt: r.created_at, updatedAt: r.updated_at,
    })))
  } catch (err) {
    console.error("[GET /api/vault]", err)
    return NextResponse.json({ error: "Vault listesi alınamadı" }, { status: 500 })
  }
}

/* POST /api/vault — yeni giriş (şifre AES-256-GCM) */
export async function POST(req: NextRequest) {
  const gate = await requirePermission("vault", "write")
  if (gate) return gate
  try {
    const { category, title, username, password, host, url, notes } = await req.json()
    if (!title?.trim() || !username?.trim() || !password?.trim()) {
      return NextResponse.json({ error: "Başlık, kullanıcı adı ve şifre zorunlu" }, { status: 400 })
    }
    const sb = await getSupabaseServer()
    const { data, error } = await sb.schema("hub").from("vault_entries").insert({
      category: category ?? "server", title: title.trim(), username: username.trim(),
      password: encrypt(password), host: host || null, url: url || null, notes: notes || null,
      password_changed_at: new Date().toISOString(),
    }).select("id").single()
    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/vault]", err)
    return NextResponse.json({ error: "Giriş eklenemedi" }, { status: 500 })
  }
}
