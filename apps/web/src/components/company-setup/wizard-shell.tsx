"use client"

import { useState, useCallback } from "react"
import {
  adServers, windowsServers, companies, serviceItems,
  sqlServers, mockBackupFiles, demoDatabases, existingAdUsers,
  WizardUser, BackupFile, Company,
} from "@/lib/setup-mock-data"
import { StepServer } from "./step-server"
import { StepFirma } from "./step-firma"
import { StepUsers } from "./step-users"
import { StepServices } from "./step-services"
import { StepSql } from "./step-sql"
import { StepSummary } from "./step-summary"
import { StepRun } from "./step-run"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Confetti } from "@/components/magicui/confetti"
import { ChevronLeft, ChevronRight, Sparkles, Check, Server, Building2, Users, Layers, Database, ClipboardList, Play } from "lucide-react"
import { cn } from "@/lib/utils"

const STEPS = [
  { label: "Sunucu",       hint: "Active Directory sunucusunu seçin",                          icon: Server },
  { label: "Firma",        hint: "Kurulacak firmayı ve Windows sunucusunu belirleyin",         icon: Building2 },
  { label: "Kullanıcılar", hint: "AD'ye eklenecek kullanıcıları tanımlayın",                  icon: Users },
  { label: "Hizmetler",   hint: "Firmaya atanacak hizmetleri seçin",                          icon: Layers },
  { label: "SQL",          hint: "Veritabanı sunucusu ve veri kaynağı yapılandırın (opsiyonel)", icon: Database },
  { label: "Özet",         hint: "Ayarları gözden geçirin",                                   icon: ClipboardList },
  { label: "Çalıştır",    hint: "Kurulumu başlatın ve ilerlemeyi takip edin",                 icon: Play },
]

let _uid = 2
function generatePassword() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$"
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}
function mkUser(): WizardUser {
  return { id: _uid++, username: "", displayName: "", password: "", showPassword: false }
}

