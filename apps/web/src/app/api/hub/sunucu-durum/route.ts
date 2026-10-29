import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { getAllAgents } from "@/lib/agent-store"
import { fetchKumaMonitors, type KumaMonitor } from "@/lib/kuma"
import { esxiConfigured, fetchEsxiHost, type EsxiHost } from "@/lib/esxi"
import { kurApiSaglik, type KurApiSaglik } from "@/lib/kur-api"

/**
 * Sunucu durumu — AYRINTILI. CRM mobil uygulamasının "Sunucular" ekranı için
 * (23.10.2026). CRM yalnız yöneticilere (sunucu_izleme yetkisi) gösterir.
 *
 * Auth: x-internal-key (Hub middleware `/api/hub/*` yolunu kapıdan muaf tutar).
 *
 * `altyapi-durum`dan farkı: o destek personeline "bizde mi, onda mı?" kararı
 * veriyor (dar). Bu ise yöneticiye her sunucunun kendisini veriyor:
 * izleme durumu (Kuma ping) + agent metrikleri (CPU/RAM/disk/bağlı kişi).
 *
 * İki kaynak ayrı ayrı raporlanır, çünkü farklı şeyler söylerler: Kuma "makine
 * ağda yanıt veriyor mu", agent "Windows içinde ne oluyor". Biri ölüp diğeri
 * yaşayabilir (ör. agent servisi durmuş ama makine ayakta).
 *
 * 29.10.2026: /tv'deki iki kart buraya da eklendi — Makdos fiziksel sunucusu
 * (ESXi: CPU/RAM/depo/güç kaynağı) ve terminal başına kayıtlı kullanıcı
 * (`kayitliKisi`, /api/servers'taki `assignedUsers` ile aynı hesap) ve kur-api
 * yazıcıları (PUSLICANCE SQL + FTP pusula.txt, `kur`).
 */

interface SrvRow { id: string; name: string; ip: string }

function anahtarGecerli(req: NextRequest): boolean {
  const beklenen = process.env.INTERNAL_APP_KEY ?? ""
  const gelen = req.headers.get("x-internal-key") ?? ""
  if (!beklenen) return false
  const a = Buffer.from(gelen), b = Buffer.from(beklenen)
  return a.length === b.length && timingSafeEqual(a, b)
}

const yanit = (m: KumaMonitor | undefined) =>
  m?.responseMs != null && m.responseMs >= 0 ? Math.round(m.responseMs) : null

