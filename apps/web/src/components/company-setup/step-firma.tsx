"use client"

import { useState } from "react"
import { Company } from "@/lib/setup-mock-data"
import { Check, Search, AlertTriangle, X, Loader2, Ban, Mail, Phone, Users, CalendarClock, ServerOff, WifiOff, RefreshCw, Building2, CheckCircle2, Hourglass } from "lucide-react"
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

  // Boş ekran özeti: kurulu = terminal atanmış; bekleyen = kurulmamış + hakkı var + lisansı geçerli.
  // Firma kodları sırayla verildiği için büyük kod = yeni müşteri.
  const kurulu = companies.filter((c) => !!c.windowsServerId).length
  const bekleyenler = companies
    .filter((c) => !c.windowsServerId && (c.licenseCount ?? 0) > 0 && !isExpired(c.lisansBitis))
    .sort((a, b) => (Number.parseInt(b.firkod, 10) || 0) - (Number.parseInt(a.firkod, 10) || 0))
  const BEKLEYEN_GOSTER = 8

  return (
    <div className="space-y-4">

      {/* Arama + Yenile */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Firma adı veya kodu ile arayın..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={companiesLoading}
            autoFocus
            className="w-full h-9 pl-8 pr-8 text-[13px] rounded-[5px] border border-border/60 bg-background outline-none focus:border-foreground/30 transition-colors disabled:opacity-50"
          />
          {companiesLoading && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground animate-spin" />
          )}
        </div>
        {onRefreshCompanies && (
          <button
            type="button"
            onClick={onRefreshCompanies}
            disabled={companiesLoading || companiesRefreshing}
            title="Firma listesini yenile (güncel lisans/kullanıcı bilgisi)"
            className="flex items-center gap-1.5 h-9 px-3 rounded-[5px] border border-border/60 bg-background text-[12px] text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`size-3.5 ${companiesRefreshing ? "animate-spin" : ""}`} />
            Yenile
          </button>
        )}
      </div>

      {/* Yükleniyor */}
      {companiesLoading && (
        <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <Skeleton className="h-3 w-10 rounded-[5px]" />
              <Skeleton className="h-3 flex-1 rounded-[5px]" />
            </div>
          ))}
        </div>
      )}

      {/* Hata */}
      {!companiesLoading && companiesError && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-500/25 bg-red-500/15 text-[11px] text-red-600 dark:text-red-400">
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
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/70 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[12px] tabular-nums text-muted-foreground w-12 shrink-0">{c.firkod}</span>
                <span className="text-[13px] font-medium truncate">{c.firma}</span>
                {c.windowsServerId && (
                  <span className="inline-flex shrink-0 rounded-[5px] bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Kurulu</span>
                )}
              </div>
              <span className="text-[12px] text-muted-foreground tabular-nums shrink-0">{c.userCount ?? 0} kullanıcı</span>
            </button>
          ))}
        </div>
      )}

      {/* Boş ekran — arama yokken özet + kurulum bekleyen en yeni firmalar */}
      {!companiesLoading && !companiesError && !search.trim() && !selectedCompany && companies.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { baslik: "Toplam firma", deger: companies.length, alt: "Pusula'da kayıtlı", ikon: <Building2 className="size-3.5" /> },
              { baslik: "Kurulu", deger: kurulu, alt: "Terminal sunucusu atanmış", ikon: <CheckCircle2 className="size-3.5" /> },
              { baslik: "Kurulum bekleyen", deger: bekleyenler.length, alt: "Lisansı geçerli, kurulmamış", ikon: <Hourglass className="size-3.5" /> },
            ].map((k) => (
              <div key={k.baslik} className="rounded-[8px] p-1.5 pb-0 bg-[var(--section-bg)]">
                <div className="rounded-[5px] bg-card px-3 py-2.5" style={{ boxShadow: "var(--card-shadow)" }}>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <p className="text-[10px] font-medium uppercase tracking-wider">{k.baslik}</p>
                    {k.ikon}
                  </div>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{k.deger.toLocaleString("tr-TR")}</p>
                </div>
                <p className="px-1.5 py-1.5 text-[11px] text-muted-foreground">{k.alt}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[8px] bg-[var(--section-bg)] p-2">
            <div className="flex items-center justify-between px-2 pb-2">
              <p className="flex items-center gap-1.5 text-[12px] font-medium">
                <Hourglass className="size-3.5 text-muted-foreground" />
                Kurulum bekleyen firmalar
              </p>
              <span className="text-[11px] text-muted-foreground">En yeni müşteri üstte</span>
            </div>
            <div className="overflow-hidden rounded-[5px] bg-card" style={{ boxShadow: "var(--card-shadow)" }}>
              {bekleyenler.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-8 text-center">
                  <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-[13px] font-medium">Kurulum bekleyen firma yok</p>
                  <p className="text-[12px] text-muted-foreground">Başka bir firma için yukarıdan arama yapın.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-8 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Kod</TableHead>
                      <TableHead className="h-8 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Firma</TableHead>
                      <TableHead className="h-8 text-[10px] font-medium uppercase tracking-wider text-muted-foreground text-right">Kullanıcı Hakkı</TableHead>
                      <TableHead className="h-8 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Lisans Bitiş</TableHead>
                      <TableHead className="h-8 w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bekleyenler.slice(0, BEKLEYEN_GOSTER).map((c) => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/20" onClick={() => onSelectCompany(c)}>
                        <TableCell className="py-1.5 text-[12px] tabular-nums text-muted-foreground">{c.firkod}</TableCell>
                        <TableCell className="py-1.5 text-[13px] font-medium max-w-[320px] truncate">{c.firma}</TableCell>
                        <TableCell className="py-1.5 text-[13px] tabular-nums text-right">{c.licenseCount}</TableCell>
                        <TableCell className="py-1.5 text-[12px] tabular-nums text-muted-foreground">{formatDate(c.lisansBitis)}</TableCell>
                        <TableCell className="py-1.5 text-right">
                          <span className="text-[12px] font-medium text-foreground/70">Seç →</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            {bekleyenler.length > BEKLEYEN_GOSTER && (
              <p className="px-2 pt-2 text-[11px] text-muted-foreground">
                {bekleyenler.length - BEKLEYEN_GOSTER} firma daha bekliyor — adı ya da koduyla arayın.
              </p>
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
