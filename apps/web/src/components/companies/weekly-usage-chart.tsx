"use client"

import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
} from "recharts"

/**
 * Haftalık kullanım — firmanın o günkü TOPLAM kullanımı, gerçek birimleriyle.
 *
 * Yüzde göstermiyoruz: "salı günü kullanıcılar toplam 1.6 GB RAM ve %3.5 CPU
 * kullanmış" okunabilsin diye. RAM/Disk GB (sol eksen), CPU % (sağ eksen).
 * `null` = o gün ölçüm yok; çizgi orada kesilir (0 ile karışmasın).
 */
interface WeeklyUsagePoint {
  day:     string
  date?:   string
  cpu?:    number | null
  ramGB?:  number | null
  diskGB?: number | null
  users?:  number | null
}

const C_RAM  = "#34d399"
const C_DISK = "#fbbf24"
const C_CPU  = "#60a5fa"

export function WeeklyUsageChart({ data }: { data: WeeklyUsagePoint[] }) {
  const hasAny = data.some((d) => d.cpu != null || d.ramGB != null || d.diskGB != null)
  if (!hasAny) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[11px] text-muted-foreground">Bu hafta için ölçüm kaydı yok</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 4, right: 2, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="wuRam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={C_RAM} stopOpacity={0.35} />
            <stop offset="95%" stopColor={C_RAM} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="wuDisk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={C_DISK} stopOpacity={0.3} />
            <stop offset="95%" stopColor={C_DISK} stopOpacity={0} />
          </linearGradient>
        </defs>

        <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        {/* Sol: GB (RAM + Disk) */}
        <YAxis
          yAxisId="gb"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false} tickLine={false}
          tickFormatter={(v) => `${v} GB`}
          width={52}
        />
        {/* Sağ: CPU % — farklı birim, ayrı eksen */}
        <YAxis
          yAxisId="cpu"
          orientation="right"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false} tickLine={false}
          tickFormatter={(v) => `%${v}`}
          width={38}
        />

        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #e5e7eb", padding: "6px 10px" }}
          formatter={(value, name) => {
            if (value == null) return ["ölçüm yok", String(name)]
            if (name === "cpu")    return [`%${value}`, "CPU (toplam)"]
            if (name === "ramGB")  return [`${value} GB`, "RAM (toplam)"]
            if (name === "diskGB") return [`${value} GB`, "Disk"]
            return [String(value), String(name)]
          }}
          labelFormatter={(label, payload) => {
            const p = payload?.[0]?.payload as WeeklyUsagePoint | undefined
            const users = p?.users
            return users != null ? `${label} · ${users} kullanıcı` : String(label)
          }}
        />

        <Area
          yAxisId="gb" type="monotone" dataKey="ramGB" name="ramGB"
          stroke={C_RAM} strokeWidth={1.5} fill="url(#wuRam)" dot={false} connectNulls={false}
        />
        <Area
          yAxisId="gb" type="monotone" dataKey="diskGB" name="diskGB"
          stroke={C_DISK} strokeWidth={1.5} fill="url(#wuDisk)" dot={false} connectNulls={false}
        />
        <Line
          yAxisId="cpu" type="monotone" dataKey="cpu" name="cpu"
          stroke={C_CPU} strokeWidth={1.5} dot={false} connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
