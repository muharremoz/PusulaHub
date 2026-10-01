/**
 * POST /api/companies/[firkod]/connect-kodu  { kullanici }
 *
 * Pusula Connect 2 için tek kullanımlık kurulum kodu (7 gün geçerli). Kurulum
 * paketinin (GET .../kurulum) kodla dağıtılan karşılığı; mantık lib/connect-kodu.ts'te.
 * Kod yalnız bu yanıtta döner — servis yalnız özetini saklar.
 */

import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { auth } from "@/auth"
import { getSupabaseServer } from "@/lib/supabase/server"
import { connectKoduUret } from "@/lib/connect-kodu"

export async function POST(req: NextRequest, { params }: { params: Promise<{ firkod: string }> }) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { firkod } = await params
  const b = (await req.json().catch(() => ({}))) as { kullanici?: string }
  const kullanici = String(b.kullanici ?? "").trim()

  const session = await auth()
  const olusturan = session?.user?.username ?? session?.user?.email ?? null
  const sb = await getSupabaseServer()
  const { data: firma } = await sb.schema("hub").from("companies").select("name").eq("company_id", firkod).maybeSingle()

  try {
    const sonuc = await connectKoduUret(firkod, (firma as { name?: string } | null)?.name ?? firkod, kullanici, olusturan)
    if (!sonuc.ok) return NextResponse.json({ error: sonuc.hata }, { status: sonuc.kod })
    return NextResponse.json({ kod: sonuc.kod, indir: sonuc.indir })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 })
  }
}
