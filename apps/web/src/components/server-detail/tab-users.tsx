"use client";

import { useState } from "react";
import { Key, UserX, UserCheck, MoreVertical, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
import type { AgentReport } from "@/lib/agent-types";

type ADUser = NonNullable<AgentReport["ad"]>["users"][number];
type LocalUser = NonNullable<AgentReport["localUsers"]>[number];

interface Props {
  users: ADUser[];
  localUsers: AgentReport["localUsers"] | null;
  firmaMap: Record<string, string>;
}

type StatusFilter = "all" | "active" | "disabled";

export function TabUsers({ users, localUsers, firmaMap }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [toggleTarget, setToggleTarget] = useState<{ username: string; enabled: boolean } | null>(null);

  const isAD = users.length > 0;
  const isLocal = !isAD && localUsers && localUsers.length > 0;

  // Ortak liste — AD önce, yoksa local
  const allUsers: { username: string; displayName: string; extra: string; enabled: boolean; lastLogin: string }[] = isAD
    ? users.map((u) => ({ username: u.username, displayName: u.displayName, extra: u.ou, enabled: u.enabled, lastLogin: u.lastLogin }))
    : (localUsers ?? []).map((u: LocalUser) => ({ username: u.username, displayName: u.displayName, extra: u.description, enabled: u.enabled, lastLogin: u.lastLogin }));

  const activeCount = allUsers.filter((u) => u.enabled).length;
  const disabledCount = allUsers.filter((u) => !u.enabled).length;

  const filtered = allUsers.filter((u) => {
    if (statusFilter === "active" && !u.enabled) return false;
    if (statusFilter === "disabled" && u.enabled) return false;
    if (
      search &&
      !u.username.toLowerCase().includes(search.toLowerCase()) &&
      !u.displayName.toLowerCase().includes(search.toLowerCase()) &&
      !u.extra.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Tümü" },
    { key: "active", label: "Aktif" },
    { key: "disabled", label: "Devre Dışı" },
  ];

  if (allUsers.length === 0) {
    return (
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px] px-3 py-12 text-center"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          <p className="text-[11px] text-muted-foreground">Kullanıcı verisi henüz alınamadı.</p>
        </div>
        <div className="h-2" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Local kullanıcı uyarısı */}
      {isLocal && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-[6px] bg-amber-50 border border-amber-200 text-amber-800">
          <Info className="size-3.5 shrink-0" />
          <span className="text-[11px]">
            Bu sunucu Active Directory rolü taşımıyor. Aşağıda <span className="font-semibold">yerel kullanıcılar</span> listeleniyor.
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Toplam", value: allUsers.length },
          { label: "Aktif", value: activeCount },
          { label: "Devre Dışı", value: disabledCount },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
            <div className="rounded-[4px] px-3 py-3" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
              <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase block mb-1">{label}</span>
              <span className="text-2xl font-bold">{value}</span>
            </div>
            <div className="h-2" />
          </div>
        ))}
      </div>

      {/* List */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="rounded-[4px]" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
          {/* Toolbar */}
          <div className="px-3 py-2 bg-muted/30 border-b border-border/40 flex items-center gap-3">
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase flex-1">
              {isAD ? "AD Kullanıcıları" : "Yerel Kullanıcılar"}
            </span>
            <div className="flex items-center rounded-[8px] p-0.5" style={{ backgroundColor: "#F4F2F0" }}>
              {filters.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={cn(
                    "rounded-[6px] text-[10px] px-2.5 py-1 font-medium transition-colors",
                    statusFilter === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <Input
              placeholder="Kullanıcı ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-[11px] rounded-[5px] w-44 border-border/50"
            />
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1fr_1fr_120px_80px_28px] gap-3 px-3 py-2 bg-muted/10 border-b border-border/40">
            {["Kullanıcı", "Görünen Ad", isAD ? "Firma" : "Açıklama", "Son Giriş", "Durum"].map((h) => (
              <span key={h} className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">{h}</span>
            ))}
            <span />
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/40">
            {filtered.map((user) => (
              <div
                key={user.username}
                className="grid grid-cols-[1fr_1fr_1fr_120px_80px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
              >
                <span className="text-[11px] font-mono truncate">{user.username}</span>
                <span className="text-[11px] truncate">{user.displayName}</span>
                <span className="text-[11px] text-muted-foreground truncate">
                  {isAD ? ((firmaMap[user.extra] ?? user.extra) || "—") : (user.extra || "—")}
                </span>
                <span className="text-[10px] text-muted-foreground">{user.lastLogin}</span>
                <div className="flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full shrink-0", user.enabled ? "bg-emerald-500" : "bg-muted-foreground")} />
                  <span className={cn("text-[10px]", user.enabled ? "text-emerald-700" : "text-muted-foreground")}>
                    {user.enabled ? "Aktif" : "Devre Dışı"}
                  </span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                      <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-[6px]">
                    <DropdownMenuItem className="text-xs cursor-pointer">
                      <Key className="size-3.5 mr-2" />
                      Şifre Sıfırla
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs cursor-pointer text-destructive"
                      onClick={() => setToggleTarget({ username: user.username, enabled: user.enabled })}
                    >
                      {user.enabled
                        ? <><UserX className="size-3.5 mr-2" />Devre Dışı Bırak</>
                        : <><UserCheck className="size-3.5 mr-2" />Etkinleştir</>
                      }
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">
                Kullanıcı bulunamadı.
              </div>
            )}
          </div>
        </div>
        <div className="h-2" />
      </div>

      {/* Devre Dışı / Etkinleştir AlertDialog */}
      <AlertDialog open={!!toggleTarget} onOpenChange={(open) => !open && setToggleTarget(null)}>
        <AlertDialogContent className="rounded-[8px] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">
              {toggleTarget?.enabled ? "Kullanıcıyı Devre Dışı Bırak" : "Kullanıcıyı Etkinleştir"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[11px] text-muted-foreground">
              <span className="font-mono font-medium text-foreground">{toggleTarget?.username}</span>{" "}
              {toggleTarget?.enabled
                ? "kullanıcısı devre dışı bırakılacak. Onaylıyor musunuz?"
                : "kullanıcısı etkinleştirilecek. Onaylıyor musunuz?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 px-3 rounded-[5px] text-[11px]">İptal</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "h-8 px-3 rounded-[5px] text-[11px]",
                toggleTarget?.enabled
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              )}
              onClick={() => setToggleTarget(null)}
            >
              {toggleTarget?.enabled ? "Devre Dışı Bırak" : "Etkinleştir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
