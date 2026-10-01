/** POST /api/connect/kodlar/[id] — kurulum kodunu (ve bu kodla kaydolan cihazları) iptal eder. */
import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { auth } from "@/auth"
import { connectKodIptal } from "@/lib/connect-yonetim"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { id } = await params
  const session = await auth()
  try {
    await connectKodIptal(id, session?.user?.username ?? session?.user?.email ?? null)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
