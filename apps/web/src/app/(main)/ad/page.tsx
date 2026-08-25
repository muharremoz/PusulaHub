"use client";

import { useEffect, useMemo, useState } from "react";
import { ListeKarti, ListeAksiyonButonu, ListeThead, ListeBosSatir } from "@/components/shared/liste-karti";
import { MetinFiltre, SecimFiltre } from "@/components/shared/liste-filtreleri";
import { PageContainer } from "@/components/layout/page-container";
import type { ADOU, ADUser } from "@/types";
import { ADUserSheet } from "@/components/ad/ad-user-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@muharremoz/pusula-ui";
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
          "w-full flex items-center gap-1.5 py-1.5 pr-2 text-left text-[11px] rounded-[5px] transition-colors",
          isSelected ? "bg-primary text-primary-foreground" : "hover:bg-black/5"
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

  /* Sütun başlığı filtreleri — liste tasarım deseni standardı. */
  const [adFiltre,    setAdFiltre]    = useState("");
  const [kadFiltre,   setKadFiltre]   = useState("");
  const [epostaFiltre, setEpostaFiltre] = useState("");
  const [ouFiltre,    setOuFiltre]    = useState<string[]>([]);
  const [durumFiltre, setDurumFiltre] = useState<string[]>([]);

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

  /* OU ağacından gelen seçim + sütun filtreleri VE (AND) ile birleşir. */
  const filtered = useMemo(() => {
    const ad  = adFiltre.trim().toLocaleLowerCase("tr-TR");
    const kad = kadFiltre.trim().toLocaleLowerCase("tr-TR");
    const eps = epostaFiltre.trim().toLocaleLowerCase("tr-TR");
    const q   = search.trim().toLocaleLowerCase("tr-TR");
    return users
      .filter((u) => {
        // Üstteki serbest arama — üç alanda birden.
        if (q && !(
          u.displayName.toLocaleLowerCase("tr-TR").includes(q) ||
          u.username.toLocaleLowerCase("tr-TR").includes(q) ||
          u.email.toLocaleLowerCase("tr-TR").includes(q)
        )) return false;
        // OU ağacı seçimi (serbest arama yokken).
        if (!q && selectedOU && selectedOU !== "Firmalar" && u.ou !== selectedOU) return false;
        if (ad && !u.displayName.toLocaleLowerCase("tr-TR").includes(ad)) return false;
        if (kad && !u.username.toLocaleLowerCase("tr-TR").includes(kad)) return false;
        if (eps && !u.email.toLocaleLowerCase("tr-TR").includes(eps)) return false;
        if (ouFiltre.length && !ouFiltre.includes(u.ou)) return false;
        if (durumFiltre.length && !durumFiltre.includes(u.enabled ? "aktif" : "pasif")) return false;
        return true;
      })
      .sort((a, b) => {
        const mul = sortDir === "asc" ? 1 : -1;
        return String(a[sortKey]).localeCompare(String(b[sortKey]), "tr") * mul;
      });
  }, [users, search, selectedOU, adFiltre, kadFiltre, epostaFiltre, ouFiltre, durumFiltre, sortKey, sortDir]);

  const ouListesi = useMemo(
    () => [...new Set(users.map((u) => u.ou).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")),
    [users],
  );

  return (
    <PageContainer title="Active Directory" description="OU ve kullanıcı yönetimi">
      <div className="grid grid-cols-[260px_1fr] gap-3 items-start">

        {/* ── OU Ağacı ── */}
        <div className="rounded-[8px] p-2" style={{ backgroundColor: "var(--section-bg)" }}>
          <div
            className="rounded-[5px] overflow-hidden"
            style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}
          >
            {/* Başlık */}
            <div className="px-3 py-2 bg-muted/20 border-b border-border">
              <p className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">OU Yapısı</p>
            </div>
            {/* Ağaç */}
            <div className="p-2 space-y-0.5 max-h-[520px] overflow-y-auto">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full rounded-[5px]" />
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
                className="h-8 text-[13px] rounded-[5px] pl-8 w-52 bg-background"
              />
            </div>
            <div className="ml-auto">
              <ListeAksiyonButonu onClick={() => setSheetOpen(true)}>
                <UserPlus className="size-3.5" />Yeni Kullanıcı
              </ListeAksiyonButonu>
            </div>
          </div>

          <ListeKarti
            baslik="Kullanıcılar"
            ikon={<Users className="size-3.5" />}
            toplam={users.length}
            filtreli={filtered.length}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[14px] font-medium leading-[20px]">
                <ListeThead>
                  <th className="px-4 py-1.5 text-left font-medium">
                    <MetinFiltre label="Ad Soyad" value={adFiltre} onChange={setAdFiltre} />
                  </th>
                  <th className="px-4 py-1.5 text-left font-medium">
                    <MetinFiltre label="Kullanıcı Adı" value={kadFiltre} onChange={setKadFiltre} />
                  </th>
                  <th className="px-4 py-1.5 text-left font-medium">
                    <MetinFiltre label="E-posta" value={epostaFiltre} onChange={setEpostaFiltre} />
                  </th>
                  <th className="px-4 py-1.5 text-left font-medium">
                    <SecimFiltre
                      label="OU"
                      options={ouListesi}
                      getLabel={(o) => o}
                      selected={ouFiltre}
                      onChange={(v) => setOuFiltre(v as string[])}
                      aranabilir
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
                    <SortHeader label="Son Giriş" sortKey="lastLogin" active={sortKey} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-1.5 text-right font-medium">İşlem</th>
                </ListeThead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={`sk-${i}`}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-1.5"><Skeleton className="h-3 w-full rounded-[5px]" /></td>
                        ))}
                        <td />
                      </tr>
                    ))
                  ) : error ? (
                    <tr>
                      <td colSpan={7} className="text-destructive px-4 py-10 text-center text-[13px]">{error}</td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <ListeBosSatir sutunSayisi={7} toplam={users.length} bosMesaj="Kullanıcı bulunamadı." />
                  ) : filtered.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/70 transition-colors">
                      <td className="px-4 py-1.5 whitespace-nowrap font-medium">{user.displayName}</td>
                      <td className="text-muted-foreground px-4 py-1.5 whitespace-nowrap font-mono text-[12px]">{user.username}</td>
                      <td className="text-muted-foreground px-4 py-1.5 text-[12px] max-w-64 truncate">{user.email}</td>
                      <td className="px-4 py-1.5 whitespace-nowrap">
                        <span className="text-muted-foreground inline-flex rounded-[5px] bg-muted px-2 py-0.5 text-[11px] font-medium">
                          {user.ou}
                        </span>
                      </td>
                      <td className="px-4 py-1.5 whitespace-nowrap">
                        {user.enabled ? (
                          <span className="inline-flex items-center gap-1.5 rounded-[5px] bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            <span className="size-1.5 rounded-full bg-emerald-500" />Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-[5px] bg-zinc-500/15 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                            <span className="size-1.5 rounded-full bg-zinc-400" />Pasif
                          </span>
                        )}
                      </td>
                      <td className="text-muted-foreground px-4 py-1.5 whitespace-nowrap text-[12px] tabular-nums">{user.lastLogin}</td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="text-muted-foreground hover:bg-muted/60 rounded-[5px] p-1 transition-colors">
                              <MoreVertical className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" sideOffset={4} className="w-44 text-[12px]">
                            <DropdownMenuItem className="gap-2">Düzenle</DropdownMenuItem>
                            <DropdownMenuItem className="gap-2">Şifre Sıfırla</DropdownMenuItem>
                            <DropdownMenuItem className="gap-2">OU Taşı</DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-rose-600 focus:text-rose-600">
                              {user.enabled ? "Devre Dışı Bırak" : "Etkinleştir"}
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

        </div>
      </div>

      <ADUserSheet open={sheetOpen} onOpenChange={setSheetOpen} />

    </PageContainer>
  );
}
