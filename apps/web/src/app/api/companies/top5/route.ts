import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

export interface Top5Company {
  id: string; name: string; status: "active" | "suspended" | "trial"
  yogunluk: number; userCount: number; userCapacity: number; dbCount: number
}

interface CompanyRow {
  company_id: string; name: string; status: string
  user_count: number; user_capacity: number
  usage_cpu: number; quota_cpu: number; usage_ram: number; quota_ram: number
  usage_disk: number; quota_disk: number; db_quota: number
  DbSizeMB: number; DbCount: number
}

function pct(usage: number, quota: number): number {
  if (!quota || quota <= 0) return 0
  return Math.min(100, Math.round((usage / quota) * 100))
}

function calcYogunluk(r: CompanyRow): number {
  const userPct = pct(r.user_count, r.user_capacity)
  const cpuPct  = pct(r.usage_cpu,  r.quota_cpu)
  const ramPct  = pct(r.usage_ram,  r.quota_ram)
  const diskPct = pct(r.usage_disk, r.quota_disk)
  const dbPct   = pct(r.DbSizeMB / 1024, r.db_quota)

  const active = [r.user_capacity > 0, r.quota_cpu > 0, r.quota_ram > 0, r.quota_disk > 0, r.db_quota > 0].filter(Boolean).length
  if (active === 0) return userPct

  const sum = (r.user_capacity > 0 ? userPct : 0) + (r.quota_cpu > 0 ? cpuPct : 0)
            + (r.quota_ram > 0 ? ramPct : 0) + (r.quota_disk > 0 ? diskPct : 0) + (r.db_quota > 0 ? dbPct : 0)
  return Math.round(sum / active)
}

export async function GET() {
  try {
    const sb = await getSupabaseServer()
    // Yalnız yoğunluğu >0 olabilecek adaylar (kota/kapasite tanımlı) — 5758 firmayı çekme.
    const [{ data: comps }, { data: dbs }] = await Promise.all([
      sb.schema("hub").from("companies")
        .select("company_id, name, status, user_count, user_capacity, usage_cpu, quota_cpu, usage_ram, quota_ram, usage_disk, quota_disk, db_quota")
        .not("company_id", "is", null)
        .or("user_capacity.gt.0,quota_cpu.gt.0,quota_ram.gt.0,quota_disk.gt.0,db_quota.gt.0"),
      sb.schema("hub").from("sql_databases").select("firma_no, size_mb"),
    ])

    const dbAgg = new Map<string, { mb: number; cnt: number }>()
    for (const d of (dbs ?? []) as { firma_no: string | null; size_mb: number }[]) {
      if (!d.firma_no) continue
      const a = dbAgg.get(d.firma_no) ?? { mb: 0, cnt: 0 }
      a.mb += d.size_mb ?? 0; a.cnt += 1; dbAgg.set(d.firma_no, a)
    }

    const top5: Top5Company[] = ((comps ?? []) as Omit<CompanyRow, "DbSizeMB" | "DbCount">[])
      .map((c) => {
        const agg = dbAgg.get(c.company_id) ?? { mb: 0, cnt: 0 }
        const r: CompanyRow = { ...c, DbSizeMB: agg.mb, DbCount: agg.cnt }
        return {
          id: r.company_id, name: r.name, status: r.status as Top5Company["status"],
          yogunluk: calcYogunluk(r), userCount: r.user_count, userCapacity: r.user_capacity, dbCount: r.DbCount,
        }
      })
      .sort((a, b) => b.yogunluk - a.yogunluk)
      .slice(0, 5)

    const resp = NextResponse.json(top5)
    resp.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60")
    return resp
  } catch (err) {
    console.error("[GET /api/companies/top5]", err)
    return NextResponse.json({ error: "Top 5 firma alınamadı" }, { status: 500 })
  }
}
