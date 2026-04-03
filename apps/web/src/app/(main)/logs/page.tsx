"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { logEntries, servers } from "@/lib/mock-data";
import { FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function LogsPage() {
  const [levelFilter, setLevelFilter] = useState<"all" | "info" | "warning" | "error" | "critical">("all");
  const [serverFilter, setServerFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = logEntries.filter((log) => {
    if (levelFilter !== "all" && log.level !== levelFilter) return false;
    if (serverFilter !== "all" && log.server !== serverFilter) return false;
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <PageContainer title="Loglar" description="Sistem olaylari ve log kayitlari">
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center rounded-[8px] p-1"
          style={{ backgroundColor: "#F4F2F0" }}
        >
          {(["all", "info", "warning", "error", "critical"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setLevelFilter(f)}
              className={`rounded-[6px] text-xs px-3 py-1.5 font-medium transition-colors ${
                levelFilter === f
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "Tumu" : f === "info" ? "Bilgi" : f === "warning" ? "Uyari" : f === "error" ? "Hata" : "Kritik"}
            </button>
          ))}
        </div>
        <select
          className="h-8 text-xs rounded-[5px] border border-border/40 bg-white px-2"
          value={serverFilter}
          onChange={(e) => setServerFilter(e.target.value)}
        >
          <option value="all">Tum Sunucular</option>
          {servers.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Log ara..."
            className="h-8 text-xs rounded-[5px] bg-white pl-8 w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Log Table */}
      <NestedCard
        footer={
          <>
            <FileText className="h-3 w-3" />
            <span>{filtered.length} log kaydı</span>
          </>
        }
      >
        <div className="grid grid-cols-[1.2fr_0.8fr_0.6fr_0.8fr_3fr] gap-2 px-1 py-1.5 bg-muted/30 rounded-[4px] border-b">
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">ZAMAN</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">SUNUCU</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">SEVIYE</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">KAYNAK</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">MESAJ</span>
        </div>
        {filtered.map((log) => (
          <div
            key={log.id}
            className="grid grid-cols-[1.2fr_0.8fr_0.6fr_0.8fr_3fr] gap-2 px-1 py-1.5 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors"
          >
            <span className="text-xs text-muted-foreground tabular-nums">{log.timestamp}</span>
            <span className="text-xs font-medium">{log.server}</span>
            <StatusBadge status={log.level} />
            <span className="text-xs text-muted-foreground truncate">{log.source}</span>
            <span className="text-xs text-muted-foreground">{log.message}</span>
          </div>
        ))}
      </NestedCard>
    </PageContainer>
  );
}
