"use client"

import { useState } from "react"
import { Company, WindowsServer } from "@/lib/setup-mock-data"
import { Check, Search, AlertTriangle, X, Loader2, Ban, Mail, Phone, Users, CalendarClock } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

function formatDate(iso?: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function isExpired(iso?: string) {
  return iso ? new Date(iso) < new Date() : false
}

export function StepFirma({
  companies,
  companiesLoading,
  companiesError,
  windowsServers,
  selectedCompany,
  selectedWindowsServerId,
  onSelectCompany,
  onClearCompany,
  onSelectWindowsServer,
}: {
  companies: Company[]
  companiesLoading?: boolean
  companiesError?: string | null
  windowsServers: WindowsServer[]
  selectedCompany: Company | null
  selectedWindowsServerId: number | null
  onSelectCompany: (c: Company) => void
  onClearCompany: () => void
  onSelectWindowsServer: (id: number) => void
}) {
  const [search, setSearch] = useState("")

  const filtered = search.trim()
    ? companies.filter((c) => {
        const q = search.toLowerCase()
        return c.firkod.toLowerCase().includes(q) || c.firma.toLowerCase().includes(q)
      })
    : []

  return (
    <div className="space-y-4">

      {/* Arama */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Firma adı veya kodu ile arayın..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={companiesLoading}
          className="w-full pl-8 pr-8 py-1.5 text-[11px] rounded-[5px] border border-border/60 bg-background outline-none focus:border-foreground/30 transition-colors disabled:opacity-50"
        />
        {companiesLoading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* Yükleniyor */}
      {companiesLoading && (
        <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <Skeleton className="h-3 w-10 rounded-[3px]" />
              <Skeleton className="h-3 flex-1 rounded-[3px]" />
            </div>
          ))}
        </div>
      )}

      {/* Hata */}
      {!companiesLoading && companiesError && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-200 bg-red-50 text-[11px] text-red-600">
          <AlertTriangle className="size-3.5 shrink-0" />
          {companiesError}
        </div>
      )}

      {/* Arama sonuçları */}
      {!companiesLoading && search && !selectedCompany && (
        <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40 max-h-60 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="py-6 text-center text-[11px] text-muted-foreground">Sonuç bulunamadı</div>
          )}
          {filtered.slice(0, 50).map((c) => (
            <button
              key={c.id}
              onClick={() => { onSelectCompany(c); setSearch("") }}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground w-10 shrink-0">{c.firkod}</span>
                <span className="text-[11px] font-medium">{c.firma}</span>
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">{c.userCount ?? 0} kullanıcı</span>
            </button>
          ))}
        </div>
      )}

      {/* Seçili firma + Windows sunucu */}
      {selectedCompany && (
        <div className="space-y-3">
          {/* Seçili firma başlık */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="size-4 rounded-full bg-foreground flex items-center justify-center shrink-0">
                <Check className="size-2.5 text-background" strokeWidth={3} />
              </span>
              <span className="text-[12px] font-semibold">{selectedCompany.firma}</span>
              <span className="text-[11px] text-muted-foreground font-mono">{selectedCompany.firkod}</span>
            </div>
            <button onClick={onClearCompany} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="size-3.5" />
            </button>
          </div>

          {/* Stats kartları */}
          <div className="grid grid-cols-4 gap-2">
            {/* E-posta */}
            <div className="rounded-[8px] p-1.5 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
              <div className="rounded-[4px] px-3 py-2.5" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground tracking-wide">E-posta</p>
                  <Mail className="size-3 text-muted-foreground" />
                </div>
                <p className="text-[11px] font-medium truncate">{selectedCompany.email || "—"}</p>
              </div>
              <p className="text-[10px] text-muted-foreground px-1.5 py-1.5">İletişim adresi</p>
            </div>

            {/* Telefon */}
            <div className="rounded-[8px] p-1.5 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
              <div className="rounded-[4px] px-3 py-2.5" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground tracking-wide">Telefon</p>
                  <Phone className="size-3 text-muted-foreground" />
                </div>
                <p className="text-[11px] font-medium truncate">{selectedCompany.phone || "—"}</p>
              </div>
              <p className="text-[10px] text-muted-foreground px-1.5 py-1.5">İletişim numarası</p>
            </div>

            {/* Kullanıcı Hakkı */}
            <div className="rounded-[8px] p-1.5 pb-0" style={{ backgroundColor: (selectedCompany.userCount ?? 0) === 0 ? "#FEF3C7" : "#F4F2F0" }}>
              <div className="rounded-[4px] px-3 py-2.5" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground tracking-wide">Kullanıcı Hakkı</p>
                  <Users className="size-3 text-muted-foreground" />
                </div>
                <p className={cn("text-[13px] font-bold tracking-tight", (selectedCompany.userCount ?? 0) === 0 && "text-amber-500")}>
                  {selectedCompany.userCount ?? 0}
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground px-1.5 py-1.5">
                {(selectedCompany.userCount ?? 0) === 0 ? "Lisans güncellenmeli" : "Aktif kullanıcı limiti"}
              </p>
            </div>

            {/* Lisans Bitiş */}
            <div className="rounded-[8px] p-1.5 pb-0" style={{ backgroundColor: isExpired(selectedCompany.lisansBitis) ? "#FEF2F2" : "#F4F2F0" }}>
              <div className="rounded-[4px] px-3 py-2.5" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground tracking-wide">Lisans Bitiş</p>
                  <CalendarClock className="size-3 text-muted-foreground" />
                </div>
                <p className={cn("text-[13px] font-bold tracking-tight", isExpired(selectedCompany.lisansBitis) ? "text-red-500" : "")}>
                  {formatDate(selectedCompany.lisansBitis)}
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground px-1.5 py-1.5">
                {isExpired(selectedCompany.lisansBitis) ? "Lisans süresi dolmuş" : "Lisans geçerlilik tarihi"}
              </p>
            </div>
          </div>

          <Separator />

          {/* Kullanıcı hakkı 0 — sunucu seçimi engellendi */}
          {(selectedCompany.userCount ?? 0) === 0 && (
            <div className="rounded-[5px] border border-amber-200 bg-amber-50 overflow-hidden">
              <div className="flex items-start gap-3 px-4 py-4">
                <div className="size-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Ban className="size-4 text-amber-600" />
                </div>
                <div className="space-y-1">
                  <p className="text-[12px] font-semibold text-amber-800">Kullanıcı hakkı bulunmuyor</p>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    Bu firmanın aktif kullanıcı hakkı <span className="font-semibold">0</span> olarak görünüyor.
                    Devam edebilmek için önce firma lisansının güncellenmesi gerekmektedir.
                    Farklı bir firma seçmek için yukarıdaki <span className="font-medium">✕</span> butonunu kullanın.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Windows sunucu seçimi — sadece kullanıcı hakkı > 0 ise */}
          {(selectedCompany.userCount ?? 0) > 0 && <div>
            <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase mb-2">
              Bağlantı Sunucusu
            </p>
            <div className="rounded-[4px] border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 border-b border-border/40 hover:bg-muted/30">
                    <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">Sunucu</TableHead>
                    <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">IP</TableHead>
                    <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">DNS</TableHead>
                    <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">Tip</TableHead>
                    <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8 text-center">Kullanıcı</TableHead>
                    <TableHead className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide h-8">Yoğunluk</TableHead>
                    <TableHead className="h-8 w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {windowsServers.map((srv) => {
                    const isSelected = selectedWindowsServerId === srv.id
                    const densityPct = Math.min(100, Math.round((srv.userCount / (srv.totalRamGB * 2)) * 100))
                    const dColor = densityPct > 80 ? "text-red-500" : densityPct > 60 ? "text-amber-500" : "text-emerald-600"
                    const barColor = densityPct > 80 ? "bg-red-500" : densityPct > 60 ? "bg-amber-500" : "bg-emerald-500"
                    return (
                      <TableRow
                        key={srv.id}
                        onClick={() => onSelectWindowsServer(srv.id)}
                        className={cn(
                          "border-b border-border/40 cursor-pointer transition-colors",
                          isSelected ? "bg-foreground/[0.04]" : "hover:bg-muted/20"
                        )}
                      >
                        <TableCell className="py-2.5">
                          <p className="text-[11px] font-medium">{srv.name}</p>
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground font-mono py-2.5">
                          {srv.ip}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground font-mono py-2.5 truncate max-w-[160px]">
                          {srv.domain}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground py-2.5">
                          {srv.type}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground tabular-nums text-center py-2.5">
                          {srv.userCount}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                              <div className={cn("h-full rounded-full", barColor)} style={{ width: `${densityPct}%` }} />
                            </div>
                            <span className={cn("text-[10px] tabular-nums w-7 text-right shrink-0", dColor)}>%{densityPct}</span>
                          </div>
                        </TableCell>
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
            <p className="text-[10px] text-muted-foreground px-1 mt-2">
              {windowsServers.length} sunucu listeleniyor
            </p>
          </div>}
        </div>
      )}
    </div>
  )
}
