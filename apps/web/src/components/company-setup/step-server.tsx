"use client"

import { Check, WifiOff, ServerOff } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface AdServerItem {
  id:           string
  name:         string
  ip:           string
  dns:          string
  domain:       string
  rdpPort:      number | null
  isOnline:     boolean
  userCount:    number
  companyCount: number
}

export function StepServer({
  servers,
  selectedId,
  onSelect,
  loading,
  error,
}: {
  servers: AdServerItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
  error?: string | null
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
        Active Directory Sunucusu
      </p>

      {/* Yüklenme */}
      {loading && (
        <div className="rounded-[4px] border border-border/50 overflow-hidden divide-y divide-border/40">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="h-3 w-32 rounded-[4px]" />
              <Skeleton className="h-3 w-24 rounded-[4px]" />
              <Skeleton className="h-3 w-28 rounded-[4px]" />
              <Skeleton className="h-3 w-16 rounded-[4px] ml-auto" />
            </div>
          ))}
        </div>
      )}

      {/* Hata */}
      {!loading && error && (
        <div className="rounded-[4px] border border-destructive/30 bg-destructive/5 px-3 py-4 text-[11px] text-destructive">
          {error}
        </div>
      )}

      {/* Boş durum */}
      {!loading && !error && servers.length === 0 && (
        <div className="rounded-[4px] border border-border/50 px-4 py-8 flex flex-col items-center justify-center gap-2 text-center">
          <ServerOff className="size-6 text-muted-foreground" />
          <p className="text-[12px] font-medium">Henüz AD sunucusu tanımlı değil</p>
          <p className="text-[10px] text-muted-foreground max-w-xs">
            Firma kurulumu yapabilmek için önce sisteme AD rolünde bir sunucu eklemelisin.
          </p>
          <a
            href="/servers"
            className="mt-1 text-[11px] font-medium px-3 py-1.5 rounded-[5px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            Sunucu Ekle
          </a>
        </div>
      )}

      {/* Tablo */}
      {!loading && !error && servers.length > 0 && (
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
                    {srv.domain || "—"}
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
      )}

      {!loading && !error && servers.length > 0 && (
        <p className="text-[10px] text-muted-foreground px-1">
          {servers.length} sunucu listeleniyor
        </p>
      )}
    </div>
  )
}
