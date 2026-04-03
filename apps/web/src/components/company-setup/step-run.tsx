"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { getSetupSteps, SetupStepDef, WizardUser } from "@/lib/setup-mock-data"
import { Check, Loader2, RotateCcw, XCircle, Shield, MessageSquare, Copy, CheckCheck, X } from "lucide-react"
import { cn } from "@/lib/utils"

type Status = "pending" | "running" | "done" | "error"
interface RunStep { def: SetupStepDef; status: Status }

interface FwItem { title: string; description: string; optional?: boolean; checked: boolean }

const FW_ITEMS: Omit<FwItem, "checked">[] = [
  { title: "Firma ID ile grup oluştur",    description: "FortiGate'te firma ID'si adıyla yeni bir kullanıcı grubu oluştur" },
  { title: "VPN kullanıcısı oluştur",      description: "Sihirbazda oluşturulan kullanıcı adı ve şifre ile VPN kullanıcısı tanımla" },
  { title: "Kullanıcıyı gruba dahil et",   description: "Oluşturulan VPN kullanıcısını firma grubuna ekle" },
  { title: "Sabit sanal IP tanımla",       description: "Gerekiyorsa SSL-VPN Portals'dan kullanıcıya sabit IP kaydı aç", optional: true },
  { title: "Sabit IP mapping'i ekle",      description: "Oluşturulan IP kaydını SSL-VPN Settings → Mapping alanına ekle", optional: true },
]

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-[8px] border border-border bg-background shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/20">
          <p className="text-[11px] font-semibold">{title}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body
  )
}

