import { NextResponse } from "next/server"
import { query } from "@/lib/db"

export interface CompanyDetail {
  usageCpu:    number
  quotaCpu:    number
  usageRam:    number   // GB
  quotaRam:    number   // GB
  usageDisk:   number   // GB
  quotaDisk:   number   // GB
  userCount:   number
  userCapacity:number
  dbSizeMB:    number
  dbQuota:     number   // GB
  weeklyUsage: { day: string; cpu: number; ram: number; disk: number }[]
}

interface CompanyRow {
  UsageCpu:    number
  QuotaCpu:    number
  UsageRam:    number
  QuotaRam:    number
  UsageDisk:   number
  QuotaDisk:   number
  UserCount:   number
  UserCapacity:number
  DbQuota:     number
  DbSizeMB:    number
}

interface WeeklyRow {
  Day:      string
  DayOrder: number
  CPU:      number
  RAM:      number
  Disk:     number
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const [compRows, weekRows] = await Promise.all([
      query<CompanyRow[]>`
        SELECT
          c.UsageCpu, c.QuotaCpu,
          c.UsageRam, c.QuotaRam,
          c.UsageDisk, c.QuotaDisk,
          c.UserCount, c.UserCapacity,
          c.DbQuota,
          ISNULL((
            SELECT SUM(sd.SizeMB)
            FROM SQLDatabases sd
            WHERE sd.FirmaNo = c.CompanyId
          ), 0) AS DbSizeMB
        FROM Companies c
        WHERE c.CompanyId = ${firkod}
      `,
      query<WeeklyRow[]>`
        SELECT w.Day, w.DayOrder, w.CPU, w.RAM, w.Disk
        FROM CompanyWeeklyUsage w
        JOIN Companies c ON c.Id = w.CompanyId
        WHERE c.CompanyId = ${firkod}
        ORDER BY w.DayOrder
      `,
    ])

    if (!compRows.length) {
      return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 })
    }

    const c = compRows[0]
    const detail: CompanyDetail = {
      usageCpu:    c.UsageCpu    ?? 0,
      quotaCpu:    c.QuotaCpu    ?? 0,
      usageRam:    c.UsageRam    ?? 0,
      quotaRam:    c.QuotaRam    ?? 0,
      usageDisk:   c.UsageDisk   ?? 0,
      quotaDisk:   c.QuotaDisk   ?? 0,
      userCount:   c.UserCount   ?? 0,
      userCapacity:c.UserCapacity ?? 0,
      dbSizeMB:    c.DbSizeMB    ?? 0,
      dbQuota:     c.DbQuota     ?? 0,
      weeklyUsage: weekRows.map((r) => ({
        day:  r.Day,
        cpu:  r.CPU,
        ram:  r.RAM,
        disk: r.Disk,
      })),
    }

    return NextResponse.json(detail)
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/detail]", err)
    return NextResponse.json({ error: "Firma detayı alınamadı" }, { status: 500 })
  }
}
