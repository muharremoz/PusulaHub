"use client"

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts"

/**
 * Haftalık kullanım — değerler firmanın KOTASINA göre yüzde (üstteki
 * "Kullanım Yoğunluğu" kartıyla aynı payda). `null` = o gün ölçüm yok;
 * 0 ile karıştırılmasın diye çizgi orada kesilir.
 */
interface WeeklyUsagePoint {
  day: string
  cpu?:  number | null
  ram?:  number | null
  disk?: number | null
  db?:   number | null
}

const SERIES = [
  { key: "cpu",  label: "CPU",         color: "#60a5fa" },
  { key: "ram",  label: "RAM",         color: "#34d399" },
  { key: "disk", label: "Disk",        color: "#fbbf24" },
  { key: "db",   label: "Veritabanı",  color: "#f87171" },
] as const

export function WeeklyUsageChart({ data }: { data: WeeklyUsagePoint[] }) {
  // Ölçüm hiç yoksa boş grafik yerine açıklama göster
  const hasAny = data.some((d) => SERIES.some((s) => d[s.key] != null))
  if (!hasAny) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[11px] text-muted-foreground">Bu hafta için ölçüm kaydı yok</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <defs>
          {SERIES.map((s) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={s.color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #e5e7eb", padding: "6px 10px" }}
          formatter={(value, name) => {
            const s = SERIES.find((x) => x.key === name)
            return [value == null ? "ölçüm yok" : `%${value}`, s?.label ?? String(name)]
          }}
        />
        {SERIES.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.key}
            stroke={s.color}
            strokeWidth={1.5}
            fill={`url(#g-${s.key})`}
            dot={false}
            // Ölçüm olmayan günde çizgiyi birleştirme — sahte süreklilik olmasın
            connectNulls={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