export async function GET(req: NextRequest) {
  if (!process.env.INTERNAL_APP_KEY) {
    return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  }
  if (!anahtarGecerli(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const sb = getSupabaseAdmin()
  const [{ data: srv, error }, { data: roller }, { data: firmalar }, { data: adKullanicilari }, kuma, esxi, kur] = await Promise.all([
    sb.schema("hub").from("servers").select("id, name, ip").order("name"),
    sb.schema("hub").from("server_roles").select("server_id, role"),
    // Kayıtlı kullanıcı: firma → sunucu ataması × firmanın AD OU'sundaki kullanıcılar.
    sb.schema("hub").from("companies").select("company_id, windows_server_id").not("windows_server_id", "is", null).limit(10_000),
    sb.schema("hub").from("ad_users").select("ou").limit(10_000),
    // Kuma'ya ulaşılamazsa sunucu listesi yine dönsün; izleme "bilinmiyor" olur.
    fetchKumaMonitors().then((m) => ({ ok: true as const, m }), () => ({ ok: false as const, m: [] as KumaMonitor[] })),
    // ESXi'ye ulaşılamazsa fiziksel sunucu null döner, ekran kartı gizler. Lib'de 60 sn önbellek.
    esxiConfigured() ? fetchEsxiHost().catch(() => null) : Promise.resolve(null),
    // CRM bu ucu 8 sn'de keser; kur-api geç kalırsa yalnız kur bölümü boş gelsin.
    Promise.race([kurApiSaglik(), new Promise<null>((r) => setTimeout(() => r(null), 3000))]).catch(() => null),
  ])
  if (error) return NextResponse.json({ error: "Sunucular alınamadı" }, { status: 500 })

  const rolMap = new Map<string, string[]>()
  for (const r of (roller ?? []) as { server_id: string; role: string }[]) {
    rolMap.set(r.server_id, [...(rolMap.get(r.server_id) ?? []), r.role])
  }

  const ouSayi = new Map<string, number>()
  for (const a of (adKullanicilari ?? []) as { ou: string | null }[]) {
    const k = (a.ou ?? "").trim()
    if (k) ouSayi.set(k, (ouSayi.get(k) ?? 0) + 1)
  }
  const kayitli = new Map<string, number>()
  for (const c of (firmalar ?? []) as { company_id: string; windows_server_id: string }[]) {
    kayitli.set(c.windows_server_id, (kayitli.get(c.windows_server_id) ?? 0) + (ouSayi.get(String(c.company_id).trim()) ?? 0))
  }

  // Ping izleyicisi sunucuya IP ile bağlanır (Kuma'daki adlar Hub'dakinden farklı olabiliyor).
  const pingByIp = new Map(kuma.m.filter((m) => m.type === "ping" && m.hostname).map((m) => [m.hostname!, m]))
  const kullanilan = new Set<KumaMonitor>()
  const agents = getAllAgents()

  const sunucular = ((srv ?? []) as SrvRow[]).map((r) => {
    const k = pingByIp.get(r.ip)
    if (k) kullanilan.add(k)
    const agent = agents.find((a) => a.agentId === r.id || a.hostname === r.name || a.ip === r.ip)
    const rap = agent?.lastReport
    const m = rap?.metrics
    const aktifKisi = rap?.sessions
      ? new Set(rap.sessions.filter((s) => s.username && s.state === "Active").map((s) => s.username.toLowerCase())).size
      : null
    return {
      id: r.id,
      ad: r.name,
      ip: r.ip,
      roller: rolMap.get(r.id) ?? [],
      /** Kuma ping: up | down | pending | maintenance | unknown; izleyici yoksa null */
      izleme: k ? k.status : null,
      yanitMs: yanit(k),
      /** Agent son 2 dk içinde rapor verdiyse online */
      agent: agent ? agent.status : null,
      cpu: m ? Math.round(m.cpu) : null,
      ram: m?.ram?.totalMB ? Math.round((m.ram.usedMB / m.ram.totalMB) * 100) : null,
      diskler: (m?.disks ?? []).map((d) => ({ surucu: d.drive.replace(/[:\\]/g, ""), yuzde: Math.round(d.percent), bosGB: Math.round(d.totalGB - d.usedGB) })),
      aktifKisi,
      /** Sunucuya atanmış firmaların AD kullanıcı sayısı; atama yoksa null */
      kayitliKisi: kayitli.get(r.id) ?? null,
      acikSureSn: m?.uptimeSeconds ?? null,
    }
  })

  // Sunucuya bağlanmayan izleyiciler (Thinstuff bekçileri, web siteleri, portlar…).
  const servisler = kuma.m
    .filter((m) => !kullanilan.has(m) && !m.name.startsWith("Döviz - "))
    .map((m) => ({ ad: m.name, tip: m.type, izleme: m.status, yanitMs: yanit(m) }))
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr", { numeric: true }))

  return NextResponse.json(
    { sunucular, servisler, fiziksel: esxi ? fizikselOzet(esxi) : null, kur: kur ? kurOzet(kur) : null, kumaErisilebilir: kuma.ok, zaman: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  )
}

/** Makdos fiziksel sunucusu (ESXi) — mobilin ihtiyacı kadar, ham host nesnesi değil. */
function fizikselOzet(h: EsxiHost) {
  return {
    ad: "Makdos",
    model: [h.vendor, h.model].filter(Boolean).join(" "),
    cpu: h.cpuTotalMhz > 0 ? Math.round((h.cpuUsedMhz / h.cpuTotalMhz) * 100) : null,
    cekirdek: h.cpuCores,
    ramKullanilanGB: Math.round(h.ramUsedGB),
    ramToplamGB: Math.round(h.ramTotalGB),
    ram: h.ramTotalGB > 0 ? Math.round((h.ramUsedGB / h.ramTotalGB) * 100) : null,
    depolar: h.datastores.map((d) => ({ ad: d.name, yuzde: Math.round(d.percent), bosGB: Math.round(d.freeGB), toplamGB: Math.round(d.capacityGB) })),
    /** green | yellow | red | unknown — sensörlerin en kötüsü */
    saglik: h.overallHealth,
    gucKaynaklari: h.powerSupplies.map((p) => ({ no: p.index, saglik: p.health, ozet: p.summary, watt: p.inputWatts })),
    sorunlar: h.problemSensors.map((x) => x.summary || x.name),
    acikSureSn: h.uptimeSeconds,
  }
}

/** kur-api yazıcıları + kaynakları. Yazıcılar dakikada bir yazar; durum kuralı istemcide (/tv ile aynı: 3 / 10 dk). */
function kurOzet(h: KurApiSaglik) {
  const { sqlWriter: sql, ftpWriter: ftp } = h.services
  return {
    yazicilar: [
      sql && { ad: "SQL · PUSLICANCE", acik: sql.enabled, durum: sql.state, sonYazma: sql.lastWriteAt, adet: sql.lastCount, hata: sql.lastError },
      ftp && { ad: "FTP · pusula.txt", acik: ftp.enabled, durum: ftp.state, sonYazma: ftp.lastUploadAt, adet: ftp.lastCount, hata: ftp.lastError },
    ].filter(Boolean),
    kaynaklar: Object.entries(h.services.upstream ?? {}).map(([ad, k]) => ({
      ad, acik: k.enabled, durum: k.state, sonVeri: k.lastUpdatedAt, hata: k.lastError,
    })),
  }
}
