import { NextRequest, NextResponse } from "next/server"
import { execute, query } from "@/lib/db"

/* POST /api/vault/[id]/access — erişim logu kaydet */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { action } = await req.json()
    await execute`
      INSERT INTO VaultAccessLog (Id, VaultEntryId, Action)
      VALUES (${crypto.randomUUID()}, ${id}, ${action ?? "view"})
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[POST /api/vault/[id]/access]", err)
    return NextResponse.json({ error: "Erişim kaydedilemedi" }, { status: 500 })
  }
}

/* GET /api/vault/[id]/access — erişim logları */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    interface LogRow { Id: string; Action: string; CreatedAt: string }
    const rows = await query<LogRow[]>`
      SELECT TOP (50) Id, Action,
             CONVERT(NVARCHAR(30), CreatedAt, 120) AS CreatedAt
      FROM VaultAccessLog
      WHERE VaultEntryId = ${id}
      ORDER BY CreatedAt DESC
    `
    return NextResponse.json(rows.map((r) => ({
      id: r.Id, action: r.Action, createdAt: r.CreatedAt,
    })))
  } catch (err) {
    console.error("[GET /api/vault/[id]/access]", err)
    return NextResponse.json({ error: "Erişim logları alınamadı" }, { status: 500 })
  }
}
