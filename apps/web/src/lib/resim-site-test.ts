import "server-only"

import { execOnAgent } from "@/lib/agent-poller"
import { bindingPort, psQuote, resolveCompanySites, siteAgent } from "@/lib/company-web-services"
import type { OpsClient } from "@/lib/web-users-ops"

/**
 * Resim (IIS RESIM) sitesinin bağlantı testi (30.10.2026) — CRM Erişim
 * sekmesindeki web hizmeti detayı için.
 *
 * 1. Sitenin klasöründen örnek bir resim dosyası seçilir. Klasör genelde
 *    Depo paylaşımı (\\10.15.2.200\Resimler\...) — Mobil'deki agent (SYSTEM)
 *    paylaşımı okuyamıyor, bu yüzden paylaşımın sahibi sunucunun agent'ı
 *    Get-SmbShare ile yerel yolu çözüp oradan okur. Yerel yolsa sitenin
 *    kendi sunucusu okur.
 * 2. Dosya hem dış adresten (DNS — müşterinin yolu) hem iç adresten (IP)
 *    istenir. Dosya yoksa yalnız kök istenir: herhangi bir HTTP yanıtı
 *    (403 dahil) portun açık olduğunu gösterir.
 * 3. Başarılı yanıttaki resim data URL olarak döner — CRM HTTPS, site HTTP;
 *    tarayıcı doğrudan yüklemeye izin vermez.
 *
 * Yalnız okur, sunucuda bir şey değiştirmez.
 */

export type ResimDeneme = {
  via:         "wan" | "lan"
  host:        string
  url:         string
  /** HTTP yanıtı geldi mi (port açık + servis ayakta) */
  erisim:      boolean
  /** Örnek dosya 200 + image/* döndü mü */
  resimOk:     boolean
  status:      number | null
  ms:          number | null
  contentType: string | null
  bytes:       number | null
  hata?:       string
}

export type ResimTestSonuc = {
  site:   string
  ornek: {
    durum: "var" | "bos" | "klasor-yok" | "okunamadi"
    /** Site köküne göre göreli yol, ileri bölü ile */
    dosya: string | null
    boyut: number | null
    hata?: string
  }
  wan:    ResimDeneme | null
  lan:    ResimDeneme | null
  /** Örnek resim (data URL) — 3 MB üstü ya da alınamadıysa null */
  gorsel: string | null
}

const GORSEL_SINIR = 3 * 1024 * 1024
/** `-in` (büyük/küçük harf duyarsız) — agent exec'te `^` yutulduğu için regex yok */
const RESIM_UZANTI = "'.jpg','.jpeg','.png','.gif','.bmp','.webp'"

type Agent = { ip: string; agent_port: number | null; api_key: string | null }

/** Klasörden ilk resim dosyasını bulan tek satırlık PS komutu (agent exec: çift tırnak yok). */
function ornekKomutu(dizinIfadesi: string): string {
  return (
    `${dizinIfadesi}; if (-not (Test-Path -LiteralPath $d)) { 'KLASOR_YOK' } else { ` +
    `$f = Get-ChildItem -LiteralPath $d -Recurse -File -ErrorAction SilentlyContinue | ` +
    `Where-Object { $_.Extension -in ${RESIM_UZANTI} } | Select-Object -First 1; ` +
    `if ($f) { 'DOSYA:' + $f.FullName.Substring($d.Length).TrimStart([char]92) + '|' + $f.Length } else { 'BOS' } }`
  )
}

