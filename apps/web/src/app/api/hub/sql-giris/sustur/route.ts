import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { icAnahtarKapisi } from "@/lib/hub-ic-anahtar"
import { SUSTUR_KAPSAM } from "@/lib/sql-giris-izleme"

/**
 * POST /api/hub/sql-giris/sustur — SQL hatalı giriş push'larını sustur / aç (29.10.2026).
 * Gövde: { kapsam: "hepsi" | "destek" | "k:<kullanıcı>", dakika: number (0 = kaldır), kim?: string }
 * Kayıt toplamaya devam eder; yalnız uyarı gönderilmez. En fazla 7 gün.
 */
export const dynamic = "force-dynamic"

const EN_FAZLA_DK = 7 * 24 * 60

export async function POST(req: NextRequest) {
  const kapi = icAnahtarKapisi(req)
  if (kapi) return kapi

  const g = (await req.json().catch(() => null)) as { kapsam?: unknown; dakika?: unknown; kim?: unknown } | null
  const kapsam = typeof g?.kapsam === "string" ? g.kapsam.trim().toLowerCase() : ""
  const dakika = typeof g?.dakika === "number" ? Math.floor(g.dakika) : NaN
  if (!SUSTUR_KAPSAM.test(kapsam)) return NextResponse.json({ error: "Geçersiz kapsam" }, { status: 400 })
  if (!(dakika >= 0 && dakika <= EN_FAZLA_DK)) return NextResponse.json({ error: "Süre 0–7 gün olmalı" }, { status: 400 })

  const sb = getSupabaseAdmin().schema("hub")
  const { error } =
    dakika === 0
      ? await sb.from("sql_giris_sustur").delete().eq("kapsam", kapsam)
      : await sb.from("sql_giris_sustur").upsert({
          kapsam,
          bitis: new Date(Date.now() + dakika * 60_000).toISOString(),
          kim: typeof g?.kim === "string" ? g.kim.slice(0, 120) : null,
          olusturma: new Date().toISOString(),
        })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  console.log(`[SqlGiris] susturma ${dakika === 0 ? "kaldırıldı" : `${dakika} dk`}: ${kapsam}`)
  return NextResponse.json({ ok: true })
}