export function WizardShell() {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<"right" | "left">("right")

  const [selectedServerId, setSelectedServerId] = useState<number | null>(null)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [selectedWindowsServerId, setSelectedWindowsServerId] = useState<number | null>(null)
  const [users, setUsers] = useState<WizardUser[]>([{ id: 1, username: "", displayName: "", password: "", showPassword: false }])
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([])
  const [selectedSqlServerId, setSelectedSqlServerId] = useState<number | null>(null)
  const [sqlMode, setSqlMode] = useState<0 | 1>(0)
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>(mockBackupFiles)
  const [backupFolderPath, setBackupFolderPath] = useState("D:\\Demo Data")
  const [selectedDemoDbIds, setSelectedDemoDbIds] = useState<number[]>([])
  const [addFirmaPrefix, setAddFirmaPrefix] = useState(true)
  const [addToSirketDb, setAddToSirketDb] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [setupDone, setSetupDone] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  const adServer = adServers.find((s) => s.id === selectedServerId) ?? null
  const windowsServer = windowsServers.find((s) => s.id === selectedWindowsServerId) ?? null
  const sqlServer = sqlServers.find((s) => s.id === selectedSqlServerId) ?? null
  const firmaId = selectedCompany?.firkod ?? ""

  const canProceed =
    step === 0 ? selectedServerId !== null :
    step === 1 ? selectedCompany !== null :
    step === 2 ? users.every((u) => u.username.trim() && u.password.trim()) :
    true

  const go = (to: number) => {
    setDir(to > step ? "right" : "left")
    setStep(to)
  }

  const addUser = useCallback(() => setUsers((u) => [...u, mkUser()]), [])
  const removeUser = useCallback((id: number) => setUsers((u) => u.filter((x) => x.id !== id)), [])
  const updateUser = useCallback(<K extends keyof WizardUser>(id: number, k: K, v: WizardUser[K]) =>
    setUsers((u) => u.map((x) => x.id === id ? { ...x, [k]: v } : x)), [])

  const toggleService = useCallback((id: number) =>
    setSelectedServiceIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]), [])
  const toggleAllInCategory = useCallback((cat: string, sel: boolean) => {
    const ids = serviceItems.filter((s) => s.category === cat).map((s) => s.id)
    setSelectedServiceIds((p) => sel ? [...new Set([...p, ...ids])] : p.filter((id) => !ids.includes(id)))
  }, [])

  const toggleBackup = (id: number) =>
    setBackupFiles((p) => p.map((f) => f.id === id ? { ...f, selected: !f.selected } : f))
  const toggleDemoDb = (id: number) =>
    setSelectedDemoDbIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])
  const scanBackups = async () => {
    setIsScanning(true)
    await new Promise((r) => setTimeout(r, 1400))
    setBackupFiles(mockBackupFiles)
    setIsScanning(false)
  }
  const reset = () => {
    setStep(0); setSelectedServerId(null); setSelectedCompany(null)
    setSelectedWindowsServerId(null); setSelectedSqlServerId(null)
    setUsers([{ id: 1, username: "", displayName: "", password: "", showPassword: false }])
    setSelectedServiceIds([]); setSelectedDemoDbIds([]); setSetupDone(false)
    setBackupFiles(mockBackupFiles)
  }

  return (
    <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
      <Confetti trigger={showConfetti} />
      <div
        className="rounded-[4px] overflow-hidden flex min-h-[600px]"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
      >
        {/* ── Sol adım menüsü ── */}
        <div className="w-52 shrink-0 border-r border-border/50 flex flex-col py-4 px-3 gap-0.5"
          style={{ backgroundColor: "#FAFAF9" }}>

          <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase px-2 mb-2">
            Kurulum Adımları
          </p>

          {STEPS.map((s, idx) => {
            const isDone = idx < step
            const isActive = idx === step
            const isFuture = idx > step
            const Icon = s.icon

            return (
              <button
                key={idx}
                disabled={isFuture}
                onClick={() => !isFuture && go(idx)}
                className={cn(
                  "flex items-center gap-2.5 px-2 py-2 rounded-[5px] text-left transition-colors w-full",
                  isActive && "bg-foreground text-background",
                  isDone && "text-foreground hover:bg-muted/60",
                  isFuture && "text-muted-foreground opacity-40 cursor-default"
                )}
              >
                <span className={cn(
                  "size-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold",
                  isActive && "bg-background/20",
                  isDone && "bg-emerald-100 text-emerald-700",
                  isFuture && "bg-muted"
                )}>
                  {isDone
                    ? <Check className="size-2.5" strokeWidth={3} />
                    : <span className="tabular-nums">{idx + 1}</span>
                  }
                </span>

                <div className="min-w-0">
                  <p className="text-[11px] font-medium leading-tight truncate">{s.label}</p>
                  <p className={cn(
                    "text-[10px] leading-tight truncate mt-0.5",
                    isActive ? "opacity-60" : "text-muted-foreground"
                  )}>
                    {s.hint}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        {/* ── Sağ içerik + footer ── */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Step content */}
          <div className="flex-1 overflow-y-auto p-5">
            <BlurFade stepKey={step} direction={dir}>
              {step === 0 && <StepServer servers={adServers} selectedId={selectedServerId} onSelect={setSelectedServerId} />}
              {step === 1 && (
                <StepFirma
                  companies={companies} windowsServers={windowsServers}
                  selectedCompany={selectedCompany} selectedWindowsServerId={selectedWindowsServerId}
                  onSelectCompany={setSelectedCompany} onClearCompany={() => setSelectedCompany(null)}
                  onSelectWindowsServer={setSelectedWindowsServerId}
                />
              )}
              {step === 2 && (
                <StepUsers
                  users={users} firmaId={firmaId}
                  userLimit={selectedCompany?.userCount ?? 0}
                  existingUsers={existingAdUsers}
                  onAdd={addUser} onRemove={removeUser}
                  onUpdateUsername={(id, v) => updateUser(id, "username", v)}
                  onUpdateDisplayName={(id, v) => updateUser(id, "displayName", v)}
                  onUpdatePassword={(id, v) => updateUser(id, "password", v)}
                  onTogglePassword={(id) => updateUser(id, "showPassword", !users.find((u) => u.id === id)?.showPassword)}
                  onGeneratePassword={(id) => updateUser(id, "password", generatePassword())}
                />
              )}
              {step === 3 && (
                <StepServices services={serviceItems} selectedIds={selectedServiceIds}
                  onToggle={toggleService} onToggleAll={toggleAllInCategory} />
              )}
              {step === 4 && (
                <StepSql
                  sqlServers={sqlServers} selectedSqlServerId={selectedSqlServerId}
                  sqlMode={sqlMode} backupFiles={backupFiles}
                  backupFolderPath={backupFolderPath} demoDatabases={demoDatabases}
                  selectedDemoDbIds={selectedDemoDbIds} addFirmaPrefix={addFirmaPrefix}
                  firmaId={firmaId} isScanning={isScanning}
                  onSelectSqlServer={setSelectedSqlServerId} onSetSqlMode={setSqlMode}
                  onToggleBackup={toggleBackup} onSetBackupFolder={setBackupFolderPath}
                  onScanBackups={scanBackups} onToggleDemoDb={toggleDemoDb}
                  onSetAddFirmaPrefix={setAddFirmaPrefix}
                  addToSirketDb={addToSirketDb} onSetAddToSirketDb={setAddToSirketDb}
                />
              )}
              {step === 5 && (
                <StepSummary
                  adServer={adServer} windowsServer={windowsServer} company={selectedCompany}
                  users={users} services={serviceItems} selectedServiceIds={selectedServiceIds}
                  sqlServer={sqlServer} sqlMode={sqlMode} backupFiles={backupFiles}
                  selectedDemoDbIds={selectedDemoDbIds} demoDatabases={demoDatabases}
                  addFirmaPrefix={addFirmaPrefix}
                />
              )}
              {step === 6 && (
                <StepRun
                  hasSql={selectedSqlServerId !== null}
                  firmaId={firmaId}
                  users={users}
                  serverName={adServer?.name ?? ""}
                  onComplete={() => setSetupDone(true)}
                  onReset={reset}
                  onConfetti={() => { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 4000) }}
                />
              )}
            </BlurFade>
          </div>

          {/* Footer nav */}
          {step < 6 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border/50"
              style={{ backgroundColor: "#FAFAF9" }}>
              <button
                onClick={() => go(step - 1)}
                disabled={step === 0}
                className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[5px] transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronLeft className="size-3.5" />
                Geri
              </button>

              <p className="text-[10px] text-muted-foreground hidden sm:block">
                {STEPS[step]?.hint}
              </p>

              {step < 5 ? (
                <button
                  onClick={() => go(step + 1)}
                  disabled={!canProceed}
                  className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-[5px] transition-colors bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30 disabled:pointer-events-none"
                >
                  İleri
                  <ChevronRight className="size-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => go(6)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-[5px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
                >
                  <Sparkles className="size-3.5" />
                  Kurulumu Başlat
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="h-2" />
    </div>
  )
}
