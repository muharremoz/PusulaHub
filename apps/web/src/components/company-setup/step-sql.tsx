"use client"

import { SqlServer, BackupFile, DemoDatabase } from "@/lib/setup-mock-data"
import { Check, FolderOpen, RefreshCw, Loader2, WifiOff } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

interface Props {
  sqlServers: SqlServer[]
  selectedSqlServerId: number | null
  sqlMode: 0 | 1
  backupFiles: BackupFile[]
  backupFolderPath: string
  demoDatabases: DemoDatabase[]
  selectedDemoDbIds: number[]
  addFirmaPrefix: boolean
  addToSirketDb: boolean
  firmaId: string
  isScanning: boolean
  onSelectSqlServer: (id: number | null) => void
  onSetSqlMode: (mode: 0 | 1) => void
  onToggleBackup: (id: number) => void
  onSetBackupFolder: (path: string) => void
  onScanBackups: () => void
  onToggleDemoDb: (id: number) => void
  onSetAddFirmaPrefix: (v: boolean) => void
  onSetAddToSirketDb: (v: boolean) => void
}

export function StepSql({
  sqlServers, selectedSqlServerId, sqlMode,
  backupFiles, backupFolderPath, demoDatabases,
  selectedDemoDbIds, addFirmaPrefix, addToSirketDb, firmaId, isScanning,
  onSelectSqlServer, onSetSqlMode, onToggleBackup,
  onSetBackupFolder, onScanBackups, onToggleDemoDb, onSetAddFirmaPrefix, onSetAddToSirketDb,
}: Props) {
  const hasSelection =
    (sqlMode === 0 && backupFiles.some((f) => f.selected)) ||
    (sqlMode === 1 && selectedDemoDbIds.length > 0)
  return (
    <div className="space-y-4">

      {/* Bilgi notu */}
      <p className="text-[11px] text-muted-foreground">
        Bu adım isteğe bağlıdır. SQL sunucusu seçmeden devam edebilirsiniz.
      </p>

      {/* SQL Sunucu listesi */}
      <div>
        <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase mb-2">SQL Sunucusu</p>
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
                      const dbName = addFirmaPrefix && firmaId ? `${firmaId}_${f.databaseName}` : f.databaseName
                      return (
                        <button
                          key={f.id}
                          onClick={() => onToggleBackup(f.id)}
                          className={cn(
                            "w-full grid grid-cols-[20px_1fr_160px_60px_70px] gap-3 items-center px-3 py-2.5 text-left transition-colors",
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
                          <span className="text-[11px] text-muted-foreground font-mono truncate">→ {dbName}</span>
                          <span className="text-[11px] text-muted-foreground tabular-nums text-right">
                            {(f.fileSizeMB / 1024).toFixed(1)} GB
                          </span>
                          <span className="text-[10px] text-muted-foreground text-right">{f.date}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mod 1 — Demo veritabanları */}
          {sqlMode === 1 && (
            <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40">
              {demoDatabases.map((db) => {
                const isSelected = selectedDemoDbIds.includes(db.id)
                const dbName = firmaId ? `${firmaId}_${db.dataName}` : db.dataName
                return (
                  <button
                    key={db.id}
                    onClick={() => onToggleDemoDb(db.id)}
                    className={cn(
                      "w-full grid grid-cols-[20px_1fr_160px_60px_80px] gap-3 items-center px-3 py-2.5 text-left transition-colors",
                      isSelected ? "bg-foreground/[0.03]" : "hover:bg-muted/20"
                    )}
                  >
                    <span className={cn(
                      "size-4 rounded-[3px] border-2 flex items-center justify-center shrink-0",
                      isSelected ? "bg-foreground border-foreground" : "border-border"
                    )}>
                      {isSelected && <Check className="size-2.5 text-background" strokeWidth={3} />}
                    </span>
                    <span className="text-[11px] font-medium">{db.name}</span>
                    <span className="text-[11px] text-muted-foreground font-mono truncate">→ {dbName}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums text-right">{db.sizeMB} MB</span>
                    <span className="text-[10px] text-muted-foreground text-right">{db.locationType}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Şirket DB toggle — seçim yapıldıysa göster */}
          {hasSelection && (
            <button
              onClick={() => onSetAddToSirketDb(!addToSirketDb)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[5px] border border-border/50 hover:bg-muted/20 transition-colors text-left"
            >
              {/* Toggle switch */}
              <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
                style={{ backgroundColor: addToSirketDb ? "#18181b" : "#d4d4d8" }}>
                <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: addToSirketDb ? "translateX(18px)" : "translateX(2px)" }} />
              </span>
              <div>
                <p className="text-[11px] font-medium">Şirket veritabanına ekle</p>
                <p className="text-[10px] text-muted-foreground">sirket.dbo.guvenlik tablosuna program kaydı oluşturulur</p>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
