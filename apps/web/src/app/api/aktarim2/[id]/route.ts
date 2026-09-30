/**
 * GET    /api/aktarim2/:id  → oturum ayrıntısı + keşif raporu
 * POST   /api/aktarim2/:id  → { islem: "iptal" }
 * DELETE /api/aktarim2/:id  → kaydı sil
 */

import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { iptal, oturum, sil } from "@/lib/aktarim2-proxy"

type Ctx = { params: Promise<{ id: string }> }

function hata(err: unknown) {
  return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requirePermission("aktarim", "read")
  if (gate) return gate
  const { id } = await params
  try { return NextResponse.json(await oturum(id)) } catch (err) { return hata(err) }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requirePermission("aktarim", "write")
  if (gate) return gate
  const { id } = await params
  const b = (await req.json().catch(() => ({}))) as { islem?: string }
  if (b.islem !== "iptal") return NextResponse.json({ error: "Bilinmeyen işlem" }, { status: 400 })
  try { return NextResponse.json(await iptal(id)) } catch (err) { return hata(err) }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const gate = await requirePermission("aktarim", "write")
  if (gate) return gate
  const { id } = await params
  try { return NextResponse.json(await sil(id)) } catch (err) { return hata(err) }
}
