/**
 * GET /api/servers/[id]/analiz
 *
 * "Bu sunucu gerçekten kullanılıyor mu, yoğunluğu ne?" sorusunun cevabı.
 * Terminal (RDP) sunucuları için yazıldı; oturum geçmişi olmayan bir
 * sunucuda boş döner ve sekme bunu açıkça söyler.
 *
 * VERİ KAYNAĞI — `hub.user_daily_usage`. Poller her 10 saniyede bir
 * sunucuyu yokluyor ve süreçleri çalışan her kullanıcı için bir örnek
 * yazıyor. Dolayısıyla:
 *
 *     süre (saat) = sample_count × 10sn ÷ 3600 = sample_count / 360
 *
 * `session_minutes` kolonu KULLANILMIYOR: uzun süre sabit "+5 dakika"
 * ekliyordu (5 dakikalık poll varsayımı) ve gerçeğin 30 katını
 * gösteriyordu. 2026-08-27'de düzeltildi ama geçmiş satırların doğru
 * kaynağı yine sample_count.
 *
 * "Aktif" burada OTURUMU AÇIK demek — bağlantısı kopmuş ama oturumunu
 * kapatmamış kullanıcı da sayılır. Bu bilinçli: kaynak tüketimi açısından
 * fark yok, kullanıcı süreçleri ayakta kalmaya devam ediyor.
 */

import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getAllAgents } from "@/lib/agent-store"
import { requirePermission } from "@/lib/require-permission"

/** Poller aralığı 10 sn → bir örnek 1/360 saat. */
const ORNEK_SAAT = 1 / 360

/** Atıl sayılma eşiği. */
const ATIL_GUN = 30

/** Trend grafiği için geriye dönük gün sayısı. */
const TREND_GUN = 30

export interface AnalizFirma {
  firma: string
  ad: string | null
  kullanici: number
  kullanan: number
  gunlukOrt: number
  kisiBasiSaat: number
  toplamSaat: number
  suAnBagli: number
}

export interface AnalizAtil {
  firma: string
  ad: string | null
  kullanici: string
  sonBaglanti: string | null
  gecenGun: number | null
}

export interface AnalizGun {
  tarih: string
  kisi: number
  saat: number
  haftaSonu: boolean
}

export interface AnalizYanit {
  sunucu: string
  veriVar: boolean
  ozet: {
    kullanici: number
    aktif: number
    atil: number
    suAnBagli: number
    suAnAktifOturum: number
    gunlukOrtKisi: number
    kisiBasiSaat: number
    zirveKisi: number
    zirveTarih: string | null
  }
  gunler: AnalizGun[]
  firmalar: AnalizFirma[]
  atillar: AnalizAtil[]
}

