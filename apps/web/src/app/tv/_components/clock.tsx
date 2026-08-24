"use client"

/**
 * Sol üst saat + tarih.
 *
 * Kimlik alt ortaya taşınınca sol üst köşe boş kalmıştı; saat oraya alındı.
 * Ölçüleri sol alttaki durum bloğuyla aynı (21px mono değer, 8px etiket),
 * böylece sol kenarda tek bir tipografi hattı oluşuyor.
 *
 * Bir izleme duvarında saatin ikinci bir işlevi var: saniye akıyorsa ekranın
 * donmadığı görülür. O yüzden saniye de gösteriliyor.
 *
 * ── Türkçe büyük harf ──────────────────────────────────────────────────
 * Tarih CSS `text-transform: uppercase` ile değil, JavaScript tarafında
 * `toLocaleUpperCase("tr-TR")` ile büyütülüyor. CSS dönüşümü "ı" harfini
 * "I" yerine yanlış çevirebiliyor; bu yöntemde AĞUSTOS ve PAZARTESİ doğru
 * çıkıyor.
 */

import { useClock } from "../_shared/use-tv-data"

const TXT     = "#D4D4D8"
const TXT_DIM = "#8B8B93"

export function Clock() {
  const now = useClock()

  // İlk render sunucuda; saat ancak istemcide oluşuyor. Yer tutucu
  // göstermek yerine hiç çizmiyoruz ki köşede boş bir iskelet durmasın.
  if (!now) return null

  const time = now.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

  const date = now
    .toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      weekday: "long",
    })
    .toLocaleUpperCase("tr-TR")

  return (
    <div className="pointer-events-none absolute left-9 top-8 select-none">
      <div
        className="text-[9px] font-medium"
        style={{ color: TXT_DIM, letterSpacing: "0.20em" }}
      >
        {date}
      </div>

      <div
        className="mt-3.5 font-mono text-[21px] font-bold leading-none tabular-nums"
        style={{ color: TXT }}
      >
        {time}
      </div>

      <div
        className="mt-1.5 text-[8px] font-medium uppercase"
        style={{ color: TXT_DIM, letterSpacing: "0.22em" }}
      >
        Yerel saat
      </div>
    </div>
  )
}
