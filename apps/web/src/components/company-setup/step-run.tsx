"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { WizardUser, BackupFile } from "@/lib/setup-mock-data"
import type { WizardServiceDto } from "@/app/api/services/route"
import type { SqlServerItem } from "@/app/api/setup/sql-servers/route"
import type { DemoDatabaseDto } from "@/app/api/demo-databases/route"
import type { CompanyServiceDto } from "@/app/api/companies/[firkod]/services/route"
import { Check, RotateCcw, Shield, MessageSquare, Copy, CheckCheck, X, KeyRound, Eye, EyeOff, AlertTriangle, Database, ListChecks } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AdProvisionRunner, ProvisionStep } from "./ad-provision-runner"
import { meetsAdComplexity } from "./step-users"
import { copyToClipboard } from "@/lib/clipboard"
import { apiKullaniciAdi, sqlLoginAdi } from "@/lib/firma-adlandirma"
import { parsMesajSatirlari, type ParsBaglanti, type ParsWizardUser } from "@/lib/pars-katalog"

interface FwItem { title: string; description: string; optional?: boolean; checked: boolean }

const FW_ITEMS: Omit<FwItem, "checked">[] = [
  { title: "Firma ID ile grup oluştur",    description: "FortiGate'te firma ID'si adıyla yeni bir kullanıcı grubu oluştur" },
  { title: "VPN kullanıcısı oluştur",      description: "Sihirbazda oluşturulan kullanıcı adı ve şifre ile VPN kullanıcısı tanımla" },
  { title: "Kullanıcıyı gruba dahil et",   description: "Oluşturulan VPN kullanıcısını firma grubuna ekle" },
  { title: "Sabit sanal IP tanımla",       description: "Gerekiyorsa SSL-VPN Portals'dan kullanıcıya sabit IP kaydı aç", optional: true },
  { title: "Sabit IP mapping'i ekle",      description: "Oluşturulan IP kaydını SSL-VPN Settings → Mapping alanına ekle", optional: true },
]

/** Tek satirlik label + degeri + kopyala butonu */
function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    const ok = await copyToClipboard(value)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-[5px] border border-border/50 bg-background px-2 py-1.5">
      <span className="w-[90px] shrink-0 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className={cn("flex-1 min-w-0 truncate text-[12px] text-foreground", mono && "font-mono")} title={value}>
        {value}
      </span>
      <button
        type="button"
        onClick={handle}
        className={cn(
          "shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-[5px] text-[10px] font-medium transition-colors",
          copied
            ? "bg-emerald-100 text-emerald-700 dark:text-emerald-400"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        title="Kopyala"
      >
        {copied ? <><CheckCheck className="size-3" /> OK</> : <Copy className="size-3" />}
      </button>
    </div>
  )
}

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
  iisServerDns?:   string
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
  /** SQL sunucusu nesnesi — müşteri mesajında IP göstermek için. */
  sqlServer?:          SqlServerItem | null
  sqlMode?:            0 | 1
  backupFolderPath?:   string
  backupFiles?:        BackupFile[]
  selectedDemoDbIds?:  number[]
  /** Mod 1 için demo veritabanı listesi (mesajda DB adı çözümlemek için). */
  demoDatabases?:      DemoDatabaseDto[]
  addFirmaPrefix?:     boolean
  addToSirketDb?:      boolean
  /** Pars hizmeti seçildiyse — kullanıcılar Ayar.mdb'ye yazılır, mesajda gösterilir */
  pars?:               { serviceId: number; users: ParsWizardUser[]; allowedReportIds: number[]; baglanti?: ParsBaglanti | null } | null
  onComplete:      () => void
  onReset:         () => void
  onConfetti:      () => void
}

