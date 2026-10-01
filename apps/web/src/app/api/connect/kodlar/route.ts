/** GET /api/connect/kodlar?firma= — Connect kurulum kodları (son 500). */
import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { connectKodlar } from "@/lib/connect-yonetim"

export async function GET(req: NextRequest) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  try {
    return NextResponse.json(await connectKodlar(req.nextUrl.searchParams.get("firma") ?? undefined))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
