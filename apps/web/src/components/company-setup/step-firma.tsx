"use client"

import { useState } from "react"
import { Company } from "@/lib/setup-mock-data"
import { Check, Search, AlertTriangle, X, Loader2, Ban, Mail, Phone, Users, CalendarClock, ServerOff, WifiOff, RefreshCw, Building2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"

export interface RdpServerItem {
  id:         string
  name:       string
  ip:         string
  dns:        string
  rdpPort:    number | null
  type:       string
  userCount:  number
  totalRamGB: number
  isOnline:   boolean
}
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
  companiesRefreshing = false,
  onRefreshCompanies,
  rdpServers,
  rdpServersLoading,
  rdpServersError,
  selectedCompany,
  selectedWindowsServerId,
  onSelectCompany,
  onClearCompany,
  onSelectWindowsServer,
  existingUserCount = 0,
  existingUsersLoading = false,
  onRefreshExistingUsers,
}: {
  companies: Company[]
  companiesLoading?: boolean
  companiesError?: string | null
  companiesRefreshing?: boolean
  onRefreshCompanies?: () => void
  rdpServers: RdpServerItem[]
  rdpServersLoading?: boolean
  rdpServersError?: string | null
  selectedCompany: Company | null
  selectedWindowsServerId: string | null
  onSelectCompany: (c: Company) => void
  onClearCompany: () => void
  onSelectWindowsServer: (id: string) => void
  existingUserCount?: number
  existingUsersLoading?: boolean
  onRefreshExistingUsers?: () => void
}) {
  // "Kullanıcı Hakkı" = lisans hakkı (Pusula API · licenseCount). Kurulu
  // firmalarda userCount AD kullanıcı sayısını taşır; limit için lisans şart.
  const licenseSeats = selectedCompany?.licenseCount ?? selectedCompany?.userCount ?? 0
  const userLimit = licenseSeats
  const licenseFull = userLimit > 0 && existingUserCount >= userLimit
  const [search, setSearch] = useState("")

  const filtered = search.trim()
    ? companies.filter((c) => {
        const q = search.toLowerCase()
        return c.firkod.toLowerCase().includes(q) || c.firma.toLowerCase().includes(q)
      })
    : []

  return (
    <div className={cn("space-y-4", !selectedCompany && "flex flex-1 flex-col")}>

      {/* Firma seçilmeden: ortalanmış arama paneli — yalnız arama + yenile */}
      {!selectedCompany && (
        <div className="relative flex flex-1 flex-col justify-center overflow-hidden rounded-[8px] bg-[var(--section-bg)] px-6 py-10">
          {/* Arka plan: ince nokta deseni + ortadan yayılan yumuşak ışık (token renkleriyle, koyu temada da) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
            style={{ backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)", backgroundSize: "16px 16px" }}
          />
          <div className="relative mx-auto flex max-w-xl flex-col items-center text-center">
            <span className="bg-card text-foreground ring-border flex size-11 items-center justify-center rounded-[8px] ring-1" style={{ boxShadow: "var(--card-shadow)" }}>
              <Building2 className="size-5" />
            </span>
            <h2 className="mt-3 text-[15px] font-semibold">Kurulacak firmayı seçin</h2>

            <div className="mt-5 flex w-full items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Firma adı veya kodu…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={companiesLoading}
                  autoFocus
                  className="h-10 w-full rounded-[5px] border bg-card pl-9 pr-28 text-[13px] outline-none transition-colors focus:border-foreground/40 disabled:opacity-50"
                  style={{ boxShadow: "var(--card-shadow)" }}
                />
                {/* Sağ uç: yükleniyor / eşleşen sayısı + temizle / toplam firma rozeti */}
                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                  {companiesLoading ? (
                    <Loader2 className="mr-1 size-4 animate-spin text-muted-foreground" />
                  ) : search ? (
                    <>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {filtered.length.toLocaleString("tr-TR")} / {companies.length.toLocaleString("tr-TR")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        aria-label="Aramayı temizle"
                        className="rounded-[5px] p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </>
                  ) : companies.length > 0 && (
                    <span className="inline-flex rounded-[5px] bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                      {companies.length.toLocaleString("tr-TR")} firma
                    </span>
                  )}
                </div>
              </div>
              {onRefreshCompanies && (
                <button
                  type="button"
                  onClick={onRefreshCompanies}
                  disabled={companiesLoading || companiesRefreshing}
                  title="Firma listesini yenile (güncel lisans/kullanıcı bilgisi)"
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-[5px] border bg-card px-3.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  style={{ boxShadow: "var(--card-shadow)" }}
                >
                  <RefreshCw className={cn("size-3.5", companiesRefreshing && "animate-spin")} />
                  {companiesRefreshing ? "Yenileniyor…" : "Yenile"}
                </button>
              )}
            </div>

            {/* Yükleniyor */}
            {companiesLoading && (
              <div className="mt-2 w-full overflow-hidden rounded-[5px] bg-card divide-y" style={{ boxShadow: "var(--card-shadow)" }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <Skeleton className="h-3 w-10 rounded-[5px]" />
                    <Skeleton className="h-3 flex-1 rounded-[5px]" />
                  </div>
                ))}
              </div>
            )}

            {/* Hata */}
            {!companiesLoading && companiesError && (
              <div className="mt-2 flex w-full items-center gap-2 rounded-[5px] bg-red-500/15 px-3 py-2.5 text-left text-[12px] text-red-700 dark:text-red-400">
                <AlertTriangle className="size-3.5 shrink-0" />
                {companiesError}
              </div>
            )}

            {/* Arama sonuçları */}
            {!companiesLoading && search.trim() && (
              <div className="mt-2 w-full max-h-72 overflow-y-auto rounded-[5px] bg-card text-left divide-y" style={{ boxShadow: "var(--card-shadow)" }}>
                {filtered.length === 0 && (
                  <div className="py-6 text-center text-[12px] text-muted-foreground">“{search.trim()}” ile eşleşen firma yok</div>
                )}
                {filtered.slice(0, 50).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { onSelectCompany(c); setSearch("") }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-12 shrink-0 text-[12px] tabular-nums text-muted-foreground">{c.firkod}</span>
                      <span className="truncate text-[13px] font-medium">{c.firma}</span>
                      {c.windowsServerId && (
                        <span className="inline-flex shrink-0 rounded-[5px] bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Kurulu</span>
                      )}
                    </div>
                    <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{c.userCount ?? 0} kullanıcı</span>
                  </button>
                ))}
                {filtered.length > 50 && (
                  <div className="px-3 py-2 text-center text-[11px] text-muted-foreground">İlk 50 sonuç gösteriliyor — aramayı daraltın</div>
                )}
              </div>
            )}
          </div>
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
            <div className="rounded-[8px] p-1.5 pb-0" style={{ backgroundColor: "var(--section-bg)" }}>
              <div className="rounded-[5px] px-3 py-2.5" style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground tracking-wide">E-posta</p>
                  <Mail className="size-3 text-muted-foreground" />
                </div>
                <p className="text-[13px] font-medium truncate">{selectedCompany.email || "—"}</p>
              </div>
              <p className="text-[10px] text-muted-foreground px-1.5 py-1.5">İletişim adresi</p>
            </div>

            {/* Telefon */}
            <div className="rounded-[8px] p-1.5 pb-0" style={{ backgroundColor: "var(--section-bg)" }}>
              <div className="rounded-[5px] px-3 py-2.5" style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground tracking-wide">Telefon</p>
                  <Phone className="size-3 text-muted-foreground" />
                </div>
                <p className="text-[13px] font-medium truncate">{selectedCompany.phone || "—"}</p>
              </div>
              <p className="text-[10px] text-muted-foreground px-1.5 py-1.5">İletişim numarası</p>
            </div>

            {/* Kullanıcı Hakkı */}
            <div className={cn("rounded-[8px] p-1.5 pb-0", licenseSeats === 0 ? "bg-amber-500/15" : "bg-[var(--section-bg)]")}>
              <div className="rounded-[5px] px-3 py-2.5" style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground tracking-wide">Kullanıcı Hakkı</p>
                  <Users className="size-3 text-muted-foreground" />
                </div>
                <p className={cn("text-[13px] font-bold tracking-tight", licenseSeats === 0 && "text-amber-500")}>
                  {licenseSeats}
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground px-1.5 py-1.5">
                {licenseSeats === 0 ? "Lisans güncellenmeli" : "Aktif kullanıcı limiti"}
              </p>
            </div>

            {/* Lisans Bitiş */}
            <div className={cn("rounded-[8px] p-1.5 pb-0", isExpired(selectedCompany.lisansBitis) ? "bg-red-500/15" : "bg-[var(--section-bg)]")}>
              <div className="rounded-[5px] px-3 py-2.5" style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}>
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
          {licenseSeats === 0 && (
            <div className="rounded-[5px] border border-amber-500/25 bg-amber-500/15 overflow-hidden">
              <div className="flex items-start gap-3 px-4 py-4">
                <div className="size-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Ban className="size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-[12px] font-semibold text-amber-800">Kullanıcı hakkı bulunmuyor</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                    Bu firmanın aktif kullanıcı hakkı <span className="font-semibold">0</span> olarak görünüyor.
                    Devam edebilmek için önce firma lisansının güncellenmesi gerekmektedir.
                    Farklı bir firma seçmek için yukarıdaki <span className="font-medium">✕</span> butonunu kullanın.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Lisans dolu uyarısı — sistemdeki mevcut kullanıcı sayısı lisansa ulaşmış */}
          {licenseSeats > 0 && licenseFull && (
            <div className="rounded-[5px] border border-red-500/25 bg-red-500/15 overflow-hidden">
              <div className="flex items-start gap-3 px-4 py-4">
                <div className="size-8 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Ban className="size-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-[12px] font-semibold text-red-800">Lisans dolu — kullanıcı eklenemez</p>
                  <p className="text-[11px] text-red-700 dark:text-red-400 leading-relaxed">
                    Firmanın kullanıcı hakkı <span className="font-semibold">{userLimit}</span> ve
                    Active Directory&apos;de zaten <span className="font-semibold">{existingUserCount}</span> kullanıcı kayıtlı.
                    Devam edebilmek için lisansın artırılması veya mevcut bir kullanıcının silinmesi gerekmektedir.
                  </p>
                  {onRefreshExistingUsers && (
                    <button
                      type="button"
                      onClick={onRefreshExistingUsers}
                      disabled={existingUsersLoading}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] border border-red-300 bg-card hover:bg-red-100 transition-colors text-[10px] font-medium text-red-700 dark:text-red-400 disabled:opacity-50"
                    >
                      <RefreshCw className={cn("size-3", existingUsersLoading && "animate-spin")} />
                      AD&apos;den yenile
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bağlantı sunucusu (RDP) seçimi — sadece kullanıcı hakkı > 0 ve lisans doluysa gizle */}
          {licenseSeats > 0 && !licenseFull && <div>
            <p className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase mb-2">
              Bağlantı Sunucusu
            </p>

            {/* Yükleniyor */}
            {rdpServersLoading && (
              <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-3">
                    <Skeleton className="h-3 w-32 rounded-[5px]" />
                    <Skeleton className="h-3 w-24 rounded-[5px]" />
                    <Skeleton className="h-3 w-28 rounded-[5px]" />
                    <Skeleton className="h-3 w-16 rounded-[5px] ml-auto" />
                  </div>
                ))}
              </div>
            )}

            {/* Hata */}
            {!rdpServersLoading && rdpServersError && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-500/25 bg-red-500/15 text-[11px] text-red-600 dark:text-red-400">
                <AlertTriangle className="size-3.5 shrink-0" />
                {rdpServersError}
              </div>
            )}

            {/* Boş */}
            {!rdpServersLoading && !rdpServersError && rdpServers.length === 0 && (
              <div className="rounded-[5px] border border-border/50 px-4 py-8 flex flex-col items-center justify-center gap-2 text-center">
                <ServerOff className="size-6 text-muted-foreground" />
                <p className="text-[12px] font-medium">RDP sunucusu tanımlı değil</p>
                <p className="text-[10px] text-muted-foreground max-w-xs">
                  Kullanıcıların bağlanacağı bir Terminal Server&apos;ı sisteme
                  RDP rolüyle eklemelisin.
                </p>
                <a
                  href="/servers"
                  className="mt-1 text-[11px] font-medium px-3 py-1.5 rounded-[5px] bg-primary text-primary-foreground hover:bg-foreground/90 transition-colors"
                >
                  Sunucu Ekle
                </a>
              </div>
            )}

            {/* Tablo */}
            {!rdpServersLoading && !rdpServersError && rdpServers.length > 0 && (
            <>
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 border-b border-border hover:bg-muted/30">
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
                  {rdpServers.map((srv) => {
                    const isSelected = selectedWindowsServerId === srv.id
                    const isDisabled = !srv.isOnline
                    // Density: totalRamGB * 2 ≈ max oturum. totalRamGB 0 ise 0 göster.
                    const maxUsers = srv.totalRamGB > 0 ? srv.totalRamGB * 2 : 0
                    const densityPct = maxUsers > 0
                      ? Math.min(100, Math.round((srv.userCount / maxUsers) * 100))
                      : 0
                    const dColor = densityPct > 80 ? "text-red-500" : densityPct > 60 ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"
                    const barColor = densityPct > 80 ? "bg-red-500" : densityPct > 60 ? "bg-amber-500" : "bg-emerald-500"
                    return (
                      <TableRow
                        key={srv.id}
                        onClick={() => !isDisabled && onSelectWindowsServer(srv.id)}
                        className={cn(
                          "border-b border-border/40 transition-colors",
                          isSelected ? "bg-foreground/[0.04]" : "hover:bg-muted/20",
                          isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                        )}
                      >
                        <TableCell className="py-2.5">
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
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground font-mono py-2.5">
                          {srv.ip}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground font-mono py-2.5 truncate max-w-[160px]">
                          {srv.dns || "—"}
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
              {rdpServers.length} sunucu listeleniyor
            </p>
            </>
            )}
          </div>}
        </div>
      )}
    </div>
  )
}
