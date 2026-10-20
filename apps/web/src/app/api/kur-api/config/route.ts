import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { requirePermission } from "@/lib/require-permission"
import { kurApiAyarKaydet, KurApiHatasi } from "@/lib/kur-api"

/**
 * PUT /api/kur-api/config  { degisiklikler: { ANAHTAR: "değer" } }
 *
 * kur-api .env'ine yazar (kur-api yedek alır, doğrular, hata varsa hiçbirini yazmaz) ve değişiklik
 * varsa kur-api kendini yeniden başlatır. Doğrulama hataları alan bazında `hatalar` ile döner.
 */
export async function PUT(req: NextRequest) {
  const gate = await requirePermission("kur-api", "write")
  if (gate) return gate

  const govde = await req.json().catch(() => null) as { degisiklikler?: unknown } | null
  const d = govde?.degisiklikler
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    return NextResponse.json({ error: "Değişiklik listesi yok" }, { status: 400 })
  }
  const degisiklikler: Record<string, string> = {}
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
      return NextResponse.json({ error: `${k}: geçersiz değer` }, { status: 400 })
    }
    degisiklikler[k] = String(v)
  }

  const session = await auth()
  const kim = session?.user?.email ?? session?.user?.name ?? undefined
  try {
    return NextResponse.json(await kurApiAyarKaydet(degisiklikler, kim))
  } catch (e) {
    if (e instanceof KurApiHatasi) {
      const hatalar = (e.detay as { hatalar?: Record<string, string> } | undefined)?.hatalar
      return NextResponse.json({ error: e.message, hatalar }, { status: e.status === 400 ? 400 : 502 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