const sade = (u: string) => (u.includes("\\") ? u.split("\\").pop()! : u).toLowerCase()
const gunAdi = (t: string) => new Date(t + "T12:00:00Z").getUTCDay()
const isGunu = (t: string) => { const g = gunAdi(t); return g >= 1 && g <= 5 }

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("servers", "read")
  if (gate) return gate

  const { id } = await params

  try {
    const sb = await getSupabaseServer()

    const { data: srv } = await sb.schema("hub").from("servers")
      .select("id, name").eq("id", id).maybeSingle()
    const sunucu = (srv as { name: string } | null)?.name
    if (!sunucu) return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })

    const bugun = new Date().toISOString().slice(0, 10)
    const basla = new Date(Date.now() - 120 * 86400_000).toISOString().slice(0, 10)

    /*  SAYFALAMA ZORUNLU: Supabase tek istekte en fazla 1000 satir
     *  donuyor. Terminal 1'in 120 gunluk kaydi 2900 satiri asiyor;
     *  sayfalama olmadan toplamlar sessizce kesiliyordu.              */
    type UsageRow = { date: string; username: string; sample_count: number }
    const usage: UsageRow[] = []
    for (let bas = 0; ; bas += 1000) {
      const { data, error } = await sb.schema("hub").from("user_daily_usage")
        .select("date, username, sample_count")
        .eq("server", sunucu).gte("date", basla)
        .order("date", { ascending: false })
        .range(bas, bas + 999)
      if (error) throw error
      const parca = (data ?? []) as UsageRow[]
      usage.push(...parca)
      if (parca.length < 1000) break
    }

    const [adRes, compRes] = await Promise.all([
      sb.schema("hub").from("ad_users").select("username, display_name, ou, enabled"),
      sb.schema("hub").from("companies").select("company_id, name"),
    ])
    const adUsers = (adRes.data ?? []) as
      { username: string; display_name: string | null; ou: string | null; enabled: boolean }[]
    const firmaAdi = new Map(
      ((compRes.data ?? []) as { company_id: string; name: string }[])
        .map((c) => [String(c.company_id), c.name]),
    )

    /* ── Canlı oturumlar (agent store) ── */
    const agent = getAllAgents().find(
      (a) => a.agentId === id || a.hostname === sunucu,
    )
    const oturum = new Map<string, string>()
    for (const s of agent?.lastReport?.sessions ?? []) {
      if (s.username) oturum.set(sade(s.username), s.state)
    }

    /* ── Kullanıcı bazında toplam ──
       Pencere: son 20 İŞ GÜNÜ + bugün. Bugün ayrıca sayılıyor ki yeni
       başlayan bir firma "hiç kullanmıyor" gibi görünmesin — 2311
       taşınırken tam bu yanılgı yaşandı. */
    const tarihler = [...new Set(usage.map((u) => u.date))].sort().reverse()
    const pencere = tarihler.filter((t) => isGunu(t) && t !== bugun).slice(0, 20)
    const pencereSet = new Set(pencere)

    const kul = new Map<string, { ornek: number; gun: number; son: string }>()
    for (const u of usage) {
      const k = sade(u.username)
      const v = kul.get(k)
      if (!v) kul.set(k, { ornek: 0, gun: 0, son: u.date })
      const o = kul.get(k)!
      if (u.date > o.son) o.son = u.date
      if (!pencereSet.has(u.date) && u.date !== bugun) continue
      o.ornek += u.sample_count
      o.gun++
    }

    /* ── Günlük seri (trend) ── */
    const gunHar = new Map<string, { kisi: Set<string>; ornek: number }>()
    for (const u of usage) {
      if (!gunHar.has(u.date)) gunHar.set(u.date, { kisi: new Set(), ornek: 0 })
      const g = gunHar.get(u.date)!
      g.kisi.add(sade(u.username))
      g.ornek += u.sample_count
    }
    const gunler: AnalizGun[] = [...gunHar.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, TREND_GUN)
      .reverse()
      .map(([tarih, g]) => ({
        tarih, kisi: g.kisi.size,
        saat: +(g.ornek * ORNEK_SAAT).toFixed(1),
        haftaSonu: !isGunu(tarih),
      }))

    /* ── Bu sunucuyu kullanan/kullanabilecek kullanıcılar ──
       AD listesi tüm domaini kapsıyor; sunucuya özgü olan, kullanım
       kaydı olanlar. Ama hiç bağlanmamış hesapları da görmek istiyoruz,
       o yüzden AD'deki herkes alınıp kullanımıyla eşleştiriliyor. */
    const atilEsik = new Date(Date.now() - ATIL_GUN * 86400_000).toISOString().slice(0, 10)

    /*  Firma adi icin yedek: hub.companies 74 kullanicinin ancak
     *  12'sine karsilik geliyor. AD'deki display_name pratikte firma
     *  adini tasiyor ("TIKIZ GOLD" gibi), o yuzden ikinci kaynak o.   */
    const firmaHar = new Map<string, {
      kullanici: number; kullanan: number; ornek: number; gun: number; bagli: number
      yedekAd: string | null
    }>()
    const atillar: AnalizAtil[] = []
    let aktifSayi = 0

    for (const u of adUsers) {
      if (!u.enabled) continue
      const k = sade(u.username)
      const f = u.ou ?? k.match(/^(\d+)\./)?.[1] ?? "—"
      if (!firmaHar.has(f))
        firmaHar.set(f, { kullanici: 0, kullanan: 0, ornek: 0, gun: 0, bagli: 0, yedekAd: null })
      const fh = firmaHar.get(f)!
      fh.kullanici++
      if (!fh.yedekAd && u.display_name) fh.yedekAd = u.display_name
      if (oturum.has(k)) fh.bagli++

      const o = kul.get(k)
      const taze = o ? o.son >= atilEsik : false
      if (taze) {
        aktifSayi++
        fh.kullanan++
        fh.ornek += o!.ornek
        fh.gun += o!.gun
      } else {
        atillar.push({
          firma: f, ad: firmaAdi.get(f) ?? u.display_name ?? null,
          kullanici: u.username,
          sonBaglanti: o?.son ?? null,
          gecenGun: o
            ? Math.round((Date.now() - new Date(o.son + "T12:00:00Z").getTime()) / 86400_000)
            : null,
        })
      }
    }

    const gunSayisi = Math.max(1, pencere.length)
    const firmalar: AnalizFirma[] = [...firmaHar.entries()]
      .map(([firma, v]) => ({
        firma,
        ad: firmaAdi.get(firma) ?? v.yedekAd ?? null,
        kullanici: v.kullanici,
        kullanan: v.kullanan,
        gunlukOrt: +(v.gun / gunSayisi).toFixed(1),
        kisiBasiSaat: v.gun ? +((v.ornek * ORNEK_SAAT) / v.gun).toFixed(1) : 0,
        toplamSaat: +(v.ornek * ORNEK_SAAT).toFixed(0),
        suAnBagli: v.bagli,
      }))
      .sort((a, b) => b.gunlukOrt - a.gunlukOrt || b.kullanici - a.kullanici)

    atillar.sort((a, b) => (b.gecenGun ?? 9999) - (a.gecenGun ?? 9999))

    const isGunleri = gunler.filter((g) => !g.haftaSonu && g.tarih !== bugun)
    const zirve = isGunleri.reduce<AnalizGun | null>(
      (en, g) => (!en || g.kisi > en.kisi ? g : en), null)

    const toplamOrnek = [...kul.values()].reduce((a, b) => a + b.ornek, 0)
    const toplamGun = [...kul.values()].reduce((a, b) => a + b.gun, 0)

    const yanit: AnalizYanit = {
      sunucu,
      veriVar: usage.length > 0,
      ozet: {
        kullanici: adUsers.filter((u) => u.enabled).length,
        aktif: aktifSayi,
        atil: atillar.length,
        suAnBagli: oturum.size,
        suAnAktifOturum: [...oturum.values()].filter((s) => s === "Active").length,
        gunlukOrtKisi: +(isGunleri.reduce((a, g) => a + g.kisi, 0)
          / Math.max(1, isGunleri.length)).toFixed(1),
        kisiBasiSaat: toplamGun ? +((toplamOrnek * ORNEK_SAAT) / toplamGun).toFixed(1) : 0,
        zirveKisi: zirve?.kisi ?? 0,
        zirveTarih: zirve?.tarih ?? null,
      },
      gunler,
      firmalar,
      atillar,
    }

    const resp = NextResponse.json(yanit)
    resp.headers.set("Cache-Control", "private, max-age=60")
    return resp
  } catch (err) {
    console.error("[GET /api/servers/[id]/analiz]", err)
    return NextResponse.json({ error: "Analiz verisi alınamadı" }, { status: 500 })
  }
}
