"use client"

import { useState, useEffect } from "react"
import { WizardUser, BackupFile } from "@/lib/setup-mock-data"
import type { WizardServiceDto } from "@/app/api/services/route"
import type { SqlServerItem } from "@/app/api/setup/sql-servers/route"
import type { DemoDatabaseDto } from "@/app/api/demo-databases/route"
import type { CompanyServiceDto } from "@/app/api/companies/[firkod]/services/route"
import { Check, RotateCcw, Shield, MessageSquare, Copy, CheckCheck, KeyRound, Eye, EyeOff, AlertTriangle, Database, ListChecks, PartyPopper } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Checkbox, Field } from "@/components/shared/form"
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

/** Tek satır: etiket + değer + kopyala */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    const ok = await copyToClipboard(value)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="w-[96px] shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={value}>{value}</span>
      <button
        type="button"
        onClick={handle}
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium transition-colors",
          copied ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        title="Kopyala"
      >
        {copied ? <><CheckCheck className="size-3" /> Kopyalandı</> : <Copy className="size-3" />}
      </button>
    </div>
  )
}

/** Sihirbaz sonu pencereleri — Sheet standardıyla aynı başlık şeridi (ikon rozeti + başlık + açıklama) */
function Pencere({ open, onOpenChange, ikon, ikonRenk, baslik, aciklama, genislik = "max-w-[480px]", kapatilamaz, children, alt }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  ikon: React.ReactNode
  ikonRenk?: string
  baslik: string
  aciklama?: React.ReactNode
  genislik?: string
  /** true → dışarı tıklama / Esc ile kapanmaz (karar bekleyen pencere) */
  kapatilamaz?: boolean
  children: React.ReactNode
  alt?: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("gap-0 overflow-hidden rounded-[10px] p-0", genislik)}
        onInteractOutside={kapatilamaz ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={kapatilamaz ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b bg-[var(--section-bg)] p-4 text-left">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1", ikonRenk ?? "bg-primary/10 text-primary ring-primary/20")}>
            {ikon}
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-[15px] font-semibold">{baslik}</DialogTitle>
            {aciklama && <DialogDescription className="text-[12px]">{aciklama}</DialogDescription>}
          </div>
        </DialogHeader>
        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto p-4">{children}</div>
        {alt && <div className="flex items-center justify-end gap-2 border-t p-4">{alt}</div>}
      </DialogContent>
    </Dialog>
  )
}

/** Bölüm başlığı (pencere içi) */
function Bolum({ baslik, sag, children }: { baslik: string; sag?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{baslik}</p>
        {sag && <span className="truncate text-[11px] text-muted-foreground">{sag}</span>}
      </div>
      {children}
    </section>
  )
}

