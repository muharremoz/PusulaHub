"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { StatsCard } from "@/components/shared/stats-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  MoreVertical,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Waypoints,
  Plus,
  Layers,
} from "lucide-react";
import { PortRangeSheet } from "@/components/ports/port-range-sheet";

/* ── Tipler ── */
type RangeStatus   = "active" | "reserved" | "inactive";
type PortProtocol  = "TCP" | "UDP" | "TCP/UDP";

interface PortRange {
  id: string;
  hizmet: string;
  firma: string;
  portStart: number;
  portEnd: number;
  protocol: PortProtocol;
  description: string;
  status: RangeStatus;
  usedCount: number;   // o aralıkta kaç port kullanılıyor
}

type SortKey = "hizmet" | "firma" | "portStart" | "status";
type SortDir = "asc" | "desc";
type FilterStatus = "all" | RangeStatus;

/* ── Mock Veri ── */
const PORT_RANGES: PortRange[] = [
  { id: "r01", hizmet: "PusulaERP",             firma: "Pusula Teknoloji", portStart: 8080, portEnd: 8089, protocol: "TCP",     description: "ERP uygulama sunucusu HTTP portları",        status: "active",   usedCount: 6 },
  { id: "r02", hizmet: "PusulaERP",             firma: "Pusula Teknoloji", portStart: 8443, portEnd: 8449, protocol: "TCP",     description: "ERP uygulama sunucusu HTTPS portları",       status: "active",   usedCount: 3 },
  { id: "r03", hizmet: "PusulaHR",              firma: "Pusula Teknoloji", portStart: 9000, portEnd: 9009, protocol: "TCP",     description: "İK modülü servis portları",                  status: "active",   usedCount: 4 },
  { id: "r04", hizmet: "REST API Entegrasyonu", firma: "Atlas Lojistik",   portStart: 5000, portEnd: 5019, protocol: "TCP",     description: "Lojistik entegrasyon API portları",          status: "active",   usedCount: 12 },
  { id: "r05", hizmet: "CRM Modülü",            firma: "Yildiz Holding",   portStart: 7000, portEnd: 7009, protocol: "TCP",     description: "CRM web uygulaması portları",                status: "active",   usedCount: 5 },
  { id: "r06", hizmet: "Doküman Yönetimi",      firma: "Pusula Teknoloji", portStart: 6100, portEnd: 6109, protocol: "TCP",     description: "Doküman yönetim sistemi portları",           status: "active",   usedCount: 3 },
  { id: "r07", hizmet: "İntranet Portalı",      firma: "Yildiz Holding",   portStart: 8800, portEnd: 8809, protocol: "TCP",     description: "İntranet portal servis portları",            status: "reserved", usedCount: 0 },
  { id: "r08", hizmet: "PusulaERP",             firma: "Atlas Lojistik",   portStart: 8090, portEnd: 8099, protocol: "TCP",     description: "Atlas ERP uygulama sunucusu portları",       status: "active",   usedCount: 7 },
  { id: "r09", hizmet: "Muhasebe Entegrasyonu", firma: "Yildiz Holding",   portStart: 4500, portEnd: 4509, protocol: "TCP/UDP", description: "Muhasebe sistemi entegrasyon portları",      status: "inactive", usedCount: 0 },
  { id: "r10", hizmet: "Prometheus İzleme",     firma: "Pusula Teknoloji", portStart: 9090, portEnd: 9099, protocol: "TCP",     description: "Metrik toplama ve izleme portları",          status: "active",   usedCount: 2 },
  { id: "r11", hizmet: "E-Fatura Servisi",      firma: "Atlas Lojistik",   portStart: 3500, portEnd: 3509, protocol: "TCP",     description: "GİB e-fatura entegrasyon portları",          status: "reserved", usedCount: 0 },
  { id: "r12", hizmet: "Banka Entegrasyonu",    firma: "Yildiz Holding",   portStart: 4400, portEnd: 4419, protocol: "TCP",     description: "Banka API bağlantı portları",                status: "active",   usedCount: 8 },
];

/* ── Durum stilleri ── */
const STATUS_CONFIG: Record<RangeStatus, { label: string; badge: string; dot: string }> = {
  active:   { label: "Aktif",    badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  reserved: { label: "Rezerve",  badge: "bg-blue-50 text-blue-700 border-blue-200",          dot: "bg-blue-400"    },
  inactive: { label: "Pasif",    badge: "bg-muted text-muted-foreground border-border",       dot: "bg-slate-300"   },
};

const PROTOCOL_BADGE: Record<PortProtocol, string> = {
  "TCP":     "bg-blue-50 text-blue-700 border-blue-200",
  "UDP":     "bg-purple-50 text-purple-700 border-purple-200",
  "TCP/UDP": "bg-orange-50 text-orange-700 border-orange-200",
};

/* ── Kullanım çubuğu ── */
function UsageBar({ used, total, status }: { used: number; total: number; status: RangeStatus }) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const color = pct >= 80 ? "bg-red-400" : pct >= 50 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        {status === "active" && (
          <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
        )}
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0 w-12 text-right">
        {status === "active" ? `${used}/${total}` : "—"}
      </span>
    </div>
  );
}

/* ── SortHeader ── */
function SortHeader({ label, sortKey, active, dir, onSort }: {
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
          ? dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
          : <ChevronsUpDown className="size-3 opacity-40" />}
      </span>
    </button>
  );
}

