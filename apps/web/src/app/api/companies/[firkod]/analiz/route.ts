/**
 * GET /api/companies/[firkod]/analiz?gun=90
 *
 * Firmanın kullanım analizi — MÜŞTERİYE GÖSTERİLMEK ÜZERE. Hub'ın kendi
 * operasyon ekranlarından farkı bu: burada "atıl hesap", "kaynak israfı"
 * gibi iç değerlendirmeler yok; müşterinin kendi kullanımını görmesini
 * sağlayan olgular var.
 *
 * SÜRE HESABI — `sample_count`. Poller sunucuyu 10 saniyede bir yokluyor
 * ve süreçleri çalışan her kullanıcı için bir örnek yazıyor:
 *
 *     saat = sample_count / 360
 *
 * `session_minutes` kolonu kullanılmıyor; uzun süre sabit "+5 dakika"
 * ekleyip gerçeğin 30 katını gösteriyordu (2026-08-27'de düzeltildi ama
 * doğru kaynak yine sample_count).
 *
 * "Çalışma saati" = oturumun açık olduğu süre. Bağlantısı kopmuş ama
 * oturumunu kapatmamış kullanıcı da sayılır; müşteriye sunulan rapordaki
 * dipnotta bu açıkça söyleniyor, aksi halde rakam abartılı görünür.
 */

import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"

const ORNEK_SAAT = 1 / 360
const VARSAYILAN_GUN = 90

export interface FirmaAnalizKullanici {
  kullanici: string
  adSoyad: string | null
  gun: number
  toplamSaat: number
  ortSaat: number
  ilkGun: string | null
  sonGun: string | null
  ortCpu: number
  ortRamMb: number
}

export interface FirmaAnalizGun {
  tarih: string
  kisi: number
  saat: number
  haftaSonu: boolean
}

export interface FirmaAnalizAy {
  ay: string
  kisi: number
  saat: number
  gun: number
}

export interface FirmaAnalizYanit {
  firkod: string
  firmaAdi: string | null
  donem: { basla: string; bitir: string; gun: number }
  veriVar: boolean
  ozet: {
    kullanici: number
    toplamSaat: number
    calisilanGun: number
    gunlukOrtKisi: number
    gunlukOrtSaat: number
    kisiBasiGunlukSaat: number
    enYogunGun: { tarih: string; kisi: number; saat: number } | null
    ortRamMb: number
  }
  sunucular: { ad: string; saat: number; kisi: number }[]
  kullanicilar: FirmaAnalizKullanici[]
  gunler: FirmaAnalizGun[]
  aylar: FirmaAnalizAy[]
}

