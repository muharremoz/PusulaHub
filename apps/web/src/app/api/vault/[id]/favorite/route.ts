import { NextRequest, NextResponse } from "next/server"
import { execute } from "@/lib/db"

/* PATCH /api/vault/[id]/favorite — favori toggle */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await execute`
      UPDATE VaultEntries
      SET IsFavorite = CASE WHEN IsFavorite = 1 THEN 0 ELSE 1 END
      WHERE Id = ${id}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/vault/[id]/favorite]", err)
    return NextResponse.json({ error: "Favori güncellenemedi" }, { status: 500 })
  }
}
