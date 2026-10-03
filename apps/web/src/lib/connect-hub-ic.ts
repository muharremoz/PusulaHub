import "server-only"

/**
 * Connect servisinin (services/pusula-connect) Hub'a sorduğu iç uçların ortak parçaları:
 * anahtar denetimi ve kullanıcının saklı AD şifresi (hub.company_user_credentials).
 * Uçlar: /api/hub/connect/profil, /api/hub/connect/sifre — middleware /api/hub/* yolunu oturumdan muaf tutar.
 */
import { createHash, timingSafeEqual } from "crypto"
import { decrypt } from "@/lib/crypto"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Connect servisiyle paylaşılan anahtar. CONNECT_SERVICE_KEY tanımlıysa YALNIZ o geçer; Aktarım'la ortak
 * TRANSFER_SERVICE_KEY'e yalnız geçiş döneminde (CONNECT_SERVICE_KEY boşken) düşülür. Ayrı olmasının sebebi:
 * Aktarım sunucusu/anahtarı ele geçirilirse Hub'dan şifre çekilememesi (03.10.2026 güvenlik gözden geçirmesi).
 */
export const connectServisAnahtari = (): string => process.env.CONNECT_SERVICE_KEY || process.env.TRANSFER_SERVICE_KEY || ""

/** X-Service-Key = connectServisAnahtari(). */
export function servisAnahtariDogru(gelen: string | null): boolean {
  const beklenen = connectServisAnahtari()
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
