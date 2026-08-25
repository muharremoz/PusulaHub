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
  Layers,
  FolderOpen,
  FileText,
  Plus,
  Server,
  Globe,
  Waypoints,
  Pencil,
  Trash2,
} from "lucide-react";
import { ServiceSheet } from "@/components/services/service-sheet";
import { toast } from "sonner";
import type { WizardServiceDto, ServiceType } from "@/app/api/services/route";

/* ── Tipler ── */
type SortKey = "name" | "category" | "displayOrder" | "isActive" | "type";
type SortDir = "asc" | "desc";
type FilterCat = "all" | string;

const TYPE_LABELS: Record<ServiceType, { label: string; icon: React.ReactNode; badge: string }> = {
  "pusula-program": { label: "Pusula", icon: <Server className="size-3" />, badge: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25" },
  "iis-site":       { label: "IIS",    icon: <Globe  className="size-3" />, badge: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/25" },
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
  /* Sütun başlığı filtreleri — liste tasarım deseni standardı. */
  const [adFiltre,        setAdFiltre]        = useState("");
  const [tipFiltre,       setTipFiltre]       = useState<ServiceType[]>([]);
  const [kategoriFiltre,  setKategoriFiltre]  = useState<string[]>([]);
  const [durumFiltre,     setDurumFiltre]     = useState<string[]>([]);

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
    const ad = adFiltre.trim().toLocaleLowerCase("tr-TR");
    return services
      .filter((s) => {
        if (ad && !s.name.toLocaleLowerCase("tr-TR").includes(ad)) return false;
        if (tipFiltre.length && !tipFiltre.includes(s.type)) return false;
        if (kategoriFiltre.length && !kategoriFiltre.includes(s.category)) return false;
        if (durumFiltre.length && !durumFiltre.includes(s.isActive ? "aktif" : "pasif")) return false;
        return true;
      })
      .sort((a, b) => {
        const mul = sortDir === "asc" ? 1 : -1;
        if (sortKey === "displayOrder") return (a.displayOrder - b.displayOrder) * mul;
        if (sortKey === "isActive")     return (Number(b.isActive) - Number(a.isActive)) * mul;
        if (sortKey === "type")         return a.type.localeCompare(b.type) * mul;
        return String(a[sortKey]).localeCompare(String(b[sortKey])) * mul;
      });
  }, [services, adFiltre, tipFiltre, kategoriFiltre, durumFiltre, sortKey, sortDir]);

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

      <ListeKarti
        baslik="Pusula Hizmetleri"
        ikon={<Layers className="size-3.5" />}
        toplam={services.length}
        filtreli={filtered.length}
        aksiyon={
          <ListeAksiyonButonu onClick={openCreate}>
            <Plus className="size-3.5" />Yeni Hizmet
          </ListeAksiyonButonu>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] font-medium leading-[20px]">
            <ListeThead>
              <th className="px-4 py-1.5 text-left font-medium">
                <SecimFiltre
                  label="Tip"
                  options={Object.keys(TYPE_LABELS) as ServiceType[]}
                  getLabel={(o) => TYPE_LABELS[o]?.label ?? o}
                  selected={tipFiltre}
                  onChange={setTipFiltre}
                />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">
                <MetinFiltre label="Hizmet Adı" value={adFiltre} onChange={setAdFiltre} />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">
                <SecimFiltre
                  label="Kategori"
                  options={categories}
                  getLabel={(o) => o}
                  selected={kategoriFiltre}
                  onChange={(v) => setKategoriFiltre(v as string[])}
                  aranabilir
                />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">Kaynak Klasör</th>
              <th className="px-4 py-1.5 text-left font-medium">Tipe Özel</th>
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
                  toplam={services.length}
                  bosMesaj="Henüz hizmet yok — “Yeni Hizmet” ile ilkini ekleyin."
                />
              ) : filtered.map((svc) => {
                const sourceFolder =
                  svc.config && "sourceFolderPath" in svc.config ? svc.config.sourceFolderPath : "—";
                const programCode =
                  svc.type === "pusula-program" && svc.config && "programCode" in svc.config
                    ? svc.config.programCode
                    : null;
                const typeMeta = TYPE_LABELS[svc.type];
                return (
                  <tr key={svc.id} className="hover:bg-muted/70 transition-colors">
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      <span className={cn("inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[11px] font-medium", typeMeta.badge)}>
                        {typeMeta.icon}
                        {typeMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        <span className={cn("size-1.5 shrink-0 rounded-full", svc.isActive ? "bg-emerald-500" : "bg-slate-300")} />
                        <span className="font-medium">{svc.name}</span>
                      </span>
                      {programCode && (
                        <p className="text-muted-foreground/70 mt-0.5 font-mono text-[11px]">{programCode}</p>
                      )}
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      <span className="text-muted-foreground inline-flex rounded-[5px] bg-muted/40 px-2 py-0.5 text-[11px] font-medium">
                        {svc.category}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-1.5 text-[12px] max-w-64">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <FolderOpen className="size-3 shrink-0" />
                        <span className="truncate font-mono">{sourceFolder}</span>
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-1.5 text-[12px] max-w-56">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {svc.type === "pusula-program" && svc.config && "paramFileName" in svc.config ? (
                          svc.config.paramFileName ? (
                            <>
                              <FileText className="size-3 shrink-0" />
                              <span className="truncate font-mono">{svc.config.paramFileName}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground/40">— param yok</span>
                          )
                        ) : svc.type === "iis-site" && svc.config && "siteNamePattern" in svc.config ? (
                          <>
                            <Waypoints className="size-3 shrink-0" />
                            <span className="truncate font-mono">{svc.config.siteNamePattern}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      {svc.isActive ? (
                        <span className="inline-flex items-center gap-1.5 rounded-[5px] bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          <span className="size-1.5 rounded-full bg-emerald-500" />Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-[5px] bg-zinc-500/15 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                          <span className="size-1.5 rounded-full bg-zinc-400" />Pasif
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-4 py-1.5 whitespace-nowrap text-[12px] tabular-nums">
                      {svc.displayOrder}
                    </td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="text-muted-foreground hover:bg-muted/60 rounded-[5px] p-1 transition-colors">
                            <MoreVertical className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={4} className="w-40 text-[12px]">
                          <DropdownMenuItem className="gap-2" onClick={() => openEdit(svc)}>
                            <Pencil className="text-muted-foreground size-3.5" />Düzenle
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => handleToggleActive(svc)}>
                            {svc.isActive ? "Pasife Al" : "Aktif Et"}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-rose-600 focus:text-rose-600" onClick={() => setDeleting(svc)}>
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
