/**
 * PUT /api/companies/[firkod]/quota
 * Body: { cpuPct, ramGB, diskGB, dbGB }
 *
 * Firmaya elle (manuel) kota atar. Density barlarında "kullanım / kota"
 * olarak gösterilir. Default değerler "manuel kota yok" anlamına gelir:
 *   CPU=0, RAM=0, Disk=25, DB=1
 * Boş/0 gönderilen alan ilgili default'a çekilir (kotayı kaldırır).
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("company-detail", "write")
  if (gate) return gate
  const { firkod } = await params

  let body: { cpuPct?: number; ramGB?: number; diskGB?: number; dbGB?: number }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 })
  }

  // 0/boş → default (kota yok). Makul aralıklara sıkıştır.
  const cpu  = clamp(Math.round(Number(body.cpuPct) || 0), 0, 100)
  const ram  = clamp(Math.round((Number(body.ramGB)  || 0) * 10) / 10, 0, 1024)
  const disk = clamp(Math.round(Number(body.diskGB) || 25), 1, 100000)
  const db   = clamp(Math.round(Number(body.dbGB)   || 1),  1, 100000)

  try {
    const sb = await getSupabaseServer()
    await sb.schema("hub").from("companies")
      .update({ quota_cpu: cpu, quota_ram: ram, quota_disk: disk, db_quota: db })
      .eq("company_id", firkod)
    return NextResponse.json({ ok: true, quota: { cpuPct: cpu, ramGB: ram, diskGB: disk, dbGB: db } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 })
  }
}
