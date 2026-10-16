import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"

/**
 * GET /api/servers/[id]/rapor?donem=bugun|7g|30g — sunucu kullanım raporu.
 *
 * 1) Metrik serisi — hub.server_metrics (5 dk kova). Bugün: 5 dk noktalar;
 *    7/30 gün: saatlik toplanır (ort = kovaların ortalaması, zirve = max).
 * 2) Dönem özeti — CPU / RAM / oturum ortalama + zirve (zamanıyla), disk
 *    dönem başı → sonu.
 * 3) Firma kullanımı — hub.user_daily_usage (server = sunucu ADI, günlük).
 *    Süre = sample_count / 360 saat (poller 10 sn; session_minutes eski
 *    satırlarda yanlış — bkz. /api/servers/[id]/analiz). CPU/RAM ortalaması
 *    örnek sayısıyla ağırlıklı.
 *
 * Tarihler Europe/Istanbul (UTC+3, yaz saati yok).
 */

export type Donem = "bugun" | "7g" | "30g"

export interface RaporNokta { ts: string; cpu: number | null; cpuMax: number | null; ramGB: number | null; ramMaxGB: number | null; oturum: number | null }
export interface RaporKullanici { kullanici: string; gun: number; saat: number; cpu: number; ramMB: number; sonGun: string }
export interface RaporFirma { firma: string; ad: string | null; kisi: number; saat: number; kisiBasiSaat: number; cpu: number; ramMB: number; kullanicilar: RaporKullanici[] }
export interface RaporYanit {
  donem: Donem
  baslangic: string
  seri: RaporNokta[]
  ozet: {
    cpu: { ort: number | null; zirve: number | null; zirveTs: string | null }
    ramGB: { ort: number | null; zirve: number | null; zirveTs: string | null; toplam: number | null }
    oturum: { ort: number | null; zirve: number | null; zirveTs: string | null }
    disk: { basGB: number | null; sonGB: number | null; toplamGB: number | null }
  }
  firmalar: RaporFirma[]
  toplam: { kisi: number; saat: number }
}

const SAAT = 3_600_000
const ORNEK_SAAT = 1 / 360

async function hepsi<T>(sorgu: (bas: number, son: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let bas = 0; bas < 100_000; bas += 1000) {
    const { data, error } = await sorgu(bas, bas + 999)
    if (error) throw error
    const parca = (data ?? []) as T[]
    out.push(...parca)
    if (parca.length < 1000) break
  }
  return out
}

