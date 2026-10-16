import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import { getAllAgents } from "@/lib/agent-store"
import { fetchKumaMonitors } from "@/lib/kuma"
import { getSpareBackupOffline } from "@/lib/sparebackup-offline"
import { withSqlConnection } from "@/lib/sql-external"
import { decrypt } from "@/lib/crypto"
import * as aktarim2 from "@/lib/aktarim2-proxy"
import { listSessions as aktarim1Oturumlar } from "@/lib/aktarim-proxy"
import { connectTumCihazlar } from "@/lib/connect-yonetim"

/**
 * GET /api/dashboard/durum — dashboard 1. aşama: "Dikkat" listesi + sunucular.
 *
 * Kaynaklar birbirinden bağımsız; biri düşerse (Kuma, SQL, aktarım servisi)
 * diğerleri yine döner, düşen kaynak `kaynakHata`'ya yazılır. 30 sn in-memory
 * önbellek: dashboard 60 sn'de bir yeniler, birden çok sekme sunucuları yormasın.
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
}

export type DikkatSeviye = "kritik" | "uyari"
export interface DikkatOge {
  seviye: DikkatSeviye
  tur: "sunucu" | "izleme" | "disk" | "yedek" | "spare" | "aktarim"
  baslik: string
  detay: string
  link?: string
}

export interface DashDurum {
  zaman: string
  sunucular: DashSunucu[]
  dikkat: DikkatOge[]
  yedek: { toplam: number; saglikli: number; gecikmis: number; sorunlu: number } | null
  izleme: { toplam: number; calisan: number; dusen: number } | null
  aktarim: { aktif: number } | null
  /** Son yedek doğrulama testi (/tv ekranından çalıştırılır, sonucu hub.settings yedek_testi_son) */
  yedekTesti: { durum: "ok" | "uyari" | "hata" | "calisiyor"; ozet: string; bitisAt: string } | null
  /** Pusula Connect: nabzı 3 dk içinde olan / iptal edilmemiş cihaz / bugün ilk kez bağlanan */
  connect: { cevrimici: number; oturumda: number; toplam: number; bugunYeni: number } | null
  kaynakHata: string[]
}

