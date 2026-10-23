import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { getAllAgents } from "@/lib/agent-store"
import { fetchKumaMonitors, type KumaMonitor } from "@/lib/kuma"

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
  const [{ data: srv, error }, { data: roller }, kuma] = await Promise.all([
    sb.schema("hub").from("servers").select("id, name, ip").order("name"),
    sb.schema("hub").from("server_roles").select("server_id, role"),
    // Kuma'ya ulaşılamazsa sunucu listesi yine dönsün; izleme "bilinmiyor" olur.
    fetchKumaMonitors().then((m) => ({ ok: true as const, m }), () => ({ ok: false as const, m: [] as KumaMonitor[] })),
  ])
  if (error) return NextResponse.json({ error: "Sunucular alınamadı" }, { status: 500 })

  const rolMap = new Map<string, string[]>()
  for (const r of (roller ?? []) as { server_id: string; role: string }[]) {
    rolMap.set(r.server_id, [...(rolMap.get(r.server_id) ?? []), r.role])
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
      acikSureSn: m?.uptimeSeconds ?? null,
    }
  })

  // Sunucuya bağlanmayan izleyiciler (Thinstuff bekçileri, web siteleri, portlar…).
  const servisler = kuma.m
    .filter((m) => !kullanilan.has(m) && !m.name.startsWith("Döviz - "))
    .map((m) => ({ ad: m.name, tip: m.type, izleme: m.status, yanitMs: yanit(m) }))
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr", { numeric: true }))

  return NextResponse.json(
    { sunucular, servisler, kumaErisilebilir: kuma.ok, zaman: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  )
}
