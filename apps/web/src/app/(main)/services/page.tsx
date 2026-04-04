"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { mockServices, type PusulaService, type ServiceCategory, type ServiceStatus } from "@/lib/mock-services";
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
  Layers,
  Plug,
  Code2,
  Building2,
  Package,
  Plus,
} from "lucide-react";
import { ServiceSheet } from "@/components/services/service-sheet";
import { StatsCard } from "@/components/shared/stats-card";

/* ── Tipler ── */
type SortKey = "name" | "category" | "status" | "firmCount" | "updatedAt";
type SortDir = "asc" | "desc";
type FilterCat = "all" | ServiceCategory;

/* ── Yardımcılar ── */
const STATUS_LABEL: Record<ServiceStatus, string> = {
  active:      "Aktif",
  maintenance: "Bakımda",
  inactive:    "Pasif",
};

const STATUS_BADGE: Record<ServiceStatus, string> = {
  active:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  maintenance: "bg-amber-50 text-amber-700 border-amber-200",
  inactive:    "bg-muted text-muted-foreground border-border",
};

const STATUS_DOT: Record<ServiceStatus, string> = {
  active:      "bg-emerald-500",
  maintenance: "bg-amber-400",
  inactive:    "bg-slate-300",
};

const CAT_BADGE: Record<ServiceCategory, string> = {
  "Yazılım":     "bg-blue-50 text-blue-700 border-blue-200",
  "Entegrasyon": "bg-purple-50 text-purple-700 border-purple-200",
  "API":         "bg-orange-50 text-orange-700 border-orange-200",
};

const CAT_ICON: Record<ServiceCategory, React.ElementType> = {
  "Yazılım":     Package,
  "Entegrasyon": Plug,
  "API":         Code2,
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
export default function ServicesPage() {
  const [sortKey, setSortKey]   = useState<SortKey>("category");
  const [sortDir, setSortDir]   = useState<SortDir>("asc");
  const [filter, setFilter]     = useState<FilterCat>("all");
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = mockServices
    .filter((s) => filter === "all" || s.category === filter)
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "firmCount") return (a.firmCount - b.firmCount) * mul;
      return String(a[sortKey]).localeCompare(String(b[sortKey])) * mul;
    });

  const counts = {
    total:       mockServices.length,
    active:      mockServices.filter((s) => s.status === "active").length,
    yazilim:     mockServices.filter((s) => s.category === "Yazılım").length,
    entegrasyon: mockServices.filter((s) => s.category === "Entegrasyon").length,
    api:         mockServices.filter((s) => s.category === "API").length,
    totalFirms:  [...new Set(mockServices.flatMap((s) => s.firmCount))].reduce((a, b) => a + b, 0),
  };

  return (
    <PageContainer title="Hizmetler" description="Pusula Yazılım ürün ve entegrasyon kataloğu">

      {/* ── İstatistikler ── */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatsCard title="TOPLAM HİZMET" value={counts.total}       icon={<Layers className="h-4 w-4" />}   trend={{ value: `${counts.active} aktif hizmet`, positive: true }}  subtitle="Tüm kategoriler" />
        <StatsCard title="YAZILIM"       value={counts.yazilim}     icon={<Package className="h-4 w-4" />}  trend={{ value: "Uygulama grubu", positive: true }}                  subtitle="Pusula ürünleri" />
        <StatsCard title="ENTEGRASYON"   value={counts.entegrasyon} icon={<Plug className="h-4 w-4" />}     trend={{ value: "Dış sistem bağlantısı", positive: true }}           subtitle="Aktif entegrasyonlar" />
        <StatsCard title="API"           value={counts.api}         icon={<Code2 className="h-4 w-4" />}   trend={{ value: "Servis katmanı", positive: true }}                  subtitle="REST / Webhook" />
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center rounded-[8px] p-1" style={{ backgroundColor: "#F4F2F0" }}>
          {(["all", "Yazılım", "Entegrasyon", "API"] as FilterCat[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-[6px] text-[11px] px-3 py-1.5 font-medium transition-colors",
                filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all" ? "Tümü" : f}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-[6px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            <Plus className="size-3.5" />
            Yeni Hizmet
          </button>
        </div>
      </div>

      {/* ── Liste ── */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px] overflow-hidden"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          {/* Header */}
          <div className="grid grid-cols-[16px_2fr_3fr_100px_80px_60px_80px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
            <span />
            <SortHeader label="Hizmet Adı"  sortKey="name"      active={sortKey} dir={sortDir} onSort={handleSort} />
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Açıklama</span>
            <SortHeader label="Kategori"    sortKey="category"  active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Durum"       sortKey="status"    active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Firma"       sortKey="firmCount" active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Güncelleme"  sortKey="updatedAt" active={sortKey} dir={sortDir} onSort={handleSort} />
            <span />
          </div>

          {/* Satırlar */}
          <div className="divide-y divide-border/40">
            {filtered.map((svc) => {
              const CatIcon = CAT_ICON[svc.category];
              return (
                <div
                  key={svc.id}
                  className="grid grid-cols-[16px_2fr_3fr_100px_80px_60px_80px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
                >
                  {/* Durum noktası */}
                  <span className="flex items-center justify-center">
                    <span className="relative flex size-1.5">
                      {svc.status === "active" && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      )}
                      <span className={cn("relative inline-flex size-1.5 rounded-full", STATUS_DOT[svc.status])} />
                    </span>
                  </span>

                  {/* Hizmet adı + versiyon + etiketler */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium truncate">{svc.name}</span>
                      <span className="text-[9px] text-muted-foreground/60 tabular-nums shrink-0">{svc.version}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {svc.tags.map((t) => (
                        <span key={t} className="text-[9px] bg-muted px-1 py-0 rounded-[3px] text-muted-foreground">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Açıklama */}
                  <span className="text-[11px] text-muted-foreground truncate">{svc.description}</span>

                  {/* Kategori */}
                  <span className={cn(
                    "text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border w-fit flex items-center gap-1",
                    CAT_BADGE[svc.category]
                  )}>
                    <CatIcon className="size-2.5" />
                    {svc.category}
                  </span>

                  {/* Durum */}
                  <span className={cn(
                    "text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border w-fit",
                    STATUS_BADGE[svc.status]
                  )}>
                    {STATUS_LABEL[svc.status]}
                  </span>

                  {/* Firma sayısı */}
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Building2 className="size-3 shrink-0" />
                    <span className="tabular-nums">{svc.firmCount}</span>
                  </div>

                  {/* Güncelleme */}
                  <span className="text-[10px] text-muted-foreground tabular-nums">{svc.updatedAt}</span>

                  {/* Aksiyon */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                        <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-[6px]">
                      <DropdownMenuItem className="text-xs cursor-pointer">Düzenle</DropdownMenuItem>
                      <DropdownMenuItem className="text-xs cursor-pointer">Firma Listesi</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-xs cursor-pointer text-destructive">Pasife Al</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
          <Layers className="size-3" />
          <span>{filtered.length} hizmet listeleniyor</span>
        </div>
      </div>

      <ServiceSheet open={sheetOpen} onOpenChange={setSheetOpen} />

    </PageContainer>
  );
}