/* ── Ana Bileşen ── */
export default function PortsPage() {
  const [sortKey,    setSortKey]    = useState<SortKey>("portStart");
  const [sortDir,    setSortDir]    = useState<SortDir>("asc");
  const [filter,     setFilter]     = useState<FilterStatus>("all");
  const [sheetOpen,  setSheetOpen]  = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = PORT_RANGES
    .filter((r) => filter === "all" || r.status === filter)
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "portStart") return (a.portStart - b.portStart) * mul;
      return String(a[sortKey]).localeCompare(String(b[sortKey])) * mul;
    });

  const totalPorts    = PORT_RANGES.reduce((s, r) => s + (r.portEnd - r.portStart + 1), 0);
  const usedPorts     = PORT_RANGES.reduce((s, r) => s + r.usedCount, 0);
  const activeRanges  = PORT_RANGES.filter((r) => r.status === "active").length;
  const reservedRanges = PORT_RANGES.filter((r) => r.status === "reserved").length;

  return (
    <PageContainer title="Port Yönetimi" description="Hizmet bazlı port aralığı tanımları ve kullanım takibi">

      {/* ── KPI Kartlar ── */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatsCard title="TOPLAM ARALIK"   value={PORT_RANGES.length} icon={<Layers    className="h-4 w-4" />} subtitle={`${totalPorts} port tanımlı`} />
        <StatsCard title="AKTİF ARALIK"    value={activeRanges}       icon={<Waypoints className="h-4 w-4" />} trend={{ value: "Kullanımda", positive: true }} subtitle="Hizmet veriyor" />
        <StatsCard title="REZERVE"          value={reservedRanges}     icon={<Waypoints className="h-4 w-4" />} trend={{ value: "Planlanmış", positive: true }} subtitle="Atanmayı bekliyor" />
        <StatsCard title="KULLANILAN PORT"  value={usedPorts}          icon={<Waypoints className="h-4 w-4" />} trend={{ value: `${totalPorts - usedPorts} boş`, positive: true }} subtitle={`${totalPorts} portta`} />
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center rounded-[8px] p-1" style={{ backgroundColor: "#F4F2F0" }}>
          {(["all", "active", "reserved", "inactive"] as FilterStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-[6px] text-[11px] px-3 py-1.5 font-medium transition-colors",
                filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all" ? "Tümü" : STATUS_CONFIG[f as RangeStatus].label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <button
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-[6px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            <Plus className="size-3.5" />
            Aralık Ekle
          </button>
        </div>
      </div>

      {/* ── Tablo ── */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="rounded-[4px] overflow-hidden" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>

          {/* Header */}
          <div className="grid grid-cols-[16px_1.6fr_1.2fr_110px_60px_90px_2fr_1.4fr_90px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
            <span />
            <SortHeader label="Hizmet"      sortKey="hizmet"    active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Firma"       sortKey="firma"     active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Port Aralığı" sortKey="portStart" active={sortKey} dir={sortDir} onSort={handleSort} />
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Proto</span>
            <SortHeader label="Durum"       sortKey="status"    active={sortKey} dir={sortDir} onSort={handleSort} />
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Açıklama</span>
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Kullanım</span>
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Toplam</span>
            <span />
          </div>

          {/* Satırlar */}
          <div className="divide-y divide-border/40">
            {filtered.map((entry) => {
              const cfg   = STATUS_CONFIG[entry.status];
              const total = entry.portEnd - entry.portStart + 1;
              return (
                <div
                  key={entry.id}
                  className="grid grid-cols-[16px_1.6fr_1.2fr_110px_60px_90px_2fr_1.4fr_90px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
                >
                  {/* Durum noktası */}
                  <span className="flex items-center justify-center">
                    <span className="relative flex size-1.5">
                      {entry.status === "active" && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      )}
                      <span className={cn("relative inline-flex size-1.5 rounded-full", cfg.dot)} />
                    </span>
                  </span>

                  {/* Hizmet */}
                  <span className="text-[11px] font-medium truncate">{entry.hizmet}</span>

                  {/* Firma */}
                  <span className="text-[11px] text-muted-foreground truncate">{entry.firma}</span>

                  {/* Port aralığı */}
                  <span className="text-[11px] font-mono font-semibold tabular-nums">
                    {entry.portStart}
                    <span className="text-muted-foreground font-normal"> – </span>
                    {entry.portEnd}
                  </span>

                  {/* Protokol */}
                  <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-[4px] border w-fit", PROTOCOL_BADGE[entry.protocol])}>
                    {entry.protocol}
                  </span>

                  {/* Durum */}
                  <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border w-fit", cfg.badge)}>
                    {cfg.label}
                  </span>

                  {/* Açıklama */}
                  <span className="text-[11px] text-muted-foreground truncate">{entry.description}</span>

                  {/* Kullanım çubuğu */}
                  <UsageBar used={entry.usedCount} total={total} status={entry.status} />

                  {/* Toplam port sayısı */}
                  <span className="text-[11px] text-muted-foreground tabular-nums">{total} port</span>

                  {/* Aksiyon */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                        <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-[6px]">
                      <DropdownMenuItem className="text-xs cursor-pointer">Düzenle</DropdownMenuItem>
                      <DropdownMenuItem className="text-xs cursor-pointer">Port Detayları</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-xs cursor-pointer text-destructive">Kaldır</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
          <Waypoints className="size-3" />
          <span>{filtered.length} aralık listeleniyor</span>
        </div>
      </div>

      <PortRangeSheet open={sheetOpen} onOpenChange={setSheetOpen} />

    </PageContainer>
  );
}
