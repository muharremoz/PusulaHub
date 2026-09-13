/**
 * POST /api/aktarim/[id]/retry → admin: yarıda kalan aktarımı yeniden dener
 * (Ubuntu'daki aktarım servisine proxy).
 */

import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { retryPush } from "@/lib/aktarim-proxy"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("aktarim", "write")
  if (gate) return gate
  const { id } = await params
  try {
    await retryPush(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
