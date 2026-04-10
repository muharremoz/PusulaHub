"use client";

import { useEffect, useMemo, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  MoreVertical,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Layers,
  FolderOpen,
  FileText,
  Plus,
  Tag,
  Inbox,
  Server,
  Globe,
  Waypoints,
} from "lucide-react";
import { ServiceSheet } from "@/components/services/service-sheet";
import { StatsCard } from "@/components/shared/stats-card";
import { toast } from "sonner";
import type { WizardServiceDto, ServiceType } from "@/app/api/services/route";

/* ── Tipler ── */
type SortKey = "name" | "category" | "displayOrder" | "isActive" | "type";
type SortDir = "asc" | "desc";
type FilterCat = "all" | string;

const TYPE_LABELS: Record<ServiceType, { label: string; icon: React.ReactNode; badge: string }> = {
  "pusula-program": { label: "Pusula", icon: <Server className="size-3" />, badge: "bg-blue-50 text-blue-700 border-blue-200" },
  "iis-site":       { label: "IIS",    icon: <Globe  className="size-3" />, badge: "bg-purple-50 text-purple-700 border-purple-200" },
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
  const [services, setServices] = useState<WizardServiceDto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [sortKey, setSortKey]   = useState<SortKey>("displayOrder");
  const [sortDir, setSortDir]   = useState<SortDir>("asc");
  const [filter, setFilter]     = useState<FilterCat>("all");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing]     = useState<WizardServiceDto | null>(null);
  const [deleting, setDeleting]   = useState<WizardServiceDto | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/services");
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Hizmetler alınamadı");
      setServices(data as WizardServiceDto[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const categories = useMemo(
    () => [...new Set(services.map((s) => s.category))],
    [services]
  );

  const filtered = useMemo(() => {
    return services
      .filter((s) => filter === "all" || s.category === filter)
      .sort((a, b) => {
        const mul = sortDir === "asc" ? 1 : -1;
        if (sortKey === "displayOrder") return (a.displayOrder - b.displayOrder) * mul;
        if (sortKey === "isActive")     return (Number(b.isActive) - Number(a.isActive)) * mul;
        if (sortKey === "type")         return a.type.localeCompare(b.type) * mul;
        return String(a[sortKey]).localeCompare(String(b[sortKey])) * mul;
      });
  }, [services, filter, sortKey, sortDir]);

  const counts = {
    total:    services.length,
    active:   services.filter((s) => s.isActive).length,
    inactive: services.filter((s) => !s.isActive).length,
    cats:     categories.length,
  };

  const openCreate = () => { setEditing(null); setSheetOpen(true); };
  const openEdit   = (s: WizardServiceDto) => { setEditing(s); setSheetOpen(true); };

  const handleToggleActive = async (s: WizardServiceDto) => {
    try {
      const r = await fetch(`/api/services/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !s.isActive }),
      });
      if (!r.ok) throw new Error((await r.json())?.error ?? "Güncellenemedi");
      toast.success(s.isActive ? "Hizmet pasife alındı" : "Hizmet aktif edildi");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const r = await fetch(`/api/services/${deleting.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json())?.error ?? "Silinemedi");
      toast.success("Hizmet silindi");
      setDeleting(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <PageContainer title="Hizmetler" description="Firma kurulum sihirbazında kullanılan hizmet kataloğu">

      {/* ── İstatistikler ── */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatsCard title="TOPLAM HİZMET" value={counts.total}    icon={<Layers className="h-4 w-4" />}      trend={{ value: `${counts.active} aktif`, positive: true }} subtitle="Tüm kategoriler" />
        <StatsCard title="AKTİF"          value={counts.active}   icon={<Tag className="h-4 w-4" />}         trend={{ value: "Sihirbazda görünür",   positive: true }} subtitle="Kullanılabilir hizmet" />
        <StatsCard title="PASİF"          value={counts.inactive} icon={<Inbox className="h-4 w-4" />}       trend={{ value: "Sihirbazda gizli",     positive: false }} subtitle="Devre dışı" />
        <StatsCard title="KATEGORİ"       value={counts.cats}     icon={<FolderOpen className="h-4 w-4" />}  trend={{ value: "Farklı grup",          positive: true }} subtitle="Otomatik gruplama" />
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center rounded-[8px] p-1 flex-wrap gap-0.5" style={{ backgroundColor: "#F4F2F0" }}>
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-[6px] text-[11px] px-3 py-1.5 font-medium transition-colors",
              filter === "all" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Tümü
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={cn(
                "rounded-[6px] text-[11px] px-3 py-1.5 font-medium transition-colors",
                filter === cat ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={openCreate}
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
          <div className="grid grid-cols-[16px_70px_1.4fr_140px_2fr_1.2fr_90px_50px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
            <span />
            <SortHeader label="Tip"          sortKey="type"          active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Hizmet Adı"   sortKey="name"          active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Kategori"     sortKey="category"      active={sortKey} dir={sortDir} onSort={handleSort} />
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Kaynak Klasör</span>
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Tipe Özel</span>
            <SortHeader label="Durum"        sortKey="isActive"      active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Sıra"         sortKey="displayOrder"  active={sortKey} dir={sortDir} onSort={handleSort} />
            <span />
          </div>

          {/* Loading */}
          {loading && (
            <div className="divide-y divide-border/40">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[16px_70px_1.4fr_140px_2fr_1.2fr_90px_50px_28px] gap-3 px-3 py-2.5 items-center">
                  <Skeleton className="size-1.5 rounded-full" />
                  <Skeleton className="h-3 w-12 rounded-[3px]" />
                  <Skeleton className="h-3 w-32 rounded-[3px]" />
                  <Skeleton className="h-3 w-16 rounded-[3px]" />
                  <Skeleton className="h-3 w-48 rounded-[3px]" />
                  <Skeleton className="h-3 w-32 rounded-[3px]" />
                  <Skeleton className="h-3 w-12 rounded-[3px]" />
                  <Skeleton className="h-3 w-6 rounded-[3px]" />
                  <Skeleton className="size-4 rounded-[3px]" />
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="px-4 py-8 text-center text-[11px] text-red-600">{error}</div>
          )}

          {/* Empty */}
          {!loading && !error && filtered.length === 0 && (
            <div className="px-4 py-12 text-center">
              <Inbox className="size-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-[12px] font-medium text-foreground">
                {filter === "all" ? "Henüz hizmet yok" : `${filter} kategorisinde hizmet yok`}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {filter === "all"
                  ? "Sağ üstteki “Yeni Hizmet” butonuyla ilk hizmetinizi ekleyin."
                  : "Farklı bir kategori seçin veya yeni hizmet ekleyin."}
              </p>
            </div>
          )}

          {/* Satırlar */}
          {!loading && !error && filtered.length > 0 && (
            <div className="divide-y divide-border/40">
              {filtered.map((svc) => {
                const sourceFolder =
                  svc.config && "sourceFolderPath" in svc.config ? svc.config.sourceFolderPath : "—";
                const programCode =
                  svc.type === "pusula-program" && svc.config && "programCode" in svc.config
                    ? svc.config.programCode
                    : null;
                const typeMeta = TYPE_LABELS[svc.type];
                return (
                <div
                  key={svc.id}
                  className="grid grid-cols-[16px_70px_1.4fr_140px_2fr_1.2fr_90px_50px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
                >
                  {/* Durum noktası */}
                  <span className="flex items-center justify-center">
                    <span className="relative flex size-1.5">
                      {svc.isActive && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      )}
                      <span className={cn(
                        "relative inline-flex size-1.5 rounded-full",
                        svc.isActive ? "bg-emerald-500" : "bg-slate-300"
                      )} />
                    </span>
                  </span>

                  {/* Tip badge */}
                  <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-[4px] border w-fit flex items-center gap-1", typeMeta.badge)}>
                    {typeMeta.icon}
                    {typeMeta.label}
                  </span>

                  {/* Hizmet adı + program kodu */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium truncate">{svc.name}</span>
                    </div>
                    {programCode && (
                      <p className="text-[9px] font-mono text-muted-foreground/70 mt-0.5">{programCode}</p>
                    )}
                  </div>

                  {/* Kategori */}
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-[4px] border bg-muted/40 text-muted-foreground border-border/60 w-fit">
                    {svc.category}
                  </span>

                  {/* Kaynak klasör */}
                  <div className="flex items-center gap-1.5 min-w-0 text-[10px] text-muted-foreground">
                    <FolderOpen className="size-3 shrink-0" />
                    <span className="font-mono truncate">{sourceFolder}</span>
                  </div>

                  {/* Tipe özel */}
                  <div className="flex items-center gap-1.5 min-w-0 text-[10px] text-muted-foreground">
                    {svc.type === "pusula-program" && svc.config && "paramFileName" in svc.config ? (
                      svc.config.paramFileName ? (
                        <>
                          <FileText className="size-3 shrink-0" />
                          <span className="font-mono truncate">{svc.config.paramFileName}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground/40">— param yok</span>
                      )
                    ) : svc.type === "iis-site" && svc.config && "siteNamePattern" in svc.config ? (
                      <>
                        <Waypoints className="size-3 shrink-0" />
                        <span className="font-mono truncate">{svc.config.siteNamePattern}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </div>

                  {/* Durum */}
                  <span className={cn(
                    "text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border w-fit",
                    svc.isActive
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-muted text-muted-foreground border-border"
                  )}>
                    {svc.isActive ? "Aktif" : "Pasif"}
                  </span>

                  {/* Sıra */}
                  <span className="text-[10px] text-muted-foreground tabular-nums text-center">{svc.displayOrder}</span>

                  {/* Aksiyon */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                        <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-[6px]">
                      <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => openEdit(svc)}>
                        Düzenle
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => handleToggleActive(svc)}>
                        {svc.isActive ? "Pasife Al" : "Aktif Et"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-xs cursor-pointer text-destructive" onClick={() => setDeleting(svc)}>
                        Sil
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
          <Layers className="size-3" />
          <span>{filtered.length} hizmet listeleniyor</span>
        </div>
      </div>

      <ServiceSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editing={editing}
        onSaved={refresh}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hizmet silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{deleting?.name}</span> kalıcı olarak silinecek. Bu işlem geri alınamaz.
              Pasife almak istiyorsanız menüden “Pasife Al” seçeneğini kullanın.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </PageContainer>
  );
}