const DISK_UYARI = 85
const DISK_KRITIK = 95
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
  const dikkat: DikkatOge[] = []

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
    }
  })

  for (const s of sunucular) {
    const link = `/servers/${s.slug}`
    if (!s.cevrimici) {
      dikkat.push({ seviye: "kritik", tur: "sunucu", baslik: `${s.ad} ulaşılamıyor`, link,
        detay: s.sonGorulme ? `Agent son rapor: ${new Date(s.sonGorulme).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}` : "Agent hiç rapor göndermedi" })
      continue
    }
    for (const d of s.diskler) {
      if (d.yuzde >= DISK_UYARI) {
        dikkat.push({ seviye: d.yuzde >= DISK_KRITIK ? "kritik" : "uyari", tur: "disk", link,
          baslik: `${s.ad} ${d.surucu} diski %${d.yuzde} dolu`, detay: `${d.bosGB} GB boş / ${d.toplamGB} GB` })
      }
    }
  }

  // ── Kuma ───────────────────────────────────────────────────
  let izleme: DashDurum["izleme"] = null
  try {
    const mon = await zamanAsimi(fetchKumaMonitors())
    const dusen = mon.filter((m) => m.status === "down")
    izleme = { toplam: mon.length, calisan: mon.filter((m) => m.status === "up").length, dusen: dusen.length }
    for (const m of dusen) {
      dikkat.push({ seviye: "kritik", tur: "izleme", baslik: `${m.name} çalışmıyor`,
        detay: `Uptime Kuma · ${m.type}${m.hostname ? ` · ${m.hostname}` : m.url ? ` · ${m.url}` : ""}` })
    }
  } catch (e) { kaynakHata.push(`Uptime Kuma: ${e instanceof Error ? e.message : e}`) }

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
    const { data: adlar } = await sb.schema("hub").from("companies").select("company_id, name").limit(10_000)
    const firmaAd = new Map(((adlar ?? []) as { company_id: string; name: string }[]).map((c) => [String(c.company_id), c.name]))
    let saglikli = 0, gecikmis = 0, sorunlu = 0
    const sorunlular: { ad: string; firmaId: number | null; saat: number }[] = []
    for (const [k, g] of tekil) {
      const d = dbMap.get(k)
      if (!d) continue // Hub'ın görmediği (silinmiş/taşınmış) DB — yedek sorunu değil, kayıt farkı
      const son = Math.max(yerelZaman(d.last_backup) || 0, yerelZaman(d.last_diff_backup) || 0)
      const saat = son ? (Date.now() - son) / 3_600_000 : Infinity
      if (saat > YEDEK_SORUN_SAAT) { sorunlu++; sorunlular.push({ ad: g.ad, firmaId: g.firmaId, saat }) }
      else if (saat > YEDEK_GECIKME_SAAT) gecikmis++
      else saglikli++
    }
    yedek = { toplam: saglikli + gecikmis + sorunlu, saglikli, gecikmis, sorunlu }
    sorunlular.sort((a, b) => b.saat - a.saat)
    for (const s of sorunlular) {
      const firma = s.firmaId != null ? firmaAd.get(String(s.firmaId)) : undefined
      dikkat.push({ seviye: "kritik", tur: "yedek", baslik: `${s.ad} yedeği alınmıyor`,
        link: s.firmaId != null ? `/companies?firkod=${s.firmaId}` : undefined,
        detay: `${firma ? `${firma} · ` : ""}${Number.isFinite(s.saat) ? `son yedek ${Math.floor(s.saat / 24)} gün ${Math.floor(s.saat % 24)} saat önce` : "hiç yedek yok"}` })
    }
    if (gecikmis > 0) dikkat.push({ seviye: "uyari", tur: "yedek", baslik: `${gecikmis} veritabanının yedeği gecikmiş`, detay: `Son yedek ${YEDEK_GECIKME_SAAT}–${YEDEK_SORUN_SAAT} saat önce`, link: "/sql" })
  } catch (e) { kaynakHata.push(`Yedek durumu: ${e instanceof Error ? e.message : e}`) }

  // ── SpareBackup istemcileri ───────────────────────────────
  try {
    const sp = await zamanAsimi(getSpareBackupOffline())
    if (sp) for (const f of sp.offline) {
      dikkat.push({ seviye: "uyari", tur: "spare", baslik: `${f.firma} SpareBackup istemcisi çevrimdışı`, link: `/companies?firkod=${f.firkod}`,
        detay: `${f.minutesAgo >= 1440 ? `${Math.floor(f.minutesAgo / 1440)} gündür` : f.minutesAgo >= 60 ? `${Math.floor(f.minutesAgo / 60)} saattir` : `${f.minutesAgo} dakikadır`} sinyal yok · ${f.lastIp}` })
    }
    else kaynakHata.push("SpareBackup: servise ulaşılamadı")
  } catch (e) { kaynakHata.push(`SpareBackup: ${e instanceof Error ? e.message : e}`) }

  // ── Aktarımlar ────────────────────────────────────────────
  let aktarim: DashDurum["aktarim"] = null
  try {
    const [a1, a2] = await Promise.all([zamanAsimi(aktarim1Oturumlar()), zamanAsimi(aktarim2.oturumlar())])
    const yedigun = Date.now() - 7 * 86_400_000
    for (const o of a2) {
      if (o.durum === "hata" && new Date(o.olusturma).getTime() > yedigun) {
        dikkat.push({ seviye: "kritik", tur: "aktarim", baslik: `${o.firmaAdi} aktarımı hata verdi`, link: "/aktarim2", detay: o.hata ?? "Ayrıntı yok" })
      }
    }
    aktarim = {
      aktif: a1.filter((o) => o.status === "active").length + a2.filter((o) => ["bagli", "yukleniyor", "yuklendi", "aktariliyor"].includes(o.durum)).length,
    }
  } catch (e) { kaynakHata.push(`Aktarım: ${e instanceof Error ? e.message : e}`) }

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

  dikkat.sort((a, b) => (a.seviye === b.seviye ? 0 : a.seviye === "kritik" ? -1 : 1))
  return { zaman: new Date().toISOString(), sunucular, dikkat, yedek, izleme, aktarim, yedekTesti, connect, kaynakHata }
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
