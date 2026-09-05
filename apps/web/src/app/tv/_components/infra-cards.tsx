"use client"

/**
 * Altyapı kartları — fiziksel sunucu, disk doluluğu ve imaj yedekleri.
 *
 * Sağ şeritteki üç karta (trafik / çevrimdışı firma / domain) eklenir.
 * Renk hiyerarşisi oradan devralındı ve bilerek korundu:
 *   beyaz   → normal değer
 *   kehribar→ dikkat, arıza değil
 *   kırmızı → kritik
 * Yeşil kullanılmıyor; bu sayfada yeşil "monitör ayakta" demek.
 *
 * ── Neden bu üç kart? ──────────────────────────────────────────────────
 * Üçü de "sessizce bozulan" şeyler: güç kaynağı aylarca arızalı kalabilir,
 * disk yavaşça dolar, bir sanal makine yedek işine hiç eklenmemiş olabilir.
 * Hiçbiri alarm üretmez, o yüzden ekranda sürekli göz önünde duruyorlar.
 *
 * Kartlar tıklamaları geçirir (`pointer-events-none`): altındaki boşluğa
 * tıklayınca genel görünüme dönmeyi engellemesinler.
 */

import type { BackupRun, BackupStorage, EsxiHost, EsxiVmBackup, SensorHealth } from "./use-esxi"

/**
 * Disk kartının ihtiyaç duyduğu asgari sunucu şekli. `@/types`'taki tam
 * `Server` yerine bu kullanılıyor: kart yalnız ad ve diskle ilgileniyor,
 * o tipe bağlanmak gereksiz bir bağ olurdu.
 */
export interface DiskCardServer {
  id:   string
  name: string
  disk: number
  disks?: { drive: string; totalGB: number; usedGB: number; percent: number }[]
}

const TXT     = "#D4D4D8"
const TXT_DIM = "#8B8B93"
const AMBER   = "#FBBF24"
const RED     = "#F87171"
const FLOW    = "#7DD3FC"

/** Disk/bellek doluluk eşikleri — üstünde renk değişir */
const WARN_PCT = 80
const CRIT_PCT = 90

/* ══════════════════════════════════════════════════════════
   Ortak parçalar (sağ şeritle aynı görünüm)
══════════════════════════════════════════════════════════ */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[12px]"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="px-5 py-3.5">{children}</div>
    </div>
  )
}

function Title({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div
        className="text-[9px] font-medium uppercase"
        style={{ color: TXT_DIM, letterSpacing: "0.26em" }}
      >
        {children}
      </div>
      {accent && (
        <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: accent }}>
          ●
        </span>
      )}
    </div>
  )
}

/** İnce doluluk çubuğu — yüzdeye göre renklenir */
function Bar({ percent, color }: { percent: number; color: string }) {
  const w = Math.max(0, Math.min(100, percent))
  return (
    <div
      className="mt-1 h-[3px] w-full overflow-hidden rounded-full"
      style={{ background: "rgba(255,255,255,0.10)" }}
    >
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  )
}

/** Ad + değer + altında çubuk */
function Meter({ name, value, percent }: { name: string; value: string; percent: number }) {
  const color = pctColor(percent)
  return (
    <div className="py-[3px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: TXT }}>{name}</span>
        <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums" style={{ color }}>
          {value}
        </span>
      </div>
      <Bar percent={percent} color={color} />
    </div>
  )
}

function Row({ name, value, color = TXT }: { name: string; value: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[3px]">
      <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: TXT }}>{name}</span>
      <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="my-2.5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }} />
}

/* ══════════════════════════════════════════════════════════
   Biçimlendirme
══════════════════════════════════════════════════════════ */

function pctColor(p: number): string {
  if (p >= CRIT_PCT) return RED
  if (p >= WARN_PCT) return AMBER
  return TXT
}

function healthColor(h: SensorHealth): string {
  if (h === "red")    return RED
  if (h === "yellow") return AMBER
  if (h === "green")  return TXT
  return TXT_DIM
}

/** Saniye → "290g 16s" */
function formatUptime(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "—"
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  if (d > 0) return `${d}g ${h}s`
  const m = Math.floor((sec % 3600) / 60)
  return `${h}s ${m}d`
}

