"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Loader2, XCircle, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ServiceType, ServiceConfig } from "@/app/api/services/route"

/**
 * AD provision runner — `/api/setup/run` SSE endpoint'ini tüketir, adımları
 * canlı olarak listeler. Hem son sihirbaz adımında hem de "Test Et" butonu
 * ile kullanıcı listesi adımında kullanılır.
 */

export type ProvisionStatus = "pending" | "running" | "done" | "error"

export interface ProvisionStep {
  stepId: string
  label:  string
  status: ProvisionStatus
  error?: string
}

export interface AdProvisionUser {
  username:    string
  displayName: string
  email:       string
  phone:       string
  password:    string
}

export interface AdProvisionService {
  id:     number
  name:   string
  type:   ServiceType
  config: ServiceConfig | null
}

export interface AdProvisionBackupFile {
  fileName:     string
  databaseName: string
}

export interface AdProvisionPayload {
  /** AD sunucusu — OU/grup/kullanıcı adımları bu agent'a gider */
  serverId:         string
  /** Windows/RDP sunucusu — pusula-program hizmet kopya adımları bu agent'a gider. */
  windowsServerId?: string
  /** IIS sunucusu — iis-site hizmet adımları (klasör/copy/port/config/site) bu agent'a gider. */
  iisServerId?:     string
  firmaId:          string
  firmaName:        string
  users:            AdProvisionUser[]
  /** Opsiyonel: hizmet kopyalama adımları. Boş ise sadece AD akışı çalışır. */
  services?:        AdProvisionService[]

  /* ── 4. adım: SQL (opsiyonel) ────────────────────────────── */
  sqlServerId?:       string
  sqlMode?:           0 | 1
  backupFolderPath?:  string
  backupFiles?:       AdProvisionBackupFile[]
  selectedDemoDbIds?: number[]
  addFirmaPrefix?:    boolean
  addToSirketDb?:     boolean
}

interface Props {
  payload:     AdProvisionPayload
  /** Mount edilince otomatik başlasın mı (default: true) */
  autoStart?:  boolean
  /** Başarıyla tamamlandığında çağrılır */
  onComplete?: () => void
  /** Fatal hata veya adım hatasında çağrılır */
  onError?:    (msg: string) => void
}

