"use client"

import { useState, useCallback, useEffect } from "react"
import {
  WizardUser, BackupFile, Company, ExistingAdUser,
} from "@/lib/setup-mock-data"
import type { WizardServiceDto } from "@/app/api/services/route"
import type { IisServerItem } from "@/app/api/setup/iis-servers/route"
import type { SqlServerItem } from "@/app/api/setup/sql-servers/route"
import type { SqlDatabasesResponse } from "@/app/api/setup/sql-servers/[id]/databases/route"
import type { ScanBackupsResponse } from "@/app/api/setup/sql-servers/[id]/scan-backups/route"
import type { DemoDatabaseDto } from "@/app/api/demo-databases/route"
import { toast } from "sonner"
import { StepServer, type AdServerItem } from "./step-server"
import { StepFirma, type RdpServerItem } from "./step-firma"
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
  return { id: _uid++, username: "", displayName: "", email: "", phone: "", password: "", showPassword: false }
}

export function WizardShell() {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<"right" | "left">("right")

  // AD Sunucuları API (step 0)
  const [apiAdServers, setApiAdServers]   = useState<AdServerItem[]>([])
  const [adServersLoading, setAdServersLoading] = useState(false)
  const [adServersError, setAdServersError]     = useState<string | null>(null)

  useEffect(() => {
    if (step !== 0) return
    if (apiAdServers.length > 0) return
    setAdServersLoading(true)
    setAdServersError(null)
    fetch("/api/setup/ad-servers")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setApiAdServers(data as AdServerItem[])
        else setAdServersError(data.error ?? "AD sunucuları alınamadı")
      })
      .catch(() => setAdServersError("AD sunucu API bağlantı hatası"))
      .finally(() => setAdServersLoading(false))
  }, [step, apiAdServers.length])

  // Firma API (step 1)
  const [apiCompanies, setApiCompanies]         = useState<Company[]>([])
  const [companiesLoading, setCompaniesLoading] = useState(false)
  const [companiesError, setCompaniesError]     = useState<string | null>(null)

  useEffect(() => {
    if (step !== 1) return
    if (apiCompanies.length > 0) return
    setCompaniesLoading(true)
    setCompaniesError(null)
    fetch("/api/firma/companies")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setApiCompanies(data as Company[])
        else setCompaniesError(data.error ?? "Firmalar alınamadı")
      })
      .catch(() => setCompaniesError("Firma API bağlantı hatası"))
      .finally(() => setCompaniesLoading(false))
  }, [step, apiCompanies.length])

  // RDP Sunucuları API (step 1)
  const [apiRdpServers, setApiRdpServers]       = useState<RdpServerItem[]>([])
  const [rdpServersLoading, setRdpServersLoading] = useState(false)
  const [rdpServersError, setRdpServersError]     = useState<string | null>(null)

  useEffect(() => {
    if (step !== 1) return
    if (apiRdpServers.length > 0) return
    setRdpServersLoading(true)
    setRdpServersError(null)
    fetch("/api/setup/rdp-servers")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setApiRdpServers(data as RdpServerItem[])
        else setRdpServersError(data.error ?? "RDP sunucuları alınamadı")
      })
      .catch(() => setRdpServersError("RDP sunucu API bağlantı hatası"))
      .finally(() => setRdpServersLoading(false))
  }, [step, apiRdpServers.length])

  // Firma'nın AD'deki mevcut kullanıcıları (step 2)
  const [apiExistingUsers, setApiExistingUsers]     = useState<ExistingAdUser[]>([])
  const [existingUsersLoading, setExistingUsersLoading] = useState(false)
  const [existingUsersError, setExistingUsersError]     = useState<string | null>(null)

  // Hizmet kataloğu (step 3)
  const [apiServices, setApiServices]           = useState<WizardServiceDto[]>([])
  const [servicesLoading, setServicesLoading]   = useState(false)
  const [servicesError, setServicesError]       = useState<string | null>(null)

  useEffect(() => {
    if (step !== 3) return
    if (apiServices.length > 0) return
    setServicesLoading(true)
    setServicesError(null)
    fetch("/api/services?onlyActive=true")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setApiServices(data as WizardServiceDto[])
        else setServicesError(data.error ?? "Hizmetler alınamadı")
      })
      .catch(() => setServicesError("Hizmet API bağlantı hatası"))
      .finally(() => setServicesLoading(false))
  }, [step, apiServices.length])

  // IIS Sunucuları (step 3)
  const [apiIisServers, setApiIisServers]         = useState<IisServerItem[]>([])
  const [iisServersLoading, setIisServersLoading] = useState(false)
  const [iisServersError, setIisServersError]     = useState<string | null>(null)

  useEffect(() => {
    if (step !== 3) return
    if (apiIisServers.length > 0) return
    setIisServersLoading(true)
    setIisServersError(null)
    fetch("/api/setup/iis-servers")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setApiIisServers(data as IisServerItem[])
        else setIisServersError(data.error ?? "IIS sunucuları alınamadı")
      })
      .catch(() => setIisServersError("IIS sunucu API bağlantı hatası"))
      .finally(() => setIisServersLoading(false))
  }, [step, apiIisServers.length])

  // SQL Sunucuları (step 4)
  const [apiSqlServers, setApiSqlServers]         = useState<SqlServerItem[]>([])
  const [sqlServersLoading, setSqlServersLoading] = useState(false)
  const [sqlServersError, setSqlServersError]     = useState<string | null>(null)

  useEffect(() => {
    if (step !== 4) return
    if (apiSqlServers.length > 0) return
    setSqlServersLoading(true)
    setSqlServersError(null)
    fetch("/api/setup/sql-servers")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setApiSqlServers(data as SqlServerItem[])
        else setSqlServersError(data.error ?? "SQL sunucuları alınamadı")
      })
      .catch(() => setSqlServersError("SQL sunucu API bağlantı hatası"))
      .finally(() => setSqlServersLoading(false))
  }, [step, apiSqlServers.length])

  // Step 4: SQL sunucuları yüklendikten sonra her biri için arka planda DB
  // bilgilerini (dbCount/totalSizeGB) doldur — kullanıcı seçim yapmadan da
  // listede doğru sayıları görsün.
  useEffect(() => {
    if (step !== 4) return
    if (apiSqlServers.length === 0) return

    // Henüz fetch edilmemiş (dbCount=0) sunucuları bul
    const toFetch = apiSqlServers.filter((s) => s.dbCount === 0 && s.totalSizeGB === 0)
    if (toFetch.length === 0) return

    toFetch.forEach((server) => {
      fetch(`/api/setup/sql-servers/${encodeURIComponent(server.id)}/databases`)
        .then((r) => r.json())
        .then((data: SqlDatabasesResponse | { error: string }) => {
          if ("databases" in data) {
            setApiSqlServers((prev) => prev.map((s) =>
              s.id === server.id
                ? { ...s, dbCount: data.dbCount, totalSizeGB: data.totalSizeGB }
                : s,
            ))
          }
        })
        .catch(() => { /* sessiz — liste yine görünür */ })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, apiSqlServers.length])


  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [selectedWindowsServerId, setSelectedWindowsServerId] = useState<string | null>(null)
  const [selectedIisServerId, setSelectedIisServerId] = useState<string | null>(null)
  const [users, setUsers] = useState<WizardUser[]>([{ id: 1, username: "", displayName: "", email: "", phone: "", password: "", showPassword: false }])
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([])
  const [selectedSqlServerId, setSelectedSqlServerId] = useState<string | null>(null)
  const [sqlMode, setSqlMode] = useState<0 | 1>(0)
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([])
  const [backupFolderPath, setBackupFolderPath] = useState("D:\\Demo Data")
  const [demoDatabases, setDemoDatabases] = useState<DemoDatabaseDto[]>([])
  const [demoDbsLoading, setDemoDbsLoading] = useState(false)
  const [demoDbsError, setDemoDbsError] = useState<string | null>(null)
  const [selectedDemoDbIds, setSelectedDemoDbIds] = useState<number[]>([])
  const [addFirmaPrefix, setAddFirmaPrefix] = useState(true)
  const [addToSirketDb, setAddToSirketDb] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [setupDone, setSetupDone] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  // Step 4: Demo veritabanları kataloğunu fetch et (aktif olanlar)
  useEffect(() => {
    if (step !== 4) return
    if (demoDatabases.length > 0) return
    setDemoDbsLoading(true)
    setDemoDbsError(null)
    fetch("/api/demo-databases?onlyActive=true")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setDemoDatabases(data as DemoDatabaseDto[])
        else setDemoDbsError(data.error ?? "Demo veritabanları alınamadı")
      })
      .catch(() => setDemoDbsError("Demo DB API bağlantı hatası"))
      .finally(() => setDemoDbsLoading(false))
  }, [step, demoDatabases.length])

  // Step 2'ye girince seçili sunucu+firma için AD'deki mevcut kullanıcıları çek
  useEffect(() => {
    if (step !== 2) return
    if (!selectedServerId || !selectedCompany) return
    setExistingUsersLoading(true)
    setExistingUsersError(null)
    const qs = new URLSearchParams({
      serverId: selectedServerId,
      firmaNo:  selectedCompany.firkod,
    }).toString()
    fetch(`/api/setup/company-users?${qs}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setApiExistingUsers(data as ExistingAdUser[])
        else setExistingUsersError(data.error ?? "Kullanıcılar alınamadı")
      })
      .catch(() => setExistingUsersError("Kullanıcı API bağlantı hatası"))
      .finally(() => setExistingUsersLoading(false))
  }, [step, selectedServerId, selectedCompany])

  const adServer = apiAdServers.find((s) => s.id === selectedServerId) ?? null
  const windowsServer = apiRdpServers.find((s) => s.id === selectedWindowsServerId) ?? null
  const sqlServer = apiSqlServers.find((s) => s.id === selectedSqlServerId) ?? null
  const firmaId = selectedCompany?.firkod ?? ""

  // Step 3 validation: iis-site hizmet seçildiyse IIS sunucusu da seçili olmalı
  const hasIisSelected = apiServices.some((s) => s.type === "iis-site" && selectedServiceIds.includes(s.id))

  const canProceed =
    step === 0 ? selectedServerId !== null :
    step === 1 ? selectedCompany !== null && (selectedCompany.userCount ?? 0) > 0 && selectedWindowsServerId !== null :
    step === 2 ? users.every((u) => u.username.trim() && u.password.trim()) :
    step === 3 ? !hasIisSelected || selectedIisServerId !== null :
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
    const ids = apiServices.filter((s) => s.category === cat).map((s) => s.id)
    setSelectedServiceIds((p) => sel ? [...new Set([...p, ...ids])] : p.filter((id) => !ids.includes(id)))
  }, [apiServices])

  const toggleBackup = (id: number) =>
    setBackupFiles((p) => p.map((f) => f.id === id ? { ...f, selected: !f.selected } : f))
  const updateBackupDatabaseName = (id: number, name: string) =>
    setBackupFiles((p) => p.map((f) => f.id === id ? { ...f, databaseName: name } : f))
  const toggleDemoDb = (id: number) =>
    setSelectedDemoDbIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])
  const updateDemoDbDataName = (id: number, dataName: string) =>
    setDemoDatabases((p) => p.map((db) => db.id === id ? { ...db, dataName } : db))
  const scanBackups = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!selectedSqlServerId) {
        if (!opts?.silent) toast.error("Önce bir SQL sunucusu seçin")
        return
      }
      const path = backupFolderPath.trim()
      if (!path) {
        if (!opts?.silent) toast.error("Yedek klasör yolu boş olamaz")
        return
      }
      setIsScanning(true)
      try {
        const resp = await fetch(
          `/api/setup/sql-servers/${encodeURIComponent(selectedSqlServerId)}/scan-backups`,
          {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ path }),
          },
        )
        const data = (await resp.json()) as ScanBackupsResponse | { error: string }
        if (!resp.ok || "error" in data) {
          const msg = "error" in data ? data.error : "Yedek dosyaları taranamadı"
          if (!opts?.silent) toast.error(msg)
          setBackupFiles([])
          return
        }
        setBackupFiles(data.files)
        if (!opts?.silent) {
          if (data.files.length === 0) {
            toast.info("Bu klasörde .bak dosyası bulunamadı", { description: path })
          } else {
            toast.success(`${data.files.length} yedek dosyası bulundu`)
          }
        }
      } catch {
        if (!opts?.silent) toast.error("Agent bağlantı hatası")
        setBackupFiles([])
      } finally {
        setIsScanning(false)
      }
    },
    [selectedSqlServerId, backupFolderPath],
  )

  // Step 4 — Mod 0 (Yedekten Yükle) aktifken, SQL sunucusu seçildiyse
  // adıma girişte ve sunucu değiştiğinde otomatik tarama yap. Kullanıcı
  // manuel butonu da kullanabilir ama boş ekran görmesin.
  useEffect(() => {
    if (step !== 4) return
    if (sqlMode !== 0) return
    if (!selectedSqlServerId) return
    if (!backupFolderPath.trim()) return
    scanBackups({ silent: true })
    // backupFolderPath'i bilerek dependency'ye koymuyoruz — her karakterde
    // tarama olmasın. Kullanıcı yolu değiştirdikten sonra Tara butonuna basar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sqlMode, selectedSqlServerId])
  const reset = () => {
    setStep(0); setSelectedServerId(null); setSelectedCompany(null)
    setSelectedWindowsServerId(null); setSelectedIisServerId(null); setSelectedSqlServerId(null)
    setUsers([{ id: 1, username: "", displayName: "", email: "", phone: "", password: "", showPassword: false }])
    setSelectedServiceIds([]); setSelectedDemoDbIds([]); setSetupDone(false)
    setBackupFiles([])
    // demoDatabases tekrar fetch edilsin diye boşalt — step 4'e girince useEffect yeniden doldurur
    setDemoDatabases([])
    setApiExistingUsers([])
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
              {step === 0 && (
                <StepServer
                  servers={apiAdServers}
                  selectedId={selectedServerId}
                  onSelect={setSelectedServerId}
                  loading={adServersLoading}
                  error={adServersError}
                />
              )}
              {step === 1 && (
                <StepFirma
                  companies={apiCompanies}
                  companiesLoading={companiesLoading}
                  companiesError={companiesError}
                  rdpServers={apiRdpServers}
                  rdpServersLoading={rdpServersLoading}
                  rdpServersError={rdpServersError}
                  selectedCompany={selectedCompany}
                  selectedWindowsServerId={selectedWindowsServerId}
                  onSelectCompany={setSelectedCompany}
                  onClearCompany={() => setSelectedCompany(null)}
                  onSelectWindowsServer={setSelectedWindowsServerId}
                />
              )}
              {step === 2 && (
                <StepUsers
                  users={users} firmaId={firmaId}
                  firmaName={selectedCompany?.firma ?? ""}
                  serverId={selectedServerId ?? ""}
                  userLimit={selectedCompany?.userCount ?? 0}
                  existingUsers={apiExistingUsers}
                  existingUsersLoading={existingUsersLoading}
                  existingUsersError={existingUsersError}
                  onAdd={addUser} onRemove={removeUser}
                  onUpdateUsername={(id, v) => updateUser(id, "username", v)}
                  onUpdateDisplayName={(id, v) => updateUser(id, "displayName", v)}
                  onUpdateEmail={(id, v) => updateUser(id, "email", v)}
                  onUpdatePhone={(id, v) => updateUser(id, "phone", v)}
                  onUpdatePassword={(id, v) => updateUser(id, "password", v)}
                  onTogglePassword={(id) => updateUser(id, "showPassword", !users.find((u) => u.id === id)?.showPassword)}
                  onGeneratePassword={(id) => updateUser(id, "password", generatePassword())}
                />
              )}
              {step === 3 && (
                <StepServices
                  services={apiServices}
                  loading={servicesLoading}
                  error={servicesError}
                  selectedIds={selectedServiceIds}
                  onToggle={toggleService}
                  onToggleAll={toggleAllInCategory}
                  iisServers={apiIisServers}
                  iisServersLoading={iisServersLoading}
                  iisServersError={iisServersError}
                  selectedIisServerId={selectedIisServerId}
                  onSelectIisServer={setSelectedIisServerId}
                />
              )}
              {step === 4 && (
                <StepSql
                  sqlServers={apiSqlServers}
                  sqlServersLoading={sqlServersLoading}
                  sqlServersError={sqlServersError}
                  selectedSqlServerId={selectedSqlServerId}
                  sqlMode={sqlMode} backupFiles={backupFiles}
                  backupFolderPath={backupFolderPath} demoDatabases={demoDatabases}
                  demoDatabasesLoading={demoDbsLoading}
                  demoDatabasesError={demoDbsError}
                  selectedDemoDbIds={selectedDemoDbIds} addFirmaPrefix={addFirmaPrefix}
                  firmaId={firmaId} isScanning={isScanning}
                  onSelectSqlServer={setSelectedSqlServerId} onSetSqlMode={setSqlMode}
                  onToggleBackup={toggleBackup} onSetBackupFolder={setBackupFolderPath}
                  onScanBackups={() => scanBackups()}
                  onUpdateBackupDatabaseName={updateBackupDatabaseName}
                  onToggleDemoDb={toggleDemoDb}
                  onUpdateDemoDbDataName={updateDemoDbDataName}
                  onSetAddFirmaPrefix={setAddFirmaPrefix}
                  addToSirketDb={addToSirketDb} onSetAddToSirketDb={setAddToSirketDb}
                />
              )}
              {step === 5 && (
                <StepSummary
                  adServer={adServer} windowsServer={windowsServer} company={selectedCompany}
                  users={users} services={apiServices} selectedServiceIds={selectedServiceIds}
                  sqlServer={sqlServer} sqlMode={sqlMode} backupFiles={backupFiles}
                  selectedDemoDbIds={selectedDemoDbIds} demoDatabases={demoDatabases}
                  addFirmaPrefix={addFirmaPrefix}
                />
              )}
              {step === 6 && (
                <StepRun
                  serverId={selectedServerId ?? ""}
                  windowsServerId={selectedWindowsServerId ?? ""}
                  iisServerId={selectedIisServerId ?? ""}
                  firmaId={firmaId}
                  firmaName={selectedCompany?.firma ?? ""}
                  serverName={adServer?.name ?? ""}
                  users={users}
                  services={apiServices.filter((s) => selectedServiceIds.includes(s.id))}
                  sqlServerId={selectedSqlServerId}
                  sqlMode={sqlMode}
                  backupFolderPath={backupFolderPath}
                  backupFiles={backupFiles}
                  selectedDemoDbIds={selectedDemoDbIds}
                  addFirmaPrefix={addFirmaPrefix}
                  addToSirketDb={addToSirketDb}
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
