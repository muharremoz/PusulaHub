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
import type { SupabaseLike } from "@/lib/firma-credentials"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { GUVENLI_KULLANICI_ADI, MSI_URL, MSI_URL_ARM, TUNEL_ADI, VPN_SUNUCU } from "@/lib/kurulum-paketi"

const BASE = process.env.CONNECT_SERVICE_URL ?? "https://aktarim.pusulanet.net/connect"
const KEY = process.env.TRANSFER_SERVICE_KEY ?? ""
export const CONNECT_INDIRME_ADRESI = `${BASE}/indir`

export type ConnectKoduSonuc =
  | { ok: true; kod: string; indir: string }
  | { ok: false; hata: string; kod: number }

/**
 * Connect'in VPN sunucusu — Hub Ayarlar > Pusula Connect (hub.settings: connect_vpn_sunucu, connect_vpn_port).
 * Girilmemişse kurulum paketinin sabiti (VPN_SUNUCU). Değişince uygulamalar profil imzasıyla fark eder,
 * FortiClient ayarını yeniden yazar.
 */
// Son okunan ayar: Supabase anlık hata verirse sabite DÜŞÜLMEZ — yoksa profil eski/yeni arasında
// gidip gelir ve müşteride "VPN ayarını güncelleyin" boşuna tekrar çıkar.
let sonVpnAdresi: string | null = null

export async function connectVpnAdresi(): Promise<string> {
  try {
    const { data, error } = await getSupabaseAdmin().schema("hub").from("settings")
      .select("key, value").in("key", ["connect_vpn_sunucu", "connect_vpn_port"])
    if (error) throw error
    const a = new Map(((data ?? []) as { key: string; value: string | null }[]).map((r) => [r.key, (r.value ?? "").trim()]))
    const sunucu = a.get("connect_vpn_sunucu"), port = a.get("connect_vpn_port")
    sonVpnAdresi = sunucu ? (port ? `${sunucu}:${port}` : sunucu) : VPN_SUNUCU
    return sonVpnAdresi
  } catch { /* ayar okunamadı → son bilinen, o da yoksa sabit */ }
  return sonVpnAdresi ?? VPN_SUNUCU
}

export interface ConnectProfil {
  vpn: string; tunel: string; rdp: string; rdpPort: number; domain: string; msiurl: string; msiurlArm: string
}

/**
 * Firmanın GÜNCEL Connect profili (VPN + RDP hedefi + domain). Kod üretirken de, Connect servisi
 * sorduğunda da (/api/hub/connect/profil) aynı yerden üretilir → Hub'da sunucu değişince uygulamaya yansır.
 * client: oturumsuz (servis-servis) çağrıda admin istemcisi verilmeli.
 */
export async function connectProfili(firkod: string, client?: SupabaseLike):
  Promise<{ ok: true; profil: ConnectProfil } | { ok: false; hata: string; kod: number }> {
  const [erisim, vpn] = await Promise.all([getFirmaErisim(firkod, client), connectVpnAdresi()])
  if (!erisim) return { ok: false, hata: "Firma bulunamadı", kod: 404 }
  const rdp = erisim.windows?.dns || erisim.windows?.ip || ""
  if (!rdp) return { ok: false, hata: "Firmaya RDP sunucusu atanmamış", kod: 409 }
  const domain = (erisim.ad?.domain ?? "").split(".")[0].toUpperCase() || "PUSULADC"
  return {
    ok: true,
    profil: {
      vpn,
      tunel: TUNEL_ADI,
      rdp,
      rdpPort: erisim.windows?.rdpPort ?? 3389,
      domain,
      msiurl: MSI_URL,
      msiurlArm: MSI_URL_ARM,
    },
  }
}

export async function connectKoduUret(firkod: string, firmaAdi: string, kullanici: string, olusturan: string | null): Promise<ConnectKoduSonuc> {
  if (!GUVENLI_KULLANICI_ADI.test(kullanici)) return { ok: false, hata: "Geçersiz kullanıcı adı", kod: 400 }

  const p = await connectProfili(firkod)
  if (!p.ok) return { ok: false, hata: p.kod === 409 ? "Firmaya RDP sunucusu atanmamış — kod üretilemez" : p.hata, kod: p.kod }

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
      profil: p.profil,
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
