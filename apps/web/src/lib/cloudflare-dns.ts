/**
 * Sunucunun DNS adını (ör. ps4.databag.net) Cloudflare'deki A kaydıyla eşitler.
 *
 * NEDEN: Connect önce DNS adına bağlanır, IP'ye yalnız ad HİÇ çözülmezse düşer.
 * Hub'da IP değişip Cloudflare kaydı eski kalırsa ad eski IP'ye çözülür ve
 * istemciler yanlış adrese gider (2026-10-06). Hub tek kaynak olsun diye
 * sunucu kaydedilince bu kayıt da güncellenir.
 *
 * Kurallar:
 *  - Token yoksa (CLOUDFLARE_API_TOKEN) hiçbir şey yapılmaz → { durum: "kapali" }.
 *  - Ad, token'ın gördüğü bir zone'a ait değilse dokunulmaz.
 *  - Kayıt varsa yalnız IP değiştirilir; TTL ve proxy ayarı korunur.
 *  - Kayıt yoksa 1 saat TTL, proxy kapalı yeni A kaydı açılır.
 *  - Aynı adda birden fazla A kaydı ya da A dışında bir kayıt (CNAME) varsa
 *    dokunulmaz — bilinçli bir kurulum olabilir.
 *  - Eski DNS adının kaydı SİLİNMEZ (ad değiştiyse eski ad elle temizlenir).
 */

const API = "https://api.cloudflare.com/client/v4"
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const AD = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

export type DnsEsitlemeSonucu =
  | { durum: "kapali" }
  | { durum: "atlandi"; neden: string }
  | { durum: "ayni"; ad: string; ip: string }
  | { durum: "guncellendi"; ad: string; eskiIp: string; ip: string }
  | { durum: "olusturuldu"; ad: string; ip: string }
  | { durum: "hata"; ad: string; hata: string }

interface CfKayit { id: string; type: string; name: string; content: string; ttl: number; proxied: boolean }

async function cf<T>(token: string, yol: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(API + yol, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
  const j = (await r.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { code: number; message: string }[] } | null
  if (!j?.success) {
    const e = j?.errors?.map((x) => `${x.code} ${x.message}`).join("; ") || `HTTP ${r.status}`
    throw new Error(e)
  }
  return j.result as T
}

export async function cloudflareDnsEsitle(dns: string | null | undefined, ip: string | null | undefined): Promise<DnsEsitlemeSonucu> {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim()
  if (!token) return { durum: "kapali" }

  const ad = (dns ?? "").trim().toLowerCase().replace(/\.$/, "")
  const adres = (ip ?? "").trim()
  if (!ad) return { durum: "atlandi", neden: "DNS adı yok" }
  if (!AD.test(ad)) return { durum: "atlandi", neden: `geçerli bir DNS adı değil: ${ad}` }
  if (!IPV4.test(adres)) return { durum: "atlandi", neden: `IPv4 değil: ${adres}` }

  try {
    // En uzun eşleşen zone (sub.ornek.com için önce sub.ornek.com, sonra ornek.com).
    const zonelar = await cf<{ id: string; name: string }[]>(token, "/zones?per_page=50")
    const zone = zonelar
      .filter((z) => ad === z.name || ad.endsWith("." + z.name))
      .sort((a, b) => b.name.length - a.name.length)[0]
    if (!zone) return { durum: "atlandi", neden: `${ad} Cloudflare'de yönetilen bir alana ait değil` }

    const kayitlar = await cf<CfKayit[]>(token, `/zones/${zone.id}/dns_records?name=${encodeURIComponent(ad)}&per_page=50`)
    const a = kayitlar.filter((k) => k.type === "A")
    const diger = kayitlar.filter((k) => k.type !== "A" && k.type !== "AAAA" && k.type !== "TXT")
    if (diger.length) return { durum: "atlandi", neden: `${ad} için ${diger[0].type} kaydı var — elle bakılmalı` }
    if (a.length > 1) return { durum: "atlandi", neden: `${ad} için ${a.length} A kaydı var — elle bakılmalı` }

    if (a.length === 1) {
      const k = a[0]
      if (k.content === adres) return { durum: "ayni", ad, ip: adres }
      await cf(token, `/zones/${zone.id}/dns_records/${k.id}`, { method: "PATCH", body: JSON.stringify({ content: adres }) })
      return { durum: "guncellendi", ad, eskiIp: k.content, ip: adres }
    }

    await cf(token, `/zones/${zone.id}/dns_records`, {
      method: "POST",
      body: JSON.stringify({ type: "A", name: ad, content: adres, ttl: 3600, proxied: false, comment: "PusulaHub sunucu kaydı" }),
    })
    return { durum: "olusturuldu", ad, ip: adres }
  } catch (e) {
    return { durum: "hata", ad, hata: e instanceof Error ? e.message : String(e) }
  }
}
