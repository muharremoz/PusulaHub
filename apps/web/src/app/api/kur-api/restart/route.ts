import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { requirePermission } from "@/lib/require-permission"
import { kurApiYenidenBaslat } from "@/lib/kur-api"

/** POST /api/kur-api/restart — kur-api'yi ayar değiştirmeden yeniden başlatır (~3 sn kesinti). */
export async function POST() {
  const gate = await requirePermission("kur-api", "write")
  if (gate) return gate

  const session = await auth()
  try {
    return NextResponse.json(await kurApiYenidenBaslat(session?.user?.email ?? session?.user?.name ?? undefined))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