const isGunu = (t: string) => {
  const g = new Date(t + "T12:00:00Z").getUTCDay()
  return g >= 1 && g <= 5
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate

  const { firkod } = await params
  const istenen = Number(new URL(req.url).searchParams.get("gun"))
  const gunSayisi = Number.isFinite(istenen) && istenen > 0 && istenen <= 365
    ? Math.floor(istenen) : VARSAYILAN_GUN

  try {
    const sb = await getSupabaseServer()
    const bitir = new Date().toISOString().slice(0, 10)
    const basla = new Date(Date.now() - gunSayisi * 86400_000).toISOString().slice(0, 10)

    /*  Sayfalama: Supabase tek istekte 1000 satır döndürüyor. Kalabalık
     *  bir firmanın 90 günü bunu rahat aşar; sayfalamasız toplamlar
     *  sessizce eksik çıkardı.                                        */
    type Satir = {
      date: string; username: string; server: string
      sample_count: number; avg_cpu: number | null; avg_ram_mb: number | null
    }
    const satirlar: Satir[] = []
    for (let bas = 0; ; bas += 1000) {
      const { data, error } = await sb.schema("hub").from("user_daily_usage")
        .select("date, username, server, sample_count, avg_cpu, avg_ram_mb")
        .eq("firma_no", firkod).gte("date", basla)
        .order("date", { ascending: true })
        .range(bas, bas + 999)
      if (error) throw error
      const parca = (data ?? []) as Satir[]
      satirlar.push(...parca)
      if (parca.length < 1000) break
    }

    const [compRes, adRes] = await Promise.all([
      sb.schema("hub").from("companies").select("name").eq("company_id", firkod).maybeSingle(),
      sb.schema("hub").from("ad_users").select("username, display_name").eq("ou", firkod),
    ])
    const firmaAdi = (compRes.data as { name: string } | null)?.name ?? null
    const adAdi = new Map(
      ((adRes.data ?? []) as { username: string; display_name: string | null }[])
        .map((u) => [u.username.toLowerCase(), u.display_name]),
    )

    /* ── Kullanıcı bazında ── */
    const kHar = new Map<string, {
      ornek: number; gun: number; ilk: string; son: string
      cpuTop: number; ramTop: number; olcum: number
    }>()
    for (const s of satirlar) {
      const k = s.username.toLowerCase()
      if (!kHar.has(k))
        kHar.set(k, { ornek: 0, gun: 0, ilk: s.date, son: s.date, cpuTop: 0, ramTop: 0, olcum: 0 })
      const v = kHar.get(k)!
      v.ornek += s.sample_count
      v.gun++
      if (s.date < v.ilk) v.ilk = s.date
      if (s.date > v.son) v.son = s.date
      if (s.avg_cpu != null) { v.cpuTop += s.avg_cpu; v.olcum++ }
      if (s.avg_ram_mb != null) v.ramTop += s.avg_ram_mb
    }

    const kullanicilar: FirmaAnalizKullanici[] = [...kHar.entries()]
      .map(([kullanici, v]) => ({
        kullanici,
        adSoyad: adAdi.get(kullanici) ?? null,
        gun: v.gun,
        toplamSaat: +(v.ornek * ORNEK_SAAT).toFixed(1),
        ortSaat: +((v.ornek * ORNEK_SAAT) / v.gun).toFixed(1),
        ilkGun: v.ilk,
        sonGun: v.son,
        ortCpu: v.olcum ? +(v.cpuTop / v.olcum).toFixed(2) : 0,
        ortRamMb: v.gun ? Math.round(v.ramTop / v.gun) : 0,
      }))
      .sort((a, b) => b.toplamSaat - a.toplamSaat)

    /* ── Günlük ── */
    const gHar = new Map<string, { kisi: Set<string>; ornek: number }>()
    for (const s of satirlar) {
      if (!gHar.has(s.date)) gHar.set(s.date, { kisi: new Set(), ornek: 0 })
      const g = gHar.get(s.date)!
      g.kisi.add(s.username.toLowerCase())
      g.ornek += s.sample_count
    }
    const gunler: FirmaAnalizGun[] = [...gHar.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([tarih, g]) => ({
        tarih, kisi: g.kisi.size,
        saat: +(g.ornek * ORNEK_SAAT).toFixed(1),
        haftaSonu: !isGunu(tarih),
      }))

    /* ── Aylık ── */
    const aHar = new Map<string, { kisi: Set<string>; ornek: number; gun: Set<string> }>()
    for (const s of satirlar) {
      const ay = s.date.slice(0, 7)
      if (!aHar.has(ay)) aHar.set(ay, { kisi: new Set(), ornek: 0, gun: new Set() })
      const a = aHar.get(ay)!
      a.kisi.add(s.username.toLowerCase())
      a.ornek += s.sample_count
      a.gun.add(s.date)
    }
    const aylar: FirmaAnalizAy[] = [...aHar.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([ay, a]) => ({
        ay, kisi: a.kisi.size,
        saat: +(a.ornek * ORNEK_SAAT).toFixed(0),
        gun: a.gun.size,
      }))

    /* ── Sunucu kırılımı ── */
    const sHar = new Map<string, { ornek: number; kisi: Set<string> }>()
    for (const s of satirlar) {
      if (!sHar.has(s.server)) sHar.set(s.server, { ornek: 0, kisi: new Set() })
      const v = sHar.get(s.server)!
      v.ornek += s.sample_count
      v.kisi.add(s.username.toLowerCase())
    }
    const sunucular = [...sHar.entries()]
      .map(([ad, v]) => ({ ad, saat: +(v.ornek * ORNEK_SAAT).toFixed(0), kisi: v.kisi.size }))
      .sort((a, b) => b.saat - a.saat)

    const isGunleri = gunler.filter((g) => !g.haftaSonu)
    const enYogun = gunler.reduce<FirmaAnalizGun | null>(
      (en, g) => (!en || g.kisi > en.kisi || (g.kisi === en.kisi && g.saat > en.saat) ? g : en), null)
    const toplamOrnek = satirlar.reduce((a, s) => a + s.sample_count, 0)
    const toplamGun = satirlar.length
    const ramTop = satirlar.reduce((a, s) => a + (s.avg_ram_mb ?? 0), 0)

    const yanit: FirmaAnalizYanit = {
      firkod,
      firmaAdi,
      donem: { basla, bitir, gun: gunSayisi },
      veriVar: satirlar.length > 0,
      ozet: {
        kullanici: kullanicilar.length,
        toplamSaat: +(toplamOrnek * ORNEK_SAAT).toFixed(0),
        calisilanGun: gunler.length,
        gunlukOrtKisi: isGunleri.length
          ? +(isGunleri.reduce((a, g) => a + g.kisi, 0) / isGunleri.length).toFixed(1) : 0,
        gunlukOrtSaat: isGunleri.length
          ? +(isGunleri.reduce((a, g) => a + g.saat, 0) / isGunleri.length).toFixed(1) : 0,
        kisiBasiGunlukSaat: toplamGun
          ? +((toplamOrnek * ORNEK_SAAT) / toplamGun).toFixed(1) : 0,
        enYogunGun: enYogun
          ? { tarih: enYogun.tarih, kisi: enYogun.kisi, saat: enYogun.saat } : null,
        ortRamMb: toplamGun ? Math.round(ramTop / toplamGun) : 0,
      },
      sunucular,
      kullanicilar,
      gunler,
      aylar,
    }

    const resp = NextResponse.json(yanit)
    resp.headers.set("Cache-Control", "private, max-age=120")
    return resp
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/analiz]", err)
    return NextResponse.json({ error: "Analiz verisi alınamadı" }, { status: 500 })
  }
}
