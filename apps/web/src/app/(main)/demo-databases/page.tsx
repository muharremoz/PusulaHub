"use client";

import { useEffect, useMemo, useState } from "react";
import { ListeKarti, ListeAksiyonButonu, ListeThead, ListeBosSatir } from "@/components/shared/liste-karti";
import { MetinFiltre, SecimFiltre } from "@/components/shared/liste-filtreleri";
import { PageContainer } from "@/components/layout/page-container";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@muharremoz/pusula-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@muharremoz/pusula-ui";
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
  Pencil,
  Trash2,
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
  "Yerel":  "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
  "Şablon": "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  "Uzak":   "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/25",
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
  /* Sütun başlığı filtreleri — liste tasarım deseni standardı. */
  const [adFiltre,      setAdFiltre]      = useState("");
  const [dbAdFiltre,    setDbAdFiltre]    = useState("");
  const [tipFiltre,     setTipFiltre]     = useState<string[]>([]);
  const [durumFiltre,   setDurumFiltre]   = useState<string[]>([]);

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
    const ad = adFiltre.trim().toLocaleLowerCase("tr-TR");
    const db = dbAdFiltre.trim().toLocaleLowerCase("tr-TR");
    return items
      .filter((s) => {
        if (ad && !s.name.toLocaleLowerCase("tr-TR").includes(ad)) return false;
        if (db && !s.dataName.toLocaleLowerCase("tr-TR").includes(db)) return false;
        if (tipFiltre.length && !tipFiltre.includes(s.locationType)) return false;
        if (durumFiltre.length && !durumFiltre.includes(s.isActive ? "aktif" : "pasif")) return false;
        return true;
      })
      .sort((a, b) => {
        const mul = sortDir === "asc" ? 1 : -1;
        if (sortKey === "displayOrder") return (a.displayOrder - b.displayOrder) * mul;
        if (sortKey === "isActive")     return (Number(b.isActive) - Number(a.isActive)) * mul;
        return String(a[sortKey]).localeCompare(String(b[sortKey])) * mul;
      });
  }, [items, adFiltre, dbAdFiltre, tipFiltre, durumFiltre, sortKey, sortDir]);

  const konumTipleri = useMemo(
    () => [...new Set(items.map((s) => s.locationType))].sort(),
    [items],
  );

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

      <ListeKarti
        baslik="Demo Veritabanları"
        ikon={<Database className="size-3.5" />}
        toplam={items.length}
        filtreli={filtered.length}
        aksiyon={
          <ListeAksiyonButonu onClick={openCreate}>
            <Plus className="size-3.5" />Yeni Veritabanı
          </ListeAksiyonButonu>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] font-medium leading-[20px]">
            <ListeThead>
              <th className="px-4 py-1.5 text-left font-medium">
                <MetinFiltre label="Ad" value={adFiltre} onChange={setAdFiltre} />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">
                <MetinFiltre label="DB Adı" value={dbAdFiltre} onChange={setDbAdFiltre} />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">Programlar</th>
              <th className="px-4 py-1.5 text-left font-medium">Konum</th>
              <th className="px-4 py-1.5 text-left font-medium">
                <SecimFiltre
                  label="Tip"
                  options={konumTipleri}
                  getLabel={(o) => o}
                  selected={tipFiltre}
                  onChange={(v) => setTipFiltre(v as string[])}
                />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">
                <SecimFiltre
                  label="Durum"
                  options={["aktif", "pasif"] as const}
                  getLabel={(o) => (o === "aktif" ? "Aktif" : "Pasif")}
                  selected={durumFiltre}
                  onChange={(v) => setDurumFiltre(v as string[])}
                />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">
                <SortHeader label="Sıra" sortKey="displayOrder" active={sortKey} dir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-1.5 text-right font-medium">İşlem</th>
            </ListeThead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-1.5"><Skeleton className="h-3 w-full rounded-[5px]" /></td>
                    ))}
                    <td />
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[13px] text-red-600 dark:text-red-400">{error}</td>
                </tr>
              ) : filtered.length === 0 ? (
                <ListeBosSatir
                  sutunSayisi={8}
                  toplam={items.length}
                  bosMesaj="Henüz demo veritabanı yok."
                />
              ) : filtered.map((db) => {
                const badge = LOCATION_BADGE[db.locationType] ?? LOCATION_BADGE.Local;
                const linkedServices = (db.serviceIds ?? [])
                  .map((id) => services.find((s) => s.id === id))
                  .filter((s): s is WizardServiceDto => !!s);
                return (
                  <tr key={db.id} className="hover:bg-muted/70 transition-colors">
                    <td className="px-4 py-1.5">
                      <span className="flex items-center gap-2">
                        <span className={cn("size-1.5 shrink-0 rounded-full", db.isActive ? "bg-emerald-500" : "bg-slate-300")} />
                        <span className="font-medium">{db.name}</span>
                      </span>
                      {db.description && (
                        <p className="text-muted-foreground/70 mt-0.5 truncate text-[11px]">{db.description}</p>
                      )}
                    </td>
                    <td className="text-muted-foreground px-4 py-1.5 whitespace-nowrap font-mono text-[12px]">{db.dataName}</td>
                    <td className="px-4 py-1.5">
                      {linkedServices.length === 0 ? (
                        <span className="text-muted-foreground/50 inline-flex items-center gap-1 text-[12px]">
                          <Wrench className="size-3" />—
                        </span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-1">
                          {linkedServices.slice(0, 3).map((svc) => (
                            <span
                              key={svc.id}
                              className="inline-flex max-w-[130px] truncate rounded-[5px] bg-indigo-500/15 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-400"
                              title={svc.name}
                            >
                              {svc.name}
                            </span>
                          ))}
                          {linkedServices.length > 3 && (
                            <span className="text-muted-foreground inline-flex rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                              +{linkedServices.length - 3}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-4 py-1.5 text-[12px] max-w-64">
                      {db.locationPath ? (
                        <span className="flex min-w-0 items-center gap-1.5">
                          <FolderOpen className="size-3 shrink-0" />
                          <span className="truncate font-mono">{db.locationPath}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      <span className={cn("inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium", badge)}>
                        {db.locationType}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      {db.isActive ? (
                        <span className="inline-flex rounded-[5px] bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Aktif
                        </span>
                      ) : (
                        <span className="inline-flex rounded-[5px] bg-zinc-500/15 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">Pasif
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-4 py-1.5 whitespace-nowrap text-[12px] tabular-nums">
                      {db.displayOrder}
                    </td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="text-muted-foreground hover:bg-muted/60 rounded-[5px] p-1 transition-colors">
                            <MoreVertical className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={4} className="w-40 text-[12px]">
                          <DropdownMenuItem className="gap-2" onClick={() => openEdit(db)}>
                            <Pencil className="text-muted-foreground size-3.5" />Düzenle
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => handleToggleActive(db)}>
                            {db.isActive ? "Pasife Al" : "Aktif Et"}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-rose-600 focus:text-rose-600" onClick={() => setDeleting(db)}>
                            <Trash2 className="size-3.5" />Sil
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ListeKarti>

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
