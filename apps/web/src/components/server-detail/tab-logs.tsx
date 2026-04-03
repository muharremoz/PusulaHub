"use client";

import { cn } from "@/lib/utils";
import type { DetailLogs } from "@/lib/mock-server-detail";

interface Props {
  logs: DetailLogs;
}

const LEVEL_CLASS: Record<string, string> = {
  Info: "bg-blue-50 text-blue-700 border-blue-200/60 border",
  Warning: "bg-amber-50 text-amber-700 border-amber-200/60 border",
  Error: "bg-red-50 text-red-700 border-red-200/60 border",
};

const LEVEL_LABEL: Record<string, string> = {
  Info: "Bilgi",
  Warning: "Uyarı",
  Error: "Hata",
};

export function TabLogs({ logs }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Event Log */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px]"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
              Olay Günlüğü
            </span>
          </div>
          <div className="divide-y divide-border/40">
            {logs.events.map((event) => (
              <div key={event.id} className="px-3 py-2.5 hover:bg-muted/20 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded-[4px] font-medium shrink-0",
                      LEVEL_CLASS[event.level]
                    )}
                  >
                    {LEVEL_LABEL[event.level]}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                    {event.time}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate">{event.source}</span>
                </div>
                <p className="text-[11px] truncate">{event.message}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="h-2" />
      </div>

      {/* Failed Logins */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px]"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
              Başarısız Giriş Denemeleri
            </span>
          </div>
          <div className="grid grid-cols-[90px_1fr_110px] gap-3 px-3 py-2 bg-muted/10 border-b border-border/40">
            {["Saat", "Kullanıcı", "IP Adresi"].map((h) => (
              <span
                key={h}
                className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase"
              >
                {h}
              </span>
            ))}
          </div>
          <div className="divide-y divide-border/40">
            {logs.failedLogins.map((fl, i) => (
              <div
                key={i}
                className="grid grid-cols-[90px_1fr_110px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
              >
                <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                  {fl.time}
                </span>
                <span className="text-[11px] font-mono truncate">{fl.username}</span>
                <span className="text-[11px] font-mono text-muted-foreground">{fl.ip}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="h-2" />
      </div>
    </div>
  );
}
