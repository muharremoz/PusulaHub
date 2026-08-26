"use client";

import { useEffect, useMemo, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@muharremoz/pusula-ui";
import { cn } from "@/lib/utils";
import {
  MoreVertical,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Waypoints,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PortRangeSheet } from "@/components/ports/port-range-sheet";
import { ListeKarti, ListeAksiyonButonu, ListeThead, ListeBosSatir } from "@/components/shared/liste-karti";
import { MetinFiltre, SecimFiltre } from "@/components/shared/liste-filtreleri";
import type { PortRangeDto } from "@/app/api/port-ranges/route";

type SortKey = "name" | "portStart" | "usage" | "status";
type SortDir = "asc" | "desc";

const PROTOCOL_BADGE: Record<string, string> = {
  "TCP":     "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
  "UDP":     "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/25",
  "TCP/UDP": "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/25",
};

/* ── Kullanım çubuğu ── */
function UsageBar({ used, total, isActive }: { used: number; total: number; isActive: boolean }) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const color = pct >= 80 ? "bg-red-400" : pct >= 50 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        {isActive && (
          <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
        )}
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0 w-12 text-right">
        {isActive ? `${used}/${total}` : "—"}
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
        "-mx-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider outline-none transition-colors select-none",
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
  const [ranges,   setRanges]   = useState<PortRangeDto[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const [sortKey,  setSortKey]  = useState<SortKey>("portStart");
  const [sortDir,  setSortDir]  = useState<SortDir>("asc");

  /* Sütun başlığı filtreleri — liste tasarım deseni standardı. */
  const [adFiltre,       setAdFiltre]       = useState("");
  const [aciklamaFiltre, setAciklamaFiltre] = useState("");
  const [protokolFiltre, setProtokolFiltre] = useState<string[]>([]);
  const [durumFiltre,    setDurumFiltre]    = useState<string[]>([]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing,   setEditing]   = useState<PortRangeDto | null>(null);

  const [deleting,    setDeleting]    = useState<PortRangeDto | null>(null);
  const [deletingNow, setDeletingNow] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/port-ranges");
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Yüklenemedi");
      setRanges(data as PortRangeDto[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  /* Tüm sütun filtreleri VE (AND) ile birleşir; erken return false deseni. */
  const filtered = useMemo(() => {
    const ad  = adFiltre.trim().toLocaleLowerCase("tr-TR");
    const acl = aciklamaFiltre.trim().toLocaleLowerCase("tr-TR");
    return ranges
      .filter((r) => {
        if (ad && !r.name.toLocaleLowerCase("tr-TR").includes(ad)) return false;
        if (acl && !(r.description ?? "").toLocaleLowerCase("tr-TR").includes(acl)) return false;
        if (protokolFiltre.length && !protokolFiltre.includes(r.protocol)) return false;
        if (durumFiltre.length && !durumFiltre.includes(r.isActive ? "aktif" : "pasif")) return false;
        return true;
      })
      .sort((a, b) => {
        const mul = sortDir === "asc" ? 1 : -1;
        if (sortKey === "portStart") return (a.portStart - b.portStart) * mul;
        if (sortKey === "usage")     return ((a.usedCount / Math.max(a.totalPorts, 1)) - (b.usedCount / Math.max(b.totalPorts, 1))) * mul;
        if (sortKey === "status")    return ((a.isActive ? 1 : 0) - (b.isActive ? 1 : 0)) * mul;
        return a.name.localeCompare(b.name, "tr") * mul;
      });
  }, [ranges, adFiltre, aciklamaFiltre, protokolFiltre, durumFiltre, sortKey, sortDir]);

  /* Listede geçen protokoller — filtre seçenekleri. */
  const protokoller = useMemo(
    () => [...new Set(ranges.map((r) => r.protocol))].sort(),
    [ranges],
  );


  const handleAdd  = () => { setEditing(null); setSheetOpen(true); };
  const handleEdit = (r: PortRangeDto) => { setEditing(r); setSheetOpen(true); };

  const handleConfirmDelete = async () => {
    if (!deleting) return;
    setDeletingNow(true);
    try {
      const r = await fetch(`/api/port-ranges/${deleting.id}`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Silinemedi");
      toast.success("Aralık silindi");
      setDeleting(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingNow(false);
    }
  };

  return (
    <PageContainer title="Port Yönetimi" description="IIS hizmetleri için port havuzları — tanım ve kullanım takibi">

      <ListeKarti
        baslik="Port Aralıkları"
        ikon={<Waypoints className="size-3.5" />}
        toplam={ranges.length}
        filtreli={filtered.length}
        aksiyon={
          <ListeAksiyonButonu onClick={handleAdd}>
            <Plus className="size-3.5" />Aralık Ekle
          </ListeAksiyonButonu>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] font-medium leading-[20px]">
            <ListeThead>
              <th className="px-4 py-1.5 text-left font-medium">
                <MetinFiltre label="Aralık Adı" value={adFiltre} onChange={setAdFiltre} />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">
                <SortHeader label="Port Aralığı" sortKey="portStart" active={sortKey} dir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">
                <SecimFiltre
                  label="Proto"
                  options={protokoller}
                  getLabel={(o) => o}
                  selected={protokolFiltre}
                  onChange={(v) => setProtokolFiltre(v as string[])}
                />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">
                <MetinFiltre label="Açıklama" value={aciklamaFiltre} onChange={setAciklamaFiltre} />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">
                <SortHeader label="Kullanım" sortKey="usage" active={sortKey} dir={sortDir} onSort={handleSort} />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">Toplam</th>
              <th className="px-4 py-1.5 text-left font-medium">
                <SecimFiltre
                  label="Durum"
                  options={["aktif", "pasif"] as const}
                  getLabel={(o) => (o === "aktif" ? "Aktif" : "Pasif")}
                  selected={durumFiltre}
                  onChange={(v) => setDurumFiltre(v as string[])}
                />
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
                  <td colSpan={8} className="text-destructive px-4 py-10 text-center text-[13px]">{error}</td>
                </tr>
              ) : filtered.length === 0 ? (
                <ListeBosSatir
                  sutunSayisi={8}
                  toplam={ranges.length}
                  bosMesaj="Henüz port aralığı yok."
                />
              ) : filtered.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/70 transition-colors">
                  <td className="px-4 py-1.5 whitespace-nowrap font-medium">{entry.name}</td>
                  <td className="px-4 py-1.5 whitespace-nowrap font-mono font-semibold tabular-nums text-[13px]">
                    {entry.portStart}
                    <span className="text-muted-foreground font-normal"> – </span>
                    {entry.portEnd}
                  </td>
                  <td className="px-4 py-1.5 whitespace-nowrap">
                    <span className={cn("inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium", PROTOCOL_BADGE[entry.protocol] ?? PROTOCOL_BADGE.TCP)}>
                      {entry.protocol}
                    </span>
                  </td>
                  <td className="text-muted-foreground px-4 py-1.5 text-[12px] max-w-64 truncate">
                    {entry.description ?? "—"}
                  </td>
                  <td className="px-4 py-1.5 min-w-40">
                    <UsageBar used={entry.usedCount} total={entry.totalPorts} isActive={entry.isActive} />
                  </td>
                  <td className="text-muted-foreground px-4 py-1.5 whitespace-nowrap text-[12px] tabular-nums">
                    {entry.totalPorts} port
                  </td>
                  <td className="px-4 py-1.5 whitespace-nowrap">
                    {entry.isActive ? (
                      <span className="inline-flex rounded-[5px] bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Aktif
                      </span>
                    ) : (
                      <span className="inline-flex rounded-[5px] bg-zinc-500/15 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">Pasif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-1.5 text-right whitespace-nowrap">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="text-muted-foreground hover:bg-muted/60 rounded-[5px] p-1 transition-colors">
                          <MoreVertical className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={4} className="w-40 text-[12px]">
                        <DropdownMenuItem className="gap-2" onClick={() => handleEdit(entry)}>
                          <Pencil className="text-muted-foreground size-3.5" />Düzenle
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 text-rose-600 focus:text-rose-600" onClick={() => setDeleting(entry)}>
                          <Trash2 className="size-3.5" />Sil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListeKarti>

      <PortRangeSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editing={editing}
        onSaved={reload}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Port aralığını sil</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.name}</strong> aralığı kalıcı olarak silinecek. Aralığa atanmış port varsa veya bir hizmet bu aralığı kullanıyorsa silme reddedilir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingNow}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deletingNow}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deletingNow ? "Siliniyor…" : "Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </PageContainer>
  );
}
