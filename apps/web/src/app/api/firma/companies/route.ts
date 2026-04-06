import { NextResponse } from "next/server"
import { query } from "@/lib/db"

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

export async function GET() {
  try {
    const rows = await query<CompanyRow[]>`
      SELECT CompanyId, Name, ContactEmail, ContactPhone, UserCount, CONVERT(NVARCHAR(20), ContractEnd, 23) AS ContractEnd
      FROM Companies
      WHERE CompanyId IS NOT NULL
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
    resp.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60")
    return resp
  } catch (err) {
    console.error("[GET /api/firma/companies]", err)
    return NextResponse.json({ error: "Firma verileri alınamadı" }, { status: 500 })
  }
}
