"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, Cell, XAxis } from "recharts";
import type { Server } from "@/types";
import type { ServerDetail } from "@/lib/mock-server-detail";

interface Props {
  server: Server;
  detail: ServerDetail;
}

function gaugeColor(value: number) {
  if (value >= 90) return { primary: "#ef4444", secondary: "#fee2e2" };
  if (value >= 75) return { primary: "#f59e0b", secondary: "#fef3c7" };
  return { primary: "#10b981", secondary: "#d1fae5" };
}

function AnimatedGauge({ value, className }: { value: number; className?: string }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDisplayed(value), 80);
    return () => clearTimeout(t);
  }, [value]);
  const { primary, secondary } = gaugeColor(value);
  return (
    <AnimatedCircularProgressBar
      value={displayed}
      gaugePrimaryColor={primary}
      gaugeSecondaryColor={secondary}
      className={className}
    />
  );
}

const chartConfig = {
  cpu: { label: "CPU" },
} satisfies ChartConfig;

function loadScore(cpu: number, ram: number, disk: number) {
  const raw = Math.round(cpu * 0.4 + ram * 0.4 + disk * 0.2);
  const score = 100 - raw;
  if (score >= 70) return { score, label: "Düşük Yük", color: "#10b981", bg: "#d1fae5", bar: "#10b981" };
  if (score >= 40) return { score, label: "Orta Yük", color: "#f59e0b", bg: "#fef3c7", bar: "#f59e0b" };
  return { score, label: "Yüksek Yük", color: "#ef4444", bg: "#fee2e2", bar: "#ef4444" };
}

function LoadScoreCard({ cpu, ram, disk }: { cpu: number; ram: number; disk: number }) {
  const { score, label, color, bg } = loadScore(cpu, ram, disk);
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDisplayed(score), 80);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <div className="rounded-[8px] p-2 pb-0 flex flex-col" style={{ backgroundColor: "#F4F2F0" }}>
      <div
        className="rounded-[4px] flex-1 flex flex-col"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
      >
        <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
            Sunucu Yük Skoru
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-4 gap-3">
          <AnimatedCircularProgressBar
            value={displayed}
            gaugePrimaryColor={color}
            gaugeSecondaryColor={bg}
            className="size-20 text-[15px] font-bold"
          />
          <div className="flex flex-col items-center gap-0.5">
            <span
              className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
              style={{ color, backgroundColor: bg }}
            >
              {label}
            </span>
            <span className="text-[10px] text-muted-foreground mt-1">genel performans skoru</span>
          </div>
        </div>
      </div>
      <div className="h-2" />
    </div>
  );
}

export function TabOverview({ server, detail }: Props) {

  return (
    <div className="space-y-3">
      {/* Main 2-column layout: left = KPI + Server Info, right = Chart */}
      <div className="grid grid-cols-2 gap-3">
        {/* Left column */}
        <div className="flex flex-col gap-3">
          {/* Sunucu Bilgileri */}
          <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
            <div
              className="rounded-[4px]"
              style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
            >
              <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                  Sunucu Bilgileri
                </span>
              </div>
              <div className="divide-y divide-border/40">
                {[
                  { label: "Sunucu Adı", value: server.name },
                  { label: "IP Adresi", value: server.ip, mono: true },
                  { label: "DNS Adresi", value: server.dns ?? "—", mono: true },
                  { label: "İşletim Sistemi", value: server.os },
                  { label: "Çalışma Süresi", value: server.uptime },
                  { label: "Son Kontrol", value: server.lastChecked },
                ].map(({ label, value, mono }) => (
                  <div key={label} className="px-3 py-2.5 flex items-center justify-between gap-4">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase shrink-0">
                      {label}
                    </span>
                    <span className={cn("text-[11px] text-right truncate", mono && "font-mono")}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="h-2" />
          </div>

          {/* Anlık Durum + Sunucu Yük Skoru */}
          <div className="grid grid-cols-2 gap-3 items-stretch">
            {/* Anlık Durum */}
            <div className="rounded-[8px] p-2 pb-0 flex flex-col" style={{ backgroundColor: "#F4F2F0" }}>
              <div
                className="rounded-[4px] flex-1 flex flex-col"
                style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
              >
                <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                    Anlık Durum
                  </span>
                </div>
                <div className="grid grid-cols-4 divide-x divide-border/40 flex-1">
                  {[
                    { label: "CPU", value: server.cpu },
                    { label: "RAM", value: server.ram },
                    { label: "Disk", value: server.disk },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col items-center justify-center py-3 gap-1.5">
                      <AnimatedGauge value={value} className="size-14 text-[10px] font-semibold" />
                      <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                        {label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">%{value}</span>
                    </div>
                  ))}
                  <div className="flex flex-col items-center justify-center py-3 gap-1.5">
                    <div className="size-14 flex items-center justify-center">
                      <span className="text-3xl font-bold tabular-nums">{detail.sessions.length}</span>
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                      Oturum
                    </span>
                    <span className="text-[10px] text-muted-foreground">aktif</span>
                  </div>
                </div>
              </div>
              <div className="h-2" />
            </div>

            {/* Sunucu Yük Skoru */}
            <LoadScoreCard cpu={server.cpu} ram={server.ram} disk={server.disk} />
          </div>
        </div>

        {/* Right column: Weekly Stats Chart */}
        <div className="rounded-[8px] p-2 pb-0 flex flex-col" style={{ backgroundColor: "#F4F2F0" }}>
          <div
            className="rounded-[4px] flex-1 flex flex-col overflow-hidden"
            style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
          >
            <div className="px-3 py-2 bg-muted/30 border-b border-border/40 shrink-0">
              <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                Haftalık Ortalama (CPU)
              </span>
            </div>
            <ChartContainer config={chartConfig} className="flex-1 w-full px-2 pt-2 min-h-0 aspect-auto">
              <BarChart data={detail.weeklyStats} barCategoryGap="30%">
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4, radius: 4 }}
                  content={
                    <ChartTooltipContent
                      hideLabel={false}
                      formatter={(value) => [`%${value}`, "CPU"]}
                    />
                  }
                />
                <Bar dataKey="cpu" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {detail.weeklyStats.map((s) => (
                    <Cell key={s.day} fill={gaugeColor(s.cpu).primary} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
          <div className="h-2" />
        </div>
      </div>

    </div>
  );
}
