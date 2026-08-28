/**
 * Firma kullanıcılarının şifrelerini saklama yardımcısı — hub.company_user_credentials.
 * Şifreler AES-256-GCM ile encrypted. Firma detayı "Erişim Bilgileri" modal'ı okur.
 * (company_id, username) manuel upsert.
 */
import { getSupabaseServer } from "@/lib/supabase/server"
import { encrypt, decrypt } from "@/lib/crypto"

/** Oturum ya da admin istemcisi — ikisi de `.schema()` sunar. */
export type SupabaseLike = Awaited<ReturnType<typeof getSupabaseServer>>

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

/**
 * SQL Server giriş şifresini kaydeder — AD/RDP şifresinden AYRI kolonda.
 *
 * NEDEN AYRI: ikisi kurulum anında aynı oluyor ama farklı hesaplar. AD
 * şifresi değişince SQL girişininki değişmiyor; tek kolonda tutulunca
 * ekran SQL şifresi diye yanlış değeri gösteriyordu (2026-08-28, firma
 * 2311'de yaşandı). Satır yoksa oluşturulmaz — SQL girişi olmayan
 * kullanıcı için anlamsız.
 */
export async function saveCompanyUserSqlPassword(
  companyId: string, username: string, password: string, sqlLogin?: string,
): Promise<void> {
  if (!companyId || !username || !password) return
  const sb = await getSupabaseServer()
  const enc = encrypt(password)
  // Giriş adı da kaydediliyor — sonradan türetilirse ad kuralı
  // değiştiğinde yanlış ad üretiliyor.
  const ekAd = sqlLogin ? { sql_login: sqlLogin } : {}
  const { data: existing } = await sb.schema("hub").from("company_user_credentials")
    .select("id").eq("company_id", companyId).eq("username", username).maybeSingle()
  if (existing) {
    await sb.schema("hub").from("company_user_credentials")
      .update({ sql_password: enc, ...ekAd, updated_at: new Date().toISOString() })
      .eq("id", (existing as { id: string }).id)
  } else {
    /*  password NULL: AD sifresini BILMIYORUZ. Buraya SQL sifresini
     *  yazmak "AD sifresi de bu" demek olurdu ve yanlis olurdu — sirf
     *  satir acabilmek icin veri uydurulmaz.                          */
    await sb.schema("hub").from("company_user_credentials")
      .insert({ company_id: companyId, username, password: null, sql_password: enc, ...ekAd })
  }
}

/**
 * Firmanın SQL giriş ADLARI (username → gerçek login adı).
 *
 * TÜRETİLMİYOR, SAKLANIYOR. Ad kuralı 2026-08-28'de alt çizgiden noktaya
 * çevrildi; türetme o günden sonra tüm firmalar için noktalı ad üretmeye
 * başladı, oysa mevcut 28 giriş hâlâ alt çizgili. Ekran var olmayan bir
 * ad gösteriyor, kullanıcı deneyip 18456 alıyordu. Dış sistemdeki bir
 * nesnenin adı türetilmez.
 */
export async function getCompanySqlLogins(
  companyId: string, client?: SupabaseLike,
): Promise<Record<string, string>> {
  if (!companyId) return {}
  const sb = client ?? (await getSupabaseServer())
  const { data } = await sb.schema("hub").from("company_user_credentials")
    .select("username, sql_login").eq("company_id", companyId)
  const out: Record<string, string> = {}
  for (const r of (data ?? []) as { username: string; sql_login: string | null }[]) {
    if (r.sql_login) out[r.username] = r.sql_login
  }
  return out
}

/**
 * Firmanın saklı SQL giriş şifreleri (username → düz şifre).
 * Yalnız `sql_password` DOLU olan satırlar döner; boş olanlar "kayıtlı
 * değil" demektir ve arayüzde öyle gösterilir.
 */
export async function getCompanySqlCredentials(
  companyId: string, client?: SupabaseLike,
): Promise<Record<string, string>> {
  if (!companyId) return {}
  const sb = client ?? (await getSupabaseServer())
  const { data } = await sb.schema("hub").from("company_user_credentials")
    .select("username, sql_password").eq("company_id", companyId)
  const out: Record<string, string> = {}
  for (const r of (data ?? []) as { username: string; sql_password: string | null }[]) {
    if (!r.sql_password) continue
    try { const pw = decrypt(r.sql_password); if (pw) out[r.username] = pw } catch { /* key değişmiş */ }
  }
  return out
}

/**
 * Firmanın tüm saklı şifrelerini decrypt edip Map döner (username → düz şifre).
 *
 * `client` verilmezse oturum tabanlı istemci kullanılır (Hub UI akışı).
 * Servis-servis çağrılarda (alt uygulamalar, `/api/hub/*`) oturum YOKTUR;
 * çağıran admin istemcisini geçmek zorundadır, aksi halde RLS boş döndürür.
 */
export async function getCompanyCredentials(
  companyId: string,
  client?: SupabaseLike,
): Promise<Record<string, string>> {
  if (!companyId) return {}
  const sb = client ?? (await getSupabaseServer())
  const { data } = await sb.schema("hub").from("company_user_credentials")
    .select("username, password").eq("company_id", companyId)
  const out: Record<string, string> = {}
  for (const r of (data ?? []) as { username: string; password: string }[]) {
    try { const pw = decrypt(r.password); if (pw) out[r.username] = pw } catch { /* key değişmiş — atla */ }
  }
  return out
}
