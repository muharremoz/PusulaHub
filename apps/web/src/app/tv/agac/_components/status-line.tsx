"use client"

/**
 * Sol alt genel durum göstergesi.
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
const UP      = "#34D399"
const DOWN    = "#EF4444"

/** Büyük değer + altında küçük başlık */
function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div>
      <div
        className="font-mono text-[21px] font-bold leading-none tabular-nums"
        style={{ color }}
      >
        {value}
      </div>
      <div
        className="mt-1.5 text-[8px] font-medium uppercase"
        style={{ color: TXT_DIM, letterSpacing: "0.22em" }}
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
    <div className="pointer-events-none absolute bottom-8 left-9 select-none">
      <div className="flex items-center gap-2.5">
        <span
          className="inline-block size-[7px] rounded-full"
          style={{
            background: healthy ? UP : DOWN,
            boxShadow: `0 0 10px ${healthy ? UP : DOWN}80`,
          }}
        />
        <span
          className="text-[9px] font-medium uppercase"
          style={{ color: healthy ? TXT_DIM : DOWN, letterSpacing: "0.26em" }}
        >
          {healthy ? "Tüm sistemler çalışıyor" : "Müdahale gerekiyor"}
        </span>
      </div>

      <div className="mt-3.5 flex items-start gap-8">
        <Stat
          value={healthy ? `${total}` : `${down}/${total}`}
          label={healthy ? "Sistem çevrimiçi" : "Sistem çevrimdışı"}
          color={healthy ? TXT : DOWN}
        />
        <Stat
          value={`%${uptimePct.toFixed(1)}`}
          label="Uptime"
          color={healthy ? TXT : DOWN}
        />
      </div>
    </div>
  )
}
