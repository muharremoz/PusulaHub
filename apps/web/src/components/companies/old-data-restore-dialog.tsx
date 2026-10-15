"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/combobox-select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@muharremoz/pusula-ui"
import { HardDriveDownload, Loader2, Check, XCircle, FolderOpen, RefreshCw, AlertTriangle, ShieldCheck } from "lucide-react"
import { Checkbox } from "@/components/shared/form"
import { cn } from "@/lib/utils"
import type { OldDataScanResponse } from "@/app/api/companies/[firkod]/sql/old-data/scan/route"

type Source = "depo" | "sql"

interface ProgramOpt { id: number; name: string; programCode: string }
interface FileRow {
  fileName:     string
  databaseName: string
  fileSizeMB:   number
  /** ".bak" → RESTORE, ".mdf" → ATTACH */
  kind:         "bak" | "mdf"
  /** kind="mdf" ve klasörde eşi varsa log dosyasının adı */
  ldfFileName?: string
  date:         string
  selected:     boolean
  programCode:  string
  /** Seçilen programın hizmet kimliği — aynı kodu paylaşan programlar (Perakende/Pusula X = 909) ayrışsın diye seçim bununla yapılır */
  programId?:   number
  /** Hedef ada {firkod}_ öneki eklensin mi (varsayılan evet) */
  firmaOneki:   boolean
  /**
   * Yedek görevine eklensin mi — veritabanı başına. Varsayılan AÇIK: yedeği unutmak,
   * gereksiz yedek almaktan pahalı. Eski yıl datasında kapatılır; kapalıysa hem
   * `sirket.guvenlik.YedekAl` 0 yazılır hem SQL Backup Master görevine eklenmez.
   */
  yedekAl:      boolean
}
interface Step { stepId: string; label: string; status: "running" | "done" | "error"; error?: string }

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${Math.round(mb)} MB`
}

/**
 * "Yeni Veritabanı Ekle" — Depo/SQL sunucusundaki .bak/.mdf dosyalarını firmaya
 * geri yükler. Yeni Hizmet penceresiyle aynı dil: üste sabit Dialog, ikon rozetli
 * başlık şeridi, tek satırlık veri konumu, satır içi hedef adı + program.
 */
export function OldDataRestoreDialog({
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
      // Kullanıcı klasörü boş bıraktıysa sunucunun döndürdüğü varsayılanı göster
      if (!path.trim()) setPathInput(data.folder)
      setFiles(data.files.map((f) => ({
        fileName: f.fileName, databaseName: f.databaseName, fileSizeMB: f.fileSizeMB, date: f.date,
        kind: f.kind ?? "bak", ldfFileName: f.ldfFileName,
        selected: false, programCode: progs.length === 1 ? progs[0].programCode : "", programId: progs.length === 1 ? progs[0].id : undefined, firmaOneki: true, yedekAl: true,
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
          files: selectedFiles.map((f) => ({
            fileName: f.fileName, databaseName: f.databaseName.trim(), programCode: f.programCode,
            kind: f.kind, ldfFileName: f.ldfFileName, firmaOneki: f.firmaOneki, yedekAl: f.yedekAl,
          })),
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

  const calisiyor = phase === "running" || phase === "done"

  return (
    <Dialog open={open} onOpenChange={(o) => { if (phase !== "running") onOpenChange(o) }}>
      {/* Üste sabit (ortalı değil): tarama sonucu yükseklik değişince pencere zıplamasın */}
      <DialogContent className="top-[8vh] translate-y-0 grid-cols-1 gap-0 p-0 sm:max-w-[760px]">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b bg-[var(--section-bg)] px-5 py-4">
          <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
            <HardDriveDownload className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-[15px] font-semibold">
              Yeni Veritabanı <span className="text-muted-foreground font-medium">— {firkod}</span>
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              {phase === "running" ? "Geri yükleniyor…" : phase === "done" ? (hasError ? "Geri yükleme hatayla bitti." : "Geri yükleme tamamlandı.") : `${firma} — yedekten geri yükle`}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Radix ScrollArea yerine düz kaydırma: iç kabı (display:table) uzun dosya adında genişleyip pencereyi taşırıyordu */}
        <div className="max-h-[68vh] min-w-0 overflow-y-auto">
          <div className="space-y-3 px-5 py-4">
            {/* Veri konumu — sunucu + klasör + tara, tek satır */}
            {!calisiyor && (
              <div>
                <div className="text-muted-foreground mb-1.5 text-[10px] font-medium tracking-wider uppercase">Veri konumu</div>
                <div className="flex items-center gap-2">
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
                    <SelectTrigger className="h-8 w-[170px] shrink-0 rounded-[5px] text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="depo" className="text-[13px]">Depo sunucusu</SelectItem>
                      <SelectItem value="sql" className="text-[13px]">SQL sunucusu</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") doScan() }}
                    placeholder={source === "depo" ? `D:\\Eski Datalar\\${firkod}` : "D:\\Yedekler"}
                    aria-label="Klasör"
                    className="h-8 min-w-0 flex-1 rounded-[5px] text-[12px]"
                  />
                  <Button size="sm" variant="outline" onClick={() => doScan()} disabled={scanLoading} className="h-8 shrink-0 gap-1.5 rounded-[5px] text-[12px]">
                    <RefreshCw className={cn("size-3.5", scanLoading && "animate-spin")} /> Tara
                  </Button>
                </div>
              </div>
            )}

            {/* Tarama */}
            {phase === "scan" && (
              scanLoading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[52px] w-full rounded-[5px]" />)}</div>
              ) : scanError ? (
                <div className="flex items-start gap-2 rounded-[5px] border border-red-500/25 bg-red-500/15 px-3 py-2.5 text-[12px] text-red-700 dark:text-red-400">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{scanError}</span>
                </div>
              ) : null
            )}

            {/* Yedek dosyaları — satıra tıkla seç; seçilince hedef ad + program satırda */}
            {phase === "select" && (
              files.length === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center gap-1.5 rounded-[5px] border border-dashed py-8 text-center">
                  <FolderOpen className="size-5" />
                  <p className="text-[12px]">Bu klasörde .bak veya .mdf dosyası bulunamadı.</p>
                  <p className="text-[11px]">Başka bir klasör yazıp Tara'ya basın.</p>
                </div>
              ) : (
                <div>
                  <div className="text-muted-foreground mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium tracking-wider uppercase">Yedek dosyaları · {files.length}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const hepsi = files.every((f) => f.selected)
                        setFiles((p) => p.map((f) => ({ ...f, selected: !hepsi })))
                      }}
                      className="hover:text-foreground text-[11px] transition-colors"
                    >
                      {files.every((f) => f.selected) ? "Seçimi kaldır" : "Tümünü seç"}
                    </button>
                  </div>
                  <div className="bg-card divide-y rounded-[5px] border">
                    {files.map((f) => {
                      const programEksik = f.selected && !f.programCode && programs.length > 0
                      return (
                        <div
                          key={f.fileName}
                          className={cn("flex items-center gap-3 px-3 py-2.5 transition-colors", f.selected ? "bg-primary/[0.03]" : "hover:bg-muted/20")}
                        >
                          <Checkbox checked={f.selected} onCheckedChange={(c) => updateFile(f.fileName, { selected: !!c })} />
                          <button
                            type="button"
                            onClick={() => updateFile(f.fileName, { selected: !f.selected })}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium leading-[18px]">{f.fileName}</span>
                              <span className="text-muted-foreground block truncate text-[11px] leading-[16px]">
                                {formatSize(f.fileSizeMB)} · {f.date}
                                {f.kind === "mdf" && (f.ldfFileName ? ` · + ${f.ldfFileName}` : " · log yok, yeniden üretilecek")}
                              </span>
                            </span>
                          </button>

                          {/* Hedef ad + program — yalnız seçiliyken */}
                          {f.selected && (
                            <div className="animate-in fade-in slide-in-from-right-1 flex shrink-0 items-center gap-2 duration-200">
                              <div className="flex h-8 w-[230px] items-center overflow-hidden rounded-[5px] border focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
                                {/* Firma öneki — tıkla aç/kapat. Öneksiz: tetiklerin/programın sabit adla
                                    aradığı transfer dataları (URN*, *_TRANSFER) için. */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => updateFile(f.fileName, { firmaOneki: !f.firmaOneki })}
                                      className={cn(
                                        "h-full shrink-0 border-r px-2 text-[12px] font-medium tabular-nums transition-colors",
                                        f.firmaOneki ? "bg-muted text-foreground" : "text-muted-foreground line-through",
                                      )}
                                    >
                                      {firkod}_
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {f.firmaOneki ? "Firma öneki eklenir — kaldırmak için tıklayın" : "Öneksiz: aynı adda DB varsa atlanır"}
                                  </TooltipContent>
                                </Tooltip>
                                <input
                                  value={f.databaseName}
                                  onChange={(e) => updateFile(f.fileName, { databaseName: e.target.value })}
                                  aria-label="Hedef veritabanı adı"
                                  className={cn("h-full min-w-0 flex-1 bg-transparent px-2 text-[12px] outline-none", !f.databaseName.trim() && "placeholder:text-rose-500")}
                                  placeholder="Veritabanı adı"
                                />
                              </div>
                              <Select value={f.programId ? String(f.programId) : undefined} onValueChange={(v) => { const p = programs.find((x) => String(x.id) === v); if (p) updateFile(f.fileName, { programId: p.id, programCode: p.programCode }) }}>
                                <SelectTrigger className={cn("h-8 w-[150px] rounded-[5px] text-[12px]", programEksik && "border-rose-500")}>
                                  <SelectValue placeholder="Program…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {programs.map((p) => (
                                    <SelectItem key={p.id} value={String(p.id)} className="text-[13px]">{p.name} ({p.programCode})</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {/* Yedek görevi — veritabanı başına (eski yıl datası kapatılır) */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    aria-pressed={f.yedekAl}
                                    onClick={() => updateFile(f.fileName, { yedekAl: !f.yedekAl })}
                                    className={cn(
                                      "flex h-8 shrink-0 items-center gap-1.5 rounded-[5px] border px-2 text-[12px] font-medium transition-colors",
                                      f.yedekAl
                                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                        : "text-muted-foreground hover:text-foreground line-through",
                                    )}
                                  >
                                    <ShieldCheck className="size-3.5" /> Yedek
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {f.yedekAl ? "Yedek görevine eklenir — kapatmak için tıklayın" : "Yedeği alınmayacak · güvenlik kaydı YedekAl = false"}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            )}

            {/* Çalışıyor / sonuç — adım listesi */}
            {calisiyor && (
              <div>
                <div className="text-muted-foreground mb-1.5 flex items-center gap-2">
                  <span className="flex-1 text-[10px] font-medium tracking-wider uppercase">Geri yükleme adımları</span>
                  {phase === "running" && <Loader2 className="text-foreground size-3.5 animate-spin" />}
                  {allDone && <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500/15"><Check className="size-2.5 text-emerald-700 dark:text-emerald-400" strokeWidth={3} /></span>}
                  {hasError && <XCircle className="size-3.5 text-red-500" />}
                </div>
                <div className="bg-card max-h-[50vh] divide-y overflow-y-auto rounded-[5px] border">
                  {steps.map((s) => (
                    <div key={s.stepId} className={cn("flex items-start gap-2.5 px-3 py-2", s.status === "running" && "bg-muted/20")}>
                      <span className="mt-0.5 shrink-0">
                        {s.status === "done" && <span className="flex size-4 items-center justify-center rounded-full bg-emerald-500/15"><Check className="size-2.5 text-emerald-700 dark:text-emerald-400" strokeWidth={3} /></span>}
                        {s.status === "running" && <Loader2 className="text-foreground size-4 animate-spin" />}
                        {s.status === "error" && <XCircle className="size-4 text-red-500" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-[12px]", s.status === "done" && "text-muted-foreground", s.status === "running" && "font-medium", s.status === "error" && "text-red-600 dark:text-red-400")}>{s.label}</p>
                        {s.error && <p className="mt-0.5 break-all whitespace-pre-wrap text-[11px] text-red-600 dark:text-red-400">{s.error}</p>}
                      </div>
                    </div>
                  ))}
                  {steps.length === 0 && phase === "running" && (
                    <div className="text-muted-foreground px-3 py-4 text-center text-[12px]">Başlatılıyor…</div>
                  )}
                </div>
                {runError && (
                  <div className="mt-2 break-all rounded-[5px] border border-red-500/25 bg-red-500/15 px-3 py-2 text-[12px] text-red-700 dark:text-red-400">{runError}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Alt şerit */}
        <div className="flex items-center gap-2 border-t px-5 py-3">
          {phase === "select" || phase === "scan" ? (
            <>
              <div className="mr-auto flex min-w-0 items-center gap-3">
                <span className="text-muted-foreground text-[12px] tabular-nums">
                  {selectedFiles.length > 0 ? `${selectedFiles.length} dosya seçildi` : "Dosya seçilmedi"}
                </span>
                {selectedFiles.some((x) => !x.yedekAl) && (
                  <span className="truncate text-[11px] text-amber-600 dark:text-amber-400">
                    {selectedFiles.filter((x) => !x.yedekAl).length} veritabanının yedeği alınmayacak
                  </span>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} className="h-8 rounded-[5px] text-[12px]">Vazgeç</Button>
              <Button size="sm" disabled={!canRun || phase !== "select"} onClick={runRestore} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
                <HardDriveDownload className="size-3.5" /> Geri Yükle
              </Button>
            </>
          ) : phase === "running" ? (
            <span className="text-muted-foreground ml-auto flex items-center gap-1.5 text-[12px]"><Loader2 className="size-3.5 animate-spin" /> Geri yükleme sürüyor…</span>
          ) : (
            <Button size="sm" onClick={() => onOpenChange(false)} className="ml-auto h-8 rounded-[5px] text-[12px]">Kapat</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
