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
  Database,
  Plus,
  Inbox,
  Tag,
  FolderOpen,
  Wrench,
  Link2,
} from "lucide-react";
import { DemoDatabaseSheet } from "@/components/demo-databases/demo-database-sheet";
import { StatsCard } from "@/components/shared/stats-card";
import { toast } from "sonner";
import type { DemoDatabaseDto } from "@/app/api/demo-databases/route";
import type { WizardServiceDto } from "@/app/api/services/route";

type SortKey = "name" | "dataName" | "locationType" | "isActive" | "displayOrder";
type SortDir = "asc" | "desc";
type FilterLoc = "all" | string;

const LOCATION_BADGE: Record<string, string> = {
  "Yerel":  "bg-blue-50 text-blue-700 border-blue-200",
  "Şablon": "bg-amber-50 text-amber-700 border-amber-200",
  "Uzak":   "bg-purple-50 text-purple-700 border-purple-200",
};

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

export default function DemoDatabasesPage() {
  const [items, setItems]   = useState<DemoDatabaseDto[]>([]);
  const [services, setServices] = useState<WizardServiceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("displayOrder");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter,  setFilter]  = useState<FilterLoc>("all");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing]     = useState<DemoDatabaseDto | null>(null);
  const [deleting, setDeleting]   = useState<DemoDatabaseDto | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dbRes, svcRes] = await Promise.all([
        fetch("/api/demo-databases"),
        fetch("/api/services?onlyActive=true"),
      ]);
      const dbData = await dbRes.json();
      if (!dbRes.ok) throw new Error(dbData?.error ?? "Demo veritabanları alınamadı");
      setItems(dbData as DemoDatabaseDto[]);

      const svcData = await svcRes.json();
      if (Array.isArray(svcData)) {
        setServices((svcData as WizardServiceDto[]).filter((s) => s.type === "pusula-program"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const serviceById = useMemo(() => {
    const m = new Map<number, WizardServiceDto>();
    for (const s of services) m.set(s.id, s);
    return m;
  }, [services]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const locationTypes = useMemo(
    () => [...new Set(items.map((s) => s.locationType))],
    [items]
  );

  const filtered = useMemo(() => {
    return items
      .filter((s) => filter === "all" || s.locationType === filter)
      .sort((a, b) => {
        const mul = sortDir === "asc" ? 1 : -1;
        if (sortKey === "displayOrder") return (a.displayOrder - b.displayOrder) * mul;
        if (sortKey === "isActive")     return (Number(b.isActive) - Number(a.isActive)) * mul;
        return String(a[sortKey]).localeCompare(String(b[sortKey])) * mul;
      });
  }, [items, filter, sortKey, sortDir]);

  const counts = {
    total:    items.length,
    active:   items.filter((s) => s.isActive).length,
    inactive: items.filter((s) => !s.isActive).length,
    linked:   items.reduce((sum, s) => sum + (s.serviceIds?.length ?? 0), 0),
  };

  const openCreate = () => { setEditing(null); setSheetOpen(true); };
  const openEdit   = (s: DemoDatabaseDto) => { setEditing(s); setSheetOpen(true); };

  const handleToggleActive = async (s: DemoDatabaseDto) => {
    try {
      const r = await fetch(`/api/demo-databases/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !s.isActive }),
      });
      if (!r.ok) throw new Error((await r.json())?.error ?? "Güncellenemedi");
      toast.success(s.isActive ? "Pasife alındı" : "Aktif edildi");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const r = await fetch(`/api/demo-databases/${deleting.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json())?.error ?? "Silinemedi");
      toast.success("Demo veritabanı silindi");
      setDeleting(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <PageContainer title="Demo Veritabanları" description="Firma kurulum sihirbazında seçilebilen demo veritabanı kataloğu">

      {/* ── İstatistikler ── */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatsCard title="TOPLAM"         value={counts.total}    icon={<Database className="h-4 w-4" />} trend={{ value: `${counts.active} aktif`,      positive: true }}  subtitle="Demo kataloğu" />
        <StatsCard title="AKTİF"          value={counts.active}   icon={<Tag className="h-4 w-4" />}      trend={{ value: "Sihirbazda görünür",  positive: true }}  subtitle="Kullanılabilir" />
        <StatsCard title="PASİF"          value={counts.inactive} icon={<Inbox className="h-4 w-4" />}    trend={{ value: "Sihirbazda gizli",    positive: false }} subtitle="Devre dışı" />
        <StatsCard title="PROGRAM BAĞI"   value={counts.linked}   icon={<Link2 className="h-4 w-4" />}    trend={{ value: "Pusula programına",   positive: true }}  subtitle="Toplam ilişki" />
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
          {locationTypes.map((loc) => (
            <button
              key={loc}
              onClick={() => setFilter(loc)}
              className={cn(
                "rounded-[6px] text-[11px] px-3 py-1.5 font-medium transition-colors",
                filter === loc ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {loc}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-[6px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            <Plus className="size-3.5" />
            Yeni Demo DB
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
          <div className="grid grid-cols-[16px_1.3fr_1fr_1.5fr_1.5fr_90px_90px_50px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
            <span />
            <SortHeader label="Ad"        sortKey="name"         active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="DB Adı"    sortKey="dataName"     active={sortKey} dir={sortDir} onSort={handleSort} />
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Programlar</span>
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Konum</span>
            <SortHeader label="Tip"       sortKey="locationType" active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Durum"     sortKey="isActive"     active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Sıra"      sortKey="displayOrder" active={sortKey} dir={sortDir} onSort={handleSort} />
            <span />
          </div>

          {/* Loading */}
          {loading && (
            <div className="divide-y divide-border/40">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[16px_1.3fr_1fr_1.5fr_1.5fr_90px_90px_50px_28px] gap-3 px-3 py-2.5 items-center">
                  <Skeleton className="size-1.5 rounded-full" />
                  <Skeleton className="h-3 w-32 rounded-[3px]" />
                  <Skeleton className="h-3 w-24 rounded-[3px]" />
                  <Skeleton className="h-3 w-40 rounded-[3px]" />
                  <Skeleton className="h-3 w-44 rounded-[3px]" />
                  <Skeleton className="h-3 w-14 rounded-[3px]" />
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
                {filter === "all" ? "Henüz demo veritabanı yok" : `${filter} tipinde demo DB yok`}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 mb-3">
                {filter === "all"
                  ? "Sağ üstteki “Yeni Demo DB” butonuyla ilk kaydı ekleyin."
                  : "Farklı bir tip seçin veya yeni demo DB ekleyin."}
              </p>
              {filter === "all" && (
                <button
                  onClick={openCreate}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-[5px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
                >
                  <Plus className="size-3.5" />
                  Yeni Demo DB
                </button>
              )}
            </div>
          )}

          {/* Satırlar */}
          {!loading && !error && filtered.length > 0 && (
            <div className="divide-y divide-border/40">
              {filtered.map((db) => {
                const badge = LOCATION_BADGE[db.locationType] ?? "bg-muted text-muted-foreground border-border";
                const linkedServices = (db.serviceIds ?? [])
                  .map((id) => serviceById.get(id))
                  .filter((s): s is WizardServiceDto => !!s);
                return (
                  <div
                    key={db.id}
                    className="grid grid-cols-[16px_1.3fr_1fr_1.5fr_1.5fr_90px_90px_50px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
                  >
                    {/* Durum noktası */}
                    <span className="flex items-center justify-center">
                      <span className="relative flex size-1.5">
                        {db.isActive && (
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        )}
                        <span className={cn(
                          "relative inline-flex size-1.5 rounded-full",
                          db.isActive ? "bg-emerald-500" : "bg-slate-300"
                        )} />
                      </span>
                    </span>

                    {/* Ad + açıklama */}
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium truncate">{db.name}</p>
                      {db.description && (
                        <p className="text-[9px] text-muted-foreground/70 mt-0.5 truncate">{db.description}</p>
                      )}
                    </div>

                    {/* DB adı */}
                    <span className="text-[11px] font-mono text-muted-foreground truncate">{db.dataName}</span>

                    {/* Programlar badge'leri */}
                    <div className="flex items-center gap-1 flex-wrap min-w-0">
                      {linkedServices.length === 0 ? (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                          <Wrench className="size-3" />
                          <span>—</span>
                        </span>
                      ) : (
                        <>
                          {linkedServices.slice(0, 3).map((svc) => (
                            <span
                              key={svc.id}
                              className="text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border bg-indigo-50 text-indigo-700 border-indigo-200 truncate max-w-[130px]"
                              title={svc.name}
                            >
                              {svc.name}
                            </span>
                          ))}
                          {linkedServices.length > 3 && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border bg-muted text-muted-foreground border-border">
                              +{linkedServices.length - 3}
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Konum yolu */}
                    <div className="flex items-center gap-1.5 min-w-0 text-[10px] text-muted-foreground">
                      {db.locationPath ? (
                        <>
                          <FolderOpen className="size-3 shrink-0" />
                          <span className="font-mono truncate">{db.locationPath}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </div>

                    {/* Tip */}
                    <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border w-fit", badge)}>
                      {db.locationType}
                    </span>

                    {/* Durum */}
                    <span className={cn(
                      "text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border w-fit",
                      db.isActive
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-muted text-muted-foreground border-border"
                    )}>
                      {db.isActive ? "Aktif" : "Pasif"}
                    </span>

                    {/* Sıra */}
                    <span className="text-[10px] text-muted-foreground tabular-nums text-center">{db.displayOrder}</span>

                    {/* Aksiyon */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-[6px]">
                        <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => openEdit(db)}>
                          Düzenle
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => handleToggleActive(db)}>
                          {db.isActive ? "Pasife Al" : "Aktif Et"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-xs cursor-pointer text-destructive" onClick={() => setDeleting(db)}>
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
          <Database className="size-3" />
          <span>{filtered.length} demo veritabanı listeleniyor</span>
        </div>
      </div>

      <DemoDatabaseSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editing={editing}
        onSaved={refresh}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Demo veritabanı silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{deleting?.name}</span> kalıcı olarak silinecek. Bu işlem geri alınamaz.
              Pasife almak istiyorsanız menüden "Pasife Al" seçeneğini kullanın.
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
