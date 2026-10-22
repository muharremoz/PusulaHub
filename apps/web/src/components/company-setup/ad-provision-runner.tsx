"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Loader2, XCircle, AlertTriangle, ChevronDown, Users, FolderOpen, HardDrive, Globe, Database, Smartphone, RefreshCw, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ServiceType, ServiceConfig } from "@/app/api/services/route"

/**
 * AD provision runner — `/api/setup/run` SSE endpoint'ini tüketir, adımları
 * canlı olarak listeler. Hem son sihirbaz adımında hem de "Test Et" butonu
 * ile kullanıcı listesi adımında kullanılır.
 */

/** warning: adım bitti ama elle bakılacak bir şey kaldı — kurulumu durdurmaz, ilerlemede tamam sayılır. */
export type ProvisionStatus = "pending" | "running" | "done" | "warning" | "error"

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
  /** API hizmeti için elle girilen uygulama kullanıcısı (Users.xml'de tek kullanıcı) */
  appUser?: { username: string; password: string }
  /** Sihirbaz API adımı: Users.xml'e yazılacak uygulama kullanıcıları (RDP değil) — verilirse firma kullanıcıları yazılmaz */
  apiUsers?: { username: string; password: string }[]
  /** Sihirbaz API adımı: Users.xml <DB> / kullanıcı Data listesi (varsayılan güncel data) */
  apiDbler?: string[]
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
  /** Depo sunucusu — D:\Resimler\<firmaId> klasörü + NTFS yetkisi bu agent'a gider. */
  depoServerId?:    string
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
  /** true → depo (resim klasörü / NTFS / desktop.ini) adımları atlanır */
  skipDepo?:          boolean
  /** Hedef DB adı → guvenlik.KOD; verilmeyen DB'ye firma numarası yazılır */
  kodlar?:            Record<string, number>

  /* ── Pars (mobil raporlama) — Hizmetler adımında Pars hizmeti seçildiyse ── */
  pars?: {
    serviceId:        number
    users:            { username: string; password: string; admin: boolean }[]
    /** İzinli rapor ID'leri; sunucu geri kalan her şeyi yasaklı yazar */
    allowedReportIds: number[]
    /** SQL adımı çalışmadığında (firma detayından ekleme) bağlanacak mevcut DB'ler */
    datalar?:         { data: string; tipId: number }[]
  }
}

interface Props {
  payload:        AdProvisionPayload
  /** Mount edilince otomatik başlasın mı (default: true) */
  autoStart?:     boolean
  /** Başarıyla tamamlandığında çağrılır */
  onComplete?:    () => void
  /** Fatal hata veya adım hatasında çağrılır */
  onError?:       (msg: string) => void
  /** Adım hatasında adım detayıyla çağrılır (şifre hatası tespiti için) */
  onStepError?:   (step: ProvisionStep) => void
  /**
   * HER adım güncellemesinde çağrılır (running/done/error farketmez).
   * `onStepError` yalnız hatayı veriyor; kritik olmayan bir adımın
   * BAŞARILI olup olmadığını bilmek gerektiğinde bu kullanılıyor
   * (ör. SQL Backup Master eklemesi — sonuca göre modal değişiyor).
   */
  onStep?:        (step: ProvisionStep) => void
}

