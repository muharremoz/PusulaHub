"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { BackupFile } from "@/lib/setup-mock-data"
import type { SqlServerItem } from "@/app/api/setup/sql-servers/route"
import type { DemoDatabaseDto } from "@/app/api/demo-databases/route"
import type { WizardServiceDto, PusulaProgramConfig } from "@/app/api/services/route"
import type { CheckPathsResponse } from "@/app/api/setup/sql-servers/[id]/check-paths/route"
import { Check, FolderOpen, RefreshCw, Loader2, WifiOff, AlertTriangle, ServerOff, FileWarning, FileCheck2, MinusCircle, Database, Server, Archive, Sparkles, ShieldCheck } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@muharremoz/pusula-ui"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@muharremoz/pusula-ui"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/combobox-select"
import { Checkbox } from "@/components/shared/form"
import { Input } from "@/components/ui/input"
import { ListeKarti, ListeThead } from "@/components/shared/liste-karti"
import { cn } from "@/lib/utils"
import { KodHucresi, KodSiralaDugmesi, useKodCakismalari } from "@/components/shared/guvenlik-kod"

interface Props {
  sqlServers: SqlServerItem[]
  sqlServersLoading?: boolean
  sqlServersError?:   string | null
  selectedSqlServerId: string | null
  sqlMode: 0 | 1
  backupFiles: BackupFile[]
  backupFolderPath: string
  demoDatabases: DemoDatabaseDto[]
  demoDatabasesLoading?: boolean
  demoDatabasesError?:   string | null
  selectedDemoDbIds: number[]
  addFirmaPrefix: boolean
  addToSirketDb: boolean
  firmaId: string
  isScanning: boolean
  onSelectSqlServer: (id: string | null) => void
  onSetSqlMode: (mode: 0 | 1) => void
  onToggleBackup: (id: number) => void
  onSetBackupFolder: (path: string) => void
  onScanBackups: () => void
  onUpdateBackupDatabaseName: (id: number, name: string) => void
  /** Hangi pusula programına bağlı olduğunu seçmek için. */
  onUpdateBackupProgramServiceId: (id: number, serviceId: number | null) => void
  /** Otomatik yedekleme kutusu (guvenlik.YedekAl) — eski yıl datasında varsayılan kapalı. */
  onToggleBackupYedek: (id: number) => void
  /** guvenlik.KOD — boş = firma numarası. Bkz. lib/guvenlik-kod.ts */
  onUpdateBackupKod: (id: number, kod: string) => void
  /** Seçili yedeklere 4515, 45151, 45152… verir */
  onSiralaBackupKodlari: () => void
  /** Sihirbazda 3. adımda seçili pusula-program servisleri (1 ise auto-assign, 2+ ise dropdown çıkar). */
  selectedPusulaServices: WizardServiceDto[]
  onToggleDemoDb: (id: number) => void
  onUpdateDemoDbDataName: (id: number, dataName: string) => void
  onSetAddFirmaPrefix: (v: boolean) => void
  onSetAddToSirketDb: (v: boolean) => void
}

/** Byte cinsinden (MB float) alınır, en uygun birimle formatlanır. */
function formatSize(mb: number): string {
  if (!mb || mb < 0) return "0 MB"
  if (mb >= 1024)   return `${(mb / 1024).toFixed(1)} GB`
  if (mb >= 1)      return `${mb.toFixed(0)} MB`
  return `${Math.round(mb * 1024)} KB`
}

/** Her demo DB için locationPath kontrol durumu. */
type PathStatus = "idle" | "checking" | "found" | "missing" | "no-path"
interface PathCheckState {
  status: PathStatus
  sizeMB: number
}

