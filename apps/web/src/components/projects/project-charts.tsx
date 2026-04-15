"use client"

import { useState, useEffect } from "react"
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  TrendingDown, BarChart3, Target,
  CheckCircle2, ListTodo, ArrowUpRight, ArrowDownRight,
} from "lucide-react"

/* ═══════════════════════════════════════════════
   Proje Grafikleri — Burndown + Velocity
═══════════════════════════════════════════════ */

interface BurndownPoint {
  date: string
  remaining: number
  ideal: number
}

interface VelocityPoint {
  week: string
  created: number
  completed: number
}

interface ChartData {
  summary: { totalTasks: number; doneTasks: number }
  burndown: BurndownPoint[]
  velocity: VelocityPoint[]
}

interface Props {
  projectId: string
}

export function ProjectCharts({ projectId }: Props) {
  const [data, setData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const r = await fetch(`/api/projects/${projectId}/charts`)
        if (r.ok) setData(await r.json())
      } catch { /* */ } finally { setLoading(false) }
    }
    load()
  }, [projectId])

  if (loading) {
    return (
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="rounded-[4px] p-6 space-y-6"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-[5px]" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-[5px]" />
        </div>
        <div className="h-2" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="rounded-[4px] px-6 py-16 text-center"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
          <BarChart3 className="size-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-[12px] font-medium text-muted-foreground">Grafik verileri yüklenemedi</p>
        </div>
        <div className="h-2" />
      </div>
    )
  }

  const { summary, burndown, velocity } = data
  const completionRate = summary.totalTasks > 0
    ? Math.round((summary.doneTasks / summary.totalTasks) * 100)
    : 0

  // Velocity ortalaması
  const avgVelocity = velocity.length > 0
    ? Math.round(velocity.reduce((s, v) => s + v.completed, 0) / velocity.length * 10) / 10
    : 0

  // Trend: son 2 hafta karşılaştırması
  const lastWeeks = velocity.slice(-2)
  const trend = lastWeeks.length === 2
    ? lastWeeks[1].completed - lastWeeks[0].completed
    : 0

  return (
    <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
      <div className="rounded-[4px] overflow-hidden"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>

        {/* KPI Kartları */}
        <div className="px-4 pt-4 pb-2">
          <div className="grid grid-cols-3 gap-3">
            {/* Toplam görev */}
            <div className="rounded-[5px] border border-border/50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <ListTodo className="size-3.5 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Toplam Görev
                </span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{summary.totalTasks}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {summary.doneTasks} tamamlandı
              </p>
            </div>

            {/* Tamamlanma oranı */}
            <div className="rounded-[5px] border border-border/50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Target className="size-3.5 text-emerald-600" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Tamamlanma
                </span>
              </div>
              <p className="text-2xl font-bold tabular-nums text-emerald-600">{completionRate}%</p>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1.5">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            </div>

            {/* Haftalık velocity */}
            <div className="rounded-[5px] border border-border/50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="size-3.5 text-blue-600" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Ortalama Hız
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold tabular-nums text-blue-600">{avgVelocity}</p>
                <span className="text-[10px] text-muted-foreground">görev/hafta</span>
              </div>
              {trend !== 0 && (
                <div className="flex items-center gap-1 mt-0.5">
                  {trend > 0 ? (
                    <ArrowUpRight className="size-3 text-emerald-600" />
                  ) : (
                    <ArrowDownRight className="size-3 text-red-500" />
                  )}
                  <span className={`text-[10px] font-medium ${trend > 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {trend > 0 ? "+" : ""}{trend} bu hafta
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Grafikler */}
        <div className="px-4 pb-4">
          <Tabs defaultValue="burndown">
            <TabsList className="h-8 mb-3">
              <TabsTrigger value="burndown" className="text-[10px] h-6 px-3 gap-1.5">
                <TrendingDown className="size-3" /> Burndown
              </TabsTrigger>
              <TabsTrigger value="velocity" className="text-[10px] h-6 px-3 gap-1.5">
                <BarChart3 className="size-3" /> Velocity
              </TabsTrigger>
            </TabsList>

            {/* Burndown Chart */}
            <TabsContent value="burndown">
              {burndown.length < 2 ? (
                <div className="flex items-center justify-center h-64 text-[11px] text-muted-foreground">
                  Burndown grafiği için yeterli veri yok (en az 2 farklı tarih gerekli)
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={burndown} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="burndownGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) => {
                          const d = new Date(v)
                          return `${d.getDate()}/${d.getMonth() + 1}`
                        }}
                        tick={{ fontSize: 9, fill: "#9ca3af" }}
                        axisLine={{ stroke: "#e5e7eb" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 9, fill: "#9ca3af" }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: 6,
                          fontSize: 10,
                          border: "1px solid #e5e7eb",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
                        }}
                        labelFormatter={(v) => {
                          const d = new Date(v as string)
                          return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long" })
                        }}
                        formatter={(value, name) => [
                          String(value),
                          name === "remaining" ? "Kalan Görev" : "İdeal",
                        ]}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={6}
                        wrapperStyle={{ fontSize: 10 }}
                        formatter={(value) =>
                          value === "remaining" ? "Kalan Görev" : "İdeal Çizgi"
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="ideal"
                        stroke="#9ca3af"
                        strokeDasharray="5 5"
                        fill="none"
                        strokeWidth={1.5}
                        dot={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="remaining"
                        stroke="#3b82f6"
                        fill="url(#burndownGradient)"
                        strokeWidth={2}
                        dot={{ r: 2, fill: "#3b82f6" }}
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </TabsContent>

            {/* Velocity Chart */}
            <TabsContent value="velocity">
              {velocity.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-[11px] text-muted-foreground">
                  Velocity grafiği için yeterli veri yok
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={velocity} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="week"
                        tickFormatter={(v) => {
                          const d = new Date(v)
                          return `${d.getDate()}/${d.getMonth() + 1}`
                        }}
                        tick={{ fontSize: 9, fill: "#9ca3af" }}
                        axisLine={{ stroke: "#e5e7eb" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 9, fill: "#9ca3af" }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                        allowDecimals={false}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: 6,
                          fontSize: 10,
                          border: "1px solid #e5e7eb",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
                        }}
                        labelFormatter={(v) => {
                          const d = new Date(v as string)
                          return `Hafta: ${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long" })}`
                        }}
                        formatter={(value, name) => [
                          String(value),
                          name === "created" ? "Oluşturulan" : "Tamamlanan",
                        ]}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={6}
                        wrapperStyle={{ fontSize: 10 }}
                        formatter={(value) =>
                          value === "created" ? "Oluşturulan" : "Tamamlanan"
                        }
                      />
                      <Bar
                        dataKey="created"
                        fill="#93c5fd"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={32}
                      />
                      <Bar
                        dataKey="completed"
                        fill="#3b82f6"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={32}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <div className="h-2" />
    </div>
  )
}
