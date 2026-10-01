/**
 * GET /api/companies/[firkod]/connect-cihazlar?kullanici=
 *
 * Pusula Connect 2'ye kayıtlı bilgisayarlar (kullanıcı başına): sürüm, son görülme, 2FA durumu.
 */

import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { connectCihazlari } from "@/lib/connect-kodu"

export async function GET(req: NextRequest, { params }: { params: Promise<{ firkod: string }> }) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { firkod } = await params
  const kullanici = req.nextUrl.searchParams.get("kullanici") ?? undefined
  try {
    return NextResponse.json({ cihazlar: await connectCihazlari(firkod, kullanici) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
