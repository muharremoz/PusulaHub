"use client"

/**
 * Altyapı kartları — fiziksel sunucu, disk doluluğu ve imaj yedekleri.
 *
 * Sağ şeritteki üç karta (trafik / çevrimdışı firma / domain) eklenir.
 * Renk hiyerarşisi oradan devralındı ve bilerek korundu:
 *   beyaz   → normal değer
 *   kehribar→ dikkat, arıza değil
 *   kırmızı → kritik
 * Yeşil yalnız İMAJ YEDEKLERİ kartındaki onay işaretlerinde: orada
 * "tur döndü mü" sorusunun cevabı ikili ve göz tek bakışta eksik kutuyu
 * arıyor. Kartların geri kalanında yeşil yok — bu sayfada yeşil
 * "monitör ayakta" demek ve anlamı bulanıklaşmasın.
 *
 * ── Neden bu üç kart? ──────────────────────────────────────────────────
 * Üçü de "sessizce bozulan" şeyler: güç kaynağı aylarca arızalı kalabilir,
 * disk yavaşça dolar, bir sanal makine yedek işine hiç eklenmemiş olabilir.
 * Hiçbiri alarm üretmez, o yüzden ekranda sürekli göz önünde duruyorlar.
 *
 * Kartlar tıklamaları geçirir (`pointer-events-none`): altındaki boşluğa
 * tıklayınca genel görünüme dönmeyi engellemesinler.
 */

import { useState } from "react"
import type { BackupSlot, EsxiHost, EsxiVmBackup, SensorHealth } from "./use-esxi"

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
const GREEN   = "#34D399"

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

function Row({
  name, value, color = TXT, yanipSon = false,
}: {
  name: string; value: string; color?: string
  /** Süren bir iş — değer yanıp söner (şu an alınan yedek) */
  yanipSon?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[3px]">
      <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: TXT }}>{name}</span>
      <span
        className={`shrink-0 font-mono text-[11px] font-semibold tabular-nums${yanipSon ? " animate-pulse" : ""}`}
        style={{ color }}
      >
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
  const datastores = host.datastores.filter((d) => d.capacityGB > 50)

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

      {/*  Host'un kendi veri depolari islemci/bellekle ayni yerde: ucu de
           bu makinenin kapasitesi. Disk Dolulugu karti kayitli sunuculara
           (isletim sistemi icinden okunan diskler) ayrildi — o baska bir
           katman ve karisitiriliyordu.
           50 GB alti elenir: ESXi'nin onyukleme bankalari ve scratch
           bolumleri gercek depolama degil, satir israfi.                */}
      {datastores.map((d) => (
        <Meter
          key={d.name}
          name={d.name}
          value={`${formatGB(d.freeGB)} boş`}
          percent={d.percent}
        />
      ))}

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

