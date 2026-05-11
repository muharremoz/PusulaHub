/**
 * POST   /api/aktarim/[id]  → admin: iptal et (Status='cancelled')
 * DELETE /api/aktarim/[id]  → admin: sil
 */

import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { cancelTransferSession, deleteTransferSession } from "@/lib/transfer-sessions"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { id } = await params
  await cancelTransferSession(id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { id } = await params
  await deleteTransferSession(id)
  return NextResponse.json({ ok: true })
}
