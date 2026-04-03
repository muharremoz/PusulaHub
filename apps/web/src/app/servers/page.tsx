"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageContainer } from "@/components/layout/page-container";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import { servers } from "@/lib/mock-data";
import { Server, MoreVertical, RefreshCw, LayoutList, LayoutGrid, Clock, Plus, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ServerSheet } from "@/components/servers/server-sheet";

type ViewMode = "list" | "card";
type SortKey = "name" | "ip" | "dns" | "status" | "cpu" | "ram" | "disk" | "role";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = { online: 0, warning: 1, offline: 2 };

const STATUS_DOT: Record<string, string> = {
  online: "bg-emerald-500",
  warning: "bg-amber-400",
  offline: "bg-red-400",
};

function gaugeColor(value: number) {
  if (value >= 90) return { primary: "#ef4444", secondary: "#fee2e2" }
  if (value >= 75) return { primary: "#f59e0b", secondary: "#fef3c7" }
  return { primary: "#10b981", secondary: "#d1fae5" }
}

function AnimatedGauge({ value, className }: { value: number; className?: string }) {
  const [displayed, setDisplayed] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setDisplayed(value), 80)
    return () => clearTimeout(t)
  }, [value])
  const { primary, secondary } = gaugeColor(value)
  return (
    <AnimatedCircularProgressBar
      value={displayed}
      gaugePrimaryColor={primary}
      gaugeSecondaryColor={secondary}
      className={className}
    />
  )
}

function SortHeader({
  label, sortKey, active, dir, onSort,
}: {
  label: string; sortKey: SortKey; active: SortKey; dir: SortDir; onSort: (k: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase transition-colors select-none",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      <span className="shrink-0">
        {isActive
          ? dir === "asc"
            ? <ChevronUp className="size-3" />
            : <ChevronDown className="size-3" />
          : <ChevronsUpDown className="size-3 opacity-40" />
        }
      </span>
    </button>
  );
}

function ActionMenu({ serverId }: { serverId: string }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-[6px]">
        <DropdownMenuItem
          className="text-xs cursor-pointer"
          onClick={() => router.push(`/servers/${serverId}`)}
        >
          Detaylar
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs">Yeniden Başlat</DropdownMenuItem>
        <DropdownMenuItem className="text-xs">Terminal</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs text-destructive">Kaldır</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ResourceBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 90 ? "bg-red-500" :
    value >= 75 ? "bg-amber-400" :
    "bg-foreground";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-6 shrink-0">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">%{value}</span>
    </div>
  );
}