export function DiskCard({ servers }: { servers: DiskCardServer[] }) {
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

  return (
    <Card>
      <Title>Disk Doluluğu</Title>

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

/*  `now` YOK: program ve tur sonuclari sunucuda hesaplaniyor
 *  (bkz. computeBackupCycle).                                          */

/**  Bir turun ne kadar sarkabilecegi — lib'deki SLOT_GRACE_MS ile ayni.
 *   Burada yalniz "su an hangi tur donuyor" sorusu icin kullaniliyor.  */
const TUR_TOLERANS_MS = 45 * 60_000

type TurDurumu = "var" | "yok" | "bekliyor" | "aliniyor"

/**
 * Tek tur kutusu.
 *
 * `bekliyor`: turun saati henüz gelmedi. Sonucu belli olmayan turu
 * kırmızı göstermek yanlış alarm olurdu.
 * `aliniyor` : şu an alınıyor — yanıp sönüyor.
 */
function TurKutusu({ saat, durum }: { saat: string; durum: TurDurumu }) {
  const renk =
    durum === "var"        ? GREEN
    : durum === "yok"      ? RED
    : durum === "aliniyor" ? FLOW
    :                        TXT_DIM
  const zemin =
    durum === "var"        ? "rgba(52,211,153,0.12)"
    : durum === "yok"      ? "rgba(248,113,113,0.14)"
    : durum === "aliniyor" ? "rgba(125,211,252,0.16)"
    :                        "rgba(255,255,255,0.04)"
  const isaret =
    durum === "var" ? "✓" : durum === "yok" ? "✕" : durum === "aliniyor" ? "●" : "·"
  return (
    <span
      className={`flex flex-1 items-center justify-center gap-[2px] rounded-[4px] py-[2px] font-mono text-[9px] font-semibold tabular-nums${
        durum === "aliniyor" ? " animate-pulse" : ""
      }`}
      style={{ color: renk, background: zemin }}
    >
      {isaret}{saat}
    </span>
  )
}

/** Gün seçici — kart içinde tıklanabilir tek eleman */
function GunSecici({ gun, onChange }: { gun: "bugun" | "dun"; onChange: (g: "bugun" | "dun") => void }) {
  return (
    /*  Sütun `pointer-events-none`: kartın altındaki boşluğa tıklayınca
     *  küre genel görünüme dönsün. Seçici bunu YALNIZ kendisi için
     *  geri açıyor, kartın geri kalanı tıklamayı geçirmeye devam eder. */
    <div className="pointer-events-auto flex shrink-0 gap-[2px]">
      {([["bugun", "Bugün"], ["dun", "Dün"]] as const).map(([k, etiket]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className="rounded-[4px] px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider transition-colors"
          style={{
            color: gun === k ? TXT : TXT_DIM,
            background: gun === k ? "rgba(255,255,255,0.10)" : "transparent",
          }}
        >
          {etiket}
        </button>
      ))}
    </div>
  )
}

/**
 * İmaj yedekleri — seçili günün makine × tur ızgarası.
 *
 * ── Neden ızgara? ─────────────────────────────────────────────────────
 * Tek satırlık "7/7" özeti turun eksik olduğunu söylüyor ama HANGİ
 * makinenin kaçırdığını söylemiyordu. Ekranın başındaki kişi tam da onu
 * soruyor. Her makinenin altında günün dört turu duruyor: eksik kutu
 * kırmızı ve tek bakışta bulunuyor.
 *
 * Hiç yedeği olmayan makineler ızgaraya GİRMİYOR — onların sorunu bir
 * turu kaçırmak değil, yedek işine hiç eklenmemiş olmaları. Dört kırmızı
 * kutuyla göstermek bambaşka bir hatayla karıştırırdı; altta ayrı satır
 * olarak duruyorlar.
 */
export function BackupImageCard({
  backups, slots, nextAt,
}: {
  backups: EsxiVmBackup[]
  slots: BackupSlot[] | null
  nextAt: string | null
  /** Kartta kullanılmıyor; ızgara makine bazlı, sayı özeti gereksiz kaldı */
  vmsInJob?: number
}) {
  const [gun, setGun] = useState<"bugun" | "dun">("bugun")

  const now      = new Date()
  const nowMs    = now.getTime()
  const kisaAd   = (x: string) => x.replace(/\s*\(.*?\)\s*$/, "")
  const isinde   = backups.filter((b) => b.times.length > 0)
  const yedeksiz = backups.filter((b) => b.times.length === 0)
  const running  = backups.find((b) => b.running)

  /*  Sunucu iki günlük pencere gönderiyor; gün seçimi burada.          */
  const bugunKey = now.toDateString()
  const dunKey   = new Date(nowMs - 86_400_000).toDateString()
  const list     = (slots ?? []).filter(
    (x) => new Date(x.at).toDateString() === (gun === "bugun" ? bugunKey : dunKey),
  )

  const eksik = list.some((x) => x.status === "missed" || x.status === "partial")

  /*  Şu an dönen tur: makine yedek alıyorsa VE turun saatindeysek.     */
  const turDurumu = (vmName: string, x: BackupSlot): TurDurumu => {
    const slotMs = new Date(x.at).getTime()
    const suAnda = Math.abs(slotMs - nowMs) <= TUR_TOLERANS_MS
    const b = backups.find((y) => y.vmName === vmName)
    if (b?.running && suAnda)   return "aliniyor"
    if (x.vms.includes(vmName)) return "var"
    if (x.status === "pending") return "bekliyor"
    /*  Makine o tarihte yedek isinde degildi (ilk yedegi daha sonra).
     *  Terminal 2 ise bugun eklendi; dunu kirmizi gostermek yanlis.    */
    const ilk = b?.times.length ? new Date(b.times[0]).getTime() : NaN
    if (isFinite(ilk) && ilk > slotMs + TUR_TOLERANS_MS) return "bekliyor"
    return "yok"
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex min-w-0 items-center gap-1.5 text-[9px] font-medium uppercase"
          style={{ color: TXT_DIM, letterSpacing: "0.26em" }}
        >
          <span className="truncate">İmaj Yedekleri</span>
          {(eksik || yedeksiz.length > 0) && (
            <span className="font-mono text-[9px]" style={{ color: RED }}>●</span>
          )}
        </div>
        <GunSecici gun={gun} onChange={setGun} />
      </div>

      {list.length === 0 ? (
        /*  Program çıkarılamadı ya da o gün hiç tur yok. Sayı uydurmak
         *  yerine bunu söylüyoruz.                                      */
        <div className="mt-2 py-1 font-mono text-[10px] uppercase" style={{ color: TXT_DIM, letterSpacing: "0.14em" }}>
          {slots && slots.length ? "o gün tur yok" : "program çıkarılamadı"}
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {isinde.map((b) => (
            <div key={b.vmName}>
              <div className="truncate text-[11px]" style={{ color: TXT }}>
                {kisaAd(b.vmName)}
              </div>
              <div className="mt-[3px] flex gap-1">
                {list.map((x) => (
                  <TurKutusu
                    key={x.at}
                    saat={new Date(x.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                    durum={turDurumu(b.vmName, x)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Divider />

      <Row
        name={running ? "Şu an" : "Sıradaki"}
        value={
          running        ? "alınıyor…"
          : nextAt       ? new Date(nextAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
          :                "—"
        }
        color={running ? FLOW : TXT_DIM}
        yanipSon={Boolean(running)}
      />

      {/*  Yedek işine hiç girmemiş makineler — tur sorunu değil, eksik
           yapılandırma. Adlarıyla gösteriliyor ki hangisi olduğu
           sorulmasın.                                                   */}
      {yedeksiz.map((b) => (
        <Row key={b.vmName} name={kisaAd(b.vmName)} value="yedek yok" color={RED} />
      ))}
    </Card>
  )
}
