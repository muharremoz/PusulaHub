/**
 * POST   /api/aktarim/[id]   → admin: iptal (Ubuntu'ya proxy)
 * DELETE /api/aktarim/[id]   → admin: sil (Ubuntu'ya proxy)
 */

import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { cancelSession, deleteSession } from "@/lib/aktarim-proxy"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { id } = await params
  try {
    await cancelSession(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("companies", "write")
  if (gate) {
    console.error("[aktarim/DELETE] permission denied")
    return gate
  }
  const { id } = await params
  try {
    console.log("[aktarim/DELETE] deleting session:", id)
    await deleteSession(id)
    console.log("[aktarim/DELETE] success:", id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Hata"
    console.error("[aktarim/DELETE] error:", msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
