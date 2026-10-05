import "server-only"

/**
 * Pusula Connect — Sayım modu: müşteri PC'sine kurulan Pusula X (RFID.xml'li kopya) için
 * server.xml / lic.xml değerleri. Connect servisi /api/hub/connect/sayim ile sorar.
 *
 *   Name     → firmanın SQL sunucusunun YEREL adresi (ip,port). Müşteri PC'si VPN'den bağlanır;
 *              dış adres kullanılmaz (kullanıcı kararı 05.10.2026).
 *   UserName → kullanıcının SQL login'i (hub.company_user_credentials.sql_login), yoksa
 *              firmanın SQL login'i olan ilk kullanıcı. 'sa' müşteri PC'sine yazılmaz.
 *   Password → o login'in SQL şifresi (sql_password; AD şifresinden AYRI).
 *   DataCode → firma kodu (giriş ekranı veritabanlarını guvenlik.kod ile süzer).
 *   ImgPath  → IIS'teki <firkod>_RESIM sitesi: http://<iis dns|ip>:<port>/
 *
 * Şifreleme (TripleDES, Pusula anahtarı) İSTEMCİDE yapılır: test için düz metin zaten
 * istemciye iner ve anahtar her PusulaX.exe'de gömülü.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { getFirmaErisim } from "@/lib/firma-erisim"
import type { SupabaseLike } from "@/lib/firma-credentials"
import { bindingPort, resolveCompanySites } from "@/lib/company-web-services"

export interface SayimBilgisi {
  firmaAdi: string
  sunucu: string
  kullanici: string
  sifre: string
  dataCode: string
  /** http://host:port/ — site yoksa null (Pusula X veritabanındaki resimyolu'na düşer). */
  resimYolu: string | null
  /** Hangi kullanıcının SQL login'i verildi (bilgi). */
  loginSahibi: string
}

export type SayimSonuc = { ok: true; bilgi: SayimBilgisi } | { ok: false; hata: string; kod: 404 | 409 | 500 }

export async function connectSayimBilgisi(firkod: string, kullanici: string): Promise<SayimSonuc> {
  const sb = getSupabaseAdmin()
  const [erisim, firma, siteler] = await Promise.all([
    getFirmaErisim(firkod, sb as unknown as SupabaseLike),
    sb.schema("hub").from("companies").select("name").eq("company_id", firkod).maybeSingle(),
    resolveCompanySites(sb as unknown as Parameters<typeof resolveCompanySites>[0], firkod),
  ])
  if (!erisim) return { ok: false, hata: "Firma Hub'da bulunamadı", kod: 404 }
  if (!erisim.sql?.ip) return { ok: false, hata: "Firmaya SQL sunucusu atanmamış (Hub → firma → Erişim)", kod: 409 }

  // SQL login: önce bu kullanıcı, yoksa SQL login'i olan ilk kullanıcı
  const kucuk = kullanici.toLowerCase()
  const loginli = Object.entries(erisim.sqlLogins).filter(([u, l]) => l && erisim.sqlCredentials[u])
  const secilen = loginli.find(([u]) => u.toLowerCase() === kucuk) ?? loginli[0]
  if (!secilen) return { ok: false, hata: "Firmanın SQL login'i Hub'da kayıtlı değil (Erişim → SQL erişimi)", kod: 409 }
  const [sahip, login] = secilen

  const sunucu = `${erisim.sql.ip},${erisim.sql.port || 1433}`

  // Resim: <firkod>_RESIM sitesi → IIS sunucusunun dış adı + site portu
  let resimYolu: string | null = null
  const site = siteler.get(`${firkod}_resim`)
  const sitePort = site ? bindingPort(site.binding) : null
  if (site && sitePort) {
    const { data: srv } = await sb.schema("hub").from("servers").select("ip, dns").eq("name", site.server).maybeSingle()
    const host = (srv as { ip: string; dns: string | null } | null)?.dns || (srv as { ip: string } | null)?.ip
    if (host) resimYolu = `http://${host}:${sitePort}/`
  }

  return {
    ok: true,
    bilgi: {
      firmaAdi: ((firma.data as { name: string | null } | null)?.name ?? "").trim() || firkod,
      sunucu,
      kullanici: login,
      sifre: erisim.sqlCredentials[sahip],
      dataCode: firkod,
      resimYolu,
      loginSahibi: sahip,
    },
  }
}
