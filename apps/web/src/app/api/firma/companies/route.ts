import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { syncFirmalarNow } from "@/lib/firma-sync"

export interface FirmaCompany {
  id:          string
  firkod:      string
  firma:       string
  email:       string
  phone:       string
  userCount:   number
  lisansBitis: string
}

interface CompanyRow {
  CompanyId:   string
  Name:        string
  ContactEmail: string | null
  ContactPhone: string | null
  UserCount:   number
  ContractEnd: string | null
}

export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams
    const sync   = params.get("sync") === "true"
    // all=true → kurulmamis firmalari da dondur (sihirbaz step 1'de ihtiyac var)
    const all    = params.get("all") === "true"
    if (sync) {
      try { await syncFirmalarNow() } catch (e) { console.error("[firma/companies] sync hata:", e) }
    }
    const rows = all
      ? await query<CompanyRow[]>`
          SELECT CompanyId, Name, ContactEmail, ContactPhone, UserCount, CONVERT(NVARCHAR(20), ContractEnd, 23) AS ContractEnd
          FROM Companies
          WHERE CompanyId IS NOT NULL
          ORDER BY Name
        `
      : await query<CompanyRow[]>`
          SELECT CompanyId, Name, ContactEmail, ContactPhone, UserCount, CONVERT(NVARCHAR(20), ContractEnd, 23) AS ContractEnd
          FROM Companies
          WHERE CompanyId IS NOT NULL AND AdServerId IS NOT NULL
          ORDER BY Name
        `

    const companies: FirmaCompany[] = rows.map((r) => ({
      id:          r.CompanyId,
      firkod:      r.CompanyId,
      firma:       r.Name,
      email:       r.ContactEmail ?? "",
      phone:       r.ContactPhone ?? "",
      userCount:   r.UserCount,
      lisansBitis: r.ContractEnd ?? "",
    }))

    const resp = NextResponse.json(companies)
    resp.headers.set("Cache-Control", "no-store")
    return resp
  } catch (err) {
    console.error("[GET /api/firma/companies]", err)
    return NextResponse.json({ error: "Firma verileri alınamadı" }, { status: 500 })
  }
}
