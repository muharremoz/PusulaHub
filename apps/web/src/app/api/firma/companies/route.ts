import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { syncFirmalarNow } from "@/lib/firma-sync"

export interface FirmaCompany {
  id: string; firkod: string; firma: string; email: string; phone: string
  userCount: number; licenseCount: number; lisansBitis: string
}

interface CompanyRow {
  company_id: string; name: string; contact_email: string | null; contact_phone: string | null
  user_count: number; ad_server_id: string | null; contract_end: string | null
}

export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams
    const sync = params.get("sync") === "true"
    const all  = params.get("all") === "true"
    if (sync) { try { await syncFirmalarNow() } catch (e) { console.error("[firma/companies] sync hata:", e) } }

    const sb = await getSupabaseServer()
    const COLS = "company_id, name, contact_email, contact_phone, user_count, ad_server_id, contract_end"

    /*
     * ⚠ PostgREST'in `max-rows` ayarı (varsayılan 1000) sunucu tarafında
     * uygulanır — `.limit(10000)` bunu AŞMAZ, sessizce 1000'de keser. Hata
     * dönmez, sadece eksik veri gelir.
     *
     * Yaşandı: hub.companies 5797 satırken liste alfabetik ilk 1000'de
     * ("ANTALYA BERİL KUYUM.") kesiliyordu; kurulum sihirbazında sonraki
     * firmalar hiç görünmüyor, "Yenile" de bir şey değiştirmiyordu (sync
     * çalışıyordu, kesilen okuma tarafıydı).
     *
     * Çözüm: `.range()` ile sayfalayarak hepsini çek. Sıralamaya
     * `company_id` tiebreaker'ı ekli — aynı ada sahip firmalarda sayfa
     * sınırında kayıt atlanmasın/tekrarlanmasın.
     */
    const PAGE = 1000
    const MAX_ROWS = 50_000  // güvenlik freni — sonsuz döngüye karşı

    const fetchAllCompanies = async (): Promise<CompanyRow[]> => {
      const out: CompanyRow[] = []
      for (let from = 0; from < MAX_ROWS; from += PAGE) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (sb.schema("hub").from("companies") as any)
          .select(COLS)
          .not("company_id", "is", null)
        if (!all) q = q.not("ad_server_id", "is", null)
        const { data, error: pErr } = await q
          .order("name")
          .order("company_id")
          .range(from, from + PAGE - 1)
        if (pErr) throw pErr
        const batch = (data ?? []) as CompanyRow[]
        out.push(...batch)
        if (batch.length < PAGE) break
      }
      return out
    }

    const [comps, { data: adu }] = await Promise.all([
      fetchAllCompanies(),
      // ad_users şu an ~58 satır; max-rows sınırının çok altında. Tablo
      // binleri geçerse buraya da sayfalama gerekir.
      sb.schema("hub").from("ad_users").select("ou"),
    ])
    // Kurulu firmada userCount = ad_users OU sayımı; değilse lisans (company.user_count)
    const ouCnt = new Map<string, number>()
    for (const a of (adu ?? []) as { ou: string }[]) ouCnt.set(a.ou, (ouCnt.get(a.ou) ?? 0) + 1)

    const companies: FirmaCompany[] = ((comps ?? []) as CompanyRow[]).map((c) => ({
      id: c.company_id, firkod: c.company_id, firma: c.name,
      email: c.contact_email ?? "", phone: c.contact_phone ?? "",
      userCount: c.ad_server_id ? (ouCnt.get(c.company_id) ?? 0) : (c.user_count ?? 0),
      licenseCount: c.user_count ?? 0,
      lisansBitis: c.contract_end ? c.contract_end.slice(0, 10) : "",
    }))

    const resp = NextResponse.json(companies)
    resp.headers.set("Cache-Control", "no-store")
    return resp
  } catch (err) {
    console.error("[GET /api/firma/companies]", err)
    return NextResponse.json({ error: "Firma verileri alınamadı" }, { status: 500 })
  }
}
