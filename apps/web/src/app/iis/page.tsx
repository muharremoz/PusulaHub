"use client";

import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { iisSites, iisAppPools } from "@/lib/mock-data";
import { Globe, Play, Square, MoreVertical, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function IISPage() {
  return (
    <PageContainer title="IIS Yonetimi" description="Web siteleri ve uygulama havuzlari">
      {/* Sites */}
      <NestedCard
        footer={
          <>
            <Globe className="h-3 w-3" />
            <span>{iisSites.length} site kayitli</span>
          </>
        }
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Web Siteleri</h3>
        </div>
        <div className="grid grid-cols-[1.5fr_1fr_1.5fr_1fr_1.5fr_0.3fr] gap-2 px-1 py-1.5 bg-muted/30 rounded-[4px] border-b">
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">SITE ADI</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">SUNUCU</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">BINDING</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">APP POOL</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide">DURUM</span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide"></span>
        </div>
        {iisSites.map((site) => (
          <div
            key={site.id}
            className="grid grid-cols-[1.5fr_1fr_1.5fr_1fr_1.5fr_0.3fr] gap-2 px-1 py-2 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors items-center"
          >
            <span className="text-xs font-medium flex items-center gap-1.5">
              <Globe className="h-3 w-3 text-muted-foreground" />
              {site.name}
            </span>
            <span className="text-xs text-muted-foreground">{site.server}</span>
            <span className="text-xs text-muted-foreground truncate font-mono">{site.binding}</span>
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium w-fit">{site.appPool}</span>
            <div className="flex items-center gap-2">
              <StatusBadge status={site.status} />
              {site.status === "Stopped" ? (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-emerald-600">
                  <Play className="h-3 w-3" />
                </Button>
              ) : (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive">
                  <Square className="h-3 w-3" />
                </Button>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center justify-center h-7 w-7 rounded-[4px] hover:bg-muted/60 transition-colors">
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-[6px]">
                <DropdownMenuItem className="text-xs">Detaylar</DropdownMenuItem>
                <DropdownMenuItem className="text-xs">Yeniden Baslat</DropdownMenuItem>
                <DropdownMenuItem className="text-xs">Log Dosyalari</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </NestedCard>

      {/* App Pools */}
      <div className="mt-3">
        <NestedCard
          footer={
            <>
              <Layers className="h-3 w-3" />
              <span>{iisAppPools.length} uygulama havuzu</span>
            </>
          }
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Uygulama Havuzlari</h3>
          </div>
          <div className="grid grid-cols-[1.5fr_0.8fr_1fr_1fr_0.5fr] gap-2 px-1 py-1.5 bg-muted/30 rounded-[4px] border-b">
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">AD</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">DURUM</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">.NET RUNTIME</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">PIPELINE</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">ISLEM</span>
          </div>
          {iisAppPools.map((pool) => (
            <div
              key={pool.name}
              className="grid grid-cols-[1.5fr_0.8fr_1fr_1fr_0.5fr] gap-2 px-1 py-1.5 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors items-center"
            >
              <span className="text-xs font-medium">{pool.name}</span>
              <StatusBadge status={pool.status} />
              <span className="text-xs text-muted-foreground">{pool.runtime}</span>
              <span className="text-xs text-muted-foreground">{pool.pipelineMode}</span>
              <div>
                {pool.status === "Stopped" ? (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-emerald-600">
                    <Play className="h-3 w-3" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive">
                    <Square className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </NestedCard>
      </div>
    </PageContainer>
  );
}