export default function ServersPage() {
  const [osFilter, setOsFilter] = useState<"all" | "windows" | "ubuntu">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "warning" | "offline">("all");
  const [view, setView] = useState<ViewMode>("list");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = servers
    .filter((s) => {
      if (osFilter === "windows" && !s.os.startsWith("Windows")) return false;
      if (osFilter === "ubuntu" && !s.os.startsWith("Ubuntu")) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":   cmp = a.name.localeCompare(b.name); break;
        case "ip":     cmp = a.ip.localeCompare(b.ip, undefined, { numeric: true }); break;
        case "dns":    cmp = (a.dns ?? "").localeCompare(b.dns ?? ""); break;
        case "status": cmp = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9); break;
        case "cpu":    cmp = a.cpu - b.cpu; break;
        case "ram":    cmp = a.ram - b.ram; break;
        case "disk":   cmp = a.disk - b.disk; break;
        case "role":   cmp = (a.roles[0] ?? "").localeCompare(b.roles[0] ?? ""); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  return (
    <PageContainer title="Sunucular" description="Tüm sunucuların listesi ve yönetimi">
      <ServerSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {/* OS filter */}
        <div className="flex items-center rounded-[8px] p-1" style={{ backgroundColor: "#F4F2F0" }}>
          {(["all", "windows", "ubuntu"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setOsFilter(f)}
              className={cn(
                "rounded-[6px] text-[11px] px-3 py-1.5 font-medium transition-colors",
                osFilter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all" ? "Tümü" : f === "windows" ? "Windows" : "Ubuntu"}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex items-center rounded-[8px] p-1" style={{ backgroundColor: "#F4F2F0" }}>
          {(["all", "online", "warning", "offline"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "rounded-[6px] text-[11px] px-3 py-1.5 font-medium transition-colors",
                statusFilter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all" ? "Tümü" : f === "online" ? "Aktif" : f === "warning" ? "Uyarı" : "Kapalı"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-[8px] p-1" style={{ backgroundColor: "#F4F2F0" }}>
            <button
              onClick={() => setView("list")}
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded-[6px] transition-colors",
                view === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutList className="size-3.5" />
            </button>
            <button
              onClick={() => setView("card")}
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded-[6px] transition-colors",
                view === "card" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="size-3.5" />
            </button>
          </div>

          {/* Refresh */}
          <button className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[6px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground">
            <RefreshCw className="size-3.5" />
            Yenile
          </button>

          {/* New server */}
          <button
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-[6px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            <Plus className="size-3.5" />
            Yeni Sunucu
          </button>
        </div>
      </div>

      {/* ── LIST VIEW ── */}
      {view === "list" && (
        <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
          <div className="rounded-[4px] overflow-hidden" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
            {/* Header */}
            <div className="grid grid-cols-[16px_1.4fr_100px_1fr_68px_0.75fr_0.75fr_0.75fr_52px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
              <span />
              <SortHeader label="Sunucu Adı" sortKey="name"   active={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="IP Adresi"  sortKey="ip"     active={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="DNS Adresi" sortKey="dns"    active={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Durum"      sortKey="status" active={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="CPU"        sortKey="cpu"    active={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="RAM"        sortKey="ram"    active={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Disk"       sortKey="disk"   active={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Rol"        sortKey="role"   active={sortKey} dir={sortDir} onSort={handleSort} />
              <span />
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/40">
              {filtered.map((srv) => (
                <div
                  key={srv.id}
                  className="grid grid-cols-[16px_1.4fr_100px_1fr_68px_0.75fr_0.75fr_0.75fr_52px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
                >
                  {/* Status dot */}
                  <span className="flex items-center justify-center">
                    <span className="relative flex size-1.5">
                      {srv.status === "online" && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      )}
                      <span className={cn("relative inline-flex size-1.5 rounded-full", STATUS_DOT[srv.status])} />
                    </span>
                  </span>

                  {/* Name */}
                  <span className="text-[11px] font-medium truncate">{srv.name}</span>

                  {/* IP */}
                  <span className="text-[11px] text-muted-foreground font-mono tabular-nums">{srv.ip}</span>

                  {/* DNS */}
                  <span className="text-[11px] text-muted-foreground/60 font-mono truncate">{srv.dns ?? "—"}</span>

                  {/* Status badge */}
                  <StatusBadge status={srv.status} className="w-fit" />

                  {/* CPU */}
                  <div className="flex items-center gap-1.5">
                    <ProgressBar value={srv.cpu} className="flex-1" />
                    <span className="text-[10px] tabular-nums text-muted-foreground w-6 text-right">%{srv.cpu}</span>
                  </div>

                  {/* RAM */}
                  <div className="flex items-center gap-1.5">
                    <ProgressBar value={srv.ram} className="flex-1" />
                    <span className="text-[10px] tabular-nums text-muted-foreground w-6 text-right">%{srv.ram}</span>
                  </div>

                  {/* Disk */}
                  <div className="flex items-center gap-1.5">
                    <ProgressBar value={srv.disk} className="flex-1" />
                    <span className="text-[10px] tabular-nums text-muted-foreground w-6 text-right">%{srv.disk}</span>
                  </div>

                  {/* Rol — sadece ilk badge */}
                  <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium whitespace-nowrap">
                    {srv.roles[0]}
                  </span>

                  {/* Actions */}
                  <ActionMenu serverId={srv.id} />
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
            <Server className="size-3" />
            <span>{filtered.length} sunucu listeleniyor</span>
          </div>
        </div>
      )}

      {/* ── CARD VIEW ── */}
      {view === "card" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((srv) => (
              <div key={srv.id} className="rounded-[8px] p-2" style={{ backgroundColor: "#F4F2F0" }}>
                <div className="rounded-[4px] overflow-hidden" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>

                  {/* Card header */}
                  <div className="px-3 pt-3 pb-2.5 border-b border-border/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="relative flex size-1.5 shrink-0">
                            {srv.status === "online" && (
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            )}
                            <span className={cn("relative inline-flex size-1.5 rounded-full", STATUS_DOT[srv.status])} />
                          </span>
                          <p className="text-[11px] font-semibold truncate">{srv.name}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground font-mono">{srv.ip}</span>
                          {srv.dns && (
                            <>
                              <span className="text-[10px] text-border">·</span>
                              <span className="text-[10px] text-muted-foreground/70 font-mono truncate">{srv.dns}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {srv.roles.map((role) => (
                          <span key={role} className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium">
                            {role}
                          </span>
                        ))}
                        <ActionMenu serverId={srv.id} />
                      </div>
                    </div>
                  </div>

                  {/* Circular metrics */}
                  <div className="grid grid-cols-3 divide-x divide-border/40 border-b border-border/40">
                    {[
                      { label: "CPU", value: srv.cpu },
                      { label: "RAM", value: srv.ram },
                      { label: "Disk", value: srv.disk },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex flex-col items-center py-3 gap-1">
                        <AnimatedGauge value={value} className="size-14 text-[11px] font-semibold" />
                        <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Card footer */}
                  <div className="flex items-center gap-1 px-3 py-2 border-t border-border/40 bg-muted/20">
                    <Clock className="size-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">{srv.lastChecked}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">↑ {srv.uptime}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1">
            <Server className="size-3" />
            <span>{filtered.length} sunucu listeleniyor</span>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
