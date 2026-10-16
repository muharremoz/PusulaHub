import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import { getAllAgents } from "@/lib/agent-store"
import { withSqlConnection } from "@/lib/sql-external"
import { decrypt } from "@/lib/crypto"
import { connectTumCihazlar } from "@/lib/connect-yonetim"

/**
 * GET /api/dashboard/durum — dashboard özet kutuları: sunucular, yedek sağlığı,
 * son yedek testi, Pusula Connect.
 *
 * Kaynaklar birbirinden bağımsız; biri düşerse diğerleri yine döner, düşen kaynak
 * `kaynakHata`'ya yazılır. 30 sn in-memory önbellek: dashboard 60 sn'de bir yeniler.
 */

export interface DashSunucu {
  id: string
  slug: string
  ad: string
  ip: string
  roller: string[]
  cevrimici: boolean
  sonGorulme: string | null
  cpu: number | null
  ram: number | null              // %
  ramGB: { kullanilan: number; toplam: number } | null
  diskler: { surucu: string; yuzde: number; bosGB: number; toplamGB: number }[]
  calisma: string | null          // uptime
  aktifKullanici: number | null   // Active oturumu olan farklı kullanıcı
  atanmisKullanici: number | null // sunucuya atanmış firmaların AD kullanıcıları
  /** Anlık oturum — server_metrics ile AYNI kural (console/services hariç; aktif = state Active).
   *  Dashboard'daki tüm "şimdi" sayıları bundan; geçmiş eğri de aynı kuralla yazılıyor. */
  aktifOturum: number | null
  kopukOturum: number | null
}

export interface DashDurum {
  zaman: string
  sunucular: DashSunucu[]
  yedek: { toplam: number; saglikli: number; gecikmis: number; sorunlu: number } | null
  /** Son yedek doğrulama testi (/tv ekranından çalıştırılır, sonucu hub.settings yedek_testi_son) */
  yedekTesti: { durum: "ok" | "uyari" | "hata" | "calisiyor"; ozet: string; bitisAt: string } | null
  /** Pusula Connect: nabzı 3 dk içinde olan / iptal edilmemiş cihaz / bugün ilk kez bağlanan */
  connect: { cevrimici: number; oturumda: number; toplam: number; bugunYeni: number } | null
  kaynakHata: string[]
}

const YEDEK_GECIKME_SAAT = 26
const YEDEK_SORUN_SAAT = 48

let onbellek: { at: number; veri: DashDurum } | null = null
const TTL = 30_000

const zamanAsimi = <T,>(p: Promise<T>, ms = 8000): Promise<T> =>
  Promise.race([p, new Promise<T>((_, red) => setTimeout(() => red(new Error("zaman aşımı")), ms))])

