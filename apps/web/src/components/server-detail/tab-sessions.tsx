"use client";

import { MoreVertical, Monitor } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DetailSession } from "@/lib/mock-server-detail";

interface Props {
  sessions: DetailSession[];
}

export function TabSessions({ sessions }: Props) {
  return (
    <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
      <div
        className="rounded-[4px] overflow-hidden"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
      >
        {/* Header */}
        <div className="grid grid-cols-[1fr_160px_120px_80px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Kullanıcı Adı</span>
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Giriş Saati</span>
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Süre</span>
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Tür</span>
          <span />
        </div>

        {/* Rows */}
        {sessions.length === 0 ? (
          <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">
            Aktif oturum bulunmuyor.
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {sessions.map((ses) => (
              <div
                key={ses.id}
                className="grid grid-cols-[1fr_160px_120px_80px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
              >
                <span className="text-[11px] font-mono font-medium truncate">{ses.username}</span>
                <span className="text-[11px] tabular-nums">{ses.logonTime}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{ses.duration}</span>
                <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium w-fit">
                  {ses.type}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                      <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-[6px]">
                    <DropdownMenuItem className="text-xs cursor-pointer">Bağlantıyı Kes</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-xs cursor-pointer text-destructive">Oturumu Kapat</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
        <Monitor className="size-3" />
        <span>{sessions.length} aktif oturum listeleniyor</span>
      </div>
    </div>
  );
}
