"use client";

import { useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import type { ADOU, ADUser } from "@/types";
import { ADUserSheet } from "@/components/ad/ad-user-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Users,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  FolderOpen,
  UserPlus,
  Search,
  MoreVertical,
} from "lucide-react";

/* ── Tipler ── */
type SortKey = "displayName" | "username" | "email" | "ou" | "lastLogin";
type SortDir = "asc" | "desc";

/* ── OU Ağacı ── */
function OUTreeItem({
  ou, depth, selectedOU, onSelect,
}: {
  ou: ADOU; depth: number; selectedOU: string; onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isSelected  = selectedOU === ou.path;
  const hasChildren = ou.children.length > 0;

  return (
    <div>
      <button
        className={cn(
          "w-full flex items-center gap-1.5 py-1.5 pr-2 text-left text-[11px] rounded-[4px] transition-colors",
          isSelected ? "bg-foreground text-background" : "hover:bg-black/5"
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => { onSelect(ou.path); if (hasChildren) setExpanded(!expanded); }}
      >
        {hasChildren
          ? expanded
            ? <ChevronDown  className="h-3 w-3 shrink-0" />
            : <ChevronRight className="h-3 w-3 shrink-0" />
          : <span className="w-3 shrink-0" />}
        <FolderOpen className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "text-background" : "text-amber-500")} />
        <span className="truncate">{ou.name}</span>
        {ou.userCount > 0 && (
          <span className={cn("ml-auto text-[10px]", isSelected ? "text-background/70" : "text-muted-foreground")}>
            {ou.userCount}
          </span>
        )}
      </button>
      {expanded && hasChildren && ou.children.map((child) => (
        <OUTreeItem key={child.path} ou={child} depth={depth + 1} selectedOU={selectedOU} onSelect={onSelect} />
      ))}
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
export default function ADPage() {
  const [selectedOU, setSelectedOU] = useState("");
  const [search,     setSearch]     = useState("");
  const [sortKey,    setSortKey]    = useState<SortKey>("displayName");
  const [sortDir,    setSortDir]    = useState<SortDir>("asc");
  const [sheetOpen,  setSheetOpen]  = useState(false);

  const [users,      setUsers]      = useState<ADUser[]>([]);
  const [ouTree,     setOUTree]     = useState<ADOU[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [uRes, oRes] = await Promise.all([
          fetch("/api/ad/users", { cache: "no-store" }),
          fetch("/api/ad/ous",   { cache: "no-store" }),
        ]);
        const [uData, oData] = await Promise.all([uRes.json(), oRes.json()]);
        if (!uRes.ok) throw new Error(uData?.error ?? "Kullanıcılar alınamadı");
        if (!oRes.ok) throw new Error(oData?.error ?? "OU ağacı alınamadı");
        if (cancelled) return;
        setUsers(uData as ADUser[]);
        setOUTree(oData as ADOU[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = users
    .filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        return (
          u.displayName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
        );
      }
      if (selectedOU && selectedOU !== "Firmalar") return u.ou === selectedOU;
      return true;
    })
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      return String(a[sortKey]).localeCompare(String(b[sortKey])) * mul;
    });

  return (
    <PageContainer title="Active Directory" description="OU ve kullanıcı yönetimi">
      <div className="grid grid-cols-[260px_1fr] gap-3 items-start">

        {/* ── OU Ağacı ── */}
        <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
          <div
            className="rounded-[4px] overflow-hidden"
            style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
          >
            {/* Başlık */}
            <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
              <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">OU Yapısı</p>
            </div>
            {/* Ağaç */}
            <div className="p-2 space-y-0.5 max-h-[520px] overflow-y-auto">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full rounded-[4px]" />
                  ))
                : ouTree.map((ou) => (
                    <OUTreeItem key={ou.path} ou={ou} depth={0} selectedOU={selectedOU} onSelect={setSelectedOU} />
                  ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
            <FolderOpen className="size-3" />
            <span>Organizasyon birimleri</span>
          </div>
        </div>

        {/* ── Kullanıcılar ── */}
        <div className="flex flex-col gap-3">

          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Kullanıcı ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-[11px] rounded-[6px] pl-8 w-52 bg-background"
              />
            </div>
            <div className="ml-auto">
              <button
                onClick={() => setSheetOpen(true)}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-[6px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
              >
                <UserPlus className="size-3.5" />
                Yeni Kullanıcı
              </button>
            </div>
          </div>

          {/* Liste */}
          <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
            <div
              className="rounded-[4px] overflow-hidden"
              style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
            >
              {/* Header */}
              <div className="grid grid-cols-[1.4fr_1fr_1.8fr_80px_70px_120px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
                <SortHeader label="Ad Soyad"      sortKey="displayName" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Kullanıcı Adı" sortKey="username"    active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="E-posta"        sortKey="email"       active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="OU"             sortKey="ou"          active={sortKey} dir={sortDir} onSort={handleSort} />
                <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Durum</span>
                <SortHeader label="Son Giriş"      sortKey="lastLogin"   active={sortKey} dir={sortDir} onSort={handleSort} />
                <span />
              </div>

              {/* Satırlar */}
              <div className="divide-y divide-border/40">
                {loading && Array.from({ length: 6 }).map((_, i) => (
                  <div key={`sk-${i}`} className="grid grid-cols-[1.4fr_1fr_1.8fr_80px_70px_120px_28px] gap-3 px-3 py-2.5 items-center">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-20" />
                    <span />
                  </div>
                ))}

                {!loading && error && (
                  <div className="px-3 py-8 text-center text-[11px] text-destructive">
                    {error}
                  </div>
                )}

                {!loading && !error && filtered.map((user) => (
                  <div
                    key={user.id}
                    className="grid grid-cols-[1.4fr_1fr_1.8fr_80px_70px_120px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
                  >
                    {/* Ad soyad */}
                    <span className="text-[11px] font-medium truncate">{user.displayName}</span>

                    {/* Kullanıcı adı */}
                    <span className="text-[11px] font-mono text-muted-foreground truncate">{user.username}</span>

                    {/* E-posta */}
                    <span className="text-[11px] text-muted-foreground truncate">{user.email}</span>

                    {/* OU */}
                    <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[4px] text-muted-foreground font-medium w-fit">
                      {user.ou}
                    </span>

                    {/* Durum */}
                    <span className={cn(
                      "text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border w-fit",
                      user.enabled
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-muted text-muted-foreground border-border"
                    )}>
                      {user.enabled ? "Aktif" : "Pasif"}
                    </span>

                    {/* Son giriş */}
                    <span className="text-[10px] text-muted-foreground tabular-nums">{user.lastLogin}</span>

                    {/* Aksiyon */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-[6px]">
                        <DropdownMenuItem className="text-xs cursor-pointer">Düzenle</DropdownMenuItem>
                        <DropdownMenuItem className="text-xs cursor-pointer">Şifre Sıfırla</DropdownMenuItem>
                        <DropdownMenuItem className="text-xs cursor-pointer">OU Taşı</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-xs cursor-pointer text-destructive">
                          {user.enabled ? "Devre Dışı Bırak" : "Etkinleştir"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}

                {!loading && !error && filtered.length === 0 && (
                  <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">
                    Kullanıcı bulunamadı.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
              <Users className="size-3" />
              <span>{filtered.length} kullanıcı listeleniyor</span>
            </div>
          </div>

        </div>
      </div>

      <ADUserSheet open={sheetOpen} onOpenChange={setSheetOpen} />

    </PageContainer>
  );
}