async function ornekBul(sb: OpsClient, fizikselYol: string, siteSunucusu: Agent | null): Promise<ResimTestSonuc["ornek"]> {
  const unc = fizikselYol.match(/^\\\\([^\\]+)\\([^\\]+)(?:\\(.*))?$/)
  let agent: Agent | null = siteSunucusu
  let komut: string

  if (unc) {
    const [, host, paylasim, alt] = unc
    const { data } = await sb
      .schema("hub").from("servers").select("ip, agent_port, api_key")
      .eq("ip", host).limit(1).maybeSingle()
    agent = (data as Agent | null) ?? null
    if (!agent) return { durum: "okunamadi", dosya: null, boyut: null, hata: `${host} sunucusu Hub'da kayıtlı değil` }
    komut = ornekKomutu(
      `$k = (Get-SmbShare -Name '${psQuote(paylasim)}' -ErrorAction Stop).Path; ` +
      `$d = ${alt ? `Join-Path $k '${psQuote(alt)}'` : "$k"}`,
    )
  } else {
    komut = ornekKomutu(`$d = '${psQuote(fizikselYol)}'`)
  }

  if (!agent?.ip || !agent.api_key) return { durum: "okunamadi", dosya: null, boyut: null, hata: "Klasörün sunucusunda agent yok" }

  const r = await execOnAgent(agent.ip, agent.agent_port ?? 8585, agent.api_key, komut, 25)
  const cikti = (r.stdout ?? "").trim()
  if (r.exitCode !== 0 && !cikti) {
    return { durum: "okunamadi", dosya: null, boyut: null, hata: (r.stderr || `exit ${r.exitCode}`).slice(0, 200) }
  }
  if (cikti.includes("KLASOR_YOK")) return { durum: "klasor-yok", dosya: null, boyut: null }
  if (cikti.includes("BOS")) return { durum: "bos", dosya: null, boyut: null }
  const m = cikti.match(/DOSYA:(.+)\|(\d+)/)
  if (!m) return { durum: "okunamadi", dosya: null, boyut: null, hata: (r.stderr || cikti || "Beklenmeyen yanıt").slice(0, 200) }
  return { durum: "var", dosya: m[1].trim().split("\\").join("/"), boyut: Number(m[2]) }
}

async function dene(
  via: "wan" | "lan", host: string, port: number, dosya: string | null,
): Promise<{ sonuc: ResimDeneme; gorsel: string | null }> {
  const yol = dosya ? "/" + dosya.split("/").map(encodeURIComponent).join("/") : "/"
  const url = `http://${host}:${port}${yol}`
  const t0 = Date.now()
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) })
    const ms = Date.now() - t0
    const contentType = res.headers.get("content-type")
    const resimOk = !!dosya && res.ok && !!contentType?.startsWith("image/")
    let bytes: number | null = Number(res.headers.get("content-length")) || null
    let gorsel: string | null = null
    if (resimOk && (bytes ?? 0) <= GORSEL_SINIR) {
      const buf = Buffer.from(await res.arrayBuffer())
      bytes = buf.length
      if (buf.length <= GORSEL_SINIR) gorsel = `data:${contentType};base64,${buf.toString("base64")}`
    } else {
      await res.body?.cancel().catch(() => {})
    }
    return {
      sonuc: { via, host: `${host}:${port}`, url, erisim: true, resimOk, status: res.status, ms, contentType, bytes },
      gorsel,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const zaman = /timeout|abort/i.test(msg)
    return {
      sonuc: {
        via, host: `${host}:${port}`, url, erisim: false, resimOk: false,
        status: null, ms: null, contentType: null, bytes: null,
        hata: zaman ? "Yanıt yok (10 sn zaman aşımı)" : "Bağlantı kurulamadı",
      },
      gorsel: null,
    }
  }
}

export async function testResimSitesi(
  sb: OpsClient, firkod: string, siteName: string,
): Promise<{ ok: true; veri: ResimTestSonuc } | { ok: false; hata: string; kod: number }> {
  const sites = await resolveCompanySites(sb, firkod)
  const site = sites.get(siteName.toLowerCase())
  if (!site) return { ok: false, hata: "Hizmet bu firmaya ait değil", kod: 403 }
  if (!/_RESIM(_|$)/i.test(site.name)) return { ok: false, hata: "Bu hizmet bir resim sitesi değil", kod: 400 }

  const port = bindingPort(site.binding)
  if (!port) return { ok: false, hata: "Hizmetin portu bilinmiyor", kod: 400 }
  const srv = await siteAgent(sb, site.server)
  if (!srv?.ip) return { ok: false, hata: "Hizmetin sunucusu bulunamadı", kod: 400 }

  const ornek = site.physical_path
    ? await ornekBul(sb, site.physical_path, srv)
    : { durum: "okunamadi" as const, dosya: null, boyut: null, hata: "Sitenin klasörü Hub'da kayıtlı değil" }

  const dns = srv.dns?.trim() || null
  const [wan, lan] = await Promise.all([
    dns ? dene("wan", dns, port, ornek.dosya) : Promise.resolve(null),
    dene("lan", srv.ip, port, ornek.dosya),
  ])

  return {
    ok: true,
    veri: {
      site: site.name,
      ornek,
      wan: wan?.sonuc ?? null,
      lan: lan.sonuc,
      gorsel: wan?.gorsel ?? lan.gorsel,
    },
  }
}