/** İstanbul gün başı (UTC) — n gün geriye */
function gunBasi(geri = 0): Date {
  const s = new Date(Date.now() + 3 * SAAT)
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - 3 * SAAT - geri * 86_400_000)
}
const yuvarla = (n: number, b = 1) => Math.round(n * 10 ** b) / 10 ** b

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("servers", "read")
  if (gate) return gate
  const { id } = await params
  const d = new URL(req.url).searchParams.get("donem")
  const donem: Donem = d === "7g" || d === "30g" ? d : "bugun"

  try {
    const sb = await getSupabaseServer()
    const { data: srv } = await sb.schema("hub").from("servers").select("name").eq("id", id).maybeSingle()
    const ad = (srv as { name: string } | null)?.name
    if (!ad) return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })

    const bas = donem === "bugun" ? gunBasi(0) : donem === "7g" ? gunBasi(6) : gunBasi(29)
    const basTarih = new Date(bas.getTime() + 3 * SAAT).toISOString().slice(0, 10)

    type Kova = { ts: string; cpu_avg: number | null; cpu_max: number | null; ram_used_mb: number | null; ram_max_mb: number | null; ram_total_mb: number | null; disk_used_gb: number | null; disk_total_gb: number | null; sessions_active: number | null }
    type Kul = { date: string; username: string; firma_no: string | null; avg_cpu: number | null; avg_ram_mb: number | null; sample_count: number | null }
    const [kovalar, kullanim] = await Promise.all([
      hepsi<Kova>((a, b) => sb.schema("hub").from("server_metrics")
        .select("ts, cpu_avg, cpu_max, ram_used_mb, ram_max_mb, ram_total_mb, disk_used_gb, disk_total_gb, sessions_active")
        .eq("server_id", id).gte("ts", bas.toISOString()).order("ts").range(a, b)),
      hepsi<Kul>((a, b) => sb.schema("hub").from("user_daily_usage")
        .select("date, username, firma_no, avg_cpu, avg_ram_mb, sample_count")
        .eq("server", ad).gte("date", basTarih).order("date").order("username").range(a, b)),
    ])

    // ── Seri: bugün 5 dk, aksi halde saatlik ──
    const gb = (mb: number | null) => (mb == null ? null : yuvarla(mb / 1024))
    let seri: RaporNokta[]
    if (donem === "bugun") {
      seri = kovalar.map((k) => ({ ts: k.ts, cpu: k.cpu_avg == null ? null : yuvarla(k.cpu_avg), cpuMax: k.cpu_max == null ? null : yuvarla(k.cpu_max), ramGB: gb(k.ram_used_mb), ramMaxGB: gb(k.ram_max_mb), oturum: k.sessions_active }))
    } else {
      const saatlik = new Map<number, Kova[]>()
      for (const k of kovalar) { const t = Math.floor(new Date(k.ts).getTime() / SAAT) * SAAT; saatlik.set(t, [...(saatlik.get(t) ?? []), k]) }
      const ort = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
      const mx = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.max(...v) : null }
      seri = [...saatlik].sort((a, b) => a[0] - b[0]).map(([t, ks]) => {
        const c = ort(ks.map((k) => k.cpu_avg)), cm = mx(ks.map((k) => k.cpu_max)), r = ort(ks.map((k) => k.ram_used_mb)), rm = mx(ks.map((k) => k.ram_max_mb))
        return { ts: new Date(t).toISOString(), cpu: c == null ? null : yuvarla(c), cpuMax: cm == null ? null : yuvarla(cm), ramGB: gb(r), ramMaxGB: gb(rm), oturum: mx(ks.map((k) => k.sessions_active)) }
      })
    }

    // ── Özet (5 dk kovalardan — saatlik toplamadan bağımsız, zirve kaybolmasın) ──
    const ortalama = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
    const zirve = (f: (k: Kova) => number | null) => kovalar.reduce<{ v: number; ts: string } | null>((m, k) => { const v = f(k); return v != null && (!m || v > m.v) ? { v, ts: k.ts } : m }, null)
    const zc = zirve((k) => k.cpu_max), zr = zirve((k) => k.ram_max_mb), zo = zirve((k) => k.sessions_active)
    const ilkDisk = kovalar.find((k) => k.disk_used_gb != null), sonDisk = [...kovalar].reverse().find((k) => k.disk_used_gb != null)
    const ozet: RaporYanit["ozet"] = {
      cpu: { ort: (() => { const o = ortalama(kovalar.map((k) => k.cpu_avg)); return o == null ? null : yuvarla(o) })(), zirve: zc ? yuvarla(zc.v) : null, zirveTs: zc?.ts ?? null },
      ramGB: { ort: gb(ortalama(kovalar.map((k) => k.ram_used_mb))), zirve: zr ? gb(zr.v) : null, zirveTs: zr?.ts ?? null, toplam: gb([...kovalar].reverse().find((k) => k.ram_total_mb)?.ram_total_mb ?? null) },
      oturum: { ort: (() => { const o = ortalama(kovalar.map((k) => k.sessions_active)); return o == null ? null : yuvarla(o) })(), zirve: zo?.v ?? null, zirveTs: zo?.ts ?? null },
      disk: { basGB: ilkDisk?.disk_used_gb ?? null, sonGB: sonDisk?.disk_used_gb ?? null, toplamGB: sonDisk?.disk_total_gb ?? null },
    }

    // ── Firma kullanımı ──
    const firmaMap = new Map<string, Map<string, { gunler: Set<string>; ornek: number; cpuW: number; ramW: number; sonGun: string }>>()
    for (const r of kullanim) {
      const f = r.firma_no ?? "—"
      const km = firmaMap.get(f) ?? new Map(); firmaMap.set(f, km)
      const u = km.get(r.username) ?? { gunler: new Set<string>(), ornek: 0, cpuW: 0, ramW: 0, sonGun: r.date }; km.set(r.username, u)
      const n = r.sample_count ?? 0
      u.gunler.add(r.date); u.ornek += n; u.cpuW += (r.avg_cpu ?? 0) * n; u.ramW += (r.avg_ram_mb ?? 0) * n
      if (r.date > u.sonGun) u.sonGun = r.date
    }
    const kodlar = [...firmaMap.keys()].filter((k) => k !== "—")
    const { data: adlar } = kodlar.length
      ? await sb.schema("hub").from("companies").select("company_id, name").in("company_id", kodlar)
      : { data: [] }
    const firmaAd = new Map(((adlar ?? []) as { company_id: string; name: string }[]).map((c) => [String(c.company_id), c.name]))

    const firmalar: RaporFirma[] = [...firmaMap].map(([firma, km]) => {
      const kullanicilar: RaporKullanici[] = [...km].map(([kullanici, u]) => ({
        kullanici, gun: u.gunler.size, saat: yuvarla(u.ornek * ORNEK_SAAT),
        cpu: u.ornek ? yuvarla(u.cpuW / u.ornek, 2) : 0, ramMB: u.ornek ? Math.round(u.ramW / u.ornek) : 0, sonGun: u.sonGun,
      })).sort((a, b) => b.saat - a.saat)
      const ornek = [...km.values()].reduce((t, u) => t + u.ornek, 0)
      const saat = yuvarla(ornek * ORNEK_SAAT)
      return {
        firma, ad: firmaAd.get(firma) ?? null, kisi: km.size, saat,
        kisiBasiSaat: km.size ? yuvarla(saat / km.size) : 0,
        cpu: ornek ? yuvarla([...km.values()].reduce((t, u) => t + u.cpuW, 0) / ornek, 2) : 0,
        ramMB: ornek ? Math.round([...km.values()].reduce((t, u) => t + u.ramW, 0) / ornek) : 0,
        kullanicilar,
      }
    }).sort((a, b) => b.saat - a.saat)

    const yanit: RaporYanit = {
      donem, baslangic: bas.toISOString(), seri, ozet, firmalar,
      toplam: { kisi: firmalar.reduce((t, f) => t + f.kisi, 0), saat: yuvarla(firmalar.reduce((t, f) => t + f.saat, 0)) },
    }
    return NextResponse.json(yanit)
  } catch (err) {
    console.error("[GET /api/servers/[id]/rapor]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
