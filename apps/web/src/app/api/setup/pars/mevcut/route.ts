import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import { parsHedefYukle, parsMevcutKullanicilar } from "@/lib/pars-service"
import type { ParsMevcutKullanici } from "@/lib/pars-katalog"

/**
 * /api/setup/pars/mevcut
 *
 * GET  ?serviceId=  → Ayar.mdb'de var olan Pars kullanıcıları, gördükleri
 *                     datalar, datadan tespit edilen firma kodu, firmanın
 *                     Hub'daki adı ve zaten aktarılmış olup olmadığı.
 * POST { serviceId, kayitlar: [{ parsUserId, username, tipi, companyId, datalar }] }
 *                   → seçilenleri hub.company_pars_users'a yazar.
 *
 * Pars'ta yıllardır kayıtlı firmalar Hub'da görünmüyordu: Hub yalnız kendi
 * yazdıklarını biliyor. Bu uç, var olanı bir kere eşleştirip kaydeder.
 * Ayar.mdb'ye HİÇBİR ŞEY yazılmaz — yalnız Hub tarafı.
 */

export const dynamic = "force-dynamic"

export interface ParsMevcutSatir extends ParsMevcutKullanici {
  /** firmaKodlari[0] için hub.companies'teki ad; yoksa null */
  firmaAdi: string | null
  /** Firma kodu Hub'da kayıtlı mı */
  firmaVar: boolean
}

export async function GET(req: NextRequest) {
  const gate = await requirePermission("services", "read")
  if (gate) return gate
  const serviceId = Number(req.nextUrl.searchParams.get("serviceId"))
  if (!Number.isFinite(serviceId) || serviceId <= 0) {
    return NextResponse.json({ error: "serviceId zorunlu" }, { status: 400 })
  }
  try {
    const h = await parsHedefYukle(serviceId)
    if (!h.ok) return NextResponse.json({ error: h.error }, { status: 400 })
    const m = await parsMevcutKullanicilar(h.hedef)
    if (!m.ok) return NextResponse.json({ error: m.error }, { status: 502 })

    // Tespit edilen (ve tahmin edilen) firma kodlarının Hub'daki adları
    const kodlar = [...new Set(m.users.flatMap((u) => [...u.firmaKodlari, ...(u.firmaTahmini ? [u.firmaTahmini.kod] : [])]))]
    const adByKod = new Map<string, string>()
    if (kodlar.length > 0) {
      const sb = await getSupabaseServer()
      const { data } = await sb.schema("hub").from("companies")
        .select("company_id, name").in("company_id", kodlar)
      for (const c of ((data ?? []) as { company_id: string; name: string }[])) adByKod.set(c.company_id, c.name)
    }

    const satirlar: ParsMevcutSatir[] = m.users.map((u) => {
      const kod = u.firmaKodlari[0] ?? null
      return { ...u, firmaAdi: kod ? adByKod.get(kod) ?? null : null, firmaVar: !!(kod && adByKod.has(kod)) }
    })
    return NextResponse.json({ baglanti: h.hedef.baglanti, users: satirlar })
  } catch (err) {
    console.error("[GET /api/setup/pars/mevcut]", err)
    return NextResponse.json({ error: "Pars kullanıcıları alınamadı" }, { status: 500 })
  }
}

interface AktarPayload {
  serviceId?: number
  kayitlar?: { parsUserId?: number; username?: string; tipi?: number; companyId?: string; datalar?: string[] }[]
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission("services", "write")
  if (gate) return gate
  try {
    const body = (await req.json()) as AktarPayload
    const serviceId = Number(body.serviceId)
    if (!Number.isFinite(serviceId) || serviceId <= 0) {
      return NextResponse.json({ error: "serviceId zorunlu" }, { status: 400 })
    }
    const kayitlar = (body.kayitlar ?? []).filter((k) => k.companyId && k.username && Number.isInteger(Number(k.parsUserId)))
    if (kayitlar.length === 0) return NextResponse.json({ error: "Aktarılacak kayıt yok" }, { status: 400 })

    const sb = await getSupabaseServer()
    // Zaten aktarılmış olanı tekrar yazma (pars_user_id benzersiz kabul edilir)
    const { data: mevcut } = await sb.schema("hub").from("company_pars_users")
      .select("pars_user_id").eq("service_id", serviceId)
    const varOlan = new Set(((mevcut ?? []) as { pars_user_id: number | null }[]).map((x) => Number(x.pars_user_id)))

    const eklenecek = kayitlar
      .filter((k) => !varOlan.has(Number(k.parsUserId)))
      .map((k) => ({
        company_id:   String(k.companyId),
        service_id:   serviceId,
        username:     String(k.username),
        tipi:         Number(k.tipi) === 1 ? 1 : 0,
        pars_user_id: Number(k.parsUserId),
        data_names:   (k.datalar ?? []).length ? (k.datalar ?? []).join(",") : null,
      }))

    if (eklenecek.length === 0) return NextResponse.json({ eklenen: 0, atlanan: kayitlar.length })
    const { error } = await sb.schema("hub").from("company_pars_users").insert(eklenecek)
    if (error) throw error
    return NextResponse.json({ eklenen: eklenecek.length, atlanan: kayitlar.length - eklenecek.length })
  } catch (err) {
    console.error("[POST /api/setup/pars/mevcut]", err)
    return NextResponse.json({ error: "Aktarım başarısız" }, { status: 500 })
  }
}
