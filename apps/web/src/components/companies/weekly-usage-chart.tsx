"use client"

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts"

interface WeeklyUsagePoint {
  day: string
  cpu?: number
  ram?: number
  disk?: number
}

export function WeeklyUsageChart({ data }: { data: WeeklyUsagePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="gCpu" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gRam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gDisk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #e5e7eb", padding: "6px 10px" }}
          formatter={(value, name) => [`%${value ?? 0}`, String(name ?? "").toUpperCase()]}
        />
        <Area type="monotone" dataKey="cpu"  stroke="#60a5fa" strokeWidth={1.5} fill="url(#gCpu)"  dot={false} />
        <Area type="monotone" dataKey="ram"  stroke="#34d399" strokeWidth={1.5} fill="url(#gRam)"  dot={false} />
        <Area type="monotone" dataKey="disk" stroke="#fbbf24" strokeWidth={1.5} fill="url(#gDisk)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