export function AdProvisionRunner({ payload, autoStart = true, onComplete, onError }: Props) {
  const [steps, setSteps]           = useState<ProvisionStep[]>([])
  const [completed, setCompleted]   = useState(false)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs]   = useState(0)
  const started = useRef(false)

  const services     = payload.services ?? []
  const serviceCount = services.length
  const pusulaCount  = services.filter((s) => s.type === "pusula-program").length
  const iisCount     = services.filter((s) => s.type === "iis-site").length
  // pusula-program: dir + copy + (param) ≈ 2.5
  // iis-site: dir + copy + port + config + site ≈ 5
  // SQL: mode 0 → backupFiles * (restore + guvenlik?)
  //      mode 1 → selectedDemoDbIds * (restore + guvenlik?)
  const sqlDbCount =
    payload.sqlServerId
      ? payload.sqlMode === 1
        ? (payload.selectedDemoDbIds?.length ?? 0)
        : (payload.backupFiles?.length ?? 0)
      : 0
  const sqlStepCount = sqlDbCount * (payload.addToSirketDb ? 2 : 1)
  // 2 Depo adımı (klasör + NTFS) — Depo sunucusu yoksa zaten gelmez, ama
  // progress bar için her zaman sayıyoruz (en kötü %2 sapma — kabul edilebilir)
  const depoStepCount = 2
  // Masaüstü adımları: MUSTERILER subdir (1) + exe kısayolları (pusulaCount) + Resimler kısayolu (1)
  // Sadece pusula servisi varsa oluşturulur
  const desktopStepCount = pusulaCount > 0 ? pusulaCount + 2 : 0
  const totalEstimated =
    3 +
    payload.users.length * 2 +
    depoStepCount +
    (serviceCount > 0 ? 1 + Math.round(pusulaCount * 2.5) + iisCount * 5 + 1 : 0) +
    desktopStepCount +
    sqlStepCount
  const doneCount = steps.filter((s) => s.status === "done").length
  const errorStep = steps.find((s) => s.status === "error")
  const progress  = Math.min(100, Math.round((doneCount / totalEstimated) * 100))
  const isRunning = !completed && !fatalError && !errorStep

  /* Süre sayacı */
  useEffect(() => {
    if (completed || fatalError || errorStep) return
    const t = setInterval(() => setElapsedMs((p) => p + 100), 100)
    return () => clearInterval(t)
  }, [completed, fatalError, errorStep])

  /* SSE consumption */
  useEffect(() => {
    if (!autoStart || started.current) return
    started.current = true

    const upsertStep = (next: ProvisionStep) => {
      setSteps((prev) => {
        const idx = prev.findIndex((s) => s.stepId === next.stepId)
        if (idx === -1) return [...prev, next]
        const copy = prev.slice()
        copy[idx] = { ...copy[idx], ...next }
        return copy
      })
    }

    const handleEvent = (
      event: string,
      data: { stepId?: string; label?: string; status?: ProvisionStatus; error?: string; message?: string },
    ) => {
      if (event === "step" && data.stepId && data.label && data.status) {
        upsertStep({
          stepId: data.stepId,
          label:  data.label,
          status: data.status,
          error:  data.error,
        })
        if (data.status === "error" && data.error) {
          onError?.(data.error)
        }
      } else if (event === "done") {
        setCompleted(true)
        onComplete?.()
      } else if (event === "error") {
        const msg = data.message ?? "Bilinmeyen hata"
        setFatalError(msg)
        onError?.(msg)
      }
    }

    const run = async () => {
      try {
        const resp = await fetch("/api/setup/run", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        })

        if (!resp.ok) {
          const txt = await resp.text()
          let msg = `HTTP ${resp.status}`
          try { const j = JSON.parse(txt); msg = j.error ?? msg } catch { }
          setFatalError(msg)
          onError?.(msg)
          return
        }
        if (!resp.body) {
          const msg = "Yanıt akışı alınamadı"
          setFatalError(msg)
          onError?.(msg)
          return
        }

        const reader  = resp.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let sepIdx: number
          while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, sepIdx)
            buffer = buffer.slice(sepIdx + 2)
            if (!raw.trim()) continue

            let evName  = "message"
            let dataStr = ""
            for (const line of raw.split("\n")) {
              if (line.startsWith("event: "))      evName  = line.slice(7).trim()
              else if (line.startsWith("data: ")) dataStr += line.slice(6)
            }
            try {
              handleEvent(evName, JSON.parse(dataStr))
            } catch (err) {
              console.error("[AdProvisionRunner] SSE parse hatası:", err, raw)
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setFatalError(msg)
        onError?.(msg)
      }
    }

    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  const formatElapsed = () => {
    const s = Math.floor(elapsedMs / 1000)
    const ms = String(elapsedMs % 1000).padStart(3, "0").slice(0, 2)
    return `${s}.${ms}s`
  }

  return (
    <div className="space-y-3">

      {/* Progress bar */}
      <div className="rounded-[5px] border border-border/50 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
          <div className="flex items-center gap-2">
            {completed ? (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                <span className="size-4 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Check className="size-2.5 text-emerald-700" strokeWidth={3} />
                </span>
                Tamamlandı
              </span>
            ) : errorStep || fatalError ? (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-red-600">
                <XCircle className="size-3.5" />
                Hata
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Çalışıyor…
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">{doneCount} / {totalEstimated} adım</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">{formatElapsed()}</span>
        </div>
        <div className="h-1 w-full bg-muted">
          <div
            className={cn(
              "h-full transition-all duration-300",
              completed ? "bg-emerald-500" : (errorStep || fatalError) ? "bg-red-500" : "bg-foreground"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Fatal error */}
      {fatalError && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-[5px] border border-red-200 bg-red-50 text-[11px] text-red-700">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold">İstek başlatılamadı</p>
            <p className="font-mono break-all mt-0.5">{fatalError}</p>
          </div>
        </div>
      )}

      {/* Adım listesi */}
      {steps.length > 0 && (
        <div className="rounded-[5px] border border-border/50 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border/40">
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase flex-1">Kurulum Adımları</span>
            {completed && <span className="size-4 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="size-2.5 text-emerald-700" strokeWidth={3} /></span>}
            {isRunning && <Loader2 className="size-3.5 text-foreground animate-spin" />}
          </div>
          <div className="divide-y divide-border/40">
            {steps.map((step) => (
              <div key={step.stepId} className={cn(
                "flex items-start gap-2.5 px-3 py-2 transition-colors",
                step.status === "running" && "bg-muted/20"
              )}>
                <span className="shrink-0 mt-0.5">
                  {step.status === "done"    && <span className="size-4 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="size-2.5 text-emerald-700" strokeWidth={3} /></span>}
                  {step.status === "running" && <Loader2 className="size-4 animate-spin text-foreground" />}
                  {step.status === "error"   && <XCircle className="size-4 text-red-500" />}
                  {step.status === "pending" && <span className="size-4 rounded-full border-2 border-border/60 block" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    "text-[11px] font-mono",
                    step.status === "done"    && "text-muted-foreground line-through",
                    step.status === "running" && "text-foreground font-semibold",
                    step.status === "pending" && "text-muted-foreground/50",
                    step.status === "error"   && "text-red-500",
                  )}>
                    {step.label}
                  </p>
                  {step.error && (
                    <p className="text-[10px] text-red-500 font-mono mt-0.5 break-all whitespace-pre-wrap">{step.error}</p>
                  )}
                </div>
                {step.status === "running" && <span className="text-[10px] text-muted-foreground animate-pulse shrink-0">işleniyor…</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