export function StepRun({
  serverId, windowsServerId, iisServerId, iisServerDns, depoServerId, firmaId, firmaName, serverName, serverDomain, serverDns, serverRdpPort, users, services,
  sqlServerId, sqlServer, sqlMode, backupFolderPath, backupFiles, selectedDemoDbIds, demoDatabases, addFirmaPrefix, addToSirketDb,
  pars,
  onComplete, onReset, onConfetti,
}: Props) {
  const [completed, setCompleted]   = useState(false)
  const [hasError, setHasError]     = useState(false)
  const [iisAssignments, setIisAssignments] = useState<CompanyServiceDto[]>([])
  const [runKey, setRunKey]         = useState(0)
  const [localUsers, setLocalUsers] = useState<WizardUser[]>(users.map((u) => ({ ...u })))
  const [fwItems, setFwItems]       = useState<FwItem[]>(FW_ITEMS.map((i) => ({ ...i, checked: false })))
  const [showFw, setShowFw]         = useState(false)
  const [showMsg, setShowMsg]       = useState(false)
  /*  Kurulum bitince kendiliğinden açılır: sihirbazın YAPAMADIĞI iki adım
   *  burada. Banner'daki düğmeyle tekrar açılabiliyor — kapatıp sonra
   *  "neydi o" diye aranmasın.                                          */
  const [showManual, setShowManual] = useState(false)
  /*  SQL Backup Master eklemesi kritik olmayan bir adim: basarisiz olsa
   *  da kurulum devam ediyor. Sonucu modalda gostermek icin izleniyor.  */
  const [sbmDurum, setSbmDurum] = useState<"yok" | "tamam" | "hata">("yok")
  /*  Spare Backup guvenlik.YedekAl'ı kendisi okuyor — guvenlik kaydı yazılan
   *  DB otomatik yedeğe girer. Kayıt yazılamayan DB'yi ayrıca göstermek için. */
  const [guvenlikDurum, setGuvenlikDurum] = useState<Record<string, "tamam" | "hata">>({})
  const [dnsKopyalandi, setDnsKopyalandi] = useState(false)
  /*  Pars yazma adımı da kritik degil; sonucu mesajda ve modalda dogru
   *  gostermek icin izleniyor — basarisizsa kullanici bilgileri mesaja
   *  girmez, "eklenemedi" uyarisi gosterilir.                          */
  const [parsDurum, setParsDurum] = useState<"yok" | "tamam" | "hata">("yok")
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

  // Kurulum tamamlanınca müşteri mesajına IIS hizmet/port bilgisi de katılsın diye
  // /api/companies/{firmaId}/services endpoint'inden iis-site atamalarını çek.
  useEffect(() => {
    if (!completed || !firmaId) return
    let mounted = true
    const load = async () => {
      try {
        const r = await fetch(`/api/companies/${encodeURIComponent(firmaId)}/services`, { cache: "no-store" })
        if (!r.ok) return
        const data = (await r.json()) as CompanyServiceDto[]
        if (mounted && Array.isArray(data)) {
          setIisAssignments(data.filter((s) => (s.type === "iis-site" || s.type === "iis-resim") && s.port != null))
        }
      } catch { /* ignore */ }
    }
    load()
    return () => { mounted = false }
  }, [completed, firmaId])

  // Her kullanici icin structured kimlik bilgisi — modal'da her alan ayri kopyalanabilir
  const credentials = (() => {
    const domainShort = (serverDomain ?? "").split(".")[0]?.trim() ?? ""
    const rdpHost     = (serverDns && serverDns.trim()) ? serverDns : serverName
    const rdpTarget   = `${rdpHost}${serverRdpPort ? `:${serverRdpPort}` : ""}`
    return localUsers.map((u) => {
      const userPart = `${firmaId}.${u.username}`
      const fullUser = domainShort ? `${domainShort}\\${userPart}` : userPart
      return {
        displayName:  u.displayName || u.username,
        vpnUsername:  userPart,
        rdpServer:    rdpTarget,
        rdpUsername:  fullUser,
        password:     u.password,
      }
    })
  })()

  // Restore edilen hedef DB'ler — addFirmaPrefix uygulanmış adlar + yedek tercihi.
  const restoredDbs = (() => {
    if (!sqlServerId) return [] as { ad: string; yedekAl: boolean }[]
    const prefix = addFirmaPrefix && firmaId ? `${firmaId}_` : ""
    if (sqlMode === 0) {
      return (backupFiles ?? [])
        .filter((f) => f.selected && f.databaseName?.trim())
        .map((f) => ({ ad: `${prefix}${f.databaseName.trim()}`, yedekAl: f.yedekAl !== false }))
    }
    // Mod 1: demo DB → dataName (demo güncel data, yedeğe girer — backend ile aynı)
    const ids = new Set(selectedDemoDbIds ?? [])
    return (demoDatabases ?? [])
      .filter((d) => ids.has(d.id))
      .map((d) => ({ ad: `${prefix}${(d.dataName ?? d.name).trim()}`, yedekAl: true }))
      .filter((d) => d.ad.length > prefix.length)
  })()
  const restoredDbNames = restoredDbs.map((d) => d.ad)
  /*  Yedeği istenip guvenlik kaydı yazılmayan DB → Spare Backup görmez
   *  (adım hata verdi ya da "Şirket veritabanına ekle" kapalıydı).        */
  const guvenlikHatali = restoredDbs.filter((d) => d.yedekAl && guvenlikDurum[d.ad] !== "tamam").map((d) => d.ad)
  const yedekSorunu = restoredDbs.length > 0 && (guvenlikHatali.length > 0 || sbmDurum === "hata")
  const elleSayisi = 1 + (pars && parsDurum === "hata" ? 1 : 0) + (yedekSorunu ? 1 : 0)

  const customerMessage = (() => {
    const lines: string[] = [
      "Merhaba,",
      "",
      "Sunucu erişim bilgileriniz aşağıdadır.",
      "Öncesinde Forticlient uygulaması ile VPN bağlantısını sağlamanız gerekiyor.",
      "",
    ]

    credentials.forEach((c, i) => {
      lines.push("VPN Bilgileri:")
      lines.push(`Kullanıcı Adı: ${c.vpnUsername}`)
      lines.push(`Şifre: ${c.password}`)
      lines.push("")
      lines.push("RDP Bilgileri:")
      lines.push(`Sunucu: ${c.rdpServer}`)
      lines.push(`Kullanıcı Adı: ${c.rdpUsername}`)
      lines.push(`Şifre: ${c.password}`)
      lines.push("")

      // API/Web uygulama kimlik bilgileri — Users.xml ile uyumlu
      // Username: {firmaId}_{username} (alt çizgili)
      if (iisAssignments.length > 0) {
        const apiUser = apiKullaniciAdi(firmaId, localUsers[i]?.username ?? "")
        lines.push("API / Web Uygulama Bilgileri:")
        lines.push(`Kullanıcı Adı: ${apiUser}`)
        lines.push(`Şifre: ${c.password}`)
        lines.push("")
      }

      if (i < credentials.length - 1) {
        lines.push("—")
        lines.push("")
      }
    })

    // Web (IIS) hizmet URL'leri
    if (iisAssignments.length > 0) {
      const iisHost = (iisServerDns && iisServerDns.trim()) || ""
      lines.push("Web Hizmetleri:")
      iisAssignments.forEach((s) => {
        const url = iisHost ? `http://${iisHost}:${s.port}` : `Port: ${s.port}`
        lines.push(`${s.name}: ${url}`)
      })
      lines.push("")
    }

    // SQL Veritabanı erişim bilgileri — yalnız 1. kullanıcı için login
    // oluşturulduğu için aynı bilgi global tek blok olarak yazılır.
    const firstUser = localUsers[0]
    if (sqlServerId && firstUser?.username && firstUser.password && restoredDbNames.length > 0) {
      lines.push("SQL Veritabanı Bilgileri:")
      if (sqlServer?.ip) lines.push(`Sunucu: ${sqlServer.ip}`)
      // SQL girisi NOKTALI — route'taki sqlLoginAdi ile ayni ad.
      lines.push(`Kullanıcı Adı: ${sqlLoginAdi(firmaId, firstUser.username)}`)
      lines.push(`Şifre: ${firstUser.password}`)
      lines.push("Veritabanları:")
      restoredDbNames.forEach((db) => lines.push(`  • ${db}`))
      lines.push("")
    }

    // Pars mobil uygulama — yalnız yazma adımı başarılıysa
    if (pars && parsDurum === "tamam") {
      const parsLines = parsMesajSatirlari(pars.users, pars.baglanti)
      if (parsLines.length > 0) lines.push(...parsLines, "")
    }

    lines.push("İyi çalışmalar.")

    return lines.join("\n")
  })()

  const handleCopy = async () => {
    const ok = await copyToClipboard(customerMessage)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
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
              fileName:         f.fileName,
              databaseName:     f.databaseName,
              programServiceId: f.programServiceId,
              kind:             f.kind ?? "bak",
              mdfFileName:      f.mdfFileName,
              ldfFileName:      f.ldfFileName,
              yedekAl:          f.yedekAl !== false,
            })),
          selectedDemoDbIds,
          addFirmaPrefix,
          addToSirketDb,
          pars: pars && pars.users.length > 0 ? {
            serviceId:        pars.serviceId,
            users:            pars.users.map((u) => ({ username: u.username.trim(), password: u.password, admin: u.admin })),
            allowedReportIds: pars.allowedReportIds,
          } : undefined,
        }}
        onComplete={() => {
          setCompleted(true)
          setShowManual(true)
          onConfetti()
          onComplete()
        }}
        onError={() => setHasError(true)}
        onStepError={handleStepError}
        onStep={(st) => {
          // sbm_add: eski "listeye ekle" adımı; bm_esitle: guvenlik ile eşitleme (sonra gelir, son sözü o söyler)
          if (st.stepId === "sbm_add" || st.stepId === "bm_esitle") {
            if (st.status === "done")  setSbmDurum("tamam")
            if (st.status === "error") setSbmDurum("hata")
          }
          if (st.stepId.startsWith("sql_guvenlik_") && !st.stepId.startsWith("sql_guvenlik_skip")) {
            const db = st.stepId.slice("sql_guvenlik_".length)
            if (st.status === "done")  setGuvenlikDurum((g) => ({ ...g, [db]: "tamam" }))
            if (st.status === "error") setGuvenlikDurum((g) => ({ ...g, [db]: "hata" }))
          }
          if (st.stepId === "pars_yaz") {
            if (st.status === "done")  setParsDurum("tamam")
            if (st.status === "error") setParsDurum("hata")
          }
        }}
      />

      {/* Tamamlama banner */}
      {completed && (
        <div className="rounded-[5px] border border-emerald-500/25 bg-emerald-500/15 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-emerald-500/25/60">
            <div>
              <p className="text-[11px] font-semibold text-emerald-800">{firmaId} kurulumu başarıyla tamamlandı</p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">{users.length} kullanıcı oluşturuldu</p>
            </div>
            <button onClick={onReset} className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[5px] border border-emerald-300 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 transition-colors">
              <RotateCcw className="size-3.5" />
              Yeni Firma
            </button>
          </div>

          <div className="flex items-center gap-2 px-3 py-2.5">
            <button
              onClick={() => setShowFw(true)}
              className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[5px] border border-orange-300 bg-orange-500/15 text-orange-700 dark:text-orange-400 hover:bg-orange-100 transition-colors"
            >
              <Shield className="size-3.5" />
              Firewall Adımları
              {fwDone > 0 && (
                <span className="ml-1 text-[9px] bg-orange-200 text-orange-800 px-1.5 rounded-full">{fwDone}/{fwItems.length}</span>
              )}
            </button>
            <button
              onClick={() => setShowMsg(true)}
              className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[5px] border border-blue-300 bg-blue-500/15 text-blue-700 dark:text-blue-400 hover:bg-blue-100 transition-colors"
            >
              <MessageSquare className="size-3.5" />
              Kullanıcı Mesajı
            </button>
            <button
              onClick={() => setShowManual(true)}
              className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[5px] border border-amber-300 bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 transition-colors"
            >
              <ListChecks className="size-3.5" />
              Elle Adımlar
            </button>
          </div>
        </div>
      )}

      {/* Hata banner */}
      {hasError && !completed && (
        <div className="rounded-[5px] border border-red-500/25 bg-red-500/15 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-red-800">Kurulum tamamlanamadı</p>
            <button onClick={onReset} className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-[5px] border border-red-300 text-red-700 dark:text-red-400 hover:bg-red-100 transition-colors">
              <RotateCcw className="size-3.5" />
              Baştan Başla
            </button>
          </div>
        </div>
      )}

      {/*
        Kurulum sonrası elle yapılacak adımlar.

        Sihirbaz AD, klasör, dosya ve SQL restore işlerini yapıyor ama iki şey
        onun erişemediği sistemlerde: güvenlik duvarı kuralı ve yedekleme
        yazılımlarının görev listeleri. İkisi de unutulduğunda sessizce
        sorun çıkarıyor — firma bağlanamıyor ya da yedeği hiç alınmıyor.
        Bu yüzden kurulum biter bitmez kendiliğinden açılıyor.
      */}
      <Dialog open={showManual} onOpenChange={setShowManual}>
        <DialogContent className="rounded-[10px] max-w-[480px] p-0 gap-0 overflow-hidden">
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b bg-[var(--section-bg)] p-4 text-left">
            <span className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-500/25 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
              <Check className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-semibold">{firmaId} kurulumu tamamlandı</DialogTitle>
              <DialogDescription className="text-[12px]">
                {elleSayisi > 0
                  ? `${elleSayisi} adım elle yapılmalı, gerisi otomatik.`
                  : "Elle yapılacak adım kalmadı."}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto p-4">
            {/* ── Elle yapılacaklar ── */}
            <section className="space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Elle yapılacak</p>

              {/* Güvenlik duvarı kuralı — sihirbazın erişemediği sistem */}
              <div className="rounded-[5px] border bg-card p-3" style={{ boxShadow: "var(--card-shadow)" }}>
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[5px] bg-amber-500/15 text-amber-700 dark:text-amber-400">
                    <Shield className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">Firewall kuralı</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      Firma kuralında RDP sunucusu olarak{" "}
                      <span className="font-medium text-foreground">{serverName || serverId}</span> seçilmeli.
                    </p>
                    {serverDns && (
                      <button
                        onClick={async () => {
                          if (await copyToClipboard(serverDns)) {
                            setDnsKopyalandi(true)
                            setTimeout(() => setDnsKopyalandi(false), 1500)
                          }
                        }}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-[5px] bg-muted px-2 py-1 text-[12px] text-foreground hover:bg-muted/70 transition-colors"
                      >
                        {serverDns}
                        {dnsKopyalandi
                          ? <CheckCheck className="size-3 text-emerald-600 dark:text-emerald-400" />
                          : <Copy className="size-3 text-muted-foreground" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Pars yazılamadıysa: kullanıcı mesaja girmez, elle eklenmeli */}
              {pars && parsDurum === "hata" && (
                <div className="rounded-[5px] border bg-card p-3" style={{ boxShadow: "var(--card-shadow)" }}>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[5px] bg-red-500/15 text-red-700 dark:text-red-400">
                      <AlertTriangle className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">Pars kullanıcıları eklenemedi</p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        Ayar.mdb&apos;ye yazma adımı hata verdi. Pusula Görev üzerinden elle eklenmeli:
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {pars.users.map((u) => (
                          <span key={u.id} className="inline-flex rounded-[5px] bg-muted px-2 py-0.5 text-[11px] font-medium">
                            {u.username}{u.admin ? " · admin" : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Otomatik yedek adımı başarısızsa buraya düşer — sessizce "tamam" denmez */}
              {yedekSorunu && (
                <div className="rounded-[5px] border bg-card p-3" style={{ boxShadow: "var(--card-shadow)" }}>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[5px] bg-red-500/15 text-red-700 dark:text-red-400">
                      <Database className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">Yedek kapsamı kontrol edilmeli</p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {guvenlikHatali.length > 0
                          ? `${guvenlikHatali.join(", ")} için güvenlik kaydı yazılamadı; Spare Backup bu veritabanını görmez.`
                          : "Backup Master listesi eşitlenemedi."}{" "}
                        Firma detayı → Veritabanları&apos;ndan kontrol edin.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* ── Yedekleme — SQL kurulmadıysa hiç gösterilmiyor ── */}
            {restoredDbs.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Yedekleme</p>
                  <span className="text-[11px] text-muted-foreground">{sqlServer?.name ?? "SQL sunucusu"}</span>
                </div>
                <div className="overflow-hidden rounded-[5px] border bg-card" style={{ boxShadow: "var(--card-shadow)" }}>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 border-b bg-muted/20 px-3 py-2">
                    {/*  Spare Backup guvenlik.YedekAl'ı kendisi okuyor; Backup Master
                         listesini sihirbaz eşitliyor. İkisi de otomatik.          */}
                    <YedekDurum ad="Spare Backup" durum={guvenlikHatali.length > 0 ? "hata" : "tamam"} />
                    <YedekDurum ad="SQL Backup Master" durum={sbmDurum} />
                  </div>
                  <ul className="divide-y">
                    {restoredDbs.map((db) => (
                      <li key={db.ad} className="flex items-center justify-between gap-3 px-3 py-1.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <Database className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate text-[13px] font-medium">{db.ad}</span>
                        </span>
                        {db.yedekAl
                          ? <span className="inline-flex rounded-[5px] bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Yedek alınacak</span>
                          : <span className="inline-flex rounded-[5px] bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Yedek yok</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}
          </div>

          <div className="flex items-center justify-end border-t p-4">
            <Button onClick={() => setShowManual(false)} className="min-w-28">Anladım</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Şifre yeniden deneme modal */}
      {pwRetry && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm mx-4 rounded-[8px] border border-border bg-background shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50 bg-amber-500/15">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="text-[12px] font-semibold text-amber-900">Şifre Karmaşıklık Hatası</p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
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
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400">✓ Şifre uygun, kurulum devam edebilir.</p>
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
                    ? "bg-primary text-primary-foreground hover:bg-foreground/90"
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
                  item.checked ? "border-emerald-500/25 bg-emerald-500/15" : "border-border/50 hover:bg-muted/20"
                )}
              >
                <span className={cn("size-4 rounded-[5px] border-2 flex items-center justify-center shrink-0 mt-0.5",
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
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-[5px] bg-emerald-500/15 border border-emerald-500/25 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
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
          <div className="space-y-4 max-h-[70vh] overflow-auto pr-1">
            {credentials.map((c, i) => (
              <div key={i} className="rounded-[5px] border border-border/60 overflow-hidden">
                <div className="px-3 py-2 bg-muted/20 border-b border-border">
                  <p className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
                    Kullanıcı · {c.displayName}
                  </p>
                </div>

                <div className="p-3 space-y-3">
                  {/* VPN */}
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">VPN Bilgileri</p>
                    <div className="space-y-1">
                      <CopyField label="Kullanıcı Adı" value={c.vpnUsername} />
                      <CopyField label="Şifre"         value={c.password} mono />
                    </div>
                  </div>

                  {/* RDP */}
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">RDP Bilgileri</p>
                    <div className="space-y-1">
                      <CopyField label="Sunucu"        value={c.rdpServer} />
                      <CopyField label="Kullanıcı Adı" value={c.rdpUsername} />
                      <CopyField label="Şifre"         value={c.password} mono />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {pars && pars.users.length > 0 && parsDurum === "tamam" && (
              <div className="rounded-[5px] border border-border/60 overflow-hidden">
                <div className="px-3 py-2 bg-muted/20 border-b border-border">
                  <p className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
                    Pars Mobil Uygulama
                  </p>
                </div>
                <div className="p-3 space-y-2">
                  {pars.baglanti?.adres && <CopyField label="Sunucu" value={pars.baglanti.adres} mono />}
                  {pars.users.map((u) => (
                    <div key={u.id} className="space-y-1">
                      <CopyField label="Kullanıcı Adı" value={u.username} mono />
                      <CopyField label="Şifre"         value={u.password} mono />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleCopy}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 py-2 rounded-[5px] border text-[11px] font-medium transition-colors",
                copied
                  ? "border-emerald-300 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "border-border hover:bg-muted/40 text-foreground"
              )}
            >
              {copied ? <><CheckCheck className="size-3.5" /> Tüm mesaj kopyalandı</> : <><Copy className="size-3.5" /> Tüm Mesajı Kopyala</>}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Yedek yazılımının bu kurulumdaki durumu — tek satır, nokta + ad + sonuç */
function YedekDurum({ ad, durum }: { ad: string; durum: "yok" | "tamam" | "hata" }) {
  const [renk, metin] =
    durum === "tamam" ? ["bg-emerald-500", "otomatik eklendi"]
    : durum === "hata" ? ["bg-red-500", "eklenemedi"]
    : ["bg-muted-foreground/40", "çalışmadı"]
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      <span className={cn("size-1.5 rounded-full", renk)} />
      <span className="font-medium">{ad}</span>
      <span className={durum === "hata" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>{metin}</span>
    </span>
  )
}
