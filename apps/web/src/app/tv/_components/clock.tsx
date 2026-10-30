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

  const hh = String(now.getHours()).padStart(2, "0")
  const mm = String(now.getMinutes()).padStart(2, "0")
  const ss = String(now.getSeconds()).padStart(2, "0")

  const gun  = now.toLocaleDateString("tr-TR", { weekday: "long" }).toLocaleUpperCase("tr-TR")
  const tarih = now
    .toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })
    .toLocaleUpperCase("tr-TR")

  /* Saniye halkası: dakikanın ne kadarı geçti. Ekranın donmadığının kanıtı. */
  const HR = 13
  const cevre = 2 * Math.PI * HR
  const dolu = (now.getSeconds() / 60) * cevre

  return (
    <div className="pointer-events-none absolute left-9 top-7 w-[196px] select-none">
      <div className="flex items-start leading-none tabular-nums" style={{ color: TXT }}>
        <span className="text-[60px] font-extralight tracking-[-0.04em]">{hh}</span>
        <span className="tv-saat-iki text-[60px] font-extralight" style={{ color: TXT_DIM }}>:</span>
        <span className="text-[60px] font-extralight tracking-[-0.04em]">{mm}</span>
        <span className="relative mt-[8px] ml-3 flex size-[32px] items-center justify-center">
          <svg width={32} height={32} viewBox="0 0 32 32" className="absolute inset-0 -rotate-90">
            <circle cx={16} cy={16} r={HR} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1.5} />
            <circle
              cx={16} cy={16} r={HR} fill="none" stroke="#A78BFA" strokeWidth={1.5} strokeLinecap="round"
              strokeDasharray={`${dolu} ${cevre}`}
              style={{
                filter: "drop-shadow(0 0 3px rgba(167,139,250,0.8))",
                transition: now.getSeconds() === 0 ? "none" : "stroke-dasharray 1s linear",
              }}
            />
          </svg>
          <span className="text-[11px] font-semibold" style={{ color: "#C4B5FD" }}>{ss}</span>
        </span>
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold" style={{ color: TXT, letterSpacing: "0.24em" }}>
          {gun}
        </span>
        <span className="text-[10px] font-medium" style={{ color: TXT_DIM, letterSpacing: "0.20em" }}>
          {tarih}
        </span>
      </div>

      <style>{`
        @keyframes tv-saat-iki { 0%,49% { opacity: 1 } 50%,100% { opacity: .25 } }
        .tv-saat-iki { animation: tv-saat-iki 2s steps(1) infinite; margin: 0 1px }
      `}</style>
    </div>
  )
}