export function StepSql({
  sqlServers, sqlServersLoading, sqlServersError,
  selectedSqlServerId,
  sqlMode,
  backupFiles, backupFolderPath, demoDatabases, demoDatabasesLoading, demoDatabasesError,
  onToggleBackupYedek, onUpdateBackupKod, onSiralaBackupKodlari,
  selectedDemoDbIds, addFirmaPrefix, addToSirketDb, firmaId, isScanning,
  onSelectSqlServer, onSetSqlMode, onToggleBackup,
  onSetBackupFolder, onScanBackups, onUpdateBackupDatabaseName,
  onUpdateBackupProgramServiceId, selectedPusulaServices,
  onToggleDemoDb, onUpdateDemoDbDataName,
  onSetAddFirmaPrefix, onSetAddToSirketDb,
}: Props) {
  const showProgramColumn = selectedPusulaServices.length >= 2
  const seciliSunucu = sqlServers.find((s) => s.id === selectedSqlServerId) ?? null
  const seciliAdet = sqlMode === 0 ? backupFiles.filter((f) => f.selected).length : selectedDemoDbIds.length
  const seciliOzet = seciliSunucu
    ? `${seciliSunucu.ip}:${seciliSunucu.port} · ${seciliAdet > 0 ? `${seciliAdet} ${sqlMode === 0 ? "yedek" : "demo veritabanı"} seçili` : sqlMode === 0 ? "yedek dosyası seçin" : "demo veritabanı seçin"}`
    : ""
  const seciliYedekler = backupFiles.filter((f) => f.selected)
  const kodCakismalari = useKodCakismalari(firmaId, seciliYedekler.map((f) => f.kod ?? ""), selectedSqlServerId)
  const hasSelection =
    (sqlMode === 0 && backupFiles.some((f) => f.selected)) ||
    (sqlMode === 1 && selectedDemoDbIds.length > 0)

  /* ── Demo DB path check (Mode 1) ──────────────────────────
   * Seçili SQL sunucusunda her demo DB'nin locationPath'i var mı diye
   * PusulaAgent üzerinden Test-Path ile kontrol eder. Kullanıcı ayrıca
   * yenile butonuyla manuel tetikleyebilir.
   */
  const [pathChecks, setPathChecks] = useState<Map<number, PathCheckState>>(new Map())
  const [isCheckingPaths, setIsCheckingPaths] = useState(false)
  // Eski fetch'leri iptal etmek için son çağrı id'si
  const checkTokenRef = useRef(0)

  const runPathCheck = useCallback(() => {
    if (sqlMode !== 1) return
    if (!selectedSqlServerId) return
    if (demoDatabases.length === 0) return

    const token = ++checkTokenRef.current

    // Path'i olan demo DB'ler + yolsuz olanlar
    const withPath = demoDatabases.filter(
      (d) => typeof d.locationPath === "string" && d.locationPath.trim().length > 0,
    )
    const pathless = demoDatabases.filter(
      (d) => !d.locationPath || d.locationPath.trim().length === 0,
    )

    // İlk olarak: path'i olanlar "checking", olmayanlar "no-path"
    setPathChecks(() => {
      const m = new Map<number, PathCheckState>()
      for (const d of withPath)  m.set(d.id, { status: "checking", sizeMB: 0 })
      for (const d of pathless)  m.set(d.id, { status: "no-path",  sizeMB: 0 })
      return m
    })

    if (withPath.length === 0) return

    setIsCheckingPaths(true)

    const paths = withPath.map((d) => d.locationPath!.trim())
    const pathToIds = new Map<string, number[]>()
    for (const d of withPath) {
      const p = d.locationPath!.trim()
      const list = pathToIds.get(p) ?? []
      list.push(d.id)
      pathToIds.set(p, list)
    }

    fetch(`/api/setup/sql-servers/${encodeURIComponent(selectedSqlServerId)}/check-paths`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ paths }),
    })
      .then((r) => r.json())
      .then((data: CheckPathsResponse | { error: string }) => {
        if (token !== checkTokenRef.current) return
        if ("error" in data) {
          setPathChecks((prev) => {
            const m = new Map(prev)
            for (const d of withPath) m.set(d.id, { status: "missing", sizeMB: 0 })
            return m
          })
          return
        }
        setPathChecks((prev) => {
          const m = new Map(prev)
          for (const r of data.results) {
            const ids = pathToIds.get(r.path) ?? []
            for (const id of ids) {
              m.set(id, {
                status: r.exists ? "found" : "missing",
                sizeMB: r.sizeMB,
              })
            }
          }
          return m
        })
      })
      .catch(() => {
        if (token !== checkTokenRef.current) return
        setPathChecks((prev) => {
          const m = new Map(prev)
          for (const d of withPath) m.set(d.id, { status: "missing", sizeMB: 0 })
          return m
        })
      })
      .finally(() => {
        if (token === checkTokenRef.current) setIsCheckingPaths(false)
      })
  }, [sqlMode, selectedSqlServerId, demoDatabases])

  useEffect(() => { runPathCheck() }, [runPathCheck])


  return (
    <div className="space-y-4">

      {/* Üst şerit — seçim özeti + şirket DB anahtarı */}
      <div className="flex items-center gap-3 rounded-[8px] bg-[var(--section-bg)] px-3 py-2.5">
        <span className="bg-primary/10 text-primary ring-primary/20 flex size-8 shrink-0 items-center justify-center rounded-[5px] ring-1">
          <Database className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">
            {seciliSunucu ? `${seciliSunucu.name} seçildi` : "SQL sunucusu seçin"}
            {!seciliSunucu && <span className="ml-1.5 inline-flex rounded-[5px] bg-muted px-1.5 py-px align-middle text-[10px] font-medium text-muted-foreground">isteğe bağlı</span>}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {seciliSunucu
              ? seciliOzet
              : "Veritabanı kurulmayacaksa sunucu seçmeden devam edebilirsiniz."}
          </p>
        </div>
        {seciliSunucu && (
          <label
            className={cn("flex shrink-0 cursor-pointer items-center gap-2 transition-opacity", !hasSelection && "cursor-not-allowed opacity-50")}
            title={hasSelection ? "sirket.dbo.guvenlik tablosuna program kaydı oluşturulur" : "Önce bir veritabanı seçmelisiniz"}
          >
            <span className="text-right">
              <span className="block text-[12px] font-medium leading-tight">Şirket veritabanına ekle</span>
              <span className="block text-[10px] leading-tight text-muted-foreground">sirket.dbo.guvenlik kaydı</span>
            </span>
            <Switch checked={addToSirketDb} disabled={!hasSelection} onCheckedChange={onSetAddToSirketDb} />
          </label>
        )}
      </div>

      {/* SQL sunucusu — kartlar; seçili karta tekrar tıklayınca seçim kalkar */}
      <div>
        <p className="flex items-center gap-1.5 pb-2 text-[12px] font-medium">
          <Server className="size-3.5 text-muted-foreground" />
          SQL Sunucusu
        </p>

        {/* Yükleniyor */}
        {sqlServersLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2.5 rounded-[8px] border-2 p-3">
                <Skeleton className="h-3.5 w-28 rounded-[5px]" />
                <Skeleton className="h-3 w-36 rounded-[5px]" />
                <Skeleton className="h-3 w-24 rounded-[5px]" />
              </div>
            ))}
          </div>
        )}

        {/* Hata */}
        {!sqlServersLoading && sqlServersError && (
          <div className="flex items-center gap-2 rounded-[5px] bg-red-500/15 px-3 py-2.5 text-[12px] text-red-700 dark:text-red-400">
            <AlertTriangle className="size-3.5 shrink-0" />
            {sqlServersError}
          </div>
        )}

        {/* Boş */}
        {!sqlServersLoading && !sqlServersError && sqlServers.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed px-4 py-8 text-center">
            <ServerOff className="size-6 text-muted-foreground" />
            <p className="text-[13px] font-medium">SQL sunucusu tanımlı değil</p>
            <p className="max-w-xs text-[12px] text-muted-foreground">
              Veritabanlarının kurulacağı bir sunucuyu sisteme SQL rolüyle eklemelisin.
            </p>
            <Button asChild size="sm" className="mt-1"><a href="/servers">Sunucu Ekle</a></Button>
          </div>
        )}

        {/* Kartlar */}
        {!sqlServersLoading && !sqlServersError && sqlServers.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sqlServers.map((srv) => {
              const sec = selectedSqlServerId === srv.id
              const kapali = !srv.isOnline
              return (
                <button
                  key={srv.id}
                  type="button"
                  onClick={() => onSelectSqlServer(sec ? null : srv.id)}
                  disabled={kapali}
                  aria-pressed={sec}
                  className={cn(
                    "rounded-[8px] border-2 p-3 text-left transition-all",
                    sec ? "border-emerald-500 bg-emerald-500/10 ring-4 ring-emerald-500/15" : "border-border bg-card hover:border-foreground/30",
                    kapali && "cursor-not-allowed opacity-50",
                  )}
                  style={{ boxShadow: "var(--card-shadow)" }}
                >
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
                      <p className="mt-0.5 truncate text-[12px] tabular-nums text-muted-foreground">{srv.ip}:{srv.port}</p>
                    </div>
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", sec ? "border-emerald-500 bg-emerald-500" : "border-border")}>
                      {sec && <Check className="size-2.5 text-white" strokeWidth={3} />}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-[12px] text-muted-foreground">
                    <span><span className="font-medium tabular-nums text-foreground">{srv.dbCount}</span> veritabanı</span>
                    <span><span className="font-medium tabular-nums text-foreground">{srv.totalSizeGB}</span> GB</span>
                  </div>
                  {kapali && (
                    <div className="mt-2.5">
                      <span className="inline-flex rounded-[5px] bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400">Çevrimdışı</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Sunucu seçildiyse — veri kaynağı + içerik */}
      {selectedSqlServerId !== null && (
        <div className="space-y-4">
          <Separator />

          {/* Veri kaynağı — kart biçiminde iki seçenek */}
          <div>
            <p className="pb-2 text-[12px] font-medium">Veri kaynağı</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                { mode: 0 as const, ikon: Archive,  baslik: "Yedekten yükle",  alt: "Müşterinin .bak / mdf dosyalarını klasörden tara" },
                { mode: 1 as const, ikon: Sparkles, baslik: "Demo veritabanı", alt: "Hazır demo datalarla boş kurulum" },
              ]).map(({ mode, ikon: Ikon, baslik, alt }) => {
                const sec = sqlMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onSetSqlMode(mode)}
                    aria-pressed={sec}
                    className={cn(
                      "flex items-center gap-3 rounded-[8px] border-2 p-3 text-left transition-all",
                      sec ? "border-emerald-500 bg-emerald-500/10 ring-4 ring-emerald-500/15" : "border-border bg-card hover:border-foreground/30",
                    )}
                    style={{ boxShadow: "var(--card-shadow)" }}
                  >
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[5px]",
                      mode === 0 ? "bg-sky-500/15 text-sky-700 dark:text-sky-400" : "bg-violet-500/15 text-violet-700 dark:text-violet-400")}>
                      <Ikon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{baslik}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{alt}</span>
                    </span>
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", sec ? "border-emerald-500 bg-emerald-500" : "border-border")}>
                      {sec && <Check className="size-2.5 text-white" strokeWidth={3} />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Mod 0 — Yedek dosyaları */}
          {sqlMode === 0 && (
            <div className="space-y-3">
              {/* Klasör yolu + tara */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <FolderOpen className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={backupFolderPath}
                    onChange={(e) => onSetBackupFolder(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !isScanning) onScanBackups() }}
                    placeholder="D:\SQLData\<firma>\aktarim"
                    className="pl-8"
                  />
                </div>
                <Button variant="outline" size="sm" className="h-8" onClick={onScanBackups} disabled={isScanning || !backupFolderPath.trim()}>
                  {isScanning ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Tara
                </Button>
              </div>

              {/* Taranıyor */}
              {isScanning && backupFiles.length === 0 && (
                <div className="space-y-2 rounded-[8px] bg-[var(--section-bg)] p-2">
                  {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-[5px]" />)}
                </div>
              )}

              {/* Henüz taranmadı / klasör boş */}
              {!isScanning && backupFiles.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-1.5 rounded-[8px] border border-dashed px-4 py-6 text-center">
                  <Archive className="size-5 text-muted-foreground" />
                  <p className="text-[13px] font-medium">Yedek dosyası listelenmedi</p>
                  <p className="max-w-sm text-[12px] text-muted-foreground">
                    SQL sunucusundaki klasörü yazıp <span className="font-medium text-foreground">Tara</span>&apos;ya basın; .bak ve .mdf dosyaları burada listelenir.
                  </p>
                </div>
              )}

              {/* Yedek dosyaları */}
              {backupFiles.length > 0 && (
                <ListeKarti
                  baslik="Yedek dosyaları"
                  ikon={<Archive className="size-3.5" />}
                  toplam={backupFiles.length}
                  filtreli={backupFiles.filter((f) => f.selected).length}
                  aksiyon={
                    <div className="flex items-center gap-3">
                      {addToSirketDb && seciliYedekler.length >= 2 && <KodSiralaDugmesi onClick={onSiralaBackupKodlari} />}
                      <label className="flex cursor-pointer select-none items-center gap-1.5 text-[12px] text-muted-foreground">
                        <Checkbox checked={addFirmaPrefix} onCheckedChange={(v) => onSetAddFirmaPrefix(!!v)} />
                        Firma öneki ekle <span className="font-medium text-foreground">({firmaId}_)</span>
                      </label>
                    </div>
                  }
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-[14px] font-medium leading-[20px]">
                      <ListeThead>
                        <th className="w-10 px-4 py-1.5 text-left font-medium" />
                        <th className="px-4 py-1.5 text-left font-medium">Dosya</th>
                        <th className="px-4 py-1.5 text-left font-medium">Hedef veritabanı</th>
                        {addToSirketDb && <th className="px-4 py-1.5 text-left font-medium" title="sirket.dbo.guvenlik · KOD — boşsa firma numarası">Kod</th>}
                        {showProgramColumn && <th className="px-4 py-1.5 text-left font-medium">Program</th>}
                        <th className="px-4 py-1.5 text-left font-medium" title="Otomatik yedeklemeye dahil et (sirket.dbo.guvenlik · YedekAl)">Yedek</th>
                        <th className="px-4 py-1.5 text-right font-medium">Boyut</th>
                        <th className="px-4 py-1.5 text-right font-medium">Tarih</th>
                      </ListeThead>
                      <tbody>
                        {backupFiles.map((f) => {
                          const showPrefix = addFirmaPrefix && !!firmaId
                          const programMissing = showProgramColumn && f.selected && f.programServiceId == null
                          return (
                            <tr
                              key={f.id}
                              onClick={() => onToggleBackup(f.id)}
                              className={cn("cursor-pointer transition-colors hover:bg-muted/20", !f.selected && "text-muted-foreground")}
                            >
                              <td className="px-4 py-1.5" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={f.selected} onCheckedChange={() => onToggleBackup(f.id)} />
                              </td>
                              <td className="max-w-[260px] px-4 py-1.5">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span
                                    className={cn(
                                      "inline-flex shrink-0 rounded-[5px] px-2 py-0.5 text-[11px] font-medium",
                                      f.kind === "attach"
                                        ? "bg-violet-500/15 text-violet-700 dark:text-violet-400"
                                        : "bg-sky-500/15 text-sky-700 dark:text-sky-400",
                                    )}
                                    title={f.kind === "attach"
                                      ? (f.ldfFileName ? `${f.mdfFileName} + ${f.ldfFileName}` : `${f.mdfFileName} (log yeniden üretilecek)`)
                                      : "RESTORE ile kurulur"}
                                  >
                                    {f.kind === "attach" ? "Attach" : "Yedek"}
                                  </span>
                                  <span className="truncate" title={f.fileName}>{f.fileName}</span>
                                </span>
                              </td>
                              {/* Düzenlenebilir DB adı — önek ayrı, input yalnız adı değiştirir */}
                              <td className="px-4 py-1.5" onClick={(e) => e.stopPropagation()}>
                                <div className="flex h-7 min-w-[220px] items-center rounded-[5px] border bg-background px-2 transition-colors focus-within:border-foreground/40">
                                  {showPrefix && <span className="shrink-0 text-[13px] text-muted-foreground">{firmaId}_</span>}
                                  <input
                                    type="text"
                                    value={f.databaseName}
                                    onChange={(e) => onUpdateBackupDatabaseName(f.id, e.target.value)}
                                    className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none"
                                  />
                                </div>
                              </td>
                              {/* guvenlik.KOD — yalnız seçili satırda düzenlenir */}
                              {addToSirketDb && (
                                <td className="px-4 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  {f.selected
                                    ? <KodHucresi value={f.kod ?? ""} onChange={(v) => onUpdateBackupKod(f.id, v)} firmaId={firmaId} cakismalar={kodCakismalari} />
                                    : <span className="text-muted-foreground text-[12px]">—</span>}
                                </td>
                              )}
                              {/* Program seçimi — yalnız 2+ Pusula programı seçildiyse */}
                              {showProgramColumn && (
                                <td className="px-4 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <Select
                                    value={f.programServiceId != null ? String(f.programServiceId) : undefined}
                                    onValueChange={(v) => onUpdateBackupProgramServiceId(f.id, v ? Number(v) : null)}
                                  >
                                    <SelectTrigger
                                      className={cn(
                                        "h-7 w-[170px] rounded-[5px] px-2 text-[13px]",
                                        programMissing && "border-amber-500/60 text-amber-700 dark:text-amber-400",
                                      )}
                                    >
                                      <SelectValue placeholder="Program seç" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {selectedPusulaServices.map((s) => {
                                        const code = (s.config as PusulaProgramConfig | null)?.programCode ?? null
                                        return (
                                          <SelectItem key={s.id} value={String(s.id)} className="text-[13px]">
                                            {s.name}{code ? ` (${code})` : ""}
                                          </SelectItem>
                                        )
                                      })}
                                    </SelectContent>
                                  </Select>
                                </td>
                              )}
                              {/*  Otomatik yedekleme — guvenlik.YedekAl. Eski yıl datası
                                   varsayılan kapalı gelir (yedek boyutunu şişirmesin),
                                   yılsız ve güncel yıl açık. */}
                              {/* Yedek görevi — firma detayı "Yeni Veritabanı" penceresiyle aynı düğme */}
                              <td className="px-4 py-1.5" onClick={(e) => e.stopPropagation()}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex">
                                      <button
                                        type="button"
                                        aria-pressed={f.yedekAl !== false}
                                        disabled={!addToSirketDb}
                                        onClick={() => onToggleBackupYedek(f.id)}
                                        className={cn(
                                          "flex h-7 shrink-0 items-center gap-1.5 rounded-[5px] border px-2 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                                          f.yedekAl !== false && addToSirketDb
                                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                            : "text-muted-foreground line-through hover:text-foreground",
                                        )}
                                      >
                                        <ShieldCheck className="size-3.5" /> Yedek
                                      </button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {!addToSirketDb
                                      ? "Şirket veritabanına ekle kapalı — yedek kaydı yazılmaz"
                                      : f.yedekAl !== false
                                        ? "Yedek görevine eklenir — kapatmak için tıklayın"
                                        : "Yedeği alınmayacak · güvenlik kaydı YedekAl = false"}
                                  </TooltipContent>
                                </Tooltip>
                              </td>
                              <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-muted-foreground">{formatSize(f.fileSizeMB)}</td>
                              <td className="whitespace-nowrap px-4 py-1.5 text-right text-[12px] tabular-nums text-muted-foreground">{f.date || "—"}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </ListeKarti>
              )}
            </div>
          )}

          {/* Mod 1 — Demo veritabanları */}
          {sqlMode === 1 && demoDatabasesLoading && (
            <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="size-4 rounded-[5px]" />
                  <Skeleton className="h-3 w-32 rounded-[5px]" />
                  <Skeleton className="h-3 w-40 rounded-[5px] ml-auto" />
                  <Skeleton className="h-3 w-16 rounded-[5px]" />
                </div>
              ))}
            </div>
          )}

          {sqlMode === 1 && !demoDatabasesLoading && demoDatabasesError && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-500/25 bg-red-500/15 text-[11px] text-red-600 dark:text-red-400">
              <AlertTriangle className="size-3.5 shrink-0" />
              {demoDatabasesError}
            </div>
          )}

          {sqlMode === 1 && !demoDatabasesLoading && !demoDatabasesError && demoDatabases.length === 0 && (
            <div className="rounded-[5px] border border-border/50 px-4 py-8 flex flex-col items-center justify-center gap-2 text-center">
              <ServerOff className="size-6 text-muted-foreground" />
              <p className="text-[12px] font-medium">Demo veritabanı tanımlı değil</p>
              <p className="text-[10px] text-muted-foreground max-w-xs">
                Firma kurulumlarında kullanmak için önce katalog sayfasından demo veritabanı ekleyin.
              </p>
              <a
                href="/demo-databases"
                className="mt-1 text-[11px] font-medium px-3 py-1.5 rounded-[5px] bg-primary text-primary-foreground hover:bg-foreground/90 transition-colors"
              >
                Demo DB Ekle
              </a>
            </div>
          )}

          {sqlMode === 1 && !demoDatabasesLoading && !demoDatabasesError && demoDatabases.length > 0 && (
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/20 border-b border-border">
                <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
                  {demoDatabases.length} demo veritabanı
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={runPathCheck}
                    disabled={isCheckingPaths || !selectedSqlServerId}
                    title="Dosyaları yeniden kontrol et"
                    className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isCheckingPaths
                      ? <Loader2 className="size-3 animate-spin" />
                      : <RefreshCw className="size-3" />}
                    Yenile
                  </button>
                  <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
                    <Checkbox
                      checked={addFirmaPrefix}
                      onCheckedChange={(v) => onSetAddFirmaPrefix(!!v)}
                    />
                    Firma prefix ekle ({firmaId}_)
                  </label>
                </div>
              </div>
              <div className="divide-y divide-border/40">
                {demoDatabases.map((db) => {
                  const isSelected = selectedDemoDbIds.includes(db.id)
                  const showPrefix = addFirmaPrefix && !!firmaId
                  const check = pathChecks.get(db.id) ?? { status: "idle" as PathStatus, sizeMB: 0 }
                  const disabled = check.status === "missing" || check.status === "checking"
                  return (
                    <div
                      key={db.id}
                      onClick={() => { if (!disabled) onToggleDemoDb(db.id) }}
                      className={cn(
                        "w-full grid grid-cols-[20px_1fr_240px_120px_80px] gap-3 items-center px-3 py-2.5 text-left transition-colors",
                        disabled
                          ? "cursor-not-allowed opacity-60"
                          : isSelected ? "bg-foreground/[0.03] cursor-pointer" : "hover:bg-muted/20 cursor-pointer"
                      )}
                    >
                      <span className={cn(
                        "size-4 rounded-[5px] border-2 flex items-center justify-center shrink-0",
                        isSelected ? "bg-foreground border-foreground" : "border-border"
                      )}>
                        {isSelected && <Check className="size-2.5 text-background" strokeWidth={3} />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate">{db.name}</p>
                        {db.locationPath && (
                          <p className="text-[9px] text-muted-foreground/70 font-mono truncate" title={db.locationPath}>
                            {db.locationPath}
                          </p>
                        )}
                      </div>
                      {/* Düzenlenebilir DB adı — sadece dosya bulunduğunda veya
                          şablon gibi yol gerektirmeyen durumda göster. Dosya yoksa
                          veya kontrol sürüyorsa kullanıcıya sessizce — göster. */}
                      {(check.status === "found" || check.status === "no-path") ? (
                        <div
                          className="flex items-center gap-1 min-w-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[11px] text-muted-foreground shrink-0">→</span>
                          <div className="flex-1 flex items-center rounded-[5px] border border-border/60 bg-background px-1.5 py-1 focus-within:border-foreground/50 hover:border-border min-w-0">
                            {showPrefix && (
                              <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                                {firmaId}_
                              </span>
                            )}
                            <input
                              type="text"
                              value={db.dataName}
                              onChange={(e) => onUpdateDemoDbDataName(db.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 text-[11px] font-mono bg-transparent outline-none min-w-0"
                            />
                          </div>
                        </div>
                      ) : check.status === "checking" ? (
                        <span className="text-[10px] text-muted-foreground/60 italic">kontrol ediliyor…</span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/30 text-center">—</span>
                      )}
                      {/* Path durum rozeti */}
                      <div className="flex items-center justify-end">
                        {check.status === "checking" && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-[5px] border bg-muted text-muted-foreground border-border">
                            <Loader2 className="size-2.5 animate-spin" />
                            Kontrol ediliyor
                          </span>
                        )}
                        {check.status === "found" && (
                          <span
                            className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-[5px] border bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25"
                            title={`${formatSize(check.sizeMB)} — ${db.locationPath}`}
                          >
                            <FileCheck2 className="size-2.5" />
                            {formatSize(check.sizeMB)}
                          </span>
                        )}
                        {check.status === "missing" && (
                          <span
                            className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-[5px] border bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25"
                            title="Dosya seçili SQL sunucusunda bulunamadı"
                          >
                            <FileWarning className="size-2.5" />
                            Dosya yok
                          </span>
                        )}
                        {check.status === "no-path" && (
                          <span
                            className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-[5px] border bg-muted/50 text-muted-foreground border-border"
                            title="Bu demo DB için kaynak yol tanımlı değil"
                          >
                            <MinusCircle className="size-2.5" />
                            Yol yok
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground text-right">{db.locationType}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}


        </div>
      )}
    </div>
  )
}
