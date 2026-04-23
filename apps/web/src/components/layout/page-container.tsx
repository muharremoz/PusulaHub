"use client";

import * as React from "react";
import { Bell, Search as SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CommandPalette } from "@/components/shared/command-palette";

interface PageContainerProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function PageContainer({ title, description, children }: PageContainerProps) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  return (
    <>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="text-[11px] text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 h-8 w-[320px] rounded-[6px] px-3 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-border/60 transition-colors"
            title="Ara (Ctrl+K)"
          >
            <SearchIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-left">Sayfa, sunucu veya firma ara...</span>
            <kbd className="text-[9px] bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">Ctrl K</kbd>
          </button>
          <button className="relative flex items-center justify-center h-8 w-8 rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            <Bell className="h-4 w-4" />
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] bg-destructive text-white border-0 flex items-center justify-center">
              3
            </Badge>
          </button>
        </div>
      </header>
      <main className="flex-1 p-6 bg-[#F9F8F7]">
        {children}
      </main>
    </>
  );
}
