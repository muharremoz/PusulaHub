"use client";

import { Separator } from "@/components/ui/separator";
import {
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Bell, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PageContainerProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function PageContainer({ title, description, children }: PageContainerProps) {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <div>
            <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="text-[11px] text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center justify-center h-8 w-8 rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            <Search className="h-4 w-4" />
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
