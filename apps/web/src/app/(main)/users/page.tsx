"use client";

import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { panelUsers } from "@/lib/mock-data";
import { UserCog, Plus, Shield, Eye, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const roleConfig = {
  admin: { label: "Yonetici", icon: Shield, color: "text-red-600 bg-red-50 border-red-200/60" },
  operator: { label: "Operator", icon: Wrench, color: "text-amber-600 bg-amber-50 border-amber-200/60" },
  viewer: { label: "Izleyici", icon: Eye, color: "text-blue-600 bg-blue-50 border-blue-200/60" },
};

export default function UsersPage() {
  return (
    <PageContainer title="Kullanici Yonetimi" description="Panel kullanicilari ve yetkilendirme">
      <NestedCard
        footer={
          <>
            <UserCog className="h-3 w-3" />
            <span>{panelUsers.length} kullanici kayitli</span>
          </>
        }
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Panel Kullanicilari</h3>
          <Button size="sm" className="rounded-[5px] text-xs gap-1 h-8">
            <Plus className="h-3.5 w-3.5" />
            Yeni Kullanici
          </Button>
        </div>

        <div className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-2 px-1 py-1.5 bg-muted/30 rounded-[4px] border-b">
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">KULLANICI</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">E-POSTA</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">ROL</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">SON AKTIVITE</span>
        </div>

        {panelUsers.map((user) => {
          const role = roleConfig[user.role];
          const initials = user.name.split(" ").map((n) => n[0]).join("");
          return (
            <div
              key={user.id}
              className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-2 px-1 py-2 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors items-center"
            >
              <div className="flex items-center gap-2.5">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-muted text-[10px] font-medium">{initials}</AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium">{user.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">{user.email}</span>
              <span className={`inline-flex items-center gap-1 rounded-[5px] border px-2 py-0.5 text-[10px] font-medium w-fit ${role.color}`}>
                <role.icon className="h-3 w-3" />
                {role.label}
              </span>
              <span className="text-xs text-muted-foreground">{user.lastActive}</span>
            </div>
          );
        })}
      </NestedCard>
    </PageContainer>
  );
}
