"use client"

import { AdServer } from "@/lib/setup-mock-data"
import { Check, WifiOff } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
    <div className="space-y-2">
      <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
        Active Directory Sunucusu
      </p>

      <div className="rounded-[4px] border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 border-b border-border/40 hover:bg-muted/30">
              <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">Sunucu</TableHead>
              <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">IP</TableHead>
              <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">Domain</TableHead>
              <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8 text-center">Firma</TableHead>
              <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">Kullanıcı Yoğunluğu</TableHead>
              <TableHead className="h-8 w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.map((srv) => {
              const isSelected = selectedId === srv.id
              const isDisabled = !srv.isOnline
              const densityPct = Math.min(100, Math.round((srv.userCount / 500) * 100))
              const dColor = densityPct > 80 ? "text-red-500" : densityPct > 60 ? "text-amber-500" : "text-emerald-600"
              const barColor = densityPct > 80 ? "bg-red-500" : densityPct > 60 ? "bg-amber-500" : "bg-emerald-500"

              return (
                <TableRow
                  key={srv.id}
                  onClick={() => !isDisabled && onSelect(srv.id)}
                  className={cn(
                    "border-b border-border/40 transition-colors",
                    isSelected ? "bg-foreground/[0.04]" : "hover:bg-muted/20",
                    isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                  )}
                >
                  {/* Sunucu adı + online dot */}
                  <TableCell className="py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium">{srv.name}</span>
                      {srv.isOnline ? (
                        <span className="relative flex size-1.5 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                        </span>
                      ) : (
                        <WifiOff className="size-3 text-red-400 shrink-0" />
                      )}
                    </div>
                  </TableCell>

                  {/* IP */}
                  <TableCell className="text-[11px] text-muted-foreground font-mono py-2.5">
                    {srv.ip}
                  </TableCell>

                  {/* Domain */}
                  <TableCell className="text-[11px] text-muted-foreground font-mono py-2.5">
                    {srv.domain}
                  </TableCell>

                  {/* Firma sayısı */}
                  <TableCell className="text-[11px] text-muted-foreground tabular-nums text-center py-2.5">
                    {srv.companyCount}
                  </TableCell>

                  {/* Kullanıcı yoğunluk barı */}
                  <TableCell className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div className={cn("h-full rounded-full", barColor)} style={{ width: `${densityPct}%` }} />
                      </div>
                      <span className={cn("text-[10px] tabular-nums w-14 text-right shrink-0", dColor)}>
                        {srv.userCount} kull.
                      </span>
                    </div>
                  </TableCell>

                  {/* Seçim */}
                  <TableCell className="py-2.5">
                    <div className={cn(
                      "size-4 rounded-full border flex items-center justify-center",
                      isSelected ? "bg-foreground border-foreground" : "border-border"
                    )}>
                      {isSelected && <Check className="size-2.5 text-background" strokeWidth={3} />}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-[10px] text-muted-foreground px-1">
        {servers.length} sunucu listeleniyor
      </p>
    </div>
  )
}
