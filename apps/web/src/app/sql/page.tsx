"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { sqlDatabases } from "@/lib/mock-data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MoreVertical,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Database,
  Play,
  Clock,
} from "lucide-react";

/* ── Tipler ── */
type SortKey = "name" | "server" | "sizeMB" | "tables" | "status" | "lastBackup";
type SortDir = "asc" | "desc";

/* ── Yardımcılar ── */
function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

const DB_STATUS_BADGE: Record<string, string> = {
  Online:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  Offline: "bg-muted text-muted-foreground border-border",
  Suspect: "bg-red-50 text-red-700 border-red-200",
};
const DB_STATUS_DOT: Record<string, string> = {
  Online:  "bg-emerald-500",
  Offline: "bg-slate-300",
  Suspect: "bg-red-500",
};

/* ── SortHeader ── */
function SortHeader({ label, sortKey, active, dir, onSort }: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
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
          ? dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
          : <ChevronsUpDown className="size-3 opacity-40" />}
      </span>
    </button>
  );
}

/* ── Ana Bileşen ── */
export default function SQLPage() {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [query, setQuery]     = useState("SELECT TOP 10 * FROM sys.tables");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...sqlDatabases].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortKey === "sizeMB" || sortKey === "tables") return (Number(a[sortKey]) - Number(b[sortKey])) * mul;
    return String(a[sortKey]).localeCompare(String(b[sortKey])) * mul;
  });

  return (
    <PageContainer title="SQL Server" description="Veritabanı yönetimi ve sorgu çalıştırma">

      {/* ── Veritabanı Listesi ── */}
      <div className="rounded-[8px] p-2 pb-0 mb-3" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px] overflow-hidden"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          {/* Header */}
          <div className="grid grid-cols-[16px_2fr_1fr_80px_60px_90px_140px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
            <span />
            <SortHeader label="Veritabanı"  sortKey="name"       active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Sunucu"      sortKey="server"     active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Boyut"       sortKey="sizeMB"     active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Tablo"       sortKey="tables"     active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Durum"       sortKey="status"     active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Son Yedek"   sortKey="lastBackup" active={sortKey} dir={sortDir} onSort={handleSort} />
            <span />
          </div>

          {/* Satırlar */}
          <div className="divide-y divide-border/40">
            {sorted.map((db) => (
              <div
                key={db.id}
                className="grid grid-cols-[16px_2fr_1fr_80px_60px_90px_140px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
              >
                {/* Durum noktası */}
                <span className="flex items-center justify-center">
                  <span className="relative flex size-1.5">
                    {db.status === "Online" && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span className={cn("relative inline-flex size-1.5 rounded-full", DB_STATUS_DOT[db.status] ?? "bg-slate-300")} />
                  </span>
                </span>

                {/* Veritabanı adı */}
                <div className="flex items-center gap-2 min-w-0">
                  <Database className="size-3 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-medium truncate font-mono">{db.name}</span>
                </div>

                {/* Sunucu */}
                <span className="text-[11px] text-muted-foreground truncate">{db.server}</span>

                {/* Boyut */}
                <span className="text-[11px] tabular-nums text-muted-foreground">{formatSize(db.sizeMB)}</span>

                {/* Tablo sayısı */}
                <span className="text-[11px] tabular-nums text-muted-foreground">{db.tables}</span>

                {/* Durum */}
                <span className={cn(
                  "text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border w-fit",
                  DB_STATUS_BADGE[db.status] ?? "bg-muted text-muted-foreground border-border"
                )}>
                  {db.status}
                </span>

                {/* Son yedek */}
                <span className="text-[10px] text-muted-foreground tabular-nums truncate">{db.lastBackup}</span>

                {/* Aksiyon */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                      <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-[6px]">
                    <DropdownMenuItem className="text-xs cursor-pointer">Detaylar</DropdownMenuItem>
                    <DropdownMenuItem className="text-xs cursor-pointer">Yedek Al</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-xs cursor-pointer text-destructive">Bağlantıları Kes</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
          <Database className="size-3" />
          <span>{sqlDatabases.length} veritabanı listeleniyor</span>
        </div>
      </div>

      {/* ── Sorgu Editörü ── */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px] overflow-hidden"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          {/* Editör Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
            <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Sorgu Çalıştır</p>
            <button className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-[5px] bg-foreground text-background hover:bg-foreground/90 transition-colors">
              <Play className="size-3" />
              Çalıştır
            </button>
          </div>

          {/* Textarea */}
          <div className="p-3">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rounded-[5px] text-[11px] font-mono resize-none min-h-[120px] bg-muted/20 border-border/40"
              spellCheck={false}
            />
          </div>

          {/* Mock Sonuç */}
          <div className="border-t border-border/40 mx-3 mb-3 pt-3">
            <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase mb-2">Sonuç (Mock)</p>
            <div className="rounded-[4px] bg-muted/20 p-3 font-mono text-[11px] space-y-1">
              <div className="text-muted-foreground">| name           | object_id | type |</div>
              <div className="text-muted-foreground">|----------------|-----------|------|</div>
              <div className="text-foreground">| Users          | 1234567   | U    |</div>
              <div className="text-foreground">| Orders         | 1234568   | U    |</div>
              <div className="text-foreground">| Products       | 1234569   | U    |</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
          <Clock className="size-3" />
          <span>Mock mod — sorgular gerçek çalıştırılmıyor</span>
        </div>
      </div>

    </PageContainer>
  );
}
