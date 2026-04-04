"use client";

import { useState } from "react";
import { Pencil, Key, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AgentReport } from "@/lib/agent-types";

type ADUser = NonNullable<AgentReport["ad"]>["users"][number];

interface Props {
  users: ADUser[];
}

type StatusFilter = "all" | "active" | "disabled";

export function TabUsers({ users }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const activeCount = users.filter((u) => u.enabled).length;
  const disabledCount = users.filter((u) => !u.enabled).length;

  const filtered = users.filter((u) => {
    if (statusFilter === "active" && !u.enabled) return false;
    if (statusFilter === "disabled" && u.enabled) return false;
    if (
      search &&
      !u.username.toLowerCase().includes(search.toLowerCase()) &&
      !u.displayName.toLowerCase().includes(search.toLowerCase()) &&
      !u.email.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Tümü" },
    { key: "active", label: "Aktif" },
    { key: "disabled", label: "Devre Dışı" },
  ];

  if (users.length === 0) {
    return (
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px] px-3 py-12 text-center"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          <p className="text-[11px] text-muted-foreground">AD kullanıcı verisi bulunmuyor</p>
        </div>
        <div className="h-2" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Toplam", value: users.length },
          { label: "Aktif", value: activeCount },
          { label: "Devre Dışı", value: disabledCount },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-[8px] p-2 pb-0"
            style={{ backgroundColor: "#F4F2F0" }}
          >
            <div
              className="rounded-[4px] px-3 py-3"
              style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
            >
              <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase block mb-1">
                {label}
              </span>
              <span className="text-2xl font-bold">{value}</span>
            </div>
            <div className="h-2" />
          </div>
        ))}
      </div>

      {/* List */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px]"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          {/* Toolbar */}
          <div className="px-3 py-2 bg-muted/30 border-b border-border/40 flex items-center gap-3">
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase flex-1">
              Kullanıcılar
            </span>
            {/* Status filter pills */}
            <div className="flex items-center rounded-[8px] p-0.5" style={{ backgroundColor: "#F4F2F0" }}>
              {filters.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={cn(
                    "rounded-[6px] text-[10px] px-2.5 py-1 font-medium transition-colors",
                    statusFilter === key
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
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
          <div className="grid grid-cols-[1fr_1fr_1fr_80px_120px_80px] gap-3 px-3 py-2 bg-muted/10 border-b border-border/40">
            {["Kullanıcı", "Görünen Ad", "E-posta", "OU", "Son Giriş", "Durum"].map((h) => (
              <span
                key={h}
                className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase"
              >
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/40">
            {filtered.map((user) => (
              <div
                key={user.username}
                className="group grid grid-cols-[1fr_1fr_1fr_80px_120px_80px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
              >
                <span className="text-[11px] font-mono truncate">{user.username}</span>
                <span className="text-[11px] truncate">{user.displayName}</span>
                <span className="text-[11px] text-muted-foreground truncate">{user.email}</span>
                <span className="text-[10px] text-muted-foreground truncate">{user.ou}</span>
                <span className="text-[10px] text-muted-foreground">{user.lastLogin}</span>
                <div className="flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full shrink-0", user.enabled ? "bg-emerald-500" : "bg-muted-foreground")} />
                  <span className={cn("text-[10px]", user.enabled ? "text-emerald-700" : "text-muted-foreground")}>
                    {user.enabled ? "Aktif" : "Devre Dışı"}
                  </span>
                  {/* Hover actions */}
                  <div className="ml-auto hidden group-hover:flex items-center gap-0.5">
                    <button
                      title="Düzenle"
                      className="flex items-center justify-center h-5 w-5 rounded-[3px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      title="Şifre Sıfırla"
                      className="flex items-center justify-center h-5 w-5 rounded-[3px] text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors"
                    >
                      <Key className="size-3" />
                    </button>
                    <button
                      title="Sil"
                      className="flex items-center justify-center h-5 w-5 rounded-[3px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
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
    </div>
  );
}
