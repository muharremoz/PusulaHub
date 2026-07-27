import { NextRequest, NextResponse } from "next/server"
import { fetchKumaMonitors, type KumaMonitor } from "@/lib/kuma"

/**
 * Altyapı durumu — ÖZET. Alt uygulamalar (CRM) için.
 *
 * Auth: x-internal-key (Hub middleware `/api/hub/*` yolunu kapıdan muaf tutar).
 *
 * Amaç: destek personeli müşteri "program açılmıyor" dediğinde 3 saniyede
 * "bizde mi, onda mı?" sorusuna cevap versin. Bu yüzden yanıt BİLEREK dar:
 * ham monitör listesi değil, karar + sorunlular.
 *
 * İki grup ayrı raporlanır çünkü sonuçları farklı: döviz kaynağı düşerse
 * kurlar bayatlar (program çalışmaya devam eder), sunucu düşerse program
 * hiç açılmaz. Personelin müşteriye söyleyeceği şey değişir.
 */

/** Kuma'da döviz kaynağı monitörleri bu önekle adlandırılır (/tv ile aynı kural). */
const DOVIZ_ONEKI = "Döviz - "

type Durum = "normal" | "kismi" | "sorunlu" | "bilinmiyor"

interface Sistem {
  ad: string
  tip: string
  /** up | down | pending | diger */
  hal: string
  sonYanitMs: number | null
}

interface Grup {
  durum: Durum
  toplam: number
  calisan: number
  /** Grubun TUM sistemleri — sorunlular basta. Personel neyin izlendigini
   *  gormek istiyor; yalnizca arizalari gostermek "hangi sistemler var?"
   *  sorusunu cevapsiz birakiyordu. */
  sistemler: Sistem[]
}

function grupla(monitors: KumaMonitor[], adiSadelestir: (n: string) => string): Grup {
  const toplam = monitors.length
  const down = monitors.filter((m) => m.status === "down")
  const pending = monitors.filter((m) => m.status === "pending")
  const calisan = monitors.filter((m) => m.status === "up").length

  // Monitör yoksa "bilinmiyor" — veri yokluğunu "her şey yolunda" diye
  // göstermek en tehlikeli yanlış olurdu.
  const durum: Durum =
    toplam === 0 ? "bilinmiyor" : down.length > 0 ? "sorunlu" : pending.length > 0 ? "kismi" : "normal"

  const sirala = (m: KumaMonitor) => (m.status === "down" ? 0 : m.status === "pending" ? 1 : 2)

  return {
    durum,
    toplam,
    calisan,
    sistemler: [...monitors]
      .sort((a, b) => sirala(a) - sirala(b) || a.name.localeCompare(b.name, "tr"))
      .map((m) => ({
        ad: adiSadelestir(m.name),
        tip: m.type,
        hal: m.status,
        sonYanitMs: m.responseMs != null && m.responseMs >= 0 ? m.responseMs : null,
      })),
  }
}

/** Genel karar = iki gruptan en kötüsü. */
function genelDurum(a: Durum, b: Durum): Durum {
  const sira: Durum[] = ["sorunlu", "kismi", "bilinmiyor", "normal"]
  for (const d of sira) if (a === d || b === d) return d
  return "normal"
}

const BOS: Grup = { durum: "bilinmiyor", toplam: 0, calisan: 0, sistemler: [] }

export async function GET(req: NextRequest) {
  const sentKey = req.headers.get("x-internal-key")
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  if (!sentKey || sentKey !== expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  try {
    const monitors = await fetchKumaMonitors()
    const kurMonitorleri = monitors.filter((m) => m.name.startsWith(DOVIZ_ONEKI))
    const sunucuMonitorleri = monitors.filter((m) => !m.name.startsWith(DOVIZ_ONEKI))

    const kur = grupla(kurMonitorleri, (n) => n.slice(DOVIZ_ONEKI.length))
    const sunucu = grupla(sunucuMonitorleri, (n) => n)

    return NextResponse.json(
      {
        durum: genelDurum(sunucu.durum, kur.durum),
        sunucu,
        kur,
        zaman: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    // Kuma'ya ulaşılamıyor → "normal" DEME. Bilinmiyor de.
    return NextResponse.json(
      {
        durum: "bilinmiyor" as Durum,
        sunucu: BOS,
        kur: BOS,
        hata: e instanceof Error ? e.message : "İzleme sistemine ulaşılamadı",
        zaman: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  }
}
