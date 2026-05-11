/**
 * GET  /api/aktarim         → admin: aktarım listesi
 * POST /api/aktarim         → admin: yeni aktarım oluştur (token üret)
 */

import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { auth } from "@/auth"
import { createTransferSession, listTransferSessions } from "@/lib/transfer-sessions"

export async function GET() {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const list = await listTransferSessions(200)
  return NextResponse.json(list)
}

interface CreateBody {
  companyId:     string
  firmaName:     string
  sqlServerId?:  string | null
  depoServerId?: string | null
  expiresInDays?: number
  notes?:        string | null
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate

  const session = await auth()
  const createdBy = session?.user?.username ?? session?.user?.email ?? null

  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 })
  }

  if (!body.companyId || !body.firmaName) {
    return NextResponse.json({ error: "companyId ve firmaName zorunludur" }, { status: 400 })
  }

  try {
    const sess = await createTransferSession({
      companyId:     body.companyId,
      firmaName:     body.firmaName,
      sqlServerId:   body.sqlServerId ?? null,
      depoServerId:  body.depoServerId ?? null,
      expiresInDays: body.expiresInDays,
      createdBy,
      notes:         body.notes ?? null,
    })
    return NextResponse.json(sess)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
