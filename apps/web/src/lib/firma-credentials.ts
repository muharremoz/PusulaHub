/**
 * Firma kullanıcılarının şifrelerini saklama yardımcısı — hub.company_user_credentials.
 * Şifreler AES-256-GCM ile encrypted. Firma detayı "Erişim Bilgileri" modal'ı okur.
 * (company_id, username) manuel upsert.
 */
import { getSupabaseServer } from "@/lib/supabase/server"
import { encrypt, decrypt } from "@/lib/crypto"

/** Şifreyi kaydet — yoksa INSERT, varsa UPDATE. Boş çağrı yok sayılır. */
export async function saveCompanyUserPassword(companyId: string, username: string, password: string): Promise<void> {
  if (!companyId || !username || !password) return
  const sb = await getSupabaseServer()
  const enc = encrypt(password)
  const { data: existing } = await sb.schema("hub").from("company_user_credentials")
    .select("id").eq("company_id", companyId).eq("username", username).maybeSingle()
  if (existing) {
    await sb.schema("hub").from("company_user_credentials")
      .update({ password: enc, updated_at: new Date().toISOString() }).eq("id", (existing as { id: string }).id)
  } else {
    await sb.schema("hub").from("company_user_credentials").insert({ company_id: companyId, username, password: enc })
  }
}

/** Firmanın tüm saklı şifrelerini decrypt edip Map döner (username → düz şifre). */
export async function getCompanyCredentials(companyId: string): Promise<Record<string, string>> {
  if (!companyId) return {}
  const sb = await getSupabaseServer()
  const { data } = await sb.schema("hub").from("company_user_credentials")
    .select("username, password").eq("company_id", companyId)
  const out: Record<string, string> = {}
  for (const r of (data ?? []) as { username: string; password: string }[]) {
    try { const pw = decrypt(r.password); if (pw) out[r.username] = pw } catch { /* key değişmiş — atla */ }
  }
  return out
}
