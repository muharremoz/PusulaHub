"use client"

import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"
import type { Donem, RaporNokta } from "@/app/api/servers/[id]/rapor/route"

/**
 * Sunucu raporu grafiği — server_metrics serisi (bugün 5 dk, 7/30 gün saatlik).
 * Tür: cpu (ortalama alan + zirve kesikli çizgi, %), ram (GB alan + zirve),
 * oturum (aktif oturum alanı). Renkler/ızgara tema token'larından.
 */
export type GrafikTur = "cpu" | "ram" | "oturum"

const RENK: Record<GrafikTur, string> = { cpu: "#3b82f6", ram: "#10b981", oturum: "#8b5cf6" }
const eksen = { fontSize: 11, fill: "var(--muted-foreground)" }
const sayi = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: 1 })

export function RaporGrafik({ seri, tur, donem, ramToplam }: { seri: RaporNokta[]; tur: GrafikTur; donem: Donem; ramToplam?: number | null }) {
  const anahtar = tur === "cpu" ? "cpu" : tur === "ram" ? "ramGB" : "oturum"
  const zirveAnahtar = tur === "cpu" ? "cpuMax" : tur === "ram" ? "ramMaxGB" : null
  const veriVar = seri.some((n) => n[anahtar as keyof RaporNokta] != null)
  if (!veriVar) {
    return (
      <div className="flex h-full items-center justify-center rounded-[5px] bg-[var(--section-bg)]">
        <p className="text-[12px] text-muted-foreground">Bu dönem için ölçüm yok</p>
      </div>
    )
  }
  const zaman = (ts: string) => {
    const d = new Date(ts)
    return donem === "bugun"
      ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" })
  }
  const birim = (v: number) => (tur === "cpu" ? `%${sayi(v)}` : tur === "ram" ? `${sayi(v)} GB` : `${sayi(v)}`)
  const renk = RENK[tur]
  const id = `rg-${tur}`

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={seri} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={renk} stopOpacity={0.3} />
            <stop offset="100%" stopColor={renk} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="ts" tickFormatter={zaman} tick={eksen} axisLine={false} tickLine={false} minTickGap={40} tickMargin={6} />
        <YAxis tick={eksen} axisLine={false} tickLine={false} width={44} allowDecimals={tur !== "oturum"}
          tickFormatter={(v: number) => birim(v)}
          domain={tur === "cpu" ? [0, 100] : tur === "ram" && ramToplam ? [0, ramToplam] : [0, "auto"]} />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          contentStyle={{
            fontSize: 12, borderRadius: 5, padding: "6px 10px",
            background: "var(--popover)", color: "var(--popover-foreground)",
            border: "1px solid var(--border)", boxShadow: "var(--card-shadow)",
          }}
          labelStyle={{ fontWeight: 600, marginBottom: 2 }}
          labelFormatter={(ts) => new Date(String(ts)).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          formatter={(v, ad) => [v == null ? "ölçüm yok" : birim(Number(v)), ad === zirveAnahtar ? "Zirve" : tur === "oturum" ? "Aktif oturum" : "Ortalama"]}
        />
        <Area type="monotone" dataKey={anahtar} stroke={renk} strokeWidth={2} fill={`url(#${id})`} dot={false} activeDot={{ r: 3 }} connectNulls={false} />
        {zirveAnahtar && (
          <Line type="monotone" dataKey={zirveAnahtar} stroke={renk} strokeOpacity={0.55} strokeWidth={1.25} strokeDasharray="4 3" dot={false} activeDot={{ r: 3 }} connectNulls={false} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
