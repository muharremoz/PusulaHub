"use client"

import { AdServer } from "@/lib/setup-mock-data"
import { Check, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"

export function StepServer({
  servers,
  selectedId,
  onSelect,
}: {
  servers: AdServer[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase mb-2">
        Active Directory Sunucusu
      </p>

      <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40">
        {servers.map((srv) => {
          const isSelected = selectedId === srv.id
          const isDisabled = !srv.isOnline
          const densityPct = Math.min(100, Math.round((srv.userCount / 500) * 100))
          const dColor = densityPct > 80 ? "text-red-500" : densityPct > 60 ? "text-amber-500" : "text-emerald-600"
          const barColor = densityPct > 80 ? "bg-red-500" : densityPct > 60 ? "bg-amber-500" : "bg-emerald-500"

          return (
            <button
              key={srv.id}
              disabled={isDisabled}
              onClick={() => !isDisabled && onSelect(srv.id)}
              className={cn(
                "w-full grid grid-cols-[1fr_110px_90px_130px_20px] gap-3 items-center px-3 py-2.5 text-left transition-colors",
                isSelected ? "bg-foreground/[0.04]" : "hover:bg-muted/20",
                isDisabled && "opacity-40 cursor-not-allowed"
              )}
            >
              {/* Ad + IP */}
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-medium">{srv.name}</p>
                  {srv.isOnline ? (
                    <span className="relative flex size-1.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                    </span>
                  ) : (
                    <WifiOff className="size-3 text-red-400 shrink-0" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">{srv.ip}</p>
              </div>

              {/* Domain */}
              <span className="text-[11px] text-muted-foreground font-mono truncate">{srv.domain}</span>

              {/* Firma sayısı */}
              <span className="text-[11px] text-muted-foreground tabular-nums">{srv.companyCount} firma</span>

              {/* Kullanıcı yoğunluk barı */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full rounded-full", barColor)} style={{ width: `${densityPct}%` }} />
                </div>
                <span className={cn("text-[10px] tabular-nums w-14 text-right", dColor)}>
                  {srv.userCount} kull.
                </span>
              </div>

              {/* Seçim */}
              <div className={cn(
                "size-4 rounded-full border flex items-center justify-center shrink-0",
                isSelected ? "bg-foreground border-foreground" : "border-border"
              )}>
                {isSelected && <Check className="size-2.5 text-background" strokeWidth={3} />}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
