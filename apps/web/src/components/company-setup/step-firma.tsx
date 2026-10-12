"use client"

import { useEffect, useState } from "react"
import { Company } from "@/lib/setup-mock-data"
import { Check, Search, AlertTriangle, X, Loader2, Ban, Mail, Phone, Users, CalendarClock, ServerOff, WifiOff, RefreshCw, Building2, MonitorSmartphone } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

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
  const [aramaAcik, setAramaAcik] = useState(false)
  useEffect(() => { setAramaAcik(false) }, [selectedCompany?.firkod])
  const lisansKalanGun = selectedCompany?.lisansBitis
    ? Math.ceil((new Date(selectedCompany.lisansBitis).getTime() - Date.now()) / 864e5)
    : Infinity

  /*  En uygun eşleşme üstte: kod tam > kod başı > ad başı > ad içinde kelime başı
   *  > kod içinde > ad içinde. Eşitlikte kısa kod, sonra ad sırası.             */
  const filtered = (() => {
    const q = search.trim().toLocaleLowerCase("tr-TR")
    if (!q) return []
    const puan = (c: Company) => {
      const kod = c.firkod.toLocaleLowerCase("tr-TR"), ad = c.firma.toLocaleLowerCase("tr-TR")
      if (kod === q) return 0
      if (kod.startsWith(q)) return 1
      if (ad.startsWith(q)) return 2
      if (ad.split(/[\s.\-/]+/).some((k) => k.startsWith(q))) return 3
      if (kod.includes(q)) return 4
      if (ad.includes(q)) return 5
      return -1
    }
    return companies
      .map((c) => ({ c, p: puan(c) }))
      .filter((x) => x.p >= 0)
      .sort((a, b) => a.p - b.p || a.c.firkod.length - b.c.firkod.length || a.c.firma.localeCompare(b.c.firma, "tr"))
      .map((x) => x.c)
  })()

  /*  Arama kutusu + yenile + sonuçlar — hem boş ekranda hem "Farklı Firma Seç"te
   *  aynı bileşen; ikisi aynı anda görünmediği için `search` durumu ortak.   */
  const aramaAlani = (
    <>
      <div className="flex w-full items-center gap-2">
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
    </>
  )

  return (
    <div className="flex flex-1 flex-col gap-4">

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

            <div className="mt-5 w-full">{aramaAlani}</div>
          </div>
        </div>
      )}

      {/* Seçili firma + Windows sunucu */}
      {selectedCompany && (
        <div className="flex flex-1 flex-col gap-4">
          {/* Firma kartı: kimlik + iletişim + iki gösterge */}
          <div className="rounded-[8px] bg-[var(--section-bg)] p-1.5">
            <div className="flex items-center gap-3 rounded-[5px] bg-card px-3 py-2.5" style={{ boxShadow: "var(--card-shadow)" }}>
              <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
                <Building2 className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[15px] font-semibold">{selectedCompany.firma}</p>
                  <span className="inline-flex shrink-0 rounded-[5px] bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{selectedCompany.firkod}</span>
                  {selectedCompany.windowsServerId && (
                    <span className="inline-flex shrink-0 rounded-[5px] bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Kurulu</span>
                  )}
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-4 text-[12px] text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-1.5"><Mail className="size-3 shrink-0" /><span className="truncate">{selectedCompany.email || "—"}</span></span>
                  <span className="flex shrink-0 items-center gap-1.5"><Phone className="size-3" />{selectedCompany.phone || "—"}</span>
                </div>
              </div>
              {!(licenseSeats === 0 || licenseFull) && (
                <Button variant="outline" size="sm" onClick={onClearCompany} className="shrink-0 gap-1.5">
                  <X className="size-3.5" /> Firma Değiştir
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1.5">
              {/* Kullanıcı hakkı */}
              <div className="rounded-[5px] bg-card px-3 py-2.5" style={{ boxShadow: "var(--card-shadow)" }}>
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    <Users className="size-3" /> Kullanıcı Hakkı
                  </p>
                  <Durum ton={licenseSeats === 0 ? "uyari" : licenseFull ? "hata" : "iyi"}>
                    {licenseSeats === 0 ? "Güncellenmeli" : licenseFull ? "Dolu" : `${userLimit - existingUserCount} boş`}
                  </Durum>
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {licenseSeats > 0 ? <>{existingUserCount}<span className="text-[15px] font-medium text-muted-foreground"> / {licenseSeats}</span></> : 0}
                </p>
                {licenseSeats > 0 && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", licenseFull ? "bg-red-500" : existingUserCount / licenseSeats > 0.8 ? "bg-amber-500" : "bg-emerald-500")}
                      style={{ width: `${Math.min(100, Math.round((existingUserCount / licenseSeats) * 100))}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Lisans bitiş */}
              <div className="rounded-[5px] bg-card px-3 py-2.5" style={{ boxShadow: "var(--card-shadow)" }}>
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    <CalendarClock className="size-3" /> Lisans Bitiş
                  </p>
                  {selectedCompany.lisansBitis && (
                    <Durum ton={lisansKalanGun < 0 ? "hata" : lisansKalanGun <= 30 ? "uyari" : "iyi"}>
                      {lisansKalanGun < 0 ? "Süresi dolmuş" : `${lisansKalanGun} gün kaldı`}
                    </Durum>
                  )}
                </div>
                <p className={cn("mt-1 text-2xl font-bold tabular-nums", lisansKalanGun < 0 && "text-red-600 dark:text-red-400")}>
                  {formatDate(selectedCompany.lisansBitis)}
                </p>
              </div>
            </div>
          </div>

          {/* Engel: hak yok ya da dolu — sunucu seçimi yerine alanı dolduran yönlendirme */}
          {(licenseSeats === 0 || licenseFull) && (
            <div className="flex flex-1 flex-col items-center justify-center rounded-[8px] border border-dashed px-6 py-10 text-center">
              <span className={cn(
                "flex size-11 items-center justify-center rounded-full",
                licenseSeats === 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-red-500/15 text-red-700 dark:text-red-400",
              )}>
                <Ban className="size-5" />
              </span>
              <h3 className="mt-3 text-[15px] font-semibold">
                {licenseSeats === 0 ? "Kullanıcı hakkı bulunmuyor" : "Lisans dolu — kullanıcı eklenemez"}
              </h3>
              {licenseFull && licenseSeats > 0 && (
                <p className="mt-1 max-w-md text-[12px] text-muted-foreground">
                  Kullanıcı hakkı {userLimit} ve Active Directory&apos;de zaten {existingUserCount} kullanıcı var. Devam etmek için lisans artırılmalı ya da bir kullanıcı silinmeli.
                </p>
              )}
              {aramaAcik ? (
                <div className="mt-4 w-full max-w-xl text-left">{aramaAlani}</div>
              ) : (
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setAramaAcik(true) }}>Farklı Firma Seç</Button>
                {licenseSeats === 0 && onRefreshCompanies && (
                  <Button size="sm" onClick={onRefreshCompanies} disabled={companiesRefreshing} className="gap-1.5">
                    <RefreshCw className={cn("size-3.5", companiesRefreshing && "animate-spin")} />
                    {companiesRefreshing ? "Yenileniyor…" : "Lisansı Yenile"}
                  </Button>
                )}
                {licenseFull && licenseSeats > 0 && onRefreshExistingUsers && (
                  <Button size="sm" onClick={onRefreshExistingUsers} disabled={existingUsersLoading} className="gap-1.5">
                    <RefreshCw className={cn("size-3.5", existingUsersLoading && "animate-spin")} />
                    AD&apos;den Yenile
                  </Button>
                )}
              </div>
              )}
            </div>
          )}

          {/* Bağlantı sunucusu (RDP) seçimi — sadece kullanıcı hakkı > 0 ve lisans doluysa gizle */}
          {licenseSeats > 0 && !licenseFull && (() => {
            // Yoğunluk: totalRamGB * 2 ≈ en fazla oturum. RAM bilinmiyorsa 0.
            const yogunluk = (srv: RdpServerItem) => {
              const max = srv.totalRamGB > 0 ? srv.totalRamGB * 2 : 0
              return max > 0 ? Math.min(100, Math.round((srv.userCount / max) * 100)) : 0
            }
            // Önerilen: çevrimiçi sunucular içinde en boş olanı
            const onerilen = rdpServers.filter((s) => s.isOnline).sort((a, b) => yogunluk(a) - yogunluk(b))[0]?.id
            return (
          <div>
            <div className="flex items-center justify-between pb-2">
              <p className="flex items-center gap-1.5 text-[12px] font-medium">
                <MonitorSmartphone className="size-3.5 text-muted-foreground" />
                Bağlantı Sunucusu
              </p>
              {!rdpServersLoading && rdpServers.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {(() => { const s = rdpServers.find((x) => x.id === selectedWindowsServerId); return s ? <span className="font-medium text-emerald-700 dark:text-emerald-400">Seçili: {s.name}</span> : "Kullanıcıların bağlanacağı terminali seçin" })()}
                </span>
              )}
            </div>

            {/* Yükleniyor */}
            {rdpServersLoading && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2.5 rounded-[5px] bg-card p-3" style={{ boxShadow: "var(--card-shadow)" }}>
                    <Skeleton className="h-3.5 w-24 rounded-[5px]" />
                    <Skeleton className="h-3 w-32 rounded-[5px]" />
                    <Skeleton className="h-1 w-full rounded-full" />
                  </div>
                ))}
              </div>
            )}

            {/* Hata */}
            {!rdpServersLoading && rdpServersError && (
              <div className="flex items-center gap-2 rounded-[5px] bg-red-500/15 px-3 py-2.5 text-[12px] text-red-700 dark:text-red-400">
                <AlertTriangle className="size-3.5 shrink-0" />
                {rdpServersError}
              </div>
            )}

            {/* Boş */}
            {!rdpServersLoading && !rdpServersError && rdpServers.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-[5px] bg-card px-4 py-8 text-center" style={{ boxShadow: "var(--card-shadow)" }}>
                <ServerOff className="size-6 text-muted-foreground" />
                <p className="text-[13px] font-medium">RDP sunucusu tanımlı değil</p>
                <p className="max-w-xs text-[12px] text-muted-foreground">
                  Kullanıcıların bağlanacağı bir Terminal Server&apos;ı sisteme RDP rolüyle eklemelisin.
                </p>
                <Button asChild size="sm" className="mt-1"><a href="/servers">Sunucu Ekle</a></Button>
              </div>
            )}

            {/* Sunucu kartları */}
            {!rdpServersLoading && !rdpServersError && rdpServers.length > 0 && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {rdpServers.map((srv) => {
                  const secili = selectedWindowsServerId === srv.id
                  const kapali = !srv.isOnline
                  const pct = yogunluk(srv)
                  const bar = pct > 80 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-emerald-500"
                  const yazi = pct > 80 ? "text-red-600 dark:text-red-400" : pct > 60 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                  return (
                    <button
                      key={srv.id}
                      type="button"
                      disabled={kapali}
                      onClick={() => onSelectWindowsServer(srv.id)}
                      aria-pressed={secili}
                      className={cn(
                        "relative rounded-[8px] border-2 p-3 text-left transition-all",
                        secili
                          ? "border-emerald-500 bg-emerald-500/10 ring-4 ring-emerald-500/15"
                          : "border-border bg-card hover:border-foreground/30",
                        kapali && "cursor-not-allowed opacity-50",
                      )}
                      style={{ boxShadow: "var(--card-shadow)" }}
                    >
                      {/* Başlık: ad + durum, sağda seçim işareti */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {srv.isOnline ? (
                              <span className="relative flex size-1.5 shrink-0">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                              </span>
                            ) : (
                              <WifiOff className="size-3 shrink-0 text-red-500" />
                            )}
                            <p className="truncate text-[13px] font-semibold">{srv.name}</p>
                          </div>
                          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{srv.dns || srv.ip}</p>
                        </div>
                        <span className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-full border",
                          secili ? "border-emerald-500 bg-emerald-500" : "border-border",
                        )}>
                          {secili && <Check className="size-2.5 text-white" strokeWidth={3} />}
                        </span>
                      </div>

                      {/* Oturum + yoğunluk */}
                      <div className="mt-3 flex items-end justify-between">
                        <p className="text-[12px] text-muted-foreground">
                          <span className="text-[15px] font-semibold tabular-nums text-foreground">{srv.userCount}</span> oturum
                        </p>
                        <span className={cn("text-[11px] font-medium tabular-nums", yazi)}>%{pct}</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
                      </div>

                      {/* Alt: IP + rozet */}
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] tabular-nums text-muted-foreground">{srv.dns ? srv.ip : srv.type}</span>
                        {kapali ? (
                          <span className="inline-flex shrink-0 rounded-[5px] bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400">Çevrimdışı</span>
                        ) : srv.id === onerilen && rdpServers.length > 1 ? (
                          <span className="inline-flex shrink-0 rounded-[5px] bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Önerilen</span>
                        ) : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

/** Gösterge kartı sağ üst durum rozeti */
function Durum({ ton, children }: { ton: "iyi" | "uyari" | "hata"; children: React.ReactNode }) {
  return (
    <span className={cn(
      "inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium",
      ton === "iyi" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
      ton === "uyari" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      ton === "hata" && "bg-red-500/15 text-red-700 dark:text-red-400",
    )}>{children}</span>
  )
}
