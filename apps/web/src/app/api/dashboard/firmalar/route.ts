import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"

/**
 * GET /api/dashboard/firmalar — dashboard 2. aşama: firmalar + bugünkü terminal oturumları.
 *
 * Yalnız KURULU firmalar (ad_server_id dolu). Yoğunluk, firma detayındaki kartla
 * aynı kurallarla hesaplanır: son 30 günün firma toplamı (user_daily_usage gün
 * bazında toplanıp ortalanır), varsayılan kota kullanıcı başı CPU %5 / RAM 2 GB
 * × 30 günde bir günde görülen en fazla kişi, Disk 25 GB, Veritabanı 5 GB.
 * Fark: veritabanı için 30 günlük ortalama yerine güncel boyut.
 *
 * 5 dk önbellek — veri günlük/5 dk kovalı, sık yenilemenin anlamı yok.
 */

export interface DashFirmaSatir { firkod: string; ad: string; detay: string; deger?: number }
export interface DashFirmalar {
  zaman: string
  lisans: { dolmus: DashFirmaSatir[]; yaklasan: DashFirmaSatir[] }
  hakAsan: DashFirmaSatir[]
  yogun: (DashFirmaSatir & { cpu: number; ram: number; disk: number; db: number })[]
  oturum: { seri: { ts: string; kisi: number }[]; zirve: { ts: string; kisi: number } | null; simdi: number | null }
  kaynakHata: string[]
}

let onbellek: { at: number; veri: DashFirmalar } | null = null
const TTL = 5 * 60_000
const LISANS_GUN = 30

/** PostgREST max-rows (1000) sessizce keser — sayfalı oku */
async function hepsi<T>(sorgu: (bas: number, son: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let bas = 0; bas < 50_000; bas += 1000) {
    const { data, error } = await sorgu(bas, bas + 999)
    if (error) throw error
    const parca = (data ?? []) as T[]
    out.push(...parca)
    if (parca.length < 1000) break
  }
  return out
}

const istanbulGunBasi = (): Date => {
  // Europe/Istanbul UTC+3 sabit (yaz saati yok)
  const simdi = new Date(Date.now() + 3 * 3_600_000)
  return new Date(Date.UTC(simdi.getUTCFullYear(), simdi.getUTCMonth(), simdi.getUTCDate()) - 3 * 3_600_000)
}

