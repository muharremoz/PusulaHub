"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import type { Server } from "@/types";
import type { AgentReport } from "@/lib/agent-types";

type RamPayload = AgentReport["metrics"]["ram"] | null;

interface Props {
  server: Server;
  sessionCount: number;
  ram?: RamPayload;
  onRefresh?: () => void;
  refreshing?: boolean;
}

function fmtGB(mb: number) {
  return `${(mb / 1024).toFixed(2)} GB`;
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
    <div className="rounded-[8px] p-2 pb-0 flex flex-col" style={{ backgroundColor: "#eef3ff" }}>
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

function RamBreakdownCard({ ram }: { ram: NonNullable<RamPayload> }) {
  const total = ram.totalMB || 1;
  const cache = ram.cacheMB ?? 0;
  // pureFreeMB varsa onu kullan — WMI freeMB bazı sürümlerde standby'ı da içeriyor
  const free  = ram.pureFreeMB ?? ram.freeMB;
  // realUsedMB agent'tan gelmiyorsa client-side hesapla
  const real  = ram.realUsedMB ?? Math.max(0, ram.totalMB - free - cache);

  const realPct  = (real / total) * 100;
  const cachePct = (cache / total) * 100;
  const freePct  = (free / total) * 100;

  // Eski agent (cacheMB göndermiyor) — kırılım kartı yerine basit "Toplam / Kullanılan / Boş" göster
  const hasCache = ram.cacheMB != null;

  return (
    <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#eef3ff" }}>
      <div
        className="rounded-[4px]"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
      >
        <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
            RAM Detayı
          </span>
        </div>
        <div className="px-3 py-3 space-y-3">
          {/* Stacked bar */}
          <div className="h-2 w-full rounded-full overflow-hidden bg-muted/30 flex">
            <div style={{ width: `${realPct}%`, backgroundColor: "#10b981" }} title={`Gerçek: ${fmtGB(real)}`} />
            {hasCache && (
              <div style={{ width: `${cachePct}%`, backgroundColor: "#94a3b8" }} title={`Cache: ${fmtGB(cache)}`} />
            )}
            <div style={{ width: `${freePct}%`, backgroundColor: "#e5e7eb" }} title={`Boş: ${fmtGB(free)}`} />
          </div>

          {/* Legend / values */}
          <div className={cn("grid gap-2 text-[11px]", hasCache ? "grid-cols-4" : "grid-cols-3")}>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-muted-foreground/40" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Toplam</span>
              </div>
              <div className="font-semibold tabular-nums mt-0.5">{fmtGB(ram.totalMB)}</div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: "#10b981" }} />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Gerçek</span>
              </div>
              <div className="font-semibold tabular-nums mt-0.5">
                {fmtGB(real)} <span className="text-muted-foreground font-normal">({realPct.toFixed(1)}%)</span>
              </div>
            </div>
            {hasCache && (
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: "#94a3b8" }} />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Cache</span>
                </div>
                <div className="font-semibold tabular-nums mt-0.5">
                  {fmtGB(cache)} <span className="text-muted-foreground font-normal">({cachePct.toFixed(1)}%)</span>
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-neutral-300" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Boş</span>
              </div>
              <div className="font-semibold tabular-nums mt-0.5">
                {fmtGB(free)} <span className="text-muted-foreground font-normal">({freePct.toFixed(1)}%)</span>
              </div>
            </div>
          </div>

          {hasCache && (
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">Cache</span> Windows&apos;un dosya sistemi cache&apos;idir; uygulamalar RAM ihtiyacı duyduğunda anında serbest bırakılır. Sunucunun gerçek yükünü <span className="font-medium text-foreground">Gerçek</span> rakamı yansıtır.
            </p>
          )}
        </div>
      </div>
      <div className="h-2" />
    </div>
  );
}

export function TabOverview({ server, sessionCount, ram, onRefresh, refreshing }: Props) {

  return (
    <div className="space-y-3">
      {/* Main 2-column layout: left = KPI + Server Info, right = Chart */}
      <div className="grid grid-cols-2 gap-3">
        {/* Left column */}
        <div className="flex flex-col gap-3">
          {/* Sunucu Bilgileri */}
          <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#eef3ff" }}>
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
                  { label: "Son Kontrol", value: (() => {
                    try {
                      const d = new Date(server.lastChecked);
                      if (isNaN(d.getTime())) return server.lastChecked;
                      return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
                    } catch { return server.lastChecked; }
                  })() },
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
            <div className="rounded-[8px] p-2 pb-0 flex flex-col" style={{ backgroundColor: "#eef3ff" }}>
              <div
                className="rounded-[4px] flex-1 flex flex-col"
                style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
              >
                <div className="px-3 py-2 bg-muted/30 border-b border-border/40 flex items-center justify-between">
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                    Anlık Durum
                  </span>
                  {onRefresh && (
                    <button
                      onClick={onRefresh}
                      disabled={refreshing}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
                      Yenile
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 divide-x divide-border/40 flex-1">
                  {[
                    { label: "CPU", value: server.cpu },
                    {
                      label: "RAM",
                      value: ram && ram.totalMB
                        ? Math.round(((ram.realUsedMB ?? Math.max(0, ram.usedMB - (ram.cacheMB ?? 0))) / ram.totalMB) * 100)
                        : server.ram,
                    },
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
                      <span className="text-3xl font-bold tabular-nums">{sessionCount}</span>
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

          {/* RAM Detayı (cache kırılımı) */}
          {ram && ram.totalMB > 0 && <RamBreakdownCard ram={ram} />}
        </div>

        {/* Right column: Weekly Stats Chart */}
        <div className="rounded-[8px] p-2 pb-0 flex flex-col" style={{ backgroundColor: "#eef3ff" }}>
          <div
            className="rounded-[4px] flex-1 flex flex-col overflow-hidden"
            style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
          >
            <div className="px-3 py-2 bg-muted/30 border-b border-border/40 shrink-0">
              <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                Haftalık Ortalama (CPU)
              </span>
            </div>
            <div className="flex-1 flex items-center justify-center px-4 py-8">
              <span className="text-[11px] text-muted-foreground">Veri toplanıyor...</span>
            </div>
          </div>
          <div className="h-2" />
        </div>
      </div>

    </div>
  );
}
