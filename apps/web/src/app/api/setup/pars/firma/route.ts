import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import { execOnAgent } from "@/lib/agent-poller"
import { parsHedefYukle, parsKatalogOku, parsKatalogOnbellekTemizle } from "@/lib/pars-service"
import {
  buildParsKullaniciGuncelle, buildParsRaporYaz, buildParsDataEkle,
  buildParsSifreOku, buildParsKullaniciDataOku, buildParsIzinliRaporOku, parsJsonAyikla,
} from "@/lib/setup-parsops"
import { parsSifreGecerliMi, parsKullaniciAdiGecerliMi, type ParsBaglanti, type ParsScript } from "@/lib/pars-katalog"

/**
 * /api/setup/pars/firma — firmanın Pars yönetimi (firma detayı > Hizmetler).
 *
 * GET  ?firkod=&serviceId= → kullanıcılar (şifre, yetki, izinli raporlar),
 *                            bağlı veritabanları, rapor kataloğu, bağlantı adresi.
 * POST { islem: "kullanici" | "raporlar" | "data-ekle", ... }
 *
 * Ayar.mdb'ye yazan her işlem tek transaction; ters yetki kuralı (yeni data
 * firma dışına yasaklanır) betiklerin içinde.
 */

export const dynamic = "force-dynamic"

export interface ParsFirmaKullanici {
  parsUserId: number
  username:   string
  tipi:       number
  password:   string | null
  /** Mobilde görünen (Mobil=True) izinli rapor id'leri */
  izinliRaporlar: number[]
  datalar:    string[]
}

export interface ParsFirmaDurum {
  baglanti:    ParsBaglanti
  kullanicilar: ParsFirmaKullanici[]
  /** Firmanın Pars'a bağlı veritabanları */
  datalar:     { data: string; tipId: number | null }[]
  /** Tüm rapor kataloğu (seçim ekranı için) */
  scripts:     ParsScript[]
  dtipler:     { tid: number; ad: string }[]
}

async function firmaKullaniciIdleri(firkod: string, serviceId: number): Promise<number[]> {
  const sb = await getSupabaseServer()
  const { data } = await sb.schema("hub").from("company_pars_users")
    .select("pars_user_id").eq("company_id", firkod).eq("service_id", serviceId)
  return ((data ?? []) as { pars_user_id: number | null }[])
    .map((x) => Number(x.pars_user_id)).filter((n) => Number.isInteger(n) && n > 0)
}

