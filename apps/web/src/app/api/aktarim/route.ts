/**
 * GET  /api/aktarim   → admin: aktarım listesi (Ubuntu'dan proxy)
 * POST /api/aktarim   → admin: yeni aktarım oluştur (Ubuntu'ya forward)
 *
 * Aktarım state'i artık Ubuntu (10.15.2.6) SQLite'ında tutuluyor.
 * Hub yalnızca admin UI sunar ve isteği VPN üzerinden Ubuntu'ya proxy eder.
 */

import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { auth } from "@/auth"
import { listSessions, createSession, type CreateInput } from "@/lib/aktarim-proxy"

export async function GET() {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  try {
    const list = await listSessions()
    return NextResponse.json(list)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const session = await auth()
  const createdBy = session?.user?.username ?? session?.user?.email ?? null

  let body: CreateInput
  try { body = (await req.json()) as CreateInput } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 })
  }
  if (!body.companyId || !body.firmaName) {
    return NextResponse.json({ error: "companyId ve firmaName zorunludur" }, { status: 400 })
  }

  try {
    const sess = await createSession({ ...body, createdBy })
    return NextResponse.json(sess)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
