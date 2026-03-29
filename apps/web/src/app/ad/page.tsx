"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { adUsers, adOUTree } from "@/lib/mock-data";
import type { ADOU } from "@/types";
import {
  Users,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Plus,
  Search,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function OUTreeItem({
  ou,
  depth,
  selectedOU,
  onSelect,
}: {
  ou: ADOU;
  depth: number;
  selectedOU: string;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isSelected = selectedOU === ou.path;
  const hasChildren = ou.children.length > 0;

  return (
    <div>
      <button
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-xs rounded-[4px] transition-colors ${
          isSelected ? "bg-foreground text-background" : "hover:bg-black/5"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          onSelect(ou.path);
          if (hasChildren) setExpanded(!expanded);
        }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <FolderOpen className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-background" : "text-amber-500"}`} />
        <span className="truncate">{ou.name}</span>
        {ou.userCount > 0 && (
          <span className={`ml-auto text-[10px] ${isSelected ? "text-background/70" : "text-muted-foreground"}`}>
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

export default function ADPage() {
  const [selectedOU, setSelectedOU] = useState("");
  const [search, setSearch] = useState("");

  const filteredUsers = adUsers.filter((u) => {
    if (search) {
      const q = search.toLowerCase();
      return u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    if (selectedOU) {
      return selectedOU.includes(u.ou);
    }
    return true;
  });

  return (
    <PageContainer title="Active Directory" description="OU ve kullanici yonetimi">
      <div className="grid grid-cols-[280px_1fr] gap-3">
        {/* OU Tree */}
        <NestedCard
          footer={
            <>
              <FolderOpen className="h-3 w-3" />
              <span>Organizasyon birimleri</span>
            </>
          }
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">OU Yapisi</h3>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div
            className="rounded-[5px] p-2 max-h-[500px] overflow-y-auto space-y-0.5"
            style={{ backgroundColor: "#F4F2F0" }}
          >
            {adOUTree.map((ou) => (
              <OUTreeItem key={ou.path} ou={ou} depth={0} selectedOU={selectedOU} onSelect={setSelectedOU} />
            ))}
          </div>
        </NestedCard>

        {/* Users Table */}
        <NestedCard
          footer={
            <>
              <Users className="h-3 w-3" />
              <span>{filteredUsers.length} kullanici</span>
            </>
          }
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Kullanicilar</h3>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Kullanici ara..."
                  className="h-8 text-xs rounded-[5px] bg-white pl-8 w-52"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button size="sm" className="rounded-[5px] text-xs gap-1 h-8">
                <UserPlus className="h-3.5 w-3.5" />
                Yeni Kullanici
              </Button>
            </div>
          </div>
          {/* Header */}
          <div className="grid grid-cols-[1.2fr_1fr_1.5fr_0.8fr_0.6fr_1fr] gap-2 px-1 py-1.5 bg-muted/30 rounded-[4px] border-b">
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">AD</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">KULLANICI ADI</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">E-POSTA</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">OU</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">DURUM</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">SON GIRIS</span>
          </div>
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              className="grid grid-cols-[1.2fr_1fr_1.5fr_0.8fr_0.6fr_1fr] gap-2 px-1 py-1.5 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors"
            >
              <span className="text-xs font-medium">{user.displayName}</span>
              <span className="text-xs text-muted-foreground">{user.username}</span>
              <span className="text-xs text-muted-foreground truncate">{user.email}</span>
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium w-fit">{user.ou}</span>
              <StatusBadge status={user.enabled ? "online" : "offline"} label={user.enabled ? "Aktif" : "Pasif"} />
              <span className="text-xs text-muted-foreground">{user.lastLogin}</span>
            </div>
          ))}
        </NestedCard>
      </div>
    </PageContainer>
  );
}