/** Beyaz kart (pencere içi) */
function Kart({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-[5px] border bg-card", className)} style={{ boxShadow: "var(--card-shadow)" }}>{children}</div>
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
  const [sbmDurum, setSbmDurum] = useState<"yok" | "tamam" | "sonra" | "hata">("yok")
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
            // Yedek işi sürüyorsa servise dokunulmaz, saatlik eşitleme ekler (lib/bm-zamanli.ts)
            if (st.status === "done")  setSbmDurum(/sürüyor|atlandı/i.test(st.label) ? "sonra" : "tamam")
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

      {/* Sonuç kartı — tamamlandı */}
      {completed && (
        <div className="rounded-[8px] bg-[var(--section-bg)] p-2">
          <div className="rounded-[5px] bg-card p-3" style={{ boxShadow: "var(--card-shadow)" }}>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[5px] bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-400">
                <PartyPopper className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{firmaId} · {firmaName}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {[
                    users.length > 0 ? `${users.length} kullanıcı` : null,
                    services.length > 0 ? `${services.length} hizmet` : null,
                    restoredDbs.length > 0 ? `${restoredDbs.length} veritabanı` : null,
                  ].filter(Boolean).join(" · ") || "Kurulum tamamlandı"}
                </p>
              </div>
              <Button size="sm" onClick={onReset}>
                <RotateCcw className="size-3.5" />
                Yeni Firma
              </Button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <SonucDugmesi
                ikon={<ListChecks className="size-4" />}
                renk="bg-amber-500/15 text-amber-700 dark:text-amber-400"
                baslik="Elle yapılacaklar"
                alt={elleSayisi > 0 ? `${elleSayisi} adım bekliyor` : "Bekleyen yok"}
                onClick={() => setShowManual(true)}
              />
              <SonucDugmesi
                ikon={<Shield className="size-4" />}
                renk="bg-orange-500/15 text-orange-700 dark:text-orange-400"
                baslik="Firewall ve VPN"
                alt={`${fwDone} / ${fwItems.length} adım işaretlendi`}
                onClick={() => setShowFw(true)}
              />
              <SonucDugmesi
                ikon={<MessageSquare className="size-4" />}
                renk="bg-sky-500/15 text-sky-700 dark:text-sky-400"
                baslik="Müşteri mesajı"
                alt="Erişim bilgilerini kopyala"
                onClick={() => setShowMsg(true)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Sonuç kartı — hata */}
      {hasError && !completed && (
        <div className="rounded-[8px] bg-[var(--section-bg)] p-2">
          <div className="flex items-center gap-3 rounded-[5px] bg-card p-3" style={{ boxShadow: "var(--card-shadow)" }}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[5px] bg-red-500/15 text-red-700 ring-1 ring-red-500/25 dark:text-red-400">
              <AlertTriangle className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">Kurulum tamamlanamadı</p>
              <p className="truncate text-[12px] text-muted-foreground">Hatalı adımın ayrıntısı yukarıdaki listede. Düzeltip baştan başlatın.</p>
            </div>
            <Button size="sm" variant="outline" onClick={onReset}>
              <RotateCcw className="size-3.5" />
              Baştan Başla
            </Button>
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
      <Pencere
        open={showManual}
        onOpenChange={setShowManual}
        ikon={<Check className="size-[18px]" />}
        ikonRenk="bg-emerald-500/15 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400"
        baslik={`${firmaId} kurulumu tamamlandı`}
        aciklama={elleSayisi > 0 ? `${elleSayisi} adım elle yapılmalı, gerisi otomatik.` : "Elle yapılacak adım kalmadı."}
        alt={<Button onClick={() => setShowManual(false)} className="min-w-28">Anladım</Button>}
      >
        <Bolum baslik="Elle yapılacak">
          {/* Güvenlik duvarı kuralı — sihirbazın erişemediği sistem */}
          <ElleKart ikon={<Shield className="size-3.5" />} renk="bg-amber-500/15 text-amber-700 dark:text-amber-400" baslik="Firewall kuralı">
            Firma kuralında RDP sunucusu olarak{" "}
            <span className="font-medium text-foreground">{serverName || serverId}</span> seçilmeli.
            {serverDns && (
              <span className="mt-2 block">
                <button
                  onClick={async () => {
                    if (await copyToClipboard(serverDns)) {
                      setDnsKopyalandi(true)
                      setTimeout(() => setDnsKopyalandi(false), 1500)
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-[5px] bg-muted px-2 py-1 text-[12px] text-foreground transition-colors hover:bg-muted/70"
                >
                  {serverDns}
                  {dnsKopyalandi
                    ? <CheckCheck className="size-3 text-emerald-600 dark:text-emerald-400" />
                    : <Copy className="size-3 text-muted-foreground" />}
                </button>
              </span>
            )}
          </ElleKart>

          {/* Pars yazılamadıysa: kullanıcı mesaja girmez, elle eklenmeli */}
          {pars && parsDurum === "hata" && (
            <ElleKart ikon={<AlertTriangle className="size-3.5" />} renk="bg-red-500/15 text-red-700 dark:text-red-400" baslik="Pars kullanıcıları eklenemedi">
              Ayar.mdb&apos;ye yazma adımı hata verdi. Pusula Görev üzerinden elle eklenmeli:
              <span className="mt-2 flex flex-wrap gap-1.5">
                {pars.users.map((u) => (
                  <span key={u.id} className="inline-flex rounded-[5px] bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                    {u.username}{u.admin ? " · admin" : ""}
                  </span>
                ))}
              </span>
            </ElleKart>
          )}

          {/* Otomatik yedek adımı başarısızsa buraya düşer — sessizce "tamam" denmez */}
          {yedekSorunu && (
            <ElleKart ikon={<Database className="size-3.5" />} renk="bg-red-500/15 text-red-700 dark:text-red-400" baslik="Yedek kapsamı kontrol edilmeli">
              {guvenlikHatali.length > 0
                ? `${guvenlikHatali.join(", ")} için güvenlik kaydı yazılamadı; Spare Backup bu veritabanını görmez.`
                : "Backup Master listesi eşitlenemedi."}{" "}
              Firma detayı → Veritabanları&apos;ndan kontrol edin.
            </ElleKart>
          )}
        </Bolum>

        {/* Yedekleme — SQL kurulmadıysa hiç gösterilmiyor */}
        {restoredDbs.length > 0 && (
          <Bolum baslik="Yedekleme" sag={sqlServer?.name ?? "SQL sunucusu"}>
            <Kart>
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
            </Kart>
          </Bolum>
        )}
      </Pencere>

      {/* Şifre yeniden deneme — karar bekler, dışarı tıklayınca kapanmaz */}
      <Pencere
        open={!!pwRetry}
        onOpenChange={(v) => { if (!v) setPwRetry(null) }}
        kapatilamaz
        ikon={<KeyRound className="size-[18px]" />}
        ikonRenk="bg-amber-500/15 text-amber-700 ring-amber-500/25 dark:text-amber-400"
        baslik="Şifre karmaşıklık hatası"
        aciklama={pwRetry ? <><span className="font-medium text-foreground">{pwRetry.fullUsername}</span> için şifre AD kuralını karşılamıyor.</> : null}
        genislik="max-w-[420px]"
        alt={<>
          <Button variant="outline" className="flex-1" onClick={() => { setPwRetry(null); onReset() }}>Baştan Başla</Button>
          <Button className="flex-1" onClick={handlePwRetrySubmit} disabled={!meetsAdComplexity(newPw)}>
            <KeyRound className="size-3.5" />
            Yeniden Dene
          </Button>
        </>}
      >
        <p className="text-[12px] text-muted-foreground">
          En az 7 karakter; büyük/küçük harf ve rakam ya da özel karakter içermeli.
        </p>
        <Field label="Yeni şifre" required>
          <div className="relative">
            <Input
              type={showNewPw ? "text" : "password"}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePwRetrySubmit()}
              autoFocus
              className={cn(
                "pr-8",
                newPw && !meetsAdComplexity(newPw) && "border-red-500/60",
                newPw && meetsAdComplexity(newPw) && "border-emerald-500/60",
              )}
            />
            <button
              type="button"
              onClick={() => setShowNewPw((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              title={showNewPw ? "Gizle" : "Göster"}
            >
              {showNewPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
          {newPw && (
            meetsAdComplexity(newPw)
              ? <p className="text-[12px] text-emerald-700 dark:text-emerald-400">Şifre uygun, kurulum devam edebilir.</p>
              : <p className="text-[12px] text-red-700 dark:text-red-400">AD karmaşıklık kuralı karşılanmıyor.</p>
          )}
        </Field>
      </Pencere>

      {/* Firewall ve VPN adımları — FortiGate'te elle, burada işaretlenir */}
      <Pencere
        open={showFw}
        onOpenChange={setShowFw}
        ikon={<Shield className="size-[18px]" />}
        ikonRenk="bg-orange-500/15 text-orange-700 ring-orange-500/25 dark:text-orange-400"
        baslik="Firewall ve VPN adımları"
        aciklama={fwDone === fwItems.length ? "Tüm adımlar tamamlandı." : `${fwDone} / ${fwItems.length} adım işaretlendi`}
        alt={<Button onClick={() => setShowFw(false)} className="min-w-28">Kapat</Button>}
      >
        <Kart>
          <ul className="divide-y">
            {fwItems.map((item, idx) => {
              const degistir = () => setFwItems((prev) => prev.map((f, i) => i === idx ? { ...f, checked: !f.checked } : f))
              return (
                <li key={idx}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/20">
                    <Checkbox checked={item.checked} onCheckedChange={degistir} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">
                        <span className={cn(item.checked && "text-muted-foreground line-through")}>{item.title}</span>
                        {item.optional && <span className="ml-1.5 inline-flex rounded-[5px] bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">opsiyonel</span>}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted-foreground">{item.description}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </Kart>
      </Pencere>

      {/* Müşteri bilgilendirme mesajı */}
      <Pencere
        open={showMsg}
        onOpenChange={setShowMsg}
        ikon={<MessageSquare className="size-[18px]" />}
        ikonRenk="bg-sky-500/15 text-sky-700 ring-sky-500/25 dark:text-sky-400"
        baslik="Müşteri bilgilendirme mesajı"
        aciklama="Alanları tek tek ya da mesajın tamamını kopyalayın."
        genislik="max-w-[520px]"
        alt={<>
          <Button variant="outline" className="flex-1" onClick={() => setShowMsg(false)}>Kapat</Button>
          <Button className="flex-1" onClick={handleCopy}>
            {copied ? <><CheckCheck className="size-3.5" /> Kopyalandı</> : <><Copy className="size-3.5" /> Tüm Mesajı Kopyala</>}
          </Button>
        </>}
      >
        {credentials.map((c, i) => (
          <Bolum key={i} baslik={`Kullanıcı · ${c.displayName}`}>
            <Kart>
              <p className="border-b bg-muted/20 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">VPN</p>
              <div className="divide-y">
                <CopyField label="Kullanıcı adı" value={c.vpnUsername} />
                <CopyField label="Şifre"         value={c.password} />
              </div>
              <p className="border-y bg-muted/20 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Uzak masaüstü (RDP)</p>
              <div className="divide-y">
                <CopyField label="Sunucu"        value={c.rdpServer} />
                <CopyField label="Kullanıcı adı" value={c.rdpUsername} />
                <CopyField label="Şifre"         value={c.password} />
              </div>
            </Kart>
          </Bolum>
        ))}

        {pars && pars.users.length > 0 && parsDurum === "tamam" && (
          <Bolum baslik="Pars mobil uygulama">
            <Kart>
              <div className="divide-y">
                {pars.baglanti?.adres && <CopyField label="Sunucu" value={pars.baglanti.adres} />}
                {pars.users.map((u) => (
                  <div key={u.id} className="divide-y">
                    <CopyField label="Kullanıcı adı" value={u.username} />
                    <CopyField label="Şifre"         value={u.password} />
                  </div>
                ))}
              </div>
            </Kart>
          </Bolum>
        )}
      </Pencere>
    </div>
  )
}

/** Sonuç kartındaki büyük aksiyon düğmesi — ikon rozeti + başlık + alt satır */
function SonucDugmesi({ ikon, renk, baslik, alt, onClick }: { ikon: React.ReactNode; renk: string; baslik: string; alt: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-[5px] border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/20"
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-[5px]", renk)}>{ikon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{baslik}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{alt}</span>
      </span>
    </button>
  )
}

/** "Elle yapılacak" penceresindeki tek iş kartı */
function ElleKart({ ikon, renk, baslik, children }: { ikon: React.ReactNode; renk: string; baslik: string; children: React.ReactNode }) {
  return (
    <Kart className="p-3">
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[5px]", renk)}>{ikon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">{baslik}</p>
          <div className="mt-0.5 text-[12px] text-muted-foreground">{children}</div>
        </div>
      </div>
    </Kart>
  )
}

/** Yedek yazılımının bu kurulumdaki durumu — tek satır, nokta + ad + sonuç */
function YedekDurum({ ad, durum }: { ad: string; durum: "yok" | "tamam" | "sonra" | "hata" }) {
  const [renk, metin] =
    durum === "tamam" ? ["bg-emerald-500", "otomatik eklendi"]
    : durum === "sonra" ? ["bg-amber-500", "yedek işi sürüyordu — saatlik eşitlemede eklenecek"]
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
