"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { servers } from "@/lib/mock-data";
import { Server, MoreVertical, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ServersPage() {
  const [filter, setFilter] = useState<"all" | "windows" | "ubuntu">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "warning" | "offline">("all");

  const filtered = servers.filter((s) => {
    if (filter === "windows" && !s.os.startsWith("Windows")) return false;
    if (filter === "ubuntu" && !s.os.startsWith("Ubuntu")) return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    return true;
  });

  return (
    <PageContainer title="Sunucular" description="Tum sunucularin listesi ve yonetimi">
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <div
          className="flex items-center rounded-[8px] p-1"
          style={{ backgroundColor: "#F4F2F0" }}
        >
          {(["all", "windows", "ubuntu"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-[6px] text-xs px-4 py-1.5 font-medium transition-colors ${
                filter === f
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "Tumu" : f === "windows" ? "Windows" : "Ubuntu"}
            </button>
          ))}
        </div>
        <div
          className="flex items-center rounded-[8px] p-1"
          style={{ backgroundColor: "#F4F2F0" }}
        >
          {(["all", "online", "warning", "offline"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`rounded-[6px] text-xs px-4 py-1.5 font-medium transition-colors ${
                statusFilter === f
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "Tumu" : f === "online" ? "Aktif" : f === "warning" ? "Uyari" : "Kapali"}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm" className="rounded-[5px] text-xs gap-1.5 h-8">
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </Button>
        </div>
      </div>

      {/* Server Table */}
      <NestedCard
        footer={
          <>
            <Server className="h-3 w-3" />
            <span>{filtered.length} sunucu listeleniyor</span>
          </>
        }
      >
        {/* Header */}
        <div className="grid grid-cols-[1.5fr_1fr_1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_1fr_0.3fr] gap-2 px-1 py-1.5 bg-muted/30 rounded-[4px] border-b">
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">SUNUCU ADI</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">IP ADRES</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">ISLETIM SISTEMI</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">DURUM</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">CPU</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">RAM</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">DISK</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">ROLLER</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide"></span>
        </div>
        {/* Rows */}
        {filtered.map((srv) => (
          <div
            key={srv.id}
            className="grid grid-cols-[1.5fr_1fr_1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_1fr_0.3fr] gap-2 px-1 py-2 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors items-center"
          >
            <span className="text-xs font-medium">{srv.name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{srv.ip}</span>
            <span className="text-xs text-muted-foreground truncate">{srv.os}</span>
            <StatusBadge status={srv.status} />
            <div className="flex items-center gap-1.5">
              <ProgressBar value={srv.cpu} className="flex-1" />
              <span className="text-[10px] tabular-nums text-muted-foreground w-6">%{srv.cpu}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ProgressBar value={srv.ram} className="flex-1" />
              <span className="text-[10px] tabular-nums text-muted-foreground w-6">%{srv.ram}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ProgressBar value={srv.disk} className="flex-1" />
              <span className="text-[10px] tabular-nums text-muted-foreground w-6">%{srv.disk}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {srv.roles.map((role) => (
                <span key={role} className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium">
                  {role}
                </span>
              ))}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center justify-center h-7 w-7 rounded-[4px] hover:bg-muted/60 transition-colors">
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-[6px]">
                <DropdownMenuItem className="text-xs">Detaylar</DropdownMenuItem>
                <DropdownMenuItem className="text-xs">Yeniden Baslat</DropdownMenuItem>
                <DropdownMenuItem className="text-xs">Terminal</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-xs text-destructive">Kaldir</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </NestedCard>
    </PageContainer>
  );
}
