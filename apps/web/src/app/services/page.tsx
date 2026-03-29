"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { StatsCard } from "@/components/shared/stats-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { services, servers } from "@/lib/mock-data";
import type { ServiceCategory, ServiceStatus } from "@/types";
import {
  Briefcase,
  Plus,
  Search,
  MoreVertical,
  Server,
  Shield,
  Database,
  Globe,
  HardDrive,
  Activity,
  Network,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const categoryIcons: Record<ServiceCategory, React.ElementType> = {
  Altyapi: Network,
  Veritabani: Database,
  Web: Globe,
  Guvenlik: Shield,
  Yedekleme: HardDrive,
  Izleme: Activity,
};

const categoryColors: Record<ServiceCategory, string> = {
  Altyapi: "bg-blue-50 text-blue-600 border-blue-200/60",
  Veritabani: "bg-purple-50 text-purple-600 border-purple-200/60",
  Web: "bg-emerald-50 text-emerald-600 border-emerald-200/60",
  Guvenlik: "bg-red-50 text-red-600 border-red-200/60",
  Yedekleme: "bg-amber-50 text-amber-600 border-amber-200/60",
  Izleme: "bg-cyan-50 text-cyan-600 border-cyan-200/60",
};

const statusConfig: Record<ServiceStatus, { label: string; variant: "online" | "warning" | "offline" }> = {
  active: { label: "Aktif", variant: "online" },
  maintenance: { label: "Bakimda", variant: "warning" },
  inactive: { label: "Pasif", variant: "offline" },
};

export default function ServicesPage() {
  const [categoryFilter, setCategoryFilter] = useState<"all" | ServiceCategory>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ServiceStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedService, setSelectedService] = useState<string | null>(null);

  const filtered = services.filter((svc) => {
    if (categoryFilter !== "all" && svc.category !== categoryFilter) return false;
    if (statusFilter !== "all" && svc.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return svc.name.toLowerCase().includes(q) || svc.description.toLowerCase().includes(q);
    }
    return true;
  });

  const activeCount = services.filter((s) => s.status === "active").length;
  const maintenanceCount = services.filter((s) => s.status === "maintenance").length;
  const categories = [...new Set(services.map((s) => s.category))];
  const totalServerLinks = services.reduce((a, s) => a + s.servers.length, 0);

  const selected = selectedService ? services.find((s) => s.id === selectedService) : null;

  return (
    <PageContainer title="Hizmetler" description="Pusula firmasinin sunucularda verdigi hizmetler">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6 items-stretch">
        <StatsCard
          title="TOPLAM HIZMET"
          value={services.length}
          icon={<Briefcase className="h-4 w-4" />}
          subtitle={`${categories.length} kategori`}
        />
        <StatsCard
          title="AKTIF HIZMET"
          value={activeCount}
          icon={<Activity className="h-4 w-4" />}
          trend={{ value: "Tumu calisiyor", positive: true }}
          subtitle="Sorunsuz"
        />
        <StatsCard
          title="BAKIMDA"
          value={maintenanceCount}
          icon={<Shield className="h-4 w-4" />}
          trend={maintenanceCount > 0 ? { value: "Dikkat gerektiriyor", positive: false } : undefined}
          subtitle="Bakim surecinde"
        />
        <StatsCard
          title="SUNUCU BAGLANTISI"
          value={totalServerLinks}
          icon={<Server className="h-4 w-4" />}
          subtitle="Hizmet-sunucu eslesmesi"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center rounded-[8px] p-1"
          style={{ backgroundColor: "#F4F2F0" }}
        >
          <button
            onClick={() => setCategoryFilter("all")}
            className={`rounded-[6px] text-xs px-3 py-1.5 font-medium transition-colors ${
              categoryFilter === "all"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Tumu
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-[6px] text-xs px-3 py-1.5 font-medium transition-colors ${
                categoryFilter === cat
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div
          className="flex items-center rounded-[8px] p-1"
          style={{ backgroundColor: "#F4F2F0" }}
        >
          {(["all", "active", "maintenance", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`rounded-[6px] text-xs px-3 py-1.5 font-medium transition-colors ${
                statusFilter === f
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "Tumu" : statusConfig[f].label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Hizmet ara..."
            className="h-8 text-xs rounded-[5px] bg-white pl-8 w-56"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" className="rounded-[5px] text-xs gap-1 h-8">
          <Plus className="h-3.5 w-3.5" />
          Yeni Hizmet
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-3">
        {/* Service Table */}
        <NestedCard
          footer={
            <>
              <Briefcase className="h-3 w-3" />
              <span>{filtered.length} hizmet listeleniyor</span>
            </>
          }
        >
          {/* Header */}
          <div className="grid grid-cols-[1.8fr_0.8fr_0.6fr_1.2fr_0.8fr_0.3fr] gap-2 px-1 py-1.5 bg-muted/30 rounded-[4px] border-b">
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">HIZMET ADI</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">KATEGORI</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">DURUM</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">SUNUCULAR</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">GUNCELLEME</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide"></span>
          </div>
          {/* Rows */}
          {filtered.map((svc) => {
            const CatIcon = categoryIcons[svc.category];
            const st = statusConfig[svc.status];
            return (
              <div
                key={svc.id}
                onClick={() => setSelectedService(svc.id)}
                className={`grid grid-cols-[1.8fr_0.8fr_0.6fr_1.2fr_0.8fr_0.3fr] gap-2 px-1 py-2 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer items-center ${
                  selectedService === svc.id ? "bg-muted/30" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`flex items-center justify-center h-7 w-7 rounded-[5px] shrink-0 ${categoryColors[svc.category]}`}>
                    <CatIcon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{svc.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{svc.description}</p>
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-[5px] border px-2 py-0.5 text-[10px] font-medium w-fit ${categoryColors[svc.category]}`}>
                  {svc.category}
                </span>
                <StatusBadge status={st.variant} label={st.label} />
                <div className="flex flex-wrap gap-1">
                  {svc.servers.map((srv) => (
                    <span key={srv} className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium">
                      {srv}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">{svc.updatedAt}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex items-center justify-center h-7 w-7 rounded-[4px] hover:bg-muted/60 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-[6px]">
                    <DropdownMenuItem className="text-xs">Duzenle</DropdownMenuItem>
                    <DropdownMenuItem className="text-xs">Kopyala</DropdownMenuItem>
                    <DropdownMenuItem className="text-xs">Devre Disi Birak</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-xs text-destructive">Sil</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </NestedCard>

        {/* Detail Panel */}
        <NestedCard>
          {selected ? (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className={`flex items-center justify-center h-10 w-10 rounded-[6px] shrink-0 ${categoryColors[selected.category]}`}>
                  {(() => {
                    const CatIcon = categoryIcons[selected.category];
                    return <CatIcon className="h-5 w-5" />;
                  })()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{selected.name}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{selected.description}</p>
                </div>
              </div>

              {/* Info */}
              <div className="space-y-3 pt-3 border-t border-border/40">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Kategori</p>
                  <span className={`inline-flex items-center gap-1 rounded-[5px] border px-2.5 py-0.5 text-[10px] font-medium ${categoryColors[selected.category]}`}>
                    {(() => {
                      const CatIcon = categoryIcons[selected.category];
                      return <CatIcon className="h-3 w-3" />;
                    })()}
                    {selected.category}
                  </span>
                </div>

                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Durum</p>
                  <StatusBadge
                    status={statusConfig[selected.status].variant}
                    label={statusConfig[selected.status].label}
                  />
                </div>

                {(selected.port || selected.protocol) && (
                  <div className="grid grid-cols-2 gap-3">
                    {selected.port && (
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1">Port</p>
                        <p className="text-xs font-mono font-medium">{selected.port}</p>
                      </div>
                    )}
                    {selected.protocol && (
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1">Protokol</p>
                        <p className="text-xs font-medium">{selected.protocol}</p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-[11px] text-muted-foreground mb-1.5">Bagli Sunucular</p>
                  <div className="space-y-1">
                    {selected.servers.map((srvName) => {
                      const srv = servers.find((s) => s.name === srvName);
                      return (
                        <div key={srvName} className="flex items-center justify-between px-2 py-1.5 rounded-[4px] bg-muted/30">
                          <div className="flex items-center gap-1.5">
                            <div className={`h-1.5 w-1.5 rounded-full ${srv?.status === "online" ? "bg-emerald-500" : srv?.status === "warning" ? "bg-amber-500" : "bg-red-500"}`} />
                            <span className="text-[11px] font-medium">{srvName}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{srv?.ip}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">Olusturulma</p>
                    <p className="text-xs">{selected.createdAt}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">Son Guncelleme</p>
                    <p className="text-xs">{selected.updatedAt}</p>
                  </div>
                </div>

                {selected.notes && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">Notlar</p>
                    <p className="text-[11px] bg-muted/30 rounded-[4px] px-2.5 py-2 leading-relaxed">
                      {selected.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-border/40 flex gap-2">
                <Button variant="outline" size="sm" className="rounded-[5px] text-xs flex-1 gap-1">
                  Duzenle
                </Button>
                <Button variant="outline" size="sm" className="rounded-[5px] text-xs gap-1">
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Briefcase className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-xs text-muted-foreground">Detaylarini gormek icin bir hizmet secin</p>
            </div>
          )}
        </NestedCard>
      </div>
    </PageContainer>
  );
}
