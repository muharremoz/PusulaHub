import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export interface Top5Company {
  id:           string
  name:         string
  status:       "active" | "suspended" | "trial"
  yogunluk:     number   // 0–100
  userCount:    number
  userCapacity: number
  dbCount:      number
}

interface CompanyRow {
  CompanyId:    string
  Name:         string
  Status:       string
  UserCount:    number
  UserCapacity: number
  UsageCpu:     number
  QuotaCpu:     number
  UsageRam:     number
  QuotaRam:     number
  UsageDisk:    number
  QuotaDisk:    number
  DbQuota:      number
  DbSizeMB:     number
  DbCount:      number
}

function pct(usage: number, quota: number): number {
  if (!quota || quota <= 0) return 0
  return Math.min(100, Math.round((usage / quota) * 100))
}

function calcYogunluk(r: CompanyRow): number {
  const userPct = pct(r.UserCount, r.UserCapacity)
  const cpuPct  = pct(r.UsageCpu,  r.QuotaCpu)
  const ramPct  = pct(r.UsageRam,  r.QuotaRam)
  const diskPct = pct(r.UsageDisk, r.QuotaDisk)
  const dbPct   = pct(r.DbSizeMB / 1024, r.DbQuota)   // MB → GB

  // Kaç metrik gerçekten kota tanımlı?
  const active = [
    r.UserCapacity > 0,
    r.QuotaCpu  > 0,
    r.QuotaRam  > 0,
    r.QuotaDisk > 0,
    r.DbQuota   > 0,
  ].filter(Boolean).length

  if (active === 0) return userPct  // en azından kullanıcı oranı

  const sum = (r.UserCapacity > 0 ? userPct : 0)
            + (r.QuotaCpu  > 0 ? cpuPct  : 0)
            + (r.QuotaRam  > 0 ? ramPct  : 0)
            + (r.QuotaDisk > 0 ? diskPct : 0)
            + (r.DbQuota   > 0 ? dbPct   : 0)

  return Math.round(sum / active)
}

export async function GET() {
  try {
    const rows = await query<CompanyRow[]>`
      SELECT
        c.CompanyId,
        c.Name,
        c.Status,
        c.UserCount,
        c.UserCapacity,
        c.UsageCpu,
        c.QuotaCpu,
        c.UsageRam,
        c.QuotaRam,
        c.UsageDisk,
        c.QuotaDisk,
        c.DbQuota,
        ISNULL((
          SELECT SUM(sd.SizeMB)
          FROM SQLDatabases sd
          WHERE sd.FirmaNo = c.CompanyId
        ), 0) AS DbSizeMB,
        ISNULL((
          SELECT COUNT(*)
          FROM SQLDatabases sd
          WHERE sd.FirmaNo = c.CompanyId
        ), 0) AS DbCount
      FROM Companies c
      WHERE c.CompanyId IS NOT NULL
    `

    const top5: Top5Company[] = rows
      .map((r: CompanyRow) => ({
        id:           r.CompanyId,
        name:         r.Name,
        status:       (r.Status as "active" | "suspended" | "trial"),
        yogunluk:     calcYogunluk(r),
        userCount:    r.UserCount,
        userCapacity: r.UserCapacity,
        dbCount:      r.DbCount,
      }))
      .sort((a: Top5Company, b: Top5Company) => b.yogunluk - a.yogunluk)
      .slice(0, 5)

    const resp = NextResponse.json(top5)
    resp.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60")
    return resp
  } catch (err) {
    console.error("[GET /api/companies/top5]", err)
    return NextResponse.json({ error: "Top 5 firma alınamadı" }, { status: 500 })
  }
}
