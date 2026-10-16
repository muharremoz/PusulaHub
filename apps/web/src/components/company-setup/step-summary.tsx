"use client"

import { Company, BackupFile, WizardUser } from "@/lib/setup-mock-data"
import type { WizardServiceDto } from "@/app/api/services/route"
import type { SqlServerItem } from "@/app/api/setup/sql-servers/route"
import type { DemoDatabaseDto } from "@/app/api/demo-databases/route"
import { type AdServerItem } from "./step-server"
import { type RdpServerItem } from "./step-firma"
import { Building2, ClipboardList, Database, Layers, Server, Smartphone, Users, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { sqlLoginAdi } from "@/lib/firma-adlandirma"
import type { ParsWizardUser } from "@/lib/pars-katalog"

interface Props {
  adServer: AdServerItem | null
  windowsServer: RdpServerItem | null
  company: Company | null
  users: WizardUser[]
  services: WizardServiceDto[]
  selectedServiceIds: number[]
  sqlServer: SqlServerItem | null
  /** SQL sunucusu ID — apiSqlServers henüz yüklenmemişse sqlServer null olur,
   *  ama selectedSqlServerId set olur. SQL bölümünü göstermek için bu kullanılır. */
  selectedSqlServerId: string | null
  sqlMode: 0 | 1
  backupFiles: BackupFile[]
  selectedDemoDbIds: number[]
  demoDatabases: DemoDatabaseDto[]
  addFirmaPrefix: boolean
  /** Pars hizmeti seçiliyse — kullanıcılar ve seçilen rapor sayısı */
  pars?: { serviceName: string; users: ParsWizardUser[]; reportCount: number; totalReports: number } | null
}

/** Beyaz kart: başlık şeridi (ikon + başlık + sayaç) + gövde */
function Kart({ baslik, ikon, sayac, children, className }: {
  baslik: string
  ikon: React.ReactNode
  sayac?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-[5px] border bg-card", className)} style={{ boxShadow: "var(--card-shadow)" }}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/20 px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {ikon}{baslik}
        </span>
        {sayac != null && <span className="rounded-full border bg-card px-1.5 text-[10px] tabular-nums text-muted-foreground">{sayac}</span>}
      </div>
      <div className="flex-1 divide-y">{children}</div>
    </div>
  )
}

/** Etiket — değer satırı */
function Satir({ etiket, deger, alt }: { etiket: string; deger: React.ReactNode; alt?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5">
      <span className="shrink-0 text-[12px] text-muted-foreground">{etiket}</span>
      <span className="min-w-0 text-right">
        <span className="block truncate text-[13px] font-medium">{deger}</span>
        {alt && <span className="block truncate text-[11px] text-muted-foreground">{alt}</span>}
      </span>
    </div>
  )
}

function Bos({ metin }: { metin: string }) {
  return <p className="px-3 py-2 text-[12px] text-muted-foreground">{metin}</p>
}

const TUR_ROZET: Record<string, { ad: string; renk: string }> = {
  "pusula-program": { ad: "Program",   renk: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400" },
  "iis-site":       { ad: "IIS sitesi", renk: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  "iis-resim":      { ad: "Resim",      renk: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  "pars":           { ad: "Pars",       renk: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
}

export function StepSummary({
  adServer, windowsServer, company, users, services,
  selectedServiceIds, sqlServer, selectedSqlServerId, sqlMode, backupFiles,
  selectedDemoDbIds, demoDatabases, addFirmaPrefix, pars,
}: Props) {
  const firmaId = company?.firkod ?? ""
  const selectedServices = services.filter((s) => selectedServiceIds.includes(s.id))
  const selectedBackups = backupFiles.filter((f) => f.selected)
  const selectedDemos = demoDatabases.filter((d) => selectedDemoDbIds.includes(d.id))

  const hasPusula = selectedServices.some((s) => s.type === "pusula-program")
  const firmaNameSafe = (company?.firma ? `${firmaId} - ${company.firma}` : firmaId).replace(/[\\/:*?"<>|]/g, "_").trim() || firmaId

  // SQL aktif mi? — selectedSqlServerId set ise yeterli (sqlServer nesnesi henüz yüklenmemiş olabilir).
  // Sunucu seçili ama veri seçili değilse SQL adımında "İleri" kapalı; buraya o hâlde gelinmez.
  const hasSqlSelection = selectedSqlServerId !== null
  const sqlDbCount = sqlMode === 0 ? selectedBackups.length : selectedDemos.length
  const firstUser = users[0]
  const sqlLogin = firstUser?.username ? sqlLoginAdi(firmaId, firstUser.username) : null

  // Hedef veritabanları (önek uygulanmış)
  const hedefDbler = sqlMode === 0
    ? selectedBackups.map((f) => ({ id: `b${f.id}`, kaynak: f.fileName, hedef: `${addFirmaPrefix ? `${firmaId}_` : ""}${f.databaseName}`, yedek: f.yedekAl !== false }))
    : selectedDemos.map((d) => ({ id: `d${d.id}`, kaynak: d.name, hedef: `${firmaId ? `${firmaId}_` : ""}${d.dataName}`, yedek: true }))

  const operations: { grup: string; is: string }[] = [
    { grup: "AD",       is: `Firmalar\\${firmaId} OU'su oluşturulacak` },
    { grup: "AD",       is: `${firmaId}_users güvenlik grubu oluşturulacak` },
    { grup: "AD",       is: `${users.length} domain kullanıcısı oluşturulup gruba eklenecek` },
    { grup: "Depo",     is: `Depo sunucusunda D:\\Resimler\\${firmaId} klasörü açılıp gruba tam yetki verilecek` },
    { grup: "Dosyalar", is: `C:\\MUSTERI\\${firmaId} klasörü açılacak, ${selectedServiceIds.length} hizmet klasörü kopyalanacak` },
    { grup: "Dosyalar", is: `Parametre dosyaları güncellenecek (DATA KODU → ${firmaId})` },
    { grup: "Dosyalar", is: "NTFS yetkileri (Full Control) uygulanacak" },
    ...(hasPusula ? [
      { grup: "Masaüstü", is: `MUSTERILER\\${firmaNameSafe} klasörü, Pusula exe ve Resimler kısayolları oluşturulacak` },
    ] : []),
    ...(hasSqlSelection && sqlDbCount > 0 ? [
      { grup: "SQL", is: sqlMode === 0 ? `${sqlDbCount} veritabanı yedekten kurulacak` : `${sqlDbCount} demo veritabanı oluşturulacak` },
      ...(sqlLogin ? [
        { grup: "SQL", is: `SQL girişi oluşturulacak: ${sqlLogin} (yalnız kendi veritabanlarını görür)` },
        { grup: "SQL", is: `${sqlDbCount} veritabanının sahibi ${sqlLogin} yapılacak` },
      ] : []),
    ] : []),
    ...(pars ? [
      { grup: "Pars", is: `Ayar.mdb'ye ${pars.users.length} kullanıcı yazılacak (${pars.reportCount} rapor açık, diğerleri yasaklı)` },
      { grup: "Pars", is: sqlDbCount > 0
          ? `${sqlDbCount} veritabanı Datalar tablosuna bağlanacak`
          : "Veritabanı seçilmediği için Datalar bağlantısı yapılmayacak — kullanıcı rapor göremez" },
    ] : []),
  ]

  const kpiler = [
    { ad: "Kullanıcı",  deger: users.length,           ikon: Users },
    { ad: "Hizmet",     deger: selectedServices.length, ikon: Layers },
    { ad: "Veritabanı", deger: hasSqlSelection ? sqlDbCount : 0, ikon: Database },
    ...(pars ? [{ ad: "Pars kullanıcısı", deger: pars.users.length, ikon: Smartphone }] : []),
  ]

  return (
    <div className="space-y-4">

      {/* Firma şeridi + sayılar */}
      <div className="rounded-[8px] bg-[var(--section-bg)] p-2">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
            <Building2 className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{firmaId}{company?.firma ? ` · ${company.firma}` : ""}</p>
            <p className="truncate text-[12px] text-muted-foreground">
              {[company?.city, adServer?.domain, windowsServer?.name].filter(Boolean).join(" · ") || "Kurulum özeti"}
            </p>
          </div>
        </div>
        <div className={cn("mt-2 grid gap-2", kpiler.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
          {kpiler.map((k) => (
            <div key={k.ad} className="rounded-[5px] bg-card px-3 py-2" style={{ boxShadow: "var(--card-shadow)" }}>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><k.ikon className="size-3" />{k.ad}</p>
              <p className="text-2xl font-bold tabular-nums">{k.deger}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Sunucular */}
        <Kart baslik="Sunucular" ikon={<Server className="size-3" />}>
          <Satir etiket="Active Directory" deger={adServer?.name ?? "—"} alt={adServer?.domain || undefined} />
          <Satir etiket="Bağlantı sunucusu" deger={windowsServer?.name ?? "—"} alt={windowsServer?.dns || undefined} />
          <Satir
            etiket="SQL sunucusu"
            deger={hasSqlSelection ? (sqlServer?.name ?? "Yükleniyor…") : "Kurulmayacak"}
            alt={hasSqlSelection && sqlServer ? `${sqlServer.ip}:${sqlServer.port}` : undefined}
          />
        </Kart>

        {/* Kullanıcılar */}
        <Kart baslik="Kullanıcılar" ikon={<Users className="size-3" />} sayac={users.length}>
          {users.length === 0 ? <Bos metin="Kullanıcı eklenmeyecek." /> : users.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="truncate text-[13px] font-medium">{firmaId}.{u.username || "—"}</span>
              <span className="truncate text-[12px] text-muted-foreground">{u.displayName || "—"}</span>
            </div>
          ))}
        </Kart>

        {/* Hizmetler */}
        <Kart baslik="Hizmetler" ikon={<Layers className="size-3" />} sayac={selectedServices.length}>
          {selectedServices.length === 0 ? <Bos metin="Hizmet seçilmedi." /> : selectedServices.map((s) => {
            const tur = TUR_ROZET[s.type] ?? { ad: s.category, renk: "bg-muted text-muted-foreground" }
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="truncate text-[13px] font-medium">{s.name}</span>
                <span className={cn("inline-flex shrink-0 rounded-[5px] px-2 py-0.5 text-[11px] font-medium", tur.renk)}>{tur.ad}</span>
              </div>
            )
          })}
        </Kart>

        {/* Veritabanları */}
        <Kart
          baslik="Veritabanları"
          ikon={<Database className="size-3" />}
          sayac={hasSqlSelection ? sqlDbCount : undefined}
        >
          {!hasSqlSelection ? <Bos metin="SQL adımı seçilmedi, veritabanı kurulmayacak." /> : (
            <>
              <Satir etiket="Kaynak" deger={sqlMode === 0 ? "Yedekten yükle" : "Demo veritabanı"} />
              {sqlLogin && <Satir etiket="SQL girişi" deger={sqlLogin} />}
              {hedefDbler.map((d) => (
                <div key={d.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground" title={d.kaynak}>{d.kaynak}</span>
                  <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-right text-[13px] font-medium" title={d.hedef}>{d.hedef}</span>
                  <span className={cn("inline-flex shrink-0 rounded-[5px] px-2 py-0.5 text-[11px] font-medium",
                    d.yedek ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                    {d.yedek ? "Yedek" : "Yedeksiz"}
                  </span>
                </div>
              ))}
            </>
          )}
        </Kart>

        {/* Pars */}
        {pars && (
          <Kart
            baslik="Pars"
            ikon={<Smartphone className="size-3" />}
            sayac={`${pars.reportCount}/${pars.totalReports} rapor`}
            className="lg:col-span-2"
          >
            {pars.users.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="truncate text-[13px] font-medium">{u.username || "—"}</span>
                <span className={cn("inline-flex shrink-0 rounded-[5px] px-2 py-0.5 text-[11px] font-medium",
                  u.admin ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground")}>
                  {u.admin ? "Admin" : "Kullanıcı"}
                </span>
              </div>
            ))}
          </Kart>
        )}
      </div>

      {/* Yapılacak işlemler — numaralı */}
      <Kart baslik="Yapılacak işlemler" ikon={<ClipboardList className="size-3" />} sayac={operations.length}>
        <ol className="divide-y">
          {operations.map((op, i) => (
            <li key={i} className="flex items-start gap-3 px-3 py-1.5">
              <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 text-[13px]">{op.is}</span>
              <span className="inline-flex shrink-0 rounded-[5px] bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{op.grup}</span>
            </li>
          ))}
        </ol>
      </Kart>
    </div>
  )
}
