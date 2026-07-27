import { NextRequest, NextResponse } from "next/server"
import { fetchKumaMonitors } from "@/lib/kuma"

/**
 * Altyapı durumu — ÖZET. Alt uygulamalar (CRM) için.
 *
 * Auth: x-internal-key (Hub middleware `/api/hub/*` yolunu kapıdan muaf tutar).
 *
 * Amaç: destek personeli müşteri "program açılmıyor" dediğinde 3 saniyede
 * "bizde mi, onda mı?" sorusuna cevap versin. Bu yüzden yanıt BİLEREK dar:
 * ham monitör listesi değil, tek bir genel karar + sorunlu olanlar.
 *
 * Yanıt: { durum, toplam, calisan, sorunlu: [{ ad, tip, sonYanitMs }], zaman }
 *   durum: "normal" | "kismi" | "sorunlu" | "bilinmiyor"
 */
export async function GET(req: NextRequest) {
  const sentKey = req.headers.get("x-internal-key")
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  if (!sentKey || sentKey !== expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  try {
    const monitors = await fetchKumaMonitors()
    const toplam = monitors.length
    const down = monitors.filter((m) => m.status === "down")
    const pending = monitors.filter((m) => m.status === "pending")
    const calisan = monitors.filter((m) => m.status === "up").length

    // Karar: hiç monitör yoksa "bilinmiyor" (veri yokluğunu "her şey yolunda"
    // diye göstermek en tehlikeli yanlış — personel yanlış güvenle cevap verir).
    const durum =
      toplam === 0 ? "bilinmiyor" : down.length > 0 ? "sorunlu" : pending.length > 0 ? "kismi" : "normal"

    return NextResponse.json(
      {
        durum,
        toplam,
        calisan,
        sorunlu: [...down, ...pending].map((m) => ({
          ad: m.name,
          tip: m.type,
          bekliyor: m.status === "pending",
          sonYanitMs: m.responseMs != null && m.responseMs >= 0 ? m.responseMs : null,
        })),
        zaman: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    // Kuma'ya ulaşılamıyor → "normal" DEME. Bilinmiyor de.
    return NextResponse.json(
      {
        durum: "bilinmiyor",
        toplam: 0,
        calisan: 0,
        sorunlu: [],
        hata: e instanceof Error ? e.message : "İzleme sistemine ulaşılamadı",
        zaman: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  }
}