/** GB → 1000 üstü TB */
function formatGB(gb: number): string {
  if (!isFinite(gb)) return "—"
  if (gb >= 1000) return `${(gb / 1000).toFixed(2)} TB`
  return `${Math.round(gb)} GB`
}

/* ══════════════════════════════════════════════════════════
   Fiziksel sunucu
══════════════════════════════════════════════════════════ */

export function PhysicalHostCard({ host }: { host: EsxiHost }) {
  const cpuPct = host.cpuTotalMhz ? Math.round((host.cpuUsedMhz / host.cpuTotalMhz) * 100) : 0
  const ramPct = host.ramTotalGB  ? Math.round((host.ramUsedGB / host.ramTotalGB) * 100)   : 0

  return (
    <Card>
      <Title accent={host.overallHealth !== "green" ? healthColor(host.overallHealth) : undefined}>
        Fiziksel Sunucu
      </Title>

      <div className="mt-2 truncate text-[12px] font-semibold" style={{ color: TXT }}>
        {host.model}
      </div>
      <div className="truncate text-[10px]" style={{ color: TXT_DIM }}>
        {host.cpuCores} çekirdek · {host.cpuThreads} iş parçacığı · {formatGB(host.ramTotalGB)}
      </div>

      <Divider />

      <Meter
        name="İşlemci"
        value={`${cpuPct}%`}
        percent={cpuPct}
      />
      <Meter
        name="Bellek"
        value={`${host.ramUsedGB.toFixed(0)} / ${host.ramTotalGB.toFixed(0)} GB`}
        percent={ramPct}
      />

      <Divider />

      {host.powerSupplies.length > 0 ? (
        host.powerSupplies.map((ps) => (
          <Row
            key={ps.index}
            name={`Güç kaynağı ${ps.index}`}
            /*  ESXi'nin API'si arıza SEBEBİNİ vermiyor, yalnız "kritik"
             *  diyor. Sebep watt değerinden çıkarılıyor: giriş 0 ise
             *  kaynağa şehir elektriği gelmiyor demektir (kablo, priz ya
             *  da ölü kaynak) — "arıza" demekten çok daha yol gösterici. */
            value={
              ps.health === "red" || ps.health === "yellow"
                ? (ps.inputWatts === 0 ? "AC girişi yok" : "arıza")
                : ps.inputWatts !== null ? `${Math.round(ps.inputWatts)} W` : "normal"
            }
            color={healthColor(ps.health)}
          />
        ))
      ) : (
        <Row name="Güç kaynağı" value="veri yok" color={TXT_DIM} />
      )}

      <Row name="Çalışma süresi" value={formatUptime(host.uptimeSeconds)} color={TXT_DIM} />
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════
   Disk doluluğu — veri deposu + sunucular
══════════════════════════════════════════════════════════ */

/** Kaç sunucu satırı gösterilir — en dolular önce */
const MAX_DISK_ROWS = 6

export function DiskCard({
  host, servers, backupStorage,
}: {
  host: EsxiHost | null
  servers: DiskCardServer[]
  /** Musteri yedeklerinin yazildigi SFTP sunucusu — dolarsa yedek durur */
  backupStorage: BackupStorage | null
}) {
  /*  Her diski ayrı satır yapıp en dolulara göre sıralıyoruz: ekranda yer
   *  sınırlı, dolmak üzere olan disk her zaman görünsün.                 */
  const rows = servers
    .flatMap((s) =>
      (s.disks?.length
        ? s.disks.map((d) => ({
            key:     `${s.id}-${d.drive}`,
            /*  Tek diskli sunucuda sürücü harfi gürültü; iki diskliyse şart. */
            name:    (s.disks?.length ?? 0) > 1 ? `${s.name} ${d.drive.replace(/[:\\]/g, "")}` : s.name,
            percent: d.percent,
            value:   `${Math.round(d.usedGB)} / ${Math.round(d.totalGB)} GB`,
          }))
        : s.disk > 0
          ? [{ key: s.id, name: s.name, percent: s.disk, value: `%${s.disk}` }]
          : []),
    )
    .sort((a, b) => b.percent - a.percent)
    .slice(0, MAX_DISK_ROWS)

  const ds = host?.datastores.filter((d) => d.capacityGB > 50) ?? []

  return (
    <Card>
      <Title>Disk Doluluğu</Title>

      {ds.map((d) => (
        <Meter
          key={d.name}
          name={d.name}
          value={`${formatGB(d.freeGB)} boş`}
          percent={d.percent}
        />
      ))}

      {/*  Yedek deposu once geliyor: dolarsa musteri yedekleri durur,
           sanal makine disklerinden daha kritik.                       */}
      {backupStorage && (
        <Meter
          name="Yedek deposu"
          value={`${formatGB(backupStorage.freeGB)} boş`}
          percent={backupStorage.percent}
        />
      )}

      {(ds.length > 0 || backupStorage) && rows.length > 0 && <Divider />}

      {rows.length > 0 ? (
        rows.map((r) => <Meter key={r.key} name={r.name} value={r.value} percent={r.percent} />)
      ) : (
        <div className="py-1 font-mono text-[10px] uppercase" style={{ color: TXT_DIM, letterSpacing: "0.14em" }}>
          veri yok
        </div>
      )}
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════
   İmaj yedekleri
══════════════════════════════════════════════════════════ */

/*  `now` YOK: turlar sunucuda, sunucunun saatiyle hesaplaniyor
 *  (bkz. computeTodayRuns).                                            */
export function BackupImageCard({
  backups, runs, vmsInJob,
}: {
  backups: EsxiVmBackup[]
  runs: BackupRun[] | null
  vmsInJob: number
}) {
  const kisaAd = (s: string) => s.replace(/\s*\(.*?\)\s*$/, "")
  const bugun = new Date().toDateString()

  /**
   * Yedegin ne kadar taze oldugu.
   *
   * Is gun icinde birkac kez donuyor ve en genis araligi gece; 20 saati
   * gecen bir yedek bir turun kacirildigini, 36 saati gecen ise isin hic
   * calismadigini gosterir.
   */
  const durum = (iso: string | null) => {
    if (!iso) return { metin: "yok", renk: RED }
    const d = new Date(iso)
    const saat = (Date.now() - d.getTime()) / 3_600_000
    /*  Bugunse saat, degilse gun farki — TV'de "11:54" bir bakista
     *  okunuyor, "3 sa once" ise turu degil sureyi anlatiyor.           */
    const metin = d.toDateString() === bugun
      ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
      : `${Math.max(1, Math.floor(saat / 24))} g önce`
    return { metin, renk: saat > 36 ? RED : saat > 20 ? AMBER : TXT }
  }

  /*  Sorunlular ustte: once hic yedegi olmayanlar, sonra en eskiler.
   *  Ekranda ilk goze carpan satir ilgilenilmesi gereken olsun.         */
  const sirali = [...backups].sort((a, b) => {
    const ta = a.lastBackupAt ? new Date(a.lastBackupAt).getTime() : 0
    const tb = b.lastBackupAt ? new Date(b.lastBackupAt).getTime() : 0
    return ta - tb
  })

  const yedeksiz = backups.filter((b) => b.times.length === 0).length
  const running  = backups.find((b) => b.running)

  return (
    <Card>
      <Title accent={yedeksiz > 0 ? RED : running ? FLOW : undefined}>
        İmaj Yedekleri
      </Title>

      <div className="mt-1.5">
        {sirali.map((b) => {
          const d = durum(b.lastBackupAt)
          return (
            <Row
              key={b.vmName}
              name={kisaAd(b.vmName)}
              value={b.running ? "alınıyor…" : d.metin}
              color={b.running ? FLOW : d.renk}
            />
          )
        })}
      </div>

      <Divider />

      <Row
        name="Bugün"
        value={`${runs?.length ?? 0} tur · son ${
          runs && runs.length
            ? new Date(runs[runs.length - 1].at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
            : "—"
        }`}
        /*  Gun icinde hic tur donmediyse dikkat: is duruyor olabilir.   */
        color={(runs?.length ?? 0) === 0 ? RED : TXT_DIM}
      />

      {/*  vmsInJob: turun kapsami buna gore okunuyor. Yedegi hic
           alinmamis makineler bu sayiya dahil DEGIL.                    */}
      {yedeksiz > 0 && (
        <Row name="Yedek işinde" value={`${vmsInJob}/${backups.length} makine`} color={RED} />
      )}
    </Card>
  )
}
