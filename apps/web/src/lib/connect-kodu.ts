/**
 * Pusula Connect 2 kurulum kodu — kurulum paketinin (lib/kurulum-paketi.ts) kod karşılığı.
 * Konsept: docs/pusula-connect/KONSEPT.md
 *
 * Zip yerine: müşteri uygulamayı indirir, bu kodu girer. Profil (VPN, RDP hedefi,
 * domain, FortiClient MSI) kodla birlikte Connect servisinde saklanır; uygulama her
 * açılışta güncelini çeker → VPN adresi değişince yeni dosya göndermek gerekmez.
 * Değerler kurulum paketiyle AYNI kaynaktan (getFirmaErisim + aynı sabitler).
 *
 * Env: CONNECT_SERVICE_URL (varsayılan https://aktarim.pusulanet.net/connect),
 *      TRANSFER_SERVICE_KEY (aktarım servisleriyle ortak anahtar)
 */

import { getFirmaErisim } from "@/lib/firma-erisim"
import { GUVENLI_KULLANICI_ADI, MSI_URL, MSI_URL_ARM, TUNEL_ADI, VPN_SUNUCU } from "@/lib/kurulum-paketi"

const BASE = process.env.CONNECT_SERVICE_URL ?? "https://aktarim.pusulanet.net/connect"
const KEY = process.env.TRANSFER_SERVICE_KEY ?? ""
export const CONNECT_INDIRME_ADRESI = `${BASE}/indir`

export type ConnectKoduSonuc =
  | { ok: true; kod: string; indir: string }
  | { ok: false; hata: string; kod: number }

export async function connectKoduUret(firkod: string, firmaAdi: string, kullanici: string, olusturan: string | null): Promise<ConnectKoduSonuc> {
  if (!GUVENLI_KULLANICI_ADI.test(kullanici)) return { ok: false, hata: "Geçersiz kullanıcı adı", kod: 400 }

  const erisim = await getFirmaErisim(firkod)
  if (!erisim) return { ok: false, hata: "Firma bulunamadı", kod: 404 }
  const rdp = erisim.windows?.dns || erisim.windows?.ip || ""
  if (!rdp) return { ok: false, hata: "Firmaya RDP sunucusu atanmamış — kod üretilemez", kod: 409 }
  const domain = (erisim.ad?.domain ?? "").split(".")[0].toUpperCase() || "PUSULADC"

  const r = await fetch(`${BASE}/admin/kodlar`, {
    method: "POST",
    headers: { "X-Service-Key": KEY, "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      firmaId: firkod,
      firmaAdi: firmaAdi || firkod,
      kullanici,
      olusturan,
      gunSayisi: 7,
      profil: {
        vpn: VPN_SUNUCU,
        tunel: TUNEL_ADI,
        rdp,
        rdpPort: erisim.windows?.rdpPort ?? 3389,
        domain,
        msiurl: MSI_URL,
        msiurlArm: MSI_URL_ARM,
      },
    }),
  })
  const metin = await r.text()
  let j: { kod?: string; hata?: string } = {}
  try { j = JSON.parse(metin) } catch { /* JSON değil */ }
  if (!r.ok || !j.kod) return { ok: false, hata: j.hata ?? `Connect servisi: HTTP ${r.status}`, kod: 502 }
  return { ok: true, kod: j.kod, indir: CONNECT_INDIRME_ADRESI }
}

/* ── Cihazlar (kodla kaydolmuş bilgisayarlar) ─────────────────────────── */

export interface ConnectCihaz {
  id: string
  makine: string | null
  surum: string | null
  ilkGiris: string
  sonGorulme: string | null
  iptal: boolean
  ikiAdim: boolean
  kodDurum: string
}

interface ServisKod {
  id: string; kullanici: string; durum: string
  cihazlar: { id: string; makine: string | null; surum: string | null; ilkGiris: string; sonGorulme: string | null; iptal: number; totpAktif: number }[]
}

/** Firmanın (isteğe bağlı: tek kullanıcının) Connect 2 cihazları, en son görüleni üstte. */
export async function connectCihazlari(firkod: string, kullanici?: string): Promise<ConnectCihaz[]> {
  const r = await fetch(`${BASE}/admin/kodlar?firma=${encodeURIComponent(firkod)}`, { headers: { "X-Service-Key": KEY }, cache: "no-store" })
  if (!r.ok) throw new Error(`Connect servisi: HTTP ${r.status}`)
  const kodlar = (await r.json()) as ServisKod[]
  return kodlar
    .filter((k) => !kullanici || k.kullanici.toLowerCase() === kullanici.toLowerCase())
    .flatMap((k) => k.cihazlar.map((c) => ({
      id: c.id, makine: c.makine, surum: c.surum, ilkGiris: c.ilkGiris, sonGorulme: c.sonGorulme,
      iptal: !!c.iptal, ikiAdim: !!c.totpAktif, kodDurum: k.durum,
    })))
    .sort((a, b) => (b.sonGorulme ?? b.ilkGiris).localeCompare(a.sonGorulme ?? a.ilkGiris))
}

/** Cihaz işlemi — önce cihazın bu firmaya ait olduğu doğrulanır (başka firmanın cihaz id'si ile çağrılamaz). */
export async function connectCihazIslem(firkod: string, cihazId: string, islem: "2fa-sifirla" | "iptal"): Promise<boolean> {
  const cihazlar = await connectCihazlari(firkod)
  if (!cihazlar.some((c) => c.id === cihazId)) return false
  const r = await fetch(`${BASE}/admin/cihazlar/${encodeURIComponent(cihazId)}/${islem}`, {
    method: "POST", headers: { "X-Service-Key": KEY }, cache: "no-store",
  })
  if (!r.ok) throw new Error(`Connect servisi: HTTP ${r.status}`)
  return true
}
