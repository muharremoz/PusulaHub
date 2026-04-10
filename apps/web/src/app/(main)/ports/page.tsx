"use client";

import { useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { StatsCard } from "@/components/shared/stats-card";
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
} from "@/components/ui/alert-dialog";
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
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { PortRangeSheet } from "@/components/ports/port-range-sheet";
import type { PortRangeDto } from "@/app/api/port-ranges/route";

type SortKey = "name" | "portStart" | "usage" | "status";
type SortDir = "asc" | "desc";
type FilterStatus = "all" | "active" | "inactive";

const PROTOCOL_BADGE: Record<string, string> = {
  "TCP":     "bg-blue-50 text-blue-700 border-blue-200",
  "UDP":     "bg-purple-50 text-purple-700 border-purple-200",
  "TCP/UDP": "bg-orange-50 text-orange-700 border-orange-200",
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
  const [ranges,   setRanges]   = useState<PortRangeDto[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const [sortKey,  setSortKey]  = useState<SortKey>("portStart");
  const [sortDir,  setSortDir]  = useState<SortDir>("asc");
  const [filter,   setFilter]   = useState<FilterStatus>("all");

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

  const filtered = ranges
    .filter((r) => filter === "all" || (filter === "active" ? r.isActive : !r.isActive))
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "portStart") return (a.portStart - b.portStart) * mul;
      if (sortKey === "usage")     return ((a.usedCount / Math.max(a.totalPorts, 1)) - (b.usedCount / Math.max(b.totalPorts, 1))) * mul;
      if (sortKey === "status")    return ((a.isActive ? 1 : 0) - (b.isActive ? 1 : 0)) * mul;
      return a.name.localeCompare(b.name) * mul;
    });

  const totalPorts     = ranges.reduce((s, r) => s + r.totalPorts, 0);
  const usedPorts      = ranges.reduce((s, r) => s + r.usedCount, 0);
  const activeRanges   = ranges.filter((r) => r.isActive).length;
  const inactiveRanges = ranges.length - activeRanges;

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

      {/* ── KPI Kartlar ── */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatsCard title="TOPLAM ARALIK"   value={ranges.length}  icon={<Layers    className="h-4 w-4" />} subtitle={`${totalPorts} port tanımlı`} />
        <StatsCard title="AKTİF ARALIK"    value={activeRanges}   icon={<Waypoints className="h-4 w-4" />} subtitle="Atama için kullanılabilir" />
        <StatsCard title="PASİF ARALIK"    value={inactiveRanges} icon={<Waypoints className="h-4 w-4" />} subtitle="Yeni atama yapılmaz" />
        <StatsCard title="KULLANILAN PORT" value={usedPorts}      icon={<Waypoints className="h-4 w-4" />} subtitle={`${totalPorts - usedPorts} boş / ${totalPorts}`} />
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center rounded-[8px] p-1" style={{ backgroundColor: "#F4F2F0" }}>
          {(["all", "active", "inactive"] as FilterStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-[6px] text-[11px] px-3 py-1.5 font-medium transition-colors",
                filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all" ? "Tümü" : f === "active" ? "Aktif" : "Pasif"}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <button
            onClick={handleAdd}
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
          <div className="grid grid-cols-[16px_1.6fr_140px_70px_2fr_1.4fr_90px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
            <span />
            <SortHeader label="Aralık Adı"   sortKey="name"      active={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="Port Aralığı" sortKey="portStart" active={sortKey} dir={sortDir} onSort={handleSort} />
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Proto</span>
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Açıklama</span>
            <SortHeader label="Kullanım"     sortKey="usage"     active={sortKey} dir={sortDir} onSort={handleSort} />
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Toplam</span>
            <span />
          </div>

          {/* Body */}
          {loading ? (
            <div className="divide-y divide-border/40">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[16px_1.6fr_140px_70px_2fr_1.4fr_90px_28px] gap-3 px-3 py-2.5 items-center">
                  <Skeleton className="size-1.5 rounded-full" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-1.5 w-full" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-5 w-5" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="px-4 py-12 text-center text-[11px] text-destructive">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-16 flex flex-col items-center gap-3">
              <Inbox className="size-8 text-muted-foreground/40" />
              <div className="text-center">
                <p className="text-[12px] font-medium">Henüz port aralığı yok</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">IIS hizmetleri için port havuzu tanımlayın</p>
              </div>
              <button
                onClick={handleAdd}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-[5px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
              >
                <Plus className="size-3.5" />
                Aralık Ekle
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {filtered.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[16px_1.6fr_140px_70px_2fr_1.4fr_90px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
                >
                  {/* Durum noktası */}
                  <span className="flex items-center justify-center">
                    <span className="relative flex size-1.5">
                      {entry.isActive && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      )}
                      <span className={cn("relative inline-flex size-1.5 rounded-full", entry.isActive ? "bg-emerald-500" : "bg-slate-300")} />
                    </span>
                  </span>

                  <span className="text-[11px] font-medium truncate">{entry.name}</span>

                  <span className="text-[11px] font-mono font-semibold tabular-nums">
                    {entry.portStart}
                    <span className="text-muted-foreground font-normal"> – </span>
                    {entry.portEnd}
                  </span>

                  <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-[4px] border w-fit", PROTOCOL_BADGE[entry.protocol] ?? PROTOCOL_BADGE.TCP)}>
                    {entry.protocol}
                  </span>

                  <span className="text-[11px] text-muted-foreground truncate">{entry.description ?? "—"}</span>

                  <UsageBar used={entry.usedCount} total={entry.totalPorts} isActive={entry.isActive} />

                  <span className="text-[11px] text-muted-foreground tabular-nums">{entry.totalPorts} port</span>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                        <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-[6px]">
                      <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => handleEdit(entry)}>Düzenle</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-xs cursor-pointer text-destructive" onClick={() => setDeleting(entry)}>Sil</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
          <Waypoints className="size-3" />
          <span>{filtered.length} aralık listeleniyor</span>
        </div>
      </div>

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