async function topla(): Promise<DashFirmalar> {
  const sb = await getSupabaseServer()
  const kaynakHata: string[] = []
  const gunBasi = istanbulGunBasi()

  type Firma = {
    company_id: string; name: string; contract_end: string | null; user_count: number | null
    quota_cpu: number | null; quota_ram: number | null; quota_disk: number | null; db_quota: number | null; file_storage_mb: number | null
  }
  const since30 = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)
  const [firmalar, adlar, dbler, kullanim, rdpRol] = await Promise.all([
    hepsi<Firma>((a, b) => sb.schema("hub").from("companies")
      .select("company_id, name, contract_end, user_count, quota_cpu, quota_ram, quota_disk, db_quota, file_storage_mb")
      .not("ad_server_id", "is", null).not("company_id", "is", null).order("company_id").range(a, b)),
    hepsi<{ ou: string | null; enabled: boolean }>((a, b) => sb.schema("hub").from("ad_users").select("ou, enabled").order("id").range(a, b)),
    hepsi<{ firma_no: string | null; size_mb: number | null }>((a, b) => sb.schema("hub").from("sql_databases").select("firma_no, size_mb").order("id").range(a, b)),
    hepsi<{ firma_no: string; date: string; username: string; avg_cpu: number | null; avg_ram_mb: number | null }>((a, b) =>
      sb.schema("hub").from("user_daily_usage").select("firma_no, date, username, avg_cpu, avg_ram_mb").gte("date", since30).order("id").range(a, b)),
    sb.schema("hub").from("server_roles").select("server_id").eq("role", "RDP"),
  ])

  // ── Lisans ────────────────────────────────────────────────
  const dolmus: DashFirmaSatir[] = [], yaklasan: DashFirmaSatir[] = []
  const bugun = new Date(gunBasi.getTime() + 3 * 3_600_000).toISOString().slice(0, 10)
  const gunFarki = (iso: string) => Math.round((Date.parse(iso) - Date.parse(bugun)) / 86_400_000)
  const tarihYaz = (iso: string) => { const [y, a, g] = iso.split("-"); return `${g}.${a}.${y}` }
  for (const f of firmalar) {
    const t = f.contract_end?.slice(0, 10)
    // 2000-01-01 gibi değerler lisans API'sinde "tarih girilmemiş" — sona ermiş sayma
    if (!t || Number(t.slice(0, 4)) < 2010) continue
    const kalan = gunFarki(t)
    if (kalan < 0) dolmus.push({ firkod: f.company_id, ad: f.name, deger: kalan, detay: `${tarihYaz(t)} · ${-kalan} gün önce doldu` })
    else if (kalan <= LISANS_GUN) yaklasan.push({ firkod: f.company_id, ad: f.name, deger: kalan, detay: `${tarihYaz(t)} · ${kalan === 0 ? "bugün doluyor" : `${kalan} gün kaldı`}` })
  }
  dolmus.sort((a, b) => (b.deger ?? 0) - (a.deger ?? 0))
  yaklasan.sort((a, b) => (a.deger ?? 0) - (b.deger ?? 0))

  // ── Hakkı aşanlar: açık AD hesabı > kullanıcı hakkı ──────
  const acikHesap = new Map<string, number>()
  for (const u of adlar) { const k = (u.ou ?? "").trim(); if (k && u.enabled) acikHesap.set(k, (acikHesap.get(k) ?? 0) + 1) }
  const hakAsan: DashFirmaSatir[] = []
  for (const f of firmalar) {
    const hak = f.user_count ?? 0, acik = acikHesap.get(f.company_id) ?? 0
    if (hak > 0 && acik > hak) hakAsan.push({ firkod: f.company_id, ad: f.name, deger: acik - hak, detay: `${acik} açık hesap · hak ${hak}` })
  }
  hakAsan.sort((a, b) => (b.deger ?? 0) - (a.deger ?? 0))

  // ── Yoğunluk ──────────────────────────────────────────────
  const dbMB = new Map<string, number>()
  for (const d of dbler) if (d.firma_no) dbMB.set(d.firma_no, (dbMB.get(d.firma_no) ?? 0) + (d.size_mb ?? 0))
  const gunluk = new Map<string, Map<string, { cpu: number; ram: number; kisi: Set<string> }>>()
  for (const r of kullanim) {
    const fm = gunluk.get(r.firma_no) ?? new Map(); gunluk.set(r.firma_no, fm)
    const g = fm.get(r.date) ?? { cpu: 0, ram: 0, kisi: new Set<string>() }; fm.set(r.date, g)
    g.cpu += r.avg_cpu ?? 0; g.ram += r.avg_ram_mb ?? 0; g.kisi.add(r.username)
  }
  const oran = (u: number, q: number) => (!q || q <= 0 ? 0 : Math.min(100, Math.round((u / q) * 100)))
  const yogun = firmalar.map((f) => {
    const gunler = [...(gunluk.get(f.company_id)?.values() ?? [])]
    const n = gunler.length || 1
    const cpuOrt = gunler.reduce((t, g) => t + g.cpu, 0) / n
    const ramOrt = gunler.reduce((t, g) => t + g.ram, 0) / n
    const kisi = Math.max(1, ...gunler.map((g) => g.kisi.size))
    const cpuKota = f.quota_cpu && f.quota_cpu > 0 ? f.quota_cpu : Math.min(100, kisi * 5)
    const ramKota = f.quota_ram && f.quota_ram > 0 ? f.quota_ram * 1024 : kisi * 2048
    const diskKota = (f.quota_disk && f.quota_disk > 0 ? f.quota_disk : 25) * 1024
    const dbKota = (f.db_quota && f.db_quota > 0 && f.db_quota !== 1 ? f.db_quota : 5) * 1024
    const p = {
      cpu: gunler.length ? oran(cpuOrt, cpuKota) : 0,
      ram: gunler.length ? oran(ramOrt, ramKota) : 0,
      disk: oran(f.file_storage_mb ?? 0, diskKota),
      db: oran(dbMB.get(f.company_id) ?? 0, dbKota),
    }
    const skor = Math.round((p.cpu + p.ram + p.disk + p.db) / 4)
    return { firkod: f.company_id, ad: f.name, deger: skor, ...p, detay: `CPU %${p.cpu} · RAM %${p.ram} · Disk %${p.disk} · DB %${p.db}` }
  }).sort((a, b) => (b.deger ?? 0) - (a.deger ?? 0)).slice(0, 5)

  // ── Bugünkü terminal oturumları (server_metrics 5 dk kova, RDP sunucuları toplamı) ──
  const rdpIdler = ((rdpRol.data ?? []) as { server_id: string }[]).map((r) => r.server_id)
  let oturum: DashFirmalar["oturum"] = { seri: [], zirve: null, simdi: null }
  try {
    if (rdpIdler.length) {
      const kovalar = await hepsi<{ ts: string; sessions_active: number | null }>((a, b) =>
        sb.schema("hub").from("server_metrics").select("ts, sessions_active").in("server_id", rdpIdler).gte("ts", gunBasi.toISOString()).order("ts").range(a, b))
      const top = new Map<string, number>()
      for (const k of kovalar) top.set(k.ts, (top.get(k.ts) ?? 0) + (k.sessions_active ?? 0))
      const seri = [...top].map(([ts, kisi]) => ({ ts, kisi })).sort((a, b) => a.ts.localeCompare(b.ts))
      const zirve = seri.reduce<{ ts: string; kisi: number } | null>((m, x) => (!m || x.kisi > m.kisi ? x : m), null)
      oturum = { seri, zirve, simdi: seri.length ? seri[seri.length - 1].kisi : null }
    }
  } catch (e) { kaynakHata.push(`Oturum geçmişi: ${e instanceof Error ? e.message : e}`) }

  return {
    zaman: new Date().toISOString(),
    lisans: { dolmus, yaklasan },
    hakAsan,
    yogun,
    oturum,
    kaynakHata,
  }
}

export async function GET() {
  const gate = await requirePermission("dashboard", "read")
  if (gate) return gate
  try {
    if (!onbellek || Date.now() - onbellek.at > TTL) onbellek = { at: Date.now(), veri: await topla() }
    return NextResponse.json(onbellek.veri)
  } catch (err) {
    console.error("[GET /api/dashboard/firmalar]", err)
    return NextResponse.json({ error: "Firma özeti alınamadı" }, { status: 500 })
  }
}