export async function GET(req: NextRequest) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const firkod    = (req.nextUrl.searchParams.get("firkod") ?? "").trim()
  const serviceId = Number(req.nextUrl.searchParams.get("serviceId"))
  if (!firkod || !Number.isFinite(serviceId)) {
    return NextResponse.json({ error: "firkod ve serviceId zorunlu" }, { status: 400 })
  }
  try {
    const h = await parsHedefYukle(serviceId)
    if (!h.ok) return NextResponse.json({ error: h.error }, { status: 400 })
    const ids = await firmaKullaniciIdleri(firkod, serviceId)
    if (ids.length === 0) return NextResponse.json({ error: "Bu firmanın Hub'da kayıtlı Pars kullanıcısı yok" }, { status: 404 })

    const [katalog, sifreRes, izinRes] = await Promise.all([
      parsKatalogOku(h.hedef, true),
      execOnAgent(h.hedef.agent.ip, h.hedef.agent.port, h.hedef.agent.apiKey, buildParsSifreOku(h.hedef.dbPath, h.hedef.password, ids), 30),
      execOnAgent(h.hedef.agent.ip, h.hedef.agent.port, h.hedef.agent.apiKey, buildParsKullaniciDataOku(h.hedef.dbPath, h.hedef.password), 60),
    ])
    if (!katalog.ok) return NextResponse.json({ error: katalog.error }, { status: 502 })

    const dizi = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []) as Record<string, unknown>[]
    const sifreler = new Map<number, { adi: string; sifre: string | null }>()
    for (const u of dizi(parsJsonAyikla<{ users?: unknown }>(sifreRes.stdout ?? "")?.users)) {
      sifreler.set(Number(u.ID), { adi: String(u.Adi ?? ""), sifre: u.sifre == null ? null : String(u.sifre) })
    }
    const izinRaw = parsJsonAyikla<{ izinler?: unknown }>(izinRes.stdout ?? "")
    const dataByUid = new Map<number, string[]>()
    for (const i of dizi(izinRaw?.izinler)) {
      const uid = Number(i.UID), d = String(i.Data ?? "")
      if (!d) continue
      dataByUid.set(uid, [...(dataByUid.get(uid) ?? []), d])
    }

    // İzinli raporlar: yasak listesinde OLMAYANLAR (ters yetki)
    const yasakRes = await execOnAgent(h.hedef.agent.ip, h.hedef.agent.port, h.hedef.agent.apiKey,
      buildParsIzinliRaporOku(h.hedef.dbPath, h.hedef.password, ids), 45)
    const izinliByUid = new Map<number, number[]>()
    for (const r of dizi(parsJsonAyikla<{ izinler?: unknown }>(yasakRes.stdout ?? "")?.izinler)) {
      const uid = Number(r.UID), sid = Number(r.ScriptID)
      if (!Number.isInteger(uid) || !Number.isInteger(sid)) continue
      izinliByUid.set(uid, [...(izinliByUid.get(uid) ?? []), sid])
    }

    const kullanicilar: ParsFirmaKullanici[] = ids.map((id) => ({
      parsUserId: id,
      username:   sifreler.get(id)?.adi ?? "",
      tipi:       katalog.katalog.users.find((u) => u.id === id)?.tipi ?? 0,
      password:   sifreler.get(id)?.sifre ?? null,
      izinliRaporlar: izinliByUid.get(id) ?? [],
      datalar:    dataByUid.get(id) ?? [],
    })).filter((u) => u.username)

    const firmaDatalari = [...new Set(kullanicilar.flatMap((u) => u.datalar))]
      .map((d) => ({ data: d, tipId: katalog.katalog.datalar.find((x) => x.data === d)?.tipId ?? null }))

    const durum: ParsFirmaDurum = {
      baglanti: h.hedef.baglanti,
      kullanicilar,
      datalar:  firmaDatalari,
      scripts:  katalog.katalog.scripts,
      dtipler:  katalog.katalog.dtipler,
    }
    return NextResponse.json(durum)
  } catch (err) {
    console.error("[GET /api/setup/pars/firma]", err)
    return NextResponse.json({ error: "Pars bilgileri alınamadı" }, { status: 500 })
  }
}

