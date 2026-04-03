"use client"

import { AdServer, WindowsServer, Company, ServiceItem, SqlServer, BackupFile, DemoDatabase, WizardUser } from "@/lib/setup-mock-data"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  adServer: AdServer | null
  windowsServer: WindowsServer | null
  company: Company | null
  users: WizardUser[]
  services: ServiceItem[]
  selectedServiceIds: number[]
  sqlServer: SqlServer | null
  sqlMode: 0 | 1
  backupFiles: BackupFile[]
  selectedDemoDbIds: number[]
  demoDatabases: DemoDatabase[]
  addFirmaPrefix: boolean
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[5px] border border-border/50 overflow-hidden">
      <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
        <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">{title}</p>
      </div>
      <div className="divide-y divide-border/40">{children}</div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("text-[11px] font-medium", mono && "font-mono")}>{value}</span>
    </div>
  )
}

export function StepSummary({
  adServer, windowsServer, company, users, services,
  selectedServiceIds, sqlServer, sqlMode, backupFiles,
  selectedDemoDbIds, demoDatabases, addFirmaPrefix,
}: Props) {
  const firmaId = company?.firkod ?? ""
  const selectedServices = services.filter((s) => selectedServiceIds.includes(s.id))
  const selectedBackups = backupFiles.filter((f) => f.selected)
  const selectedDemos = demoDatabases.filter((d) => selectedDemoDbIds.includes(d.id))

  const operations = [
    `AD'de Firmalar\\${firmaId} OU oluşturulacak`,
    `OU içinde ${firmaId}_users güvenlik grubu oluşturulacak`,
    `${users.length} domain kullanıcısı oluşturulup gruba eklenecek`,
    `C:\\Pusula\\MUSTERI\\${firmaId} klasörü açılacak`,
    `${selectedServiceIds.length} hizmet klasörü kopyalanacak`,
    `Parametre dosyaları güncellenecek ([DATA KODU] → ${firmaId})`,
    `NTFS yetkileri (Full Control) uygulanacak`,
    ...(sqlServer
      ? sqlMode === 0
        ? [`${selectedBackups.length} veritabanı restore edilecek`]
        : [`${selectedDemos.length} demo veritabanı oluşturulacak`]
      : []),
  ]

  return (
    <div className="space-y-3">

      {/* Sunucu + Firma yan yana */}
      <div className="grid grid-cols-2 gap-3">
        <Section title="Sunucu">
          <Row label="AD Sunucusu" value={adServer?.name ?? "—"} mono />
          <Row label="Bağlantı Sunucusu" value={windowsServer?.name ?? "—"} mono />
        </Section>

        <Section title="Firma">
          <Row label="Firma Kodu" value={firmaId} mono />
          <Row label="Firma Adı" value={company?.firma ?? "—"} />
          <Row label="Şehir" value={company?.city ?? "—"} />
        </Section>
      </div>

      {/* Kullanıcılar */}
      <Section title={`Kullanıcılar — ${users.length} adet`}>
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between px-3 py-2">
            <span className="text-[11px] font-mono">{firmaId}.{u.username || "—"}</span>
            <span className="text-[11px] text-muted-foreground">{u.displayName || "—"}</span>
          </div>
        ))}
      </Section>

      {/* Hizmetler */}
      <Section title={`Hizmetler — ${selectedServiceIds.length} adet`}>
        {selectedServices.length === 0 ? (
          <div className="px-3 py-2">
            <span className="text-[11px] text-muted-foreground">Hizmet seçilmedi</span>
          </div>
        ) : selectedServices.map((s) => (
          <div key={s.id} className="flex items-center justify-between px-3 py-2">
            <span className="text-[11px] font-medium">{s.name}</span>
            <span className="text-[10px] text-muted-foreground">{s.category}</span>
          </div>
        ))}
      </Section>

      {/* SQL */}
      {sqlServer && (
        <Section title="SQL Veritabanı">
          <Row label="SQL Sunucusu" value={sqlServer.name} mono />
          <Row label="Mod" value={sqlMode === 0 ? "Yedekten Yükle" : "Demo Veritabanı"} />
          {sqlMode === 0 && selectedBackups.map((f) => (
            <div key={f.id} className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] font-mono truncate">{f.fileName}</span>
              <span className="text-[11px] text-muted-foreground font-mono ml-4 shrink-0">
                → {addFirmaPrefix ? `${firmaId}_` : ""}{f.databaseName}
              </span>
            </div>
          ))}
          {sqlMode === 1 && selectedDemos.map((d) => (
            <div key={d.id} className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] font-medium">{d.name}</span>
              <span className="text-[11px] text-muted-foreground font-mono">
                → {firmaId ? `${firmaId}_` : ""}{d.dataName}
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* Yapılacak işlemler */}
      <Section title="Yapılacak İşlemler">
        {operations.map((op, i) => (
          <div key={i} className="flex items-start gap-2.5 px-3 py-2">
            <span className="size-4 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="size-2.5 text-emerald-700" strokeWidth={3} />
            </span>
            <span className="text-[11px] text-muted-foreground">{op}</span>
          </div>
        ))}
      </Section>

    </div>
  )
}
