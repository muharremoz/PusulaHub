"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { WizardUser, BackupFile } from "@/lib/setup-mock-data"
import type { WizardServiceDto } from "@/app/api/services/route"
import { Check, RotateCcw, Shield, MessageSquare, Copy, CheckCheck, X, KeyRound, Eye, EyeOff, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { AdProvisionRunner, ProvisionStep } from "./ad-provision-runner"
import { meetsAdComplexity } from "./step-users"

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

interface Props {
  serverId:        string
  windowsServerId: string
  iisServerId:     string
  depoServerId:    string
  firmaId:         string
  firmaName:       string
  serverName:      string
  serverDomain?:   string
  serverDns?:      string
  serverRdpPort?:  number | null
  users:           WizardUser[]
  services:        WizardServiceDto[]
  /* 4. adım: SQL */
  sqlServerId?:        string | null
  sqlMode?:            0 | 1
  backupFolderPath?:   string
  backupFiles?:        BackupFile[]
  selectedDemoDbIds?:  number[]
  addFirmaPrefix?:     boolean
  addToSirketDb?:      boolean
  onComplete:      () => void
  onReset:         () => void
  onConfetti:      () => void
}

export function StepRun({
  serverId, windowsServerId, iisServerId, depoServerId, firmaId, firmaName, serverName, serverDomain, serverDns, serverRdpPort, users, services,
  sqlServerId, sqlMode, backupFolderPath, backupFiles, selectedDemoDbIds, addFirmaPrefix, addToSirketDb,
  onComplete, onReset, onConfetti,
}: Props) {
  const [completed, setCompleted]   = useState(false)
  const [hasError, setHasError]     = useState(false)
  const [runKey, setRunKey]         = useState(0)
  const [localUsers, setLocalUsers] = useState<WizardUser[]>(users.map((u) => ({ ...u })))
  const [fwItems, setFwItems]       = useState<FwItem[]>(FW_ITEMS.map((i) => ({ ...i, checked: false })))
  const [showFw, setShowFw]         = useState(false)
  const [showMsg, setShowMsg]       = useState(false)
  const [copied, setCopied]         = useState(false)

  // Şifre yeniden deneme
  const [pwRetry, setPwRetry]       = useState<{ fullUsername: string; shortUsername: string } | null>(null)
  const [newPw, setNewPw]           = useState("")
  const [showNewPw, setShowNewPw]   = useState(false)

  const handleStepError = (step: ProvisionStep) => {
    const isPasswordError =
      step.error?.includes("ADPasswordComplexity") ||
      step.error?.includes("password does not meet") ||
      step.error?.includes("PasswordComplexity")
    if (!isPasswordError) return

    // Label: "Kullanıcı oluşturuluyor: 343.test" → fullUsername = "343.test"
    const match = step.label.match(/Kullanıcı oluşturuluyor:\s*(.+)/)
    if (!match) return
    const fullUsername  = match[1].trim()
    // Short username: firmaId. önekini kaldır
    const shortUsername = fullUsername.includes(".")
      ? fullUsername.slice(fullUsername.indexOf(".") + 1)
      : fullUsername
    setPwRetry({ fullUsername, shortUsername })
    setNewPw("")
    setShowNewPw(false)
  }

  const handlePwRetrySubmit = () => {
    if (!pwRetry || !meetsAdComplexity(newPw)) return
    setLocalUsers((prev) =>
      prev.map((u) => u.username === pwRetry.shortUsername ? { ...u, password: newPw } : u)
    )
    setPwRetry(null)
    setHasError(false)
    setCompleted(false)
    setRunKey((k) => k + 1) // runner'ı yeniden başlat
  }

  const fwDone = fwItems.filter((i) => i.checked).length

  const customerMessage = [
    "Merhaba,",
    "",
    "Sunucu erişim bilgileriniz aşağıdadır.",
    "",
    `Sunucu: ${(serverDns && serverDns.trim()) ? serverDns : serverName}${serverRdpPort ? `:${serverRdpPort}` : ""}`,
    "",
    ...localUsers.flatMap((u) => {
      // Domain'den .local/.lan/.corp gibi uzantıları çıkar (ör: pusuladc.local → pusuladc)
      const domainShort = (serverDomain ?? "").split(".")[0]?.trim() ?? ""
      const userPart = `${firmaId}.${u.username}`
      const fullUser = domainShort ? `${domainShort}\\${userPart}` : userPart
      return [`Kullanıcı Adı: ${fullUser}`, `Şifre: ${u.password}`, ""]
    }),
    "Bağlantı Rehberi: https://www.youtube.com/watch?v=sclrNkCJ734",
    "",
    "İyi çalışmalar.",
  ].join("\n")

  const handleCopy = async () => {
    await navigator.clipboard.writeText(customerMessage)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-3">

      {/* Asıl runner */}
      <AdProvisionRunner
        key={runKey}
        payload={{
          serverId,
          windowsServerId,
          iisServerId,
          depoServerId: depoServerId || undefined,
          firmaId,
          firmaName,
          users: localUsers.map((u) => ({
            username:    u.username,
            displayName: u.displayName,
            email:       u.email,
            phone:       u.phone,
            password:    u.password,
          })),
          services: services.map((s) => ({
            id:     s.id,
            name:   s.name,
            type:   s.type,
            config: s.config,
          })),
          /* 4. adım: SQL (boşsa backend atlar) */
          sqlServerId:       sqlServerId ?? undefined,
          sqlMode,
          backupFolderPath,
          backupFiles: (backupFiles ?? [])
            .filter((f) => f.selected)
            .map((f) => ({
              fileName:     f.fileName,
              databaseName: f.databaseName,
            })),
          selectedDemoDbIds,
          addFirmaPrefix,
          addToSirketDb,
        }}
        onComplete={() => {
          setCompleted(true)
          onConfetti()
          onComplete()
        }}
        onError={() => setHasError(true)}
        onStepError={handleStepError}
      />

      {/* Tamamlama banner */}
      {completed && (
        <div className="rounded-[5px] border border-emerald-200 bg-emerald-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-emerald-200/60">
            <div>
              <p className="text-[11px] font-semibold text-emerald-800">{firmaId} kurulumu başarıyla tamamlandı</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">{users.length} kullanıcı oluşturuldu</p>
            </div>
            <button onClick={onReset} className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[5px] border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition-colors">
              <RotateCcw className="size-3.5" />
              Yeni Firma
            </button>
          </div>

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

      {/* Hata banner */}
      {hasError && !completed && (
        <div className="rounded-[5px] border border-red-200 bg-red-50 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-red-800">Kurulum tamamlanamadı</p>
            <button onClick={onReset} className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[5px] border border-red-300 text-red-700 hover:bg-red-100 transition-colors">
              <RotateCcw className="size-3.5" />
              Baştan Başla
            </button>
          </div>
        </div>
      )}

      {/* Şifre yeniden deneme modal */}
      {pwRetry && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm mx-4 rounded-[8px] border border-border bg-background shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-amber-50">
              <AlertTriangle className="size-4 text-amber-600 shrink-0" />
              <div>
                <p className="text-[12px] font-semibold text-amber-900">Şifre Karmaşıklık Hatası</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  <span className="font-mono font-semibold">{pwRetry.fullUsername}</span> için şifre AD kuralını karşılamıyor.
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-muted-foreground">
                Yeni bir şifre girin. En az 7 karakter, büyük/küçük harf + rakam veya özel karakter içermelidir.
              </p>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium">Yeni Şifre</label>
                <div className={cn(
                  "flex items-center rounded-[5px] border-2 bg-background transition-colors",
                  newPw && !meetsAdComplexity(newPw) ? "border-red-400" : newPw ? "border-emerald-400" : "border-border"
                )}>
                  <input
                    type={showNewPw ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handlePwRetrySubmit()}
                    placeholder="••••••••"
                    autoFocus
                    className="flex-1 px-3 py-2 text-[13px] bg-transparent outline-none min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw((v) => !v)}
                    className="px-2 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    {showNewPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
                {newPw && !meetsAdComplexity(newPw) && (
                  <p className="text-[10px] text-red-500">AD karmaşıklık kuralı karşılanmıyor.</p>
                )}
                {newPw && meetsAdComplexity(newPw) && (
                  <p className="text-[10px] text-emerald-600">✓ Şifre uygun, kurulum devam edebilir.</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/50 bg-muted/20">
              <button
                onClick={() => { setPwRetry(null); onReset() }}
                className="text-[11px] font-medium px-3 py-1.5 rounded-[5px] border border-border hover:bg-muted/40 transition-colors"
              >
                Baştan Başla
              </button>
              <button
                onClick={handlePwRetrySubmit}
                disabled={!meetsAdComplexity(newPw)}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[5px] transition-colors",
                  meetsAdComplexity(newPw)
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                <KeyRound className="size-3.5" />
                Yeniden Dene
              </button>
            </div>
          </div>
        </div>,
        document.body
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
