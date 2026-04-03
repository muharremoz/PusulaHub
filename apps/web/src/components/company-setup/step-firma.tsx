"use client"

import { useState } from "react"
import { Company, WindowsServer } from "@/lib/setup-mock-data"
import { Check, Search, AlertTriangle, X } from "lucide-react"
import { Separator } from "@/components/ui/separator"
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
  windowsServers,
  selectedCompany,
  selectedWindowsServerId,
  onSelectCompany,
  onClearCompany,
  onSelectWindowsServer,
}: {
  companies: Company[]
  windowsServers: WindowsServer[]
  selectedCompany: Company | null
  selectedWindowsServerId: number | null
  onSelectCompany: (c: Company) => void
  onClearCompany: () => void
  onSelectWindowsServer: (id: number) => void
}) {
  const [search, setSearch] = useState("")

  const filtered = companies.filter((c) => {
    const q = search.toLowerCase()
    return (
      c.firkod.toLowerCase().includes(q) ||
      c.firma.toLowerCase().includes(q) ||
      (c.city ?? "").toLowerCase().includes(q)
    )
  })

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
          className="w-full pl-8 pr-3 py-1.5 text-[11px] rounded-[5px] border border-border/60 bg-background outline-none focus:border-foreground/30 transition-colors"
        />
      </div>

      {/* Arama sonuçları */}
      {search && !selectedCompany && (
        <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40">
          {filtered.length === 0 && (
            <div className="py-6 text-center text-[11px] text-muted-foreground">Sonuç bulunamadı</div>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => { onSelectCompany(c); setSearch("") }}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground w-10">{c.firkod}</span>
                <span className="text-[11px] font-medium">{c.firma}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{c.city}</span>
            </button>
          ))}
        </div>
      )}

      {/* Seçili firma + Windows sunucu */}
      {selectedCompany && (
        <div className="space-y-3">
          {/* Seçili firma detay kartı */}
          <div className="rounded-[5px] border border-foreground/20 bg-foreground/[0.03] overflow-hidden">
            {/* Başlık satırı */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
              <div className="flex items-center gap-2">
                <span className="size-4 rounded-full bg-foreground flex items-center justify-center shrink-0">
                  <Check className="size-2.5 text-background" strokeWidth={3} />
                </span>
                <span className="text-[11px] font-semibold">{selectedCompany.firma}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{selectedCompany.firkod}</span>
              </div>
              <button onClick={onClearCompany} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="size-3.5" />
              </button>
            </div>

            {/* Detaylar grid */}
            <div className="grid grid-cols-3 divide-x divide-border/40">
              {[
                { label: "E-posta",      value: selectedCompany.email || "—" },
                { label: "Telefon",      value: selectedCompany.phone || "—" },
                { label: "Şehir",        value: selectedCompany.city || "—" },
                { label: "Kullanıcı Hakkı", value: String(selectedCompany.userCount ?? 0) },
                { label: "Son Giriş",    value: formatDate(selectedCompany.lastLogin) },
                { label: "Lisans Bitiş", value: formatDate(selectedCompany.lisansBitis), expired: isExpired(selectedCompany.lisansBitis) },
              ].map(({ label, value, expired }) => (
                <div key={label} className="px-3 py-2 [&:nth-child(n+4)]:border-t [&:nth-child(n+4)]:border-border/40">
                  <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                  <p className={cn("text-[11px] font-medium truncate", expired && "text-red-500")}>{value}</p>
                </div>
              ))}
            </div>

            {(selectedCompany.userCount ?? 0) === 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                <AlertTriangle className="size-3 shrink-0" /> Kullanıcı hakkı 0 — yeni kullanıcılar aktif olmayabilir
              </div>
            )}
          </div>

          <Separator />

          {/* Windows sunucu seçimi */}
          <div>
            <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase mb-2">
              Bağlantı Sunucusu
            </p>
            <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40">
              {windowsServers.map((srv) => {
                const isSelected = selectedWindowsServerId === srv.id
                const densityPct = Math.min(100, Math.round((srv.userCount / (srv.totalRamGB * 2)) * 100))
                const dColor = densityPct > 80 ? "text-red-500" : densityPct > 60 ? "text-amber-500" : "text-emerald-600"
                const barColor = densityPct > 80 ? "bg-red-500" : densityPct > 60 ? "bg-amber-500" : "bg-emerald-500"
                return (
                  <button
                    key={srv.id}
                    onClick={() => onSelectWindowsServer(srv.id)}
                    className={cn(
                      "w-full grid grid-cols-[1fr_160px_80px_80px_100px_20px] gap-3 items-center px-3 py-2.5 text-left transition-colors",
                      isSelected ? "bg-foreground/[0.04]" : "hover:bg-muted/20"
                    )}
                  >
                    {/* Ad + IP */}
                    <div>
                      <p className="text-[11px] font-medium">{srv.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{srv.ip}</p>
                    </div>
                    {/* DNS */}
                    <span className="text-[11px] text-muted-foreground font-mono truncate">{srv.domain}</span>
                    {/* Tip */}
                    <span className="text-[11px] text-muted-foreground truncate">{srv.type}</span>
                    {/* Kullanıcı */}
                    <span className="text-[11px] text-muted-foreground tabular-nums">{srv.userCount} kull.</span>
                    {/* Yoğunluk */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div className={cn("h-full rounded-full", barColor)} style={{ width: `${densityPct}%` }} />
                      </div>
                      <span className={cn("text-[10px] tabular-nums w-7 text-right shrink-0", dColor)}>%{densityPct}</span>
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
        </div>
      )}
    </div>
  )
}
