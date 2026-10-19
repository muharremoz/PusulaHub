"use client"

import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts"

/**
 * Haftalık kullanım — firmanın o günkü TOPLAM kullanımı, gerçek birimleriyle.
 *
 * Yüzde göstermiyoruz: "salı günü kullanıcılar toplam 1.6 GB RAM ve %3.5 CPU
 * kullanmış" okunabilsin diye. RAM/Disk GB (sol eksen), CPU % (sağ eksen).
 * `null` = o gün ölçüm yok; çizgi orada kesilir (0 ile karışmasın).
 *
 * Renkler/ızgara/ipucu tema token'larından — koyu temada da okunur.
 * Disk günden güne neredeyse sabit: dolgulu alan yerine kesikli çizgi,
 * grafiği kaplayıp RAM'i örtmesin.
 */
interface WeeklyUsagePoint {
  day:     string
  date?:   string
  cpu?:    number | null
  ramGB?:  number | null
  diskGB?: number | null
  users?:  number | null
}

const C_RAM  = "#10b981"
const C_DISK = "#f59e0b"
const C_CPU  = "#3b82f6"

const sayi = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: 1 })

/**
 * Yalnız iki yanı boş (null) olan noktaya işaret koyar. Çizgi iki nokta
 * arasında çizildiği için hafta sonu boş kalınca pazartesinin tek ölçümü
 * hiç görünmüyordu. Diğer noktalar çizginin kendisinde okunuyor.
 */
function yalnizNokta(data: WeeklyUsagePoint[], key: "cpu" | "ramGB" | "diskGB", renk: string) {
  const NoktaIsareti = (p: { cx?: number; cy?: number; index?: number }) => {
    const i = p.index ?? -1
    const yalniz = data[i]?.[key] != null && data[i - 1]?.[key] == null && data[i + 1]?.[key] == null
    if (!yalniz || p.cx == null || p.cy == null) return <g key={`${key}-${i}`} />
    return <circle key={`${key}-${i}`} cx={p.cx} cy={p.cy} r={3} fill={renk} />
  }
  return NoktaIsareti
}
const eksen = { fontSize: 11, fill: "var(--muted-foreground)" }

export function WeeklyUsageChart({ data }: { data: WeeklyUsagePoint[] }) {
  const hasAny = data.some((d) => d.cpu != null || d.ramGB != null || d.diskGB != null)
  if (!hasAny) {
    return (
      <div className="flex h-full items-center justify-center rounded-[5px] bg-[var(--section-bg)]">
        <p className="text-[12px] text-muted-foreground">Son 7 gün için ölçüm kaydı yok</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="wuRam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={C_RAM} stopOpacity={0.3} />
            <stop offset="100%" stopColor={C_RAM} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="day" tick={eksen} axisLine={false} tickLine={false} tickMargin={6} />
        {/* Sol: GB (RAM + Disk) */}
        <YAxis
          yAxisId="gb" tick={eksen} axisLine={false} tickLine={false}
          tickFormatter={(v: number) => `${sayi(v)} GB`} width={48} allowDecimals={false}
        />
        {/* Sağ: CPU % — farklı birim, ayrı eksen */}
        <YAxis
          yAxisId="cpu" orientation="right" tick={eksen} axisLine={false} tickLine={false}
          tickFormatter={(v: number) => `%${sayi(v)}`} width={36} allowDecimals={false}
        />

        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          contentStyle={{
            fontSize: 12, borderRadius: 5, padding: "6px 10px",
            background: "var(--popover)", color: "var(--popover-foreground)",
            border: "1px solid var(--border)", boxShadow: "var(--card-shadow)",
          }}
          labelStyle={{ fontWeight: 600, marginBottom: 2 }}
          formatter={(value, name) => {
            if (value == null) return ["ölçüm yok", String(name)]
            const v = typeof value === "number" ? sayi(value) : String(value)
            if (name === "cpu")    return [`%${v}`, "CPU"]
            if (name === "ramGB")  return [`${v} GB`, "RAM"]
            if (name === "diskGB") return [`${v} GB`, "Disk"]
            return [v, String(name)]
          }}
          labelFormatter={(label, payload) => {
            const p = payload?.[0]?.payload as WeeklyUsagePoint | undefined
            const users = p?.users
            return users != null ? `${label} · ${users} kullanıcı` : String(label)
          }}
        />

        <Area isAnimationActive={false}
          yAxisId="gb" type="monotone" dataKey="ramGB" name="ramGB"
          stroke={C_RAM} strokeWidth={2} fill="url(#wuRam)" dot={yalnizNokta(data, "ramGB", C_RAM)} activeDot={{ r: 3 }} connectNulls={false}
        />
        <Line isAnimationActive={false}
          yAxisId="gb" type="monotone" dataKey="diskGB" name="diskGB"
          stroke={C_DISK} strokeWidth={1.5} strokeDasharray="4 3" dot={yalnizNokta(data, "diskGB", C_DISK)} activeDot={{ r: 3 }} connectNulls={false}
        />
        <Line isAnimationActive={false}
          yAxisId="cpu" type="monotone" dataKey="cpu" name="cpu"
          stroke={C_CPU} strokeWidth={2} dot={yalnizNokta(data, "cpu", C_CPU)} activeDot={{ r: 3 }} connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
