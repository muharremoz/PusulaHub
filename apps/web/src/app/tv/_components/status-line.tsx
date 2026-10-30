"use client"

/**
 * Genel durum göstergesi — sol üstte, saatin yanında (eskiden sol alttaydı).
 *
 * Kimlik bloğunun (sol üst) içinde tek satır olarak duruyordu; oradan
 * ayrılıp kendi alanına alındı. Böylece hem kimlik sadeleşti hem de bu
 * bilgi kendi başına okunur bir ağırlık kazandı — sol üst ile sol alt
 * birbirini dengeliyor.
 *
 * Nokta küreyle aynı dili konuşur: her şey ayaktaysa yeşil, bir arıza
 * varsa kırmızı. Sayı da öyle — arıza varken kaç sistemin düştüğünü
 * gösterir, yoksa kaç sistemin ayakta olduğunu.
 */

const TXT     = "#D4D4D8"
const TXT_DIM = "#8B8B93"
const DOWN    = "#EF4444"

/** Büyük, ince değer + yanında küçük birim/başlık — saatle aynı dil */
function Stat({ value, unit, unitColor, label, color }: { value: string; unit?: string; unitColor?: string; label: string; color: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1 leading-none tabular-nums" style={{ color }}>
        {unit && <span className="text-[24px] font-light" style={{ color: unitColor ?? TXT_DIM }}>{unit}</span>}
        {/* Saatle aynı boy ve kalınlık (clock.tsx: 60px extralight) */}
        <span className="text-[60px] font-extralight tracking-[-0.04em]">{value}</span>
      </div>
      <div
        className="mt-3 text-[10px] font-medium uppercase leading-[17px]"
        style={{ color: TXT_DIM, letterSpacing: "0.20em" }}
      >
        {label}
      </div>
    </div>
  )
}

interface Props {
  total:     number
  down:      number
  uptimePct: number
}

export function StatusLine({ total, down, uptimePct }: Props) {
  const healthy = down === 0

  return (
    <div
      className="pointer-events-none absolute left-[268px] top-7 select-none border-l pl-8"
      style={{ borderColor: "rgba(255,255,255,0.10)" }}
    >
      <div className="flex items-start gap-10">
        <Stat
          value={healthy ? `${total}` : `${down}/${total}`}
          label={healthy ? "Çevrimiçi" : "Çevrimdışı"}
          color={healthy ? TXT : DOWN}
        />
        <Stat
          unit="%"
          unitColor={healthy ? "#A78BFA" : DOWN}
          value={String(Math.floor(uptimePct))}
          label="Uptime"
          color={healthy ? TXT : DOWN}
        />
      </div>

    </div>
  )
}
