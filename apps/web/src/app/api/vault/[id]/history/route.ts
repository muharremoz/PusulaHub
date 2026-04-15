import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { decrypt } from "@/lib/crypto"

/* GET /api/vault/[id]/history — şifre geçmişi */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    interface HistoryRow { Id: string; Password: string; ChangedAt: string }
    const rows = await query<HistoryRow[]>`
      SELECT Id, Password,
             CONVERT(NVARCHAR(30), ChangedAt, 120) AS ChangedAt
      FROM VaultPasswordHistory
      WHERE VaultEntryId = ${id}
      ORDER BY ChangedAt DESC
    `
    return NextResponse.json(rows.map((r) => ({
      id:        r.Id,
      password:  decrypt(r.Password) ?? "***",
      changedAt: r.ChangedAt,
    })))
  } catch (err) {
    console.error("[GET /api/vault/[id]/history]", err)
    return NextResponse.json({ error: "Şifre geçmişi alınamadı" }, { status: 500 })
  }
}
