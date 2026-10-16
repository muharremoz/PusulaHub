"use client"

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"

/** Bugünkü terminal oturumları — RDP sunucularının 5 dk kovalık aktif oturum toplamı. */
const saat = (ts: string) => new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
const eksen = { fontSize: 11, fill: "var(--muted-foreground)" }

export function OturumGrafik({ seri }: { seri: { ts: string; kisi: number }[] }) {
  if (seri.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[5px] bg-[var(--section-bg)]">
        <p className="text-[12px] text-muted-foreground">Bugün için oturum ölçümü yok</p>
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={seri} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="dashOturum" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="ts" tickFormatter={saat} tick={eksen} axisLine={false} tickLine={false} minTickGap={40} tickMargin={6} />
        <YAxis tick={eksen} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          contentStyle={{
            fontSize: 12, borderRadius: 5, padding: "6px 10px",
            background: "var(--popover)", color: "var(--popover-foreground)",
            border: "1px solid var(--border)", boxShadow: "var(--card-shadow)",
          }}
          labelFormatter={(ts) => saat(String(ts))}
          formatter={(v) => [`${v} kişi`, "Aktif oturum"]}
        />
        <Area type="monotone" dataKey="kisi" stroke="#3b82f6" strokeWidth={2} fill="url(#dashOturum)" dot={false} activeDot={{ r: 3 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