function slugify(name: string): string {
  return name.toLowerCase()
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function sureYaz(sn: number): string {
  const g = Math.floor(sn / 86400), s = Math.floor((sn % 86400) / 3600), d = Math.floor((sn % 3600) / 60)
  return g > 0 ? `${g}g ${s}s` : s > 0 ? `${s}s ${d}d` : `${d}d`
}

/** msdb yerel saati Supabase'e "+00:00" etiketiyle yazılıyor — ofseti at, yerel oku. */
const yerelZaman = (s: string | null): number => (s ? new Date(s.slice(0, 19)).getTime() : NaN)

async function topla(): Promise<DashDurum> {
  const sb = await getSupabaseServer()
  const kaynakHata: string[] = []

  // ── Sunucular ──────────────────────────────────────────────
  const [{ data: srvData }, { data: rolData }, { data: firmaData }, { data: adData }] = await Promise.all([
    sb.schema("hub").from("servers").select("id, name, ip, sql_username, sql_password").order("name"),
    sb.schema("hub").from("server_roles").select("server_id, role"),
    sb.schema("hub").from("companies").select("company_id, windows_server_id").not("windows_server_id", "is", null).limit(10_000),
    sb.schema("hub").from("ad_users").select("ou").limit(10_000),
  ])
  type Srv = { id: string; name: string; ip: string; sql_username: string | null; sql_password: string | null }
  const srvler = (srvData ?? []) as Srv[]
  const roller = new Map<string, string[]>()
  for (const r of (rolData ?? []) as { server_id: string; role: string }[]) roller.set(r.server_id, [...(roller.get(r.server_id) ?? []), r.role])
  const ouSay = new Map<string, number>()
  for (const a of (adData ?? []) as { ou: string | null }[]) { const k = (a.ou ?? "").trim(); if (k) ouSay.set(k, (ouSay.get(k) ?? 0) + 1) }
  const atanmis = new Map<string, number>()
  for (const c of (firmaData ?? []) as { company_id: string; windows_server_id: string }[]) {
    atanmis.set(c.windows_server_id, (atanmis.get(c.windows_server_id) ?? 0) + (ouSay.get(String(c.company_id).trim()) ?? 0))
  }

  const ajanlar = getAllAgents()
  const sunucular: DashSunucu[] = srvler.map((r) => {
    const a = ajanlar.find((x) => x.agentId === r.id || x.hostname === r.name || x.ip === r.ip)
    const m = a?.lastReport?.metrics
    const cevrimici = a?.status === "online"
    const oturum = a?.lastReport?.sessions
    const ramKul = m ? (m.ram.realUsedMB ?? m.ram.usedMB) : 0
    const rdpOturum = oturum && cevrimici ? oturum.filter((x) => !/console|services/i.test(x.sessionType ?? "")) : null
    const aktifOturum = rdpOturum ? rdpOturum.filter((x) => /^active$/i.test(x.state ?? "")).length : null
    return {
      id: r.id, slug: slugify(r.name), ad: r.name, ip: r.ip,
      roller: roller.get(r.id) ?? [],
      cevrimici,
      sonGorulme: a?.lastSeen ?? null,
      cpu: m && cevrimici ? Math.round(m.cpu) : null,
      ram: m && cevrimici && m.ram.totalMB ? Math.round((ramKul / m.ram.totalMB) * 100) : null,
      ramGB: m && cevrimici ? { kullanilan: Math.round(ramKul / 102.4) / 10, toplam: Math.round(m.ram.totalMB / 1024) } : null,
      diskler: m && cevrimici ? (m.disks ?? []).map((d) => ({ surucu: d.drive, yuzde: Math.round(d.percent), bosGB: Math.round(d.freeGB), toplamGB: Math.round(d.totalGB) })) : [],
      calisma: m && cevrimici ? sureYaz(m.uptimeSeconds) : null,
      aktifKullanici: oturum && cevrimici ? new Set(oturum.filter((s) => s.username && s.state === "Active").map((s) => s.username.toLowerCase())).size : null,
      atanmisKullanici: atanmis.get(r.id) ?? null,
      aktifOturum,
      kopukOturum: rdpOturum && aktifOturum != null ? rdpOturum.length - aktifOturum : null,
    }
  })

  // ── Yedek: guvenlik.YedekAl=1 DB'lerin son yedeği (tam/diferansiyel en yenisi) ──
  let yedek: DashDurum["yedek"] = null
  try {
    const sqlIds = new Set([...roller].filter(([, r]) => r.includes("SQL")).map(([id]) => id))
    const sqlSrv = srvler.filter((s) => sqlIds.has(s.id) && s.sql_username && s.sql_password)
    type G = { ad: string; firmaId: number | null }
    const yedekli: G[] = []
    for (const s of sqlSrv) {
      const satirlar = await zamanAsimi(withSqlConnection<{ DataYolu: string | null; srkadi: string | null; PusulaFirmaId: number | null }[]>(
        { server: s.ip, port: 1433, user: s.sql_username!, password: decrypt(s.sql_password) ?? "", database: "sirket", requestTimeout: 8000 },
        async (pool) => (await pool.request().query("SELECT DataYolu, srkadi, PusulaFirmaId FROM guvenlik WHERE YedekAl = 1")).recordset,
      ))
      for (const g of satirlar) { const ad = (g.DataYolu || g.srkadi || "").trim(); if (ad) yedekli.push({ ad, firmaId: g.PusulaFirmaId }) }
    }
    const tekil = new Map(yedekli.map((g) => [g.ad.toLowerCase(), g]))
    const { data: dbData } = await sb.schema("hub").from("sql_databases").select("name, last_backup, last_diff_backup").limit(10_000)
    const dbMap = new Map(((dbData ?? []) as { name: string; last_backup: string | null; last_diff_backup: string | null }[]).map((d) => [d.name.toLowerCase(), d]))
    let saglikli = 0, gecikmis = 0, sorunlu = 0
    for (const [k, g] of tekil) {
      const d = dbMap.get(k)
      if (!d) continue // Hub'ın görmediği (silinmiş/taşınmış) DB — yedek sorunu değil, kayıt farkı
      const son = Math.max(yerelZaman(d.last_backup) || 0, yerelZaman(d.last_diff_backup) || 0)
      const saat = son ? (Date.now() - son) / 3_600_000 : Infinity
      if (saat > YEDEK_SORUN_SAAT) sorunlu++
      else if (saat > YEDEK_GECIKME_SAAT) gecikmis++
      else saglikli++
    }
    yedek = { toplam: saglikli + gecikmis + sorunlu, saglikli, gecikmis, sorunlu }
  } catch (e) { kaynakHata.push(`Yedek durumu: ${e instanceof Error ? e.message : e}`) }

  // ── Son yedek testi ────────────────────────────────────────
  let yedekTesti: DashDurum["yedekTesti"] = null
  try {
    const { data } = await sb.schema("hub").from("settings").select("value").eq("key", "yedek_testi_son").maybeSingle()
    const v = (data as { value: string | null } | null)?.value
    if (v) yedekTesti = JSON.parse(v)
  } catch { /* hiç çalıştırılmadı / bozuk kayıt — kart "—" */ }

  // ── Pusula Connect ────────────────────────────────────────
  let connect: DashDurum["connect"] = null
  try {
    const cihazlar = (await zamanAsimi(connectTumCihazlar())).filter((c) => !c.iptal)
    // Connect servisi UTC saati ofsetsiz yazıyor ("2026-10-16 15:20:00") — connect sayfasıyla aynı okuma
    const z = (s: string | null) => (s ? new Date(s.replace(" ", "T") + "Z").getTime() : 0)
    const canli = cihazlar.filter((c) => Date.now() - z(c.sonNabiz) < 180_000)
    const gunBasi = new Date(Date.now() + 3 * 3_600_000)
    const bugunBas = Date.UTC(gunBasi.getUTCFullYear(), gunBasi.getUTCMonth(), gunBasi.getUTCDate()) - 3 * 3_600_000
    connect = {
      cevrimici: canli.length,
      oturumda: canli.filter((c) => c.oturumAcik).length,
      toplam: cihazlar.length,
      bugunYeni: cihazlar.filter((c) => z(c.ilkGiris) >= bugunBas).length,
    }
  } catch (e) { kaynakHata.push(`Pusula Connect: ${e instanceof Error ? e.message : e}`) }

  return { zaman: new Date().toISOString(), sunucular, yedek, yedekTesti, connect, kaynakHata }
}

export async function GET() {
  const gate = await requirePermission("dashboard", "read")
  if (gate) return gate
  try {
    if (!onbellek || Date.now() - onbellek.at > TTL) onbellek = { at: Date.now(), veri: await topla() }
    return NextResponse.json(onbellek.veri)
  } catch (err) {
    console.error("[GET /api/dashboard/durum]", err)
    return NextResponse.json({ error: "Durum alınamadı" }, { status: 500 })
  }
}
