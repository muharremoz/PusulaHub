"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { BackupFile } from "@/lib/setup-mock-data"
import type { SqlServerItem } from "@/app/api/setup/sql-servers/route"
import type { DemoDatabaseDto } from "@/app/api/demo-databases/route"
import type { CheckPathsResponse } from "@/app/api/setup/sql-servers/[id]/check-paths/route"
import { Check, FolderOpen, RefreshCw, Loader2, WifiOff, AlertTriangle, ServerOff, FileWarning, FileCheck2, MinusCircle, PlayCircle, X } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

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
  selectedDemoDbIds, addFirmaPrefix, addToSirketDb, firmaId, isScanning,
  onSelectSqlServer, onSetSqlMode, onToggleBackup,
  onSetBackupFolder, onScanBackups, onUpdateBackupDatabaseName,
  onToggleDemoDb, onUpdateDemoDbDataName,
  onSetAddFirmaPrefix, onSetAddToSirketDb,
}: Props) {
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

  /* ── Restore Test ──────────────────────────────────────────
   * Sihirbazdan bağımsız olarak seçili .bak dosyalarını / demo DB'leri
   * gerçek RESTORE ile dener. Başarısızsa sebebini gösterir (yol yok,
   * yetki hatası, zaten var, vs.). Test sonrası DB otomatik DROP edilir.
   */
  interface TestResult {
    bakPath:      string
    targetDbName: string
    ok:           boolean
    error?:       string
    durationMs:   number
    dropped?:     boolean
  }
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<TestResult[] | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [testDropAfter, setTestDropAfter] = useState(false)

  async function handleTestRestore() {
    if (!selectedSqlServerId) return
    const prefix = addFirmaPrefix && firmaId ? `${firmaId}_` : ""

    const tasks: Array<{ bakPath: string; targetDbName: string }> = []

    if (sqlMode === 0) {
      const folder = backupFolderPath.trim().replace(/[\\/]+$/, "")
      for (const f of backupFiles) {
        if (!f.selected) continue
        const fileName = (f.fileName ?? "").trim()
        const dbName   = (f.databaseName ?? "").trim()
        if (!fileName || !dbName) continue
        tasks.push({
          bakPath:      folder ? `${folder}\\${fileName}` : fileName,
          targetDbName: `${prefix}${dbName}`,
        })
      }
    } else {
      for (const db of demoDatabases) {
        if (!selectedDemoDbIds.includes(db.id)) continue
        const bakPath = (db.locationPath ?? "").trim()
        if (!bakPath) continue
        const name = (db.dataName ?? db.name).trim()
        if (!name) continue
        tasks.push({
          bakPath,
          targetDbName: `${prefix}${name}`,
        })
      }
    }

    if (tasks.length === 0) {
      setTestError("Test edilecek görev yok — önce dosya/DB seçin")
      setTestResults(null)
      return
    }

    setTesting(true)
    setTestError(null)
    setTestResults(null)
    try {
      const r = await fetch(
        `/api/setup/sql-servers/${encodeURIComponent(selectedSqlServerId)}/test-restore`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ tasks, dropAfter: testDropAfter }),
        },
      )
      const data = await r.json()
      if (!r.ok) {
        setTestError(data?.error || `Hata (HTTP ${r.status})`)
      } else {
        setTestResults(data.results as TestResult[])
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "İstek başarısız")
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">

      {/* Üst şerit — bilgi notu + şirket DB toggle (sabit, sağ üst) */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Bu adım isteğe bağlıdır. SQL sunucusu seçmeden devam edebilirsiniz.
        </p>
        <div
          className={cn(
            "flex items-center gap-2 shrink-0 transition-opacity",
            !hasSelection && "opacity-50",
          )}
          title={
            hasSelection
              ? "sirket.dbo.guvenlik tablosuna program kaydı oluşturulur"
              : "Önce bir veritabanı seçmelisiniz"
          }
        >
          <div className="text-right">
            <p className="text-[11px] font-medium leading-tight">Şirket veritabanına ekle</p>
            <p className="text-[9px] text-muted-foreground leading-tight">sirket.dbo.guvenlik kaydı</p>
          </div>
          <Switch
            checked={addToSirketDb}
            disabled={!hasSelection}
            onCheckedChange={onSetAddToSirketDb}
          />
        </div>
      </div>

      {/* SQL Sunucu listesi */}
      <div>
        <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase mb-2">SQL Sunucusu</p>

        {/* Yükleniyor */}
        {sqlServersLoading && (
          <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3">
                <Skeleton className="h-3 w-32 rounded-[4px]" />
                <Skeleton className="h-3 w-24 rounded-[4px]" />
                <Skeleton className="h-3 w-20 rounded-[4px]" />
                <Skeleton className="h-3 w-16 rounded-[4px] ml-auto" />
              </div>
            ))}
          </div>
        )}

        {/* Hata */}
        {!sqlServersLoading && sqlServersError && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-200 bg-red-50 text-[11px] text-red-600">
            <AlertTriangle className="size-3.5 shrink-0" />
            {sqlServersError}
          </div>
        )}

        {/* Boş */}
        {!sqlServersLoading && !sqlServersError && sqlServers.length === 0 && (
          <div className="rounded-[5px] border border-border/50 px-4 py-8 flex flex-col items-center justify-center gap-2 text-center">
            <ServerOff className="size-6 text-muted-foreground" />
            <p className="text-[12px] font-medium">SQL sunucusu tanımlı değil</p>
            <p className="text-[10px] text-muted-foreground max-w-xs">
              Veritabanlarının kurulacağı bir sunucuyu sisteme SQL rolüyle eklemelisin.
            </p>
            <a
              href="/servers"
              className="mt-1 text-[11px] font-medium px-3 py-1.5 rounded-[5px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
            >
              Sunucu Ekle
            </a>
          </div>
        )}

        {/* Liste */}
        {!sqlServersLoading && !sqlServersError && sqlServers.length > 0 && (
        <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40">
          {sqlServers.map((srv) => {
            const isSelected = selectedSqlServerId === srv.id
            return (
              <button
                key={srv.id}
                onClick={() => onSelectSqlServer(isSelected ? null : srv.id)}
                disabled={!srv.isOnline}
                className={cn(
                  "w-full grid grid-cols-[1fr_90px_80px_80px_20px] gap-3 items-center px-3 py-2.5 text-left transition-colors",
                  isSelected ? "bg-foreground/[0.04]" : "hover:bg-muted/20",
                  !srv.isOnline && "opacity-40 cursor-not-allowed"
                )}
              >
                {/* Ad + IP:Port */}
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
                  <p className="text-[10px] text-muted-foreground font-mono">{srv.ip}:{srv.port}</p>
                </div>
                {/* Auth */}
                <span className="text-[11px] text-muted-foreground">{srv.authType} Auth</span>
                {/* DB sayısı */}
                <span className="text-[11px] text-muted-foreground tabular-nums">{srv.dbCount} veritabanı</span>
                {/* Boyut */}
                <span className="text-[11px] text-muted-foreground tabular-nums">{srv.totalSizeGB} GB</span>
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
        )}
      </div>

      {/* Sunucu seçildiyse — mod + içerik */}
      {selectedSqlServerId !== null && (
        <div className="space-y-4">
          <Separator />

          {/* Mod seçimi */}
          <div>
            <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase mb-2">Veri Kaynağı</p>
            <div className="flex gap-1 rounded-[5px] border border-border/50 p-1 bg-muted/20 w-fit">
              {[
                { mode: 0 as const, label: "Yedekten Yükle" },
                { mode: 1 as const, label: "Demo Veritabanı" },
              ].map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => onSetSqlMode(mode)}
                  className={cn(
                    "px-3 py-1.5 rounded-[4px] text-[11px] font-medium transition-colors",
                    sqlMode === mode
                      ? "bg-background text-foreground shadow-sm border border-border/50"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Mod 0 — Yedek dosyaları */}
          {sqlMode === 0 && (
            <div className="space-y-3">
              {/* Klasör yolu */}
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-[5px] border border-border bg-background focus-within:border-foreground/40 transition-colors">
                  <FolderOpen className="size-3.5 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    value={backupFolderPath}
                    onChange={(e) => onSetBackupFolder(e.target.value)}
                    placeholder="D:\Demo Data"
                    className="flex-1 text-[11px] bg-transparent outline-none"
                  />
                </div>
                <button
                  onClick={onScanBackups}
                  disabled={isScanning}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-[5px] border border-border text-[11px] font-medium hover:bg-muted/40 transition-colors disabled:opacity-50"
                >
                  {isScanning
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : <RefreshCw className="size-3.5" />}
                  Tara
                </button>
              </div>

              {/* Yedek dosyaları */}
              {backupFiles.length > 0 && (
                <div className="rounded-[5px] border border-border/50 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                      {backupFiles.length} yedek dosyası
                    </span>
                    <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
                      <Checkbox
                        checked={addFirmaPrefix}
                        onCheckedChange={(v) => onSetAddFirmaPrefix(!!v)}
                      />
                      Firma prefix ekle ({firmaId}_)
                    </label>
                  </div>
                  <div className="divide-y divide-border/40">
                    {backupFiles.map((f) => {
                      const showPrefix = addFirmaPrefix && !!firmaId
                      return (
                        <div
                          key={f.id}
                          onClick={() => onToggleBackup(f.id)}
                          className={cn(
                            "w-full grid grid-cols-[20px_1fr_240px_70px_70px] gap-3 items-center px-3 py-2.5 text-left transition-colors cursor-pointer",
                            f.selected ? "bg-foreground/[0.03]" : "hover:bg-muted/20"
                          )}
                        >
                          <span className={cn(
                            "size-4 rounded-[3px] border-2 flex items-center justify-center shrink-0",
                            f.selected ? "bg-foreground border-foreground" : "border-border"
                          )}>
                            {f.selected && <Check className="size-2.5 text-background" strokeWidth={3} />}
                          </span>
                          <span className="text-[11px] font-mono truncate">{f.fileName}</span>
                          {/* Düzenlenebilir DB adı — prefix ayrı lozenj, input sadece name'i değiştirir */}
                          <div
                            className="flex items-center gap-1 min-w-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[11px] text-muted-foreground shrink-0">→</span>
                            <div className="flex-1 flex items-center rounded-[4px] border border-border/60 bg-background px-1.5 py-1 focus-within:border-foreground/50 hover:border-border min-w-0">
                              {showPrefix && (
                                <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                                  {firmaId}_
                                </span>
                              )}
                              <input
                                type="text"
                                value={f.databaseName}
                                onChange={(e) => onUpdateBackupDatabaseName(f.id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 text-[11px] font-mono bg-transparent outline-none min-w-0"
                              />
                            </div>
                          </div>
                          <span className="text-[11px] text-muted-foreground tabular-nums text-right">
                            {formatSize(f.fileSizeMB)}
                          </span>
                          <span className="text-[10px] text-muted-foreground text-right">{f.date}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mod 1 — Demo veritabanları */}
          {sqlMode === 1 && demoDatabasesLoading && (
            <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="size-4 rounded-[3px]" />
                  <Skeleton className="h-3 w-32 rounded-[4px]" />
                  <Skeleton className="h-3 w-40 rounded-[4px] ml-auto" />
                  <Skeleton className="h-3 w-16 rounded-[4px]" />
                </div>
              ))}
            </div>
          )}

          {sqlMode === 1 && !demoDatabasesLoading && demoDatabasesError && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-200 bg-red-50 text-[11px] text-red-600">
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
                className="mt-1 text-[11px] font-medium px-3 py-1.5 rounded-[5px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
              >
                Demo DB Ekle
              </a>
            </div>
          )}

          {sqlMode === 1 && !demoDatabasesLoading && !demoDatabasesError && demoDatabases.length > 0 && (
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/30 border-b border-border/40">
                <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
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
                        "size-4 rounded-[3px] border-2 flex items-center justify-center shrink-0",
                        isSelected ? "bg-foreground border-foreground" : "border-border"
                      )}>
                        {isSelected && <Check className="size-2.5 text-background" strokeWidth={3} />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium truncate">{db.name}</p>
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
                          <div className="flex-1 flex items-center rounded-[4px] border border-border/60 bg-background px-1.5 py-1 focus-within:border-foreground/50 hover:border-border min-w-0">
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
                          <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border bg-muted text-muted-foreground border-border">
                            <Loader2 className="size-2.5 animate-spin" />
                            Kontrol ediliyor
                          </span>
                        )}
                        {check.status === "found" && (
                          <span
                            className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border bg-emerald-50 text-emerald-700 border-emerald-200"
                            title={`${formatSize(check.sizeMB)} — ${db.locationPath}`}
                          >
                            <FileCheck2 className="size-2.5" />
                            {formatSize(check.sizeMB)}
                          </span>
                        )}
                        {check.status === "missing" && (
                          <span
                            className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border bg-red-50 text-red-700 border-red-200"
                            title="Dosya seçili SQL sunucusunda bulunamadı"
                          >
                            <FileWarning className="size-2.5" />
                            Dosya yok
                          </span>
                        )}
                        {check.status === "no-path" && (
                          <span
                            className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border bg-muted/50 text-muted-foreground border-border"
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

          {/* Restore Test — sihirbazdan bağımsız deneme */}
          {hasSelection && (
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border/40">
                <PlayCircle className="size-3.5 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase flex-1">
                  Restore Testi
                </span>
                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
                  <Checkbox
                    checked={testDropAfter}
                    onCheckedChange={(v) => setTestDropAfter(!!v)}
                  />
                  Test sonrası DROP
                </label>
                <button
                  type="button"
                  onClick={handleTestRestore}
                  disabled={testing}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border border-border bg-background text-[10px] font-medium hover:bg-muted/40 transition-colors disabled:opacity-50"
                >
                  {testing
                    ? <Loader2 className="size-3 animate-spin" />
                    : <PlayCircle className="size-3" />}
                  {testing ? "Deneniyor..." : "Restore'u Test Et"}
                </button>
              </div>
              <div className="px-3 py-2.5 space-y-2">
                {!testing && !testResults && !testError && (
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Seçili veritabanlarını gerçek RESTORE ile dener, başarısızsa nedenini gösterir.
                    <strong className="font-medium"> DROP</strong> seçeneği açıksa test sonrası silinir; kapalıysa DB sunucuda kalır (veriyi inceleyebilirsin).
                  </p>
                )}
                {testError && (
                  <div className="flex items-start gap-2 px-2.5 py-2 rounded-[4px] bg-red-50 border border-red-200 text-[10px] text-red-700">
                    <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                    <span className="flex-1">{testError}</span>
                    <button type="button" onClick={() => setTestError(null)} className="text-red-700/60 hover:text-red-700">
                      <X className="size-3" />
                    </button>
                  </div>
                )}
                {testResults && (
                  <div className="space-y-1.5">
                    {testResults.map((r, i) => (
                      <div
                        key={i}
                        className={cn(
                          "px-2.5 py-2 rounded-[4px] border text-[10px]",
                          r.ok
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-red-50 border-red-200",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {r.ok
                            ? <FileCheck2 className="size-3 text-emerald-600 shrink-0 mt-0.5" />
                            : <FileWarning className="size-3 text-red-600 shrink-0 mt-0.5" />}
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={cn(
                                "font-mono font-medium",
                                r.ok ? "text-emerald-800" : "text-red-800",
                              )}>
                                [{r.targetDbName}]
                              </span>
                              <span className="text-muted-foreground tabular-nums">
                                {(r.durationMs / 1000).toFixed(1)}s
                              </span>
                              {r.ok && r.dropped && (
                                <span className="text-[9px] text-emerald-700/70">
                                  · test sonrası DROP edildi
                                </span>
                              )}
                            </div>
                            <p className="text-[9px] font-mono text-muted-foreground truncate" title={r.bakPath}>
                              {r.bakPath}
                            </p>
                            {!r.ok && r.error && (
                              <p className="text-[10px] text-red-700 leading-relaxed whitespace-pre-wrap break-words">
                                {r.error}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center gap-3 pt-1 text-[9px] text-muted-foreground">
                      <span>
                        {testResults.filter((r) => r.ok).length}/{testResults.length} başarılı
                      </span>
                      <button
                        type="button"
                        onClick={() => setTestResults(null)}
                        className="ml-auto hover:text-foreground transition-colors"
                      >
                        Temizle
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