export function AdProvisionRunner({ payload, autoStart = true, onComplete, onError, onStepError, onStep }: Props) {
  const [steps, setSteps]           = useState<ProvisionStep[]>([])
  const [completed, setCompleted]   = useState(false)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs]   = useState(0)
  const started = useRef(false)
  const listeRef = useRef<HTMLDivElement>(null)

  /* Yeni adim geldikce listeyi en alta kaydir */
  useEffect(() => {
    const el = listeRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [steps])

  const services     = payload.services ?? []
  const serviceCount = services.length
  const pusulaCount  = services.filter((s) => s.type === "pusula-program").length
  const iisCount     = services.filter((s) => s.type === "iis-site").length
  const resimCount   = services.filter((s) => s.type === "iis-resim").length
  // pusula-program: dir + copy + (param) + firmano.bak ≈ 3.5
  // iis-site: dir + copy + port + config + site ≈ 5
  // iis-resim: port + site ≈ 2
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
  const depoStepCount = payload.skipDepo ? 0 : 2
  // Masaüstü adımları: MUSTERILER subdir (1) + exe kısayolları (pusulaCount) + Resimler kısayolu (1)
  // Sadece pusula servisi varsa oluşturulur
  const desktopStepCount = pusulaCount > 0 ? pusulaCount + 2 : 0
  // Pars: Ayar.mdb oku + tek yazma adımı
  const parsStepCount = payload.pars ? 2 : 0
  // Yalnız Pars: AD adımları (OU/grup) ve senkron yok
  const parsOnly = payload.users.length === 0 && serviceCount > 0 && services.every((s) => s.type === "pars") && !payload.sqlServerId
  const totalEstimated =
    (parsOnly ? 0 : 3) +
    payload.users.length * 2 +
    depoStepCount +
    (serviceCount > 0 ? 1 + Math.round(pusulaCount * 3.5) + iisCount * 5 + resimCount * 2 + 1 : 0) +
    desktopStepCount +
    sqlStepCount +
    parsStepCount
  const doneCount = steps.filter((s) => s.status === "done" || s.status === "warning").length
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
        onStep?.({
          stepId: data.stepId!,
          label:  data.label!,
          status: data.status!,
          error:  data.error,
        })
        if (data.status === "error" && data.error) {
          onError?.(data.error)
          onStepError?.({ stepId: data.stepId!, label: data.label!, status: "error", error: data.error })
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
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
  }

  /* Adımları gruplara topla — grup tahmini toplamı, henüz başlamamış grupları da göstermek için */
  const tahmin: Record<GrupKey, number> = {
    ad:    (parsOnly ? 0 : 3) + payload.users.length * 2,
    dosya: (serviceCount > 0 ? 2 : 0) + Math.round(pusulaCount * 3.5) + desktopStepCount,
    depo:  depoStepCount,
    iis:   iisCount * 5 + resimCount * 2,
    sql:   sqlStepCount,
    pars:  parsStepCount,
    kayit: 0,
  }
  const gruplar = GRUPLAR.map((g) => {
    const adimlar = steps.filter((s) => grupBul(s.stepId) === g.key)
    const bitti   = adimlar.filter((s) => s.status === "done" || s.status === "warning").length
    const durum: ProvisionStatus =
      adimlar.some((s) => s.status === "error")   ? "error"
      : adimlar.some((s) => s.status === "running") ? "running"
      : adimlar.length > 0 && (completed || bitti >= tahmin[g.key]) ? "done"
      : adimlar.length > 0 ? "running"
      : "pending"
    return { ...g, adimlar, bitti, toplam: Math.max(tahmin[g.key], adimlar.length), durum }
  }).filter((g) => g.adimlar.length > 0 || (!completed && !fatalError && g.toplam > 0))

  // Grup açık mı: kullanıcı seçimi yoksa çalışan / hatalı grup açık gelir
  const [acik, setAcik] = useState<Partial<Record<GrupKey, boolean>>>({})
  const durumMetni = completed ? "Kurulum tamamlandı" : (errorStep || fatalError) ? "Kurulum durdu" : "Kurulum çalışıyor"

  return (
    <div className="space-y-3">

      {/* Durum kartı — başlık, adım/süre, yüzde, ilerleme çubuğu */}
      <div className="rounded-[8px] bg-[var(--section-bg)] p-2">
        <div className="rounded-[5px] bg-card p-3" style={{ boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center gap-3">
            <span className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1",
              completed ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400"
              : (errorStep || fatalError) ? "bg-red-500/15 text-red-700 ring-red-500/25 dark:text-red-400"
              : "bg-primary/10 text-primary ring-primary/20",
            )}>
              {completed ? <Check className="size-[18px]" strokeWidth={2.5} />
                : (errorStep || fatalError) ? <XCircle className="size-[18px]" />
                : <Loader2 className="size-[18px] animate-spin" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">
                {durumMetni}
                {payload.firmaId && <span className="font-medium text-muted-foreground"> · {payload.firmaId}</span>}
              </p>
              <p className="truncate text-[12px] text-muted-foreground">
                {doneCount} / {Math.max(totalEstimated, steps.length)} adım · {formatElapsed()}
                {errorStep && <> · <span className="text-red-700 dark:text-red-400">{errorStep.label}</span></>}
              </p>
            </div>
            <span className="text-2xl font-bold tabular-nums">{completed ? 100 : progress}%</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                completed ? "bg-emerald-500" : (errorStep || fatalError) ? "bg-red-500" : "bg-primary",
              )}
              style={{ width: `${completed ? 100 : progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Başlatılamadı */}
      {fatalError && (
        <div className="flex items-start gap-2 rounded-[5px] bg-red-500/15 px-3 py-2.5 text-[12px] text-red-700 dark:text-red-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">İstek başlatılamadı</p>
            <p className="mt-0.5 break-all">{fatalError}</p>
          </div>
        </div>
      )}

      {/* Gruplu adım listesi */}
      {gruplar.length > 0 && (
        <div className="overflow-hidden rounded-t-[10px] border-t bg-card" style={{ boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center justify-between border-b px-4 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Kurulum adımları</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Durum</span>
          </div>
          {/*  Uzun kurulumlarda liste sayfayı aşıyordu: sabit yükseklik + kaydırma */}
          <div ref={listeRef} className="max-h-[420px] divide-y overflow-y-auto">
            {gruplar.map((g) => {
              const Ikon = g.ikon
              const isOpen = (acik[g.key] ?? (g.durum === "running" || g.durum === "error")) && g.adimlar.length > 0
              return (
                <div key={g.key}>
                  <button
                    type="button"
                    disabled={g.adimlar.length === 0}
                    onClick={() => setAcik((p) => ({ ...p, [g.key]: !isOpen }))}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                      g.adimlar.length > 0 && "hover:bg-muted/20",
                      g.durum === "running" && "bg-muted/20",
                    )}
                  >
                    <DurumIkon durum={g.durum} />
                    <span className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-[5px]",
                      g.durum === "pending" ? "bg-muted text-muted-foreground" : g.renk,
                    )}>
                      <Ikon className="size-3.5" />
                    </span>
                    <span className={cn(
                      "min-w-0 flex-1 truncate text-[14px] font-medium leading-[20px]",
                      g.durum === "pending" && "text-muted-foreground",
                    )}>
                      {g.ad}
                    </span>
                    <span className={cn(
                      "inline-flex shrink-0 rounded-[5px] px-2 py-0.5 text-[11px] font-medium tabular-nums",
                      g.durum === "done"    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : g.durum === "error" ? "bg-red-500/15 text-red-700 dark:text-red-400"
                      : "bg-muted text-muted-foreground",
                    )}>
                      {g.durum === "done" ? `${g.bitti} adım` : `${g.bitti} / ${g.toplam}`}
                    </span>
                    <ChevronDown className={cn(
                      "size-3.5 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-180",
                      g.adimlar.length === 0 && "opacity-0",
                    )} />
                  </button>

                  {isOpen && (
                    <ul className="pb-1.5">
                      {g.adimlar.map((step) => (
                        <li key={step.stepId} className="flex items-start gap-2.5 py-1 pl-[52px] pr-4">
                          <span className="mt-[3px]"><DurumIkon durum={step.status} kucuk /></span>
                          <div className="min-w-0 flex-1">
                            <p className={cn(
                              "text-[13px]",
                              step.status === "running" && "font-medium text-foreground",
                              step.status === "done"    && "text-muted-foreground",
                              step.status === "pending" && "text-muted-foreground/60",
                              step.status === "error"   && "font-medium text-red-700 dark:text-red-400",
                              step.status === "warning" && "font-medium text-amber-700 dark:text-amber-400",
                            )}>
                              {step.label}
                            </p>
                            {step.error && (
                              <p className={cn(
                                "mt-1 whitespace-pre-wrap break-all rounded-[5px] px-2 py-1.5 text-[12px]",
                                step.status === "warning" ? "bg-amber-500/15 text-amber-800 dark:text-amber-400" : "bg-red-500/15 text-red-700 dark:text-red-400",
                              )}>
                                {step.error}
                              </p>
                            )}
                          </div>
                          {step.status === "running" && <span className="shrink-0 animate-pulse text-[12px] text-muted-foreground">işleniyor…</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Gruplar ──────────────────────────────────────────────────────────── */

type GrupKey = "ad" | "dosya" | "depo" | "iis" | "sql" | "pars" | "kayit"

const GRUPLAR: { key: GrupKey; ad: string; ikon: LucideIcon; renk: string }[] = [
  { key: "ad",    ad: "Active Directory",  ikon: Users,      renk: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  { key: "dosya", ad: "Program dosyaları", ikon: FolderOpen, renk: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400" },
  { key: "depo",  ad: "Depo",              ikon: HardDrive,  renk: "bg-teal-500/15 text-teal-700 dark:text-teal-400" },
  { key: "iis",   ad: "IIS hizmetleri",    ikon: Globe,      renk: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  { key: "sql",   ad: "SQL veritabanları", ikon: Database,   renk: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  { key: "pars",  ad: "Pars (mobil)",      ikon: Smartphone, renk: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  { key: "kayit", ad: "Hub kaydı",         ikon: RefreshCw,  renk: "bg-muted text-muted-foreground" },
]

/** Adım kimliğinin öneki grubunu belirler (`/api/setup/run` stepId'leri) */
function grupBul(stepId: string): GrupKey {
  if (/^(ou_|group$|user_|member_|office_|bilkar_member_)/.test(stepId)) return "ad"
  if (/^(iis_|resim_site_)/.test(stepId)) return "iis"
  if (/^(sql_|sbm_|bm_)/.test(stepId)) return "sql"
  if (/^pars_/.test(stepId)) return "pars"
  if (/^depo_/.test(stepId)) return "depo"
  if (/^(firma_root|ntfs$|svc_|desktop_|shortcut_|bilkar_desktop_)/.test(stepId)) return "dosya"
  return "kayit"
}

function DurumIkon({ durum, kucuk }: { durum: ProvisionStatus; kucuk?: boolean }) {
  const boyut = kucuk ? "size-3.5" : "size-4"
  if (durum === "done") return (
    <span className={cn(boyut, "flex shrink-0 items-center justify-center rounded-full bg-emerald-500")}>
      <Check className="size-2.5 text-white" strokeWidth={3} />
    </span>
  )
  if (durum === "running") return <Loader2 className={cn(boyut, "shrink-0 animate-spin text-foreground")} />
  if (durum === "error")   return <XCircle className={cn(boyut, "shrink-0 text-red-600 dark:text-red-400")} />
  if (durum === "warning") return <AlertTriangle className={cn(boyut, "shrink-0 text-amber-600 dark:text-amber-400")} />
  return <span className={cn(boyut, "block shrink-0 rounded-full border-2 border-border")} />
}