export function StepRun({
  hasSql, firmaId, users, serverName,
  onComplete, onReset, onConfetti,
}: {
  hasSql: boolean
  firmaId: string
  users: WizardUser[]
  serverName: string
  onComplete: () => void
  onReset: () => void
  onConfetti: () => void
}) {
  const stepDefs = getSetupSteps(hasSql)
  const [steps, setSteps] = useState<RunStep[]>(stepDefs.map((def) => ({ def, status: "pending" })))
  const [completed, setCompleted] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [fwItems, setFwItems] = useState<FwItem[]>(FW_ITEMS.map((i) => ({ ...i, checked: false })))
  const [showFw, setShowFw] = useState(false)
  const [showMsg, setShowMsg] = useState(false)
  const [copied, setCopied] = useState(false)
  const started = useRef(false)

  const doneCount = steps.filter((s) => s.status === "done").length
  const progress = Math.round((doneCount / steps.length) * 100)
  const fwDone = fwItems.filter((i) => i.checked).length

  useEffect(() => {
    if (completed) return
    const t = setInterval(() => setElapsedMs((p) => p + 100), 100)
    return () => clearInterval(t)
  }, [completed])

  useEffect(() => {
    if (started.current) return
    started.current = true
    const run = async () => {
      for (let i = 0; i < stepDefs.length; i++) {
        setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, status: "running" } : s))
        await new Promise((r) => setTimeout(r, stepDefs[i].durationMs))
        setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, status: "done" } : s))
      }
      setCompleted(true)
      onConfetti()
      onComplete()
    }
    run()
  }, [])

  const formatElapsed = () => {
    const s = Math.floor(elapsedMs / 1000)
    const ms = String(elapsedMs % 1000).padStart(3, "0").slice(0, 2)
    return `${s}.${ms}s`
  }

  const customerMessage = [
    "Merhaba,",
    "",
    "Sunucu erişim bilgileriniz aşağıdadır.",
    "",
    `Sunucu: ${serverName}`,
    "",
    ...users.flatMap((u) => [`Kullanıcı Adı: ${firmaId}.${u.username}`, `Şifre: ${u.password}`, ""]),
    "Bağlantı Rehberi: https://www.youtube.com/watch?v=sclrNkCJ734",
    "",
    "İyi çalışmalar.",
  ].join("\n")

  const handleCopy = async () => {
    await navigator.clipboard.writeText(customerMessage)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const groups = stepDefs.reduce<Record<string, RunStep[]>>((acc, def) => {
    const step = steps.find((s) => s.def.id === def.id)
    if (step) (acc[def.group] ??= []).push(step)
    return acc
  }, {})

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
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Çalışıyor…
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">{doneCount} / {steps.length} adım</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">{formatElapsed()}</span>
        </div>
        <div className="h-1 w-full bg-muted">
          <div
            className={cn("h-full transition-all duration-300", completed ? "bg-emerald-500" : "bg-foreground")}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Grup listesi */}
      {Object.entries(groups).map(([groupName, groupSteps]) => {
        const allDone = groupSteps.every((s) => s.status === "done")
        const isRunning = groupSteps.some((s) => s.status === "running")
        return (
          <div key={groupName} className="rounded-[5px] border border-border/50 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border/40">
              <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase flex-1">{groupName}</span>
              {allDone && <span className="size-4 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="size-2.5 text-emerald-700" strokeWidth={3} /></span>}
              {isRunning && <Loader2 className="size-3.5 text-foreground animate-spin" />}
            </div>
            <div className="divide-y divide-border/40">
              {groupSteps.map((step) => (
                <div key={step.def.id} className={cn("flex items-center gap-2.5 px-3 py-2 transition-colors", step.status === "running" && "bg-muted/20")}>
                  <span className="shrink-0">
                    {step.status === "done" && <span className="size-4 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="size-2.5 text-emerald-700" strokeWidth={3} /></span>}
                    {step.status === "running" && <Loader2 className="size-4 animate-spin text-foreground" />}
                    {step.status === "error" && <XCircle className="size-4 text-red-500" />}
                    {step.status === "pending" && <span className="size-4 rounded-full border-2 border-border/60 block" />}
                  </span>
                  <span className={cn("text-[11px] font-mono flex-1",
                    step.status === "done" && "text-muted-foreground line-through",
                    step.status === "running" && "text-foreground font-semibold",
                    step.status === "pending" && "text-muted-foreground/50",
                    step.status === "error" && "text-red-500",
                  )}>
                    {step.def.label.replace("{firma}", firmaId)}
                  </span>
                  {step.status === "running" && <span className="text-[10px] text-muted-foreground animate-pulse">işleniyor…</span>}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Tamamlama banner */}
      {completed && (
        <div className="rounded-[5px] border border-emerald-200 bg-emerald-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-emerald-200/60">
            <div>
              <p className="text-[11px] font-semibold text-emerald-800">{firmaId} kurulumu başarıyla tamamlandı</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">{steps.length} adım · {formatElapsed()}</p>
            </div>
            <button onClick={onReset} className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[5px] border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition-colors">
              <RotateCcw className="size-3.5" />
              Yeni Firma
            </button>
          </div>

          {/* Aksiyon butonları */}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <button
              onClick={() => setShowFw(true)}
              className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[5px] border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
            >
              <Shield className="size-3.5" />
              Firewall Adımları
              {fwDone > 0 && (
                <span className="ml-1 text-[9px] bg-orange-200 text-orange-800 px-1.5 rounded-full">{fwDone}/{fwItems.length}</span>
              )}
            </button>
            <button
              onClick={() => setShowMsg(true)}
              className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[5px] border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <MessageSquare className="size-3.5" />
              Kullanıcı Mesajı
            </button>
          </div>
        </div>
      )}

      {/* Firewall Modal */}
      {showFw && (
        <Modal title="Firewall & VPN Adımları" onClose={() => setShowFw(false)}>
          <div className="space-y-2">
            {fwItems.map((item, idx) => (
              <button
                key={idx}
                onClick={() => setFwItems((prev) => prev.map((f, i) => i === idx ? { ...f, checked: !f.checked } : f))}
                className={cn(
                  "w-full flex items-start gap-3 px-3 py-2.5 rounded-[5px] border text-left transition-colors",
                  item.checked ? "border-emerald-200 bg-emerald-50" : "border-border/50 hover:bg-muted/20"
                )}
              >
                <span className={cn("size-4 rounded-[3px] border-2 flex items-center justify-center shrink-0 mt-0.5",
                  item.checked ? "bg-foreground border-foreground" : "border-border"
                )}>
                  {item.checked && <Check className="size-2.5 text-background" strokeWidth={3} />}
                </span>
                <div className="min-w-0">
                  <p className={cn("text-[11px] font-medium", item.checked && "line-through text-muted-foreground")}>
                    {item.title}
                    {item.optional && <span className="ml-1.5 text-[9px] text-muted-foreground font-normal">(opsiyonel)</span>}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.description}</p>
                </div>
              </button>
            ))}
            {fwDone === fwItems.length && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-[5px] bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-700 font-medium">
                <Check className="size-3.5" strokeWidth={3} />
                Tüm adımlar tamamlandı!
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Müşteri Mesajı Modal */}
      {showMsg && (
        <Modal title="Müşteri Bilgilendirme Mesajı" onClose={() => setShowMsg(false)}>
          <div className="space-y-3">
            <pre className="text-[11px] font-mono text-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-[5px] border border-border/50 p-3">
              {customerMessage}
            </pre>
            <button
              onClick={handleCopy}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 py-2 rounded-[5px] border text-[11px] font-medium transition-colors",
                copied
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-border hover:bg-muted/40 text-foreground"
              )}
            >
              {copied ? <><CheckCheck className="size-3.5" /> Kopyalandı</> : <><Copy className="size-3.5" /> Kopyala</>}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
