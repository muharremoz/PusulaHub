import "server-only"

/**
 * Connect servisinin (services/pusula-connect) Hub'a sorduğu iç uçların ortak parçaları:
 * anahtar denetimi ve kullanıcının saklı AD şifresi (hub.company_user_credentials).
 * Uçlar: /api/hub/connect/profil, /api/hub/connect/sifre — middleware /api/hub/* yolunu oturumdan muaf tutar.
 */
import { createHash, timingSafeEqual } from "crypto"
import { decrypt } from "@/lib/crypto"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/** X-Service-Key = TRANSFER_SERVICE_KEY (Connect/Aktarım servisleriyle ortak). */
export function servisAnahtariDogru(gelen: string | null): boolean {
  const beklenen = process.env.TRANSFER_SERVICE_KEY ?? ""
  if (!beklenen || !gelen) return false
  const a = Buffer.from(gelen), b = Buffer.from(beklenen)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Kullanıcının saklı şifresi (şifreli hali) — kullanıcı adı büyük/küçük harf duyarsız.
 * surum: şifreli değerin özeti; şifre her kaydedilişte (rastgele IV) değişir → uygulama yeniden çeker.
 */
export async function kullaniciSifreKaydi(firkod: string, kullanici: string): Promise<{ sifreli: string; surum: string } | null> {
  const sb = getSupabaseAdmin()
  const { data } = await sb.schema("hub").from("company_user_credentials")
    .select("username, password").eq("company_id", firkod)
  const satir = ((data ?? []) as { username: string; password: string | null }[])
    .find((r) => r.username.toLowerCase() === kullanici.toLowerCase())
  if (!satir?.password) return null
  return { sifreli: satir.password, surum: createHash("sha256").update(satir.password).digest("hex").slice(0, 16) }
}

export function sifreCoz(sifreli: string): string | null {
  try { return decrypt(sifreli) || null } catch { return null }
}
