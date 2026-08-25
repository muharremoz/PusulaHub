"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { SheetTitle, SheetContent, SheetHeader, Sheet } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {  } from "@muharremoz/pusula-ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/combobox-select"
import { Skeleton } from "@/components/ui/skeleton"
import { Database, HardDriveDownload, Loader2, Check, XCircle, FolderOpen, RefreshCw, AlertTriangle } from "lucide-react"
import { Checkbox } from "@/components/shared/form"
import { cn } from "@/lib/utils"
import type { OldDataScanResponse } from "@/app/api/companies/[firkod]/sql/old-data/scan/route"

type Source = "depo" | "sql"

interface ProgramOpt { id: number; name: string; programCode: string }
interface FileRow {
  fileName:     string
  databaseName: string
  fileSizeMB:   number
  date:         string
  selected:     boolean
  programCode:  string
}
interface Step { stepId: string; label: string; status: "running" | "done" | "error"; error?: string }

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${Math.round(mb)} MB`
}

export function OldDataRestoreSheet({
  open, onOpenChange, firkod, firma, onComplete,
}: {
  open:         boolean
  onOpenChange: (o: boolean) => void
  firkod:       string
  firma:        string
  onComplete?:  () => void
}) {
  const [phase, setPhase]       = useState<"scan" | "select" | "running" | "done">("scan")
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError]     = useState<string | null>(null)
  const [folder, setFolder]     = useState("")
  // Kaynak: Depo mu SQL sunucusu mu, hangi klasör. Varsayılan eski davranış
  // (Depo · D:\Eski Datalar\{firkod}) — normal/şablon DB için değiştirilebilir.
  const [source, setSource]     = useState<Source>("depo")
  const [pathInput, setPathInput] = useState("")
  const [scannedServer, setScannedServer] = useState("")
  const [files, setFiles]       = useState<FileRow[]>([])
  const [programs, setPrograms] = useState<ProgramOpt[]>([])
  const [steps, setSteps]       = useState<Step[]>([])
  const [runError, setRunError] = useState<string | null>(null)
  const startedRef = useRef(false)

  const doScan = useCallback(async (opts?: { source?: Source; path?: string }) => {
    const src  = opts?.source ?? source
    const path = opts?.path ?? pathInput
    setScanLoading(true); setScanError(null); setPhase("scan")
    try {
      const [scanRes, svcRes] = await Promise.all([
        fetch(`/api/companies/${firkod}/sql/old-data/scan`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ source: src, path: path.trim() }),
        }),
        fetch(`/api/services?onlyActive=true`).then((r) => r.ok ? r.json() : []).catch(() => []),
      ])
      const progs: ProgramOpt[] = (Array.isArray(svcRes) ? svcRes : [])
        .filter((s: { type?: string }) => s.type === "pusula-program")
        .map((s: { id: number; name: string; config?: { programCode?: string | null } }) => ({
          id: s.id, name: s.name, programCode: s.config?.programCode ?? "",
        }))
        .filter((p: ProgramOpt) => p.programCode)
      setPrograms(progs)

      if (!scanRes.ok) {
        const j = await scanRes.json().catch(() => ({}))
        setScanError(j.error ?? `Tarama başarısız (HTTP ${scanRes.status})`)
        return
      }
      const data = await scanRes.json() as OldDataScanResponse
      setFolder(data.folder)
      setScannedServer(data.server ?? "")
      // Kullanıcı klasörü boş bıraktıysa sunucunun döndürdüğü varsayılanı göster
      if (!path.trim()) setPathInput(data.folder)
      setFiles(data.files.map((f) => ({
        fileName: f.fileName, databaseName: f.databaseName, fileSizeMB: f.fileSizeMB, date: f.date,
        selected: false, programCode: progs.length === 1 ? progs[0].programCode : "",
      })))
      setPhase("select")
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Tarama hatası")
    } finally {
      setScanLoading(false)
    }
  }, [firkod, source, pathInput])

  // Açılınca varsayılan kaynakla (Depo · Eski Datalar) tara, kapanınca sıfırla.
  // doScan bağımlılığa alınmıyor: source/pathInput değiştikçe kimliği değişir ve
  // her tuş vuruşunda yeniden tarama tetiklerdi.
  useEffect(() => {
    if (open) {
      startedRef.current = false
      setSteps([]); setRunError(null); setPhase("scan")
      setSource("depo"); setPathInput("")
      doScan({ source: "depo", path: "" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const selectedFiles = files.filter((f) => f.selected)
  const canRun =
    selectedFiles.length > 0 &&
    selectedFiles.every((f) => f.databaseName.trim() && (programs.length === 0 || f.programCode))

  const updateFile = (fileName: string, patch: Partial<FileRow>) =>
    setFiles((prev) => prev.map((f) => f.fileName === fileName ? { ...f, ...patch } : f))

  const upsertStep = (s: Step) =>
    setSteps((prev) => {
      const i = prev.findIndex((x) => x.stepId === s.stepId)
      if (i === -1) return [...prev, s]
      const copy = prev.slice(); copy[i] = { ...copy[i], ...s }; return copy
    })

  async function runRestore() {
    if (startedRef.current) return
    startedRef.current = true
    setPhase("running"); setSteps([]); setRunError(null)
    try {
      const resp = await fetch(`/api/companies/${firkod}/sql/old-data/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          path: pathInput.trim(),
          files: selectedFiles.map((f) => ({ fileName: f.fileName, databaseName: f.databaseName.trim(), programCode: f.programCode })),
        }),
      })
      if (!resp.ok || !resp.body) {
        const txt = await resp.text().catch(() => "")
        let msg = `HTTP ${resp.status}`
        try { msg = JSON.parse(txt).error ?? msg } catch { /* */ }
        setRunError(msg); setPhase("done"); return
      }
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, idx); buffer = buffer.slice(idx + 2)
          if (!raw.trim()) continue
          let ev = "message", dataStr = ""
          for (const line of raw.split("\n")) {
            if (line.startsWith("event: ")) ev = line.slice(7).trim()
            else if (line.startsWith("data: ")) dataStr += line.slice(6)
          }
          try {
            const d = JSON.parse(dataStr)
            if (ev === "step" && d.stepId) upsertStep({ stepId: d.stepId, label: d.label, status: d.status, error: d.error })
            else if (ev === "done") { setPhase("done"); onComplete?.() }
            else if (ev === "error") { setRunError(d.message ?? "Hata"); setPhase("done") }
          } catch { /* parse */ }
        }
      }
      if (phase !== "done") setPhase("done")
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Bağlantı hatası"); setPhase("done")
    }
  }

  const hasError = steps.some((s) => s.status === "error") || !!runError
  const allDone = phase === "done" && !hasError

  return (
    <Sheet open={open} onOpenChange={(o) => { if (phase !== "running") onOpenChange(o) }}>
      <SheetContent side="right" className="!w-[520px] !max-w-[520px]">
        <SheetHeader>
          <SheetTitle className="text-sm flex items-center gap-2">
            <HardDriveDownload className="h-4 w-4" /> Yeni Veritabanı Ekle
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground">{firma} — yedekten geri yükle</p>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-4 py-4 space-y-3">
            {/* Kaynak: hangi sunucu + hangi klasör */}
            {phase !== "running" && phase !== "done" && (
              <div className="rounded-[5px] border border-border/50 overflow-hidden">
                <div className="px-3 py-2 bg-muted/20 border-b border-border">
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Veri Konumu</span>
                </div>
                <div className="px-3 py-2.5 space-y-2">
                  <div className="space-y-0.5">
                    <Label className="text-[9px] text-muted-foreground">Sunucu</Label>
                    <Select
                      value={source}
                      onValueChange={(v) => {
                        const s = v as Source
                        setSource(s)
                        // Sunucu değişti — varsayılan klasör de değişsin
                        const next = s === "depo" ? `D:\\Eski Datalar\\${firkod}` : ""
                        setPathInput(next)
                        doScan({ source: s, path: next })
                      }}
                    >
                      <SelectTrigger className="h-7 rounded-[5px] text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="depo" className="text-[13px]">Depo sunucusu</SelectItem>
                        <SelectItem value="sql" className="text-[13px]">SQL sunucusu</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[9px] text-muted-foreground">Klasör</Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={pathInput}
                        onChange={(e) => setPathInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") doScan() }}
                        placeholder={source === "depo" ? `D:\\Eski Datalar\\${firkod}` : "D:\\Yedekler"}
                        className="h-7 rounded-[5px] text-[11px] font-mono"
                      />
                      <Button
                        size="sm" variant="outline" onClick={() => doScan()} disabled={scanLoading}
                        className="h-7 rounded-[5px] text-[11px] gap-1 shrink-0"
                      >
                        <RefreshCw className={cn("h-3 w-3", scanLoading && "animate-spin")} /> Tara
                      </Button>
                    </div>
                  </div>
                  {folder && (
                    <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                      <FolderOpen className="h-3 w-3 shrink-0" />
                      <span className="font-mono truncate">
                        {scannedServer ? `${scannedServer} · ` : ""}{folder}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Tarama */}
            {phase === "scan" && (
              scanLoading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-[5px]" />)}</div>
              ) : scanError ? (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-[5px] border border-red-500/25 bg-red-500/15 text-[11px] text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{scanError}</span>
                </div>
              ) : null
            )}

            {/* Dosya seçimi */}
            {phase === "select" && (
              files.length === 0 ? (
                <div className="rounded-[5px] border border-border/50 px-4 py-8 text-center">
                  <Database className="h-6 w-6 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-[11px] text-muted-foreground">Bu klasörde .bak dosyası bulunamadı.</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono">{folder}</p>
                </div>
              ) : (
                <div className="rounded-[5px] border border-border/50 overflow-hidden">
                  <div className="px-3 py-2 bg-muted/20 border-b border-border">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Yedek Dosyaları ({files.length})</span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {files.map((f) => (
                      <div key={f.fileName} className={cn("px-3 py-2.5 space-y-2", f.selected && "bg-muted/20")}>
                        <div className="flex items-center gap-2">
                          <Checkbox checked={f.selected} onCheckedChange={(c) => updateFile(f.fileName, { selected: !!c })} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-mono truncate">{f.fileName}</p>
                            <p className="text-[9px] text-muted-foreground">{formatSize(f.fileSizeMB)} · {f.date}</p>
                          </div>
                        </div>
                        {f.selected && (
                          <div className="pl-6 grid grid-cols-[1fr_140px] gap-2">
                            <div className="space-y-0.5">
                              <Label className="text-[9px] text-muted-foreground">Hedef DB adı</Label>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-mono text-muted-foreground shrink-0">{firkod}_</span>
                                <Input
                                  value={f.databaseName}
                                  onChange={(e) => updateFile(f.fileName, { databaseName: e.target.value })}
                                  className="h-7 rounded-[5px] text-[11px] font-mono"
                                />
                              </div>
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[9px] text-muted-foreground">Program</Label>
                              <Select value={f.programCode || undefined} onValueChange={(v) => updateFile(f.fileName, { programCode: v })}>
                                <SelectTrigger className={cn("h-7 rounded-[5px] text-[11px]", !f.programCode && programs.length > 0 && "border-amber-500/60")}>
                                  <SelectValue placeholder="Seç…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {programs.map((p) => (
                                    <SelectItem key={p.id} value={p.programCode} className="text-[13px]">{p.name} ({p.programCode})</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Çalışıyor / sonuç — adım listesi */}
            {(phase === "running" || phase === "done") && (
              <div className="rounded-[5px] border border-border/50 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border">
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase flex-1">Restore Adımları</span>
                  {phase === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />}
                  {allDone && <span className="size-4 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="size-2.5 text-emerald-700 dark:text-emerald-400" strokeWidth={3} /></span>}
                  {hasError && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                </div>
                <div className="divide-y divide-border/40 max-h-[50vh] overflow-y-auto">
                  {steps.map((s) => (
                    <div key={s.stepId} className={cn("flex items-start gap-2.5 px-3 py-2", s.status === "running" && "bg-muted/20")}>
                      <span className="shrink-0 mt-0.5">
                        {s.status === "done" && <span className="size-4 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="size-2.5 text-emerald-700 dark:text-emerald-400" strokeWidth={3} /></span>}
                        {s.status === "running" && <Loader2 className="size-4 animate-spin text-foreground" />}
                        {s.status === "error" && <XCircle className="size-4 text-red-500" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-[11px] font-mono", s.status === "done" && "text-muted-foreground line-through", s.status === "running" && "font-semibold", s.status === "error" && "text-red-500")}>{s.label}</p>
                        {s.error && <p className="text-[10px] text-red-500 font-mono mt-0.5 break-all whitespace-pre-wrap">{s.error}</p>}
                      </div>
                    </div>
                  ))}
                  {steps.length === 0 && phase === "running" && (
                    <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">Başlatılıyor…</div>
                  )}
                </div>
                {runError && (
                  <div className="px-3 py-2 border-t border-red-500/25 bg-red-500/15 text-[11px] text-red-700 dark:text-red-400 font-mono break-all">{runError}</div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/50 flex items-center justify-between gap-2">
          {phase === "select" && (
            <>
              <span className="text-[11px] text-muted-foreground">{selectedFiles.length} dosya seçildi</span>
              <Button size="sm" disabled={!canRun} onClick={runRestore} className="rounded-[5px] h-8 text-[13px] gap-1.5">
                <HardDriveDownload className="h-3.5 w-3.5" /> Geri Yükle
              </Button>
            </>
          )}
          {phase === "running" && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 ml-auto"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Restore sürüyor…</span>
          )}
          {phase === "done" && (
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} className="rounded-[5px] h-8 text-[13px] ml-auto">Kapat</Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