interface PostPayload {
  islem?:     "kullanici" | "raporlar" | "data-ekle"
  firkod?:    string
  serviceId?: number
  /** islem=kullanici */
  parsUserId?: number
  yeniAd?:     string
  yeniSifre?:  string
  tipi?:       0 | 1
  /** islem=raporlar */
  izinliRaporlar?: number[]
  /** islem=data-ekle */
  data?:   string
  tipId?:  number
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  try {
    const b = (await req.json()) as PostPayload
    const firkod    = (b.firkod ?? "").trim()
    const serviceId = Number(b.serviceId)
    if (!firkod || !Number.isFinite(serviceId)) {
      return NextResponse.json({ error: "firkod ve serviceId zorunlu" }, { status: 400 })
    }
    const h = await parsHedefYukle(serviceId)
    if (!h.ok) return NextResponse.json({ error: h.error }, { status: 400 })
    const hedef = h.hedef
    const firmaIdleri = await firmaKullaniciIdleri(firkod, serviceId)
    const calistir = async (cmd: string, sn = 60) => {
      const r = await execOnAgent(hedef.agent.ip, hedef.agent.port, hedef.agent.apiKey, cmd, sn)
      const j = parsJsonAyikla<{ ok?: boolean; error?: string } & Record<string, unknown>>(r.stdout ?? "")
      if (!j) throw new Error((r.stderr || r.stdout || `exit ${r.exitCode}`).trim().slice(0, 300))
      if (!j.ok) throw new Error(j.error ?? "İşlem başarısız")
      return j
    }

    if (b.islem === "kullanici") {
      const parsUserId = Number(b.parsUserId)
      if (!firmaIdleri.includes(parsUserId)) {
        return NextResponse.json({ error: "Bu kullanıcı firmaya ait değil" }, { status: 403 })
      }
      const yeniAd = (b.yeniAd ?? "").trim()
      const yeniSifre = (b.yeniSifre ?? "").trim()
      if (yeniAd && !parsKullaniciAdiGecerliMi(yeniAd)) {
        return NextResponse.json({ error: "Kullanıcı adı geçersiz (boşluk/tırnak olmadan 2-40 karakter)" }, { status: 400 })
      }
      if (yeniSifre && !parsSifreGecerliMi(yeniSifre)) {
        return NextResponse.json({ error: "Şifre 6 karakter harf/rakam olmalı" }, { status: 400 })
      }
      const j = await calistir(buildParsKullaniciGuncelle(hedef.dbPath, hedef.password, {
        parsUserId, yeniAd: yeniAd || null, yeniSifre: yeniSifre || null, tipi: b.tipi ?? null,
      }))
      parsKatalogOnbellekTemizle(serviceId)
      // Hub kaydındaki ad/yetki de güncellensin
      const sb = await getSupabaseServer()
      const guncel: Record<string, unknown> = {}
      if (yeniAd) guncel.username = yeniAd
      if (b.tipi === 0 || b.tipi === 1) guncel.tipi = b.tipi
      if (Object.keys(guncel).length > 0) {
        await sb.schema("hub").from("company_pars_users").update(guncel)
          .eq("company_id", firkod).eq("service_id", serviceId).eq("pars_user_id", parsUserId)
      }
      return NextResponse.json(j)
    }

    if (b.islem === "raporlar") {
      const parsUserId = Number(b.parsUserId)
      if (!firmaIdleri.includes(parsUserId)) {
        return NextResponse.json({ error: "Bu kullanıcı firmaya ait değil" }, { status: 403 })
      }
      const izinli = (b.izinliRaporlar ?? []).map(Number).filter((n) => Number.isInteger(n))
      const j = await calistir(buildParsRaporYaz(hedef.dbPath, hedef.password, parsUserId, izinli), 90)
      return NextResponse.json(j)
    }

    if (b.islem === "data-ekle") {
      const data = (b.data ?? "").trim()
      const tipId = Number(b.tipId)
      if (!data) return NextResponse.json({ error: "Veritabanı adı zorunlu" }, { status: 400 })
      if (!Number.isInteger(tipId) || tipId === 0) {
        return NextResponse.json({ error: "Program tipi seçilmeli" }, { status: 400 })
      }
      if (firmaIdleri.length === 0) {
        return NextResponse.json({ error: "Firmanın Pars kullanıcısı yok" }, { status: 400 })
      }
      const j = await calistir(buildParsDataEkle(hedef.dbPath, hedef.password, {
        data, tipId, firmaKullanicilari: firmaIdleri,
      }), 120)
      parsKatalogOnbellekTemizle(serviceId)
      // Hub'daki data_names alanını tazele
      const sb = await getSupabaseServer()
      const { data: rows } = await sb.schema("hub").from("company_pars_users")
        .select("id, data_names").eq("company_id", firkod).eq("service_id", serviceId)
      for (const r of ((rows ?? []) as { id: number; data_names: string | null }[])) {
        const mevcut = (r.data_names ?? "").split(",").map((x) => x.trim()).filter(Boolean)
        if (mevcut.includes(data)) continue
        await sb.schema("hub").from("company_pars_users")
          .update({ data_names: [...mevcut, data].join(",") }).eq("id", r.id)
      }
      return NextResponse.json(j)
    }

    return NextResponse.json({ error: "Bilinmeyen işlem" }, { status: 400 })
  } catch (err) {
    console.error("[POST /api/setup/pars/firma]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "İşlem başarısız" }, { status: 500 })
  }
}
