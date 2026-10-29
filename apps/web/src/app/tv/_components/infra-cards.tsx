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

import { Fragment, useState } from "react"
import type { BackupSlot, EsxiHost, EsxiVmBackup, SensorHealth } from "./use-esxi"
import type { SqlGirisVeri } from "./sql-giris"

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
  /*  `accent` verilince basligin KENDISI o renge boyaniyor. Once saga
   *  bir nokta konuyordu; kartlarda ikon kullanmama karariyla kalkti —
   *  uyariyi rengin kendisi tasiyor, satirdaki kirmizi deger zaten
   *  nedenini soyluyor.                                               */
  return (
    <div
      className="truncate text-[9px] font-medium uppercase"
      style={{ color: accent ?? TXT_DIM, letterSpacing: "0.26em" }}
    >
      {children}
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
function Meter({ name, value, percent, compact = false }: { name: string; value: string; percent: number; compact?: boolean }) {
  const color = pctColor(percent)
  return (
    <div className={compact ? "py-[1px]" : "py-[3px]"}>
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

export function DiskCard({ servers }: { servers: DiskCardServer[] }) {
  /*  Her diski ayrı satır yapıp en dolulara göre sıralıyoruz: dolmak üzere
   *  olan disk her zaman üstte. Eskiden ilk 6 satırla sınırlıydı; sunucu
   *  sayısı arttıkça (T5–T7) diskler listeden düşüyordu — artık hepsi.   */
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

  return (
    <Card>
      <Title>Disk Doluluğu</Title>

      {rows.length > 0 ? (
        rows.map((r) => <Meter key={r.key} name={r.name} value={r.value} percent={r.percent} compact={rows.length > 10} />)
      ) : (
        <div className="py-1 font-mono text-[10px] uppercase" style={{ color: TXT_DIM, letterSpacing: "0.14em" }}>
          veri yok
        </div>
      )}
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════
   RDP sunucularında anlık bağlı kişi
══════════════════════════════════════════════════════════ */

/**
 * RDP kartının ihtiyaç duyduğu asgari sunucu şekli.
 * `activeSessions` /api/servers'ta hesaplanıyor: yalnız "Active" oturumlar,
 * aynı kullanıcı bir kez — yani oturum değil KİŞİ sayısı. undefined = agent
 * oturum bildirmiyor.
 */
export interface RdpCardServer {
  id:     string
  name:   string
  status?: string
  roles?: string[]
  activeSessions?: number
  assignedUsers?:  number
}

/**
 * Terminal başına planlanan kullanıcı sayısı — çubuk buna göre dolar.
 * Oturum açma gecikmesi oturum sayısıyla doğrusal büyüdüğü için (T1'de
 * ~0,25 sn/oturum) bu sınıra yaklaşmak da "dikkat" demek: %80'de kehribar,
 * %90'da kırmızı.
 */
const RDP_KAPASITE = 80

export function RdpUsersCard({ servers }: { servers: RdpCardServer[] }) {
  const rdp = servers
    .filter((s) => (s.roles ?? []).some((r) => r.toUpperCase() === "RDP"))
    .sort((a, b) => a.name.localeCompare(b.name, "tr", { numeric: true }))

  const bilinen = rdp.filter((s) => s.status !== "offline" && typeof s.activeSessions === "number")
  const toplam  = bilinen.reduce((t, s) => t + (s.activeSessions ?? 0), 0)
  const cevrimdisi = rdp.some((s) => s.status === "offline")
  /*  Kayıtlı kullanıcı: sunucuya atanmış firmaların AD kullanıcıları.
   *  "83 / 350" — o an çalışan / toplam. Hiçbir sunucuda bilinmiyorsa
   *  yalnız bağlı sayı gösterilir.                                      */
  const kayitli = rdp.reduce((t, s) => t + (s.assignedUsers ?? 0), 0)

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <Title accent={cevrimdisi ? RED : undefined}>Bağlı Kullanıcı</Title>
        <span className="shrink-0 font-mono text-[18px] font-semibold leading-none tabular-nums" style={{ color: TXT }}>
          {bilinen.length > 0 ? toplam : "—"}
          {kayitli > 0 && (
            <span className="text-[11px] font-medium" style={{ color: TXT_DIM }}> / {kayitli}</span>
          )}
        </span>
      </div>

      <div className="mt-2">
        {rdp.length === 0 ? (
          <div className="py-1 font-mono text-[10px] uppercase" style={{ color: TXT_DIM, letterSpacing: "0.14em" }}>
            rdp sunucusu yok
          </div>
        ) : (
          rdp.map((s) => {
            if (s.status === "offline") {
              return <Row key={s.id} name={s.name} value="çevrimdışı" color={RED} />
            }
            if (typeof s.activeSessions !== "number") {
              return <Row key={s.id} name={s.name} value="—" color={TXT_DIM} />
            }
            const n = s.activeSessions
            return (
              <Meter
                key={s.id}
                name={s.name}
                value={typeof s.assignedUsers === "number" ? `${n} / ${s.assignedUsers}` : `${n} kişi`}
                percent={Math.round((n / RDP_KAPASITE) * 100)}
              />
            )
          })
        )}
      </div>
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
function TurKutusu({ durum }: { durum: TurDurumu }) {
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
  /*  Isaret ve saat YOK — saat sutun basliginda, durumu rengin kendisi
   *  anlatiyor. Ince bir cerceve + yumusak zemin: bos (bekliyor) hucre
   *  de seciliyor ama dolu olanla karismiyor.                          */
  return (
    <span
      className={`block h-[10px] rounded-[3px]${durum === "aliniyor" ? " animate-pulse" : ""}`}
      style={{
        background: durum === "bekliyor" ? zemin : renk,
        opacity: durum === "bekliyor" ? 1 : 0.85,
        boxShadow: durum === "bekliyor" ? "inset 0 0 0 1px rgba(255,255,255,0.06)" : undefined,
      }}
    />
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

  /**
   * Süren yedeğin AİT OLDUĞU tur — makinenin son izine en yakın tur.
   *
   * Önce "turun saatine 45 dk yakınsa" deniyordu ve yanlıştı: Veeam'in
   * haftalık tam yedeği saatlerce sürüyor, tolerans dolunca kutu sönüp
   * yeşile dönüyordu — yedek hâlâ sürerken "tamam" demiş oluyorduk.
   * Günlükteki iz yedeğin BAŞLANGICI olduğu için, süre ne olursa olsun
   * doğru turu işaret ediyor.
   *
   * Karşılaştırma seçili günle sınırlı DEĞİL: bütün turlar arasından en
   * yakını bulunup sonra "o mu" diye bakılıyor. Yoksa Dün görünümünde
   * bugün süren yedek yanlış bir kutuyu yakardı.
   */
  const surenTur = (b: EsxiVmBackup): string | null => {
    if (!b.running || !b.times.length || !slots?.length) return null
    /*  Süren yedeğin izi sunucuda zaten bir tura atanmış: makineyi içeren
     *  EN SON tur. "En yakın saat" 19.10'da yanılttı — 12:00 turu 14:04'e
     *  sarkınca Coolify'ın süren yedeği 15:00 kutusunda yanıp söndü.    */
    const iceren = slots.filter((y) => y.vms.includes(b.vmName))
    if (iceren.length) return iceren[iceren.length - 1].at
    const sonIz = new Date(b.times[b.times.length - 1]).getTime()
    let enYakin = slots[0]
    for (const y of slots) {
      if (Math.abs(new Date(y.at).getTime() - sonIz) < Math.abs(new Date(enYakin.at).getTime() - sonIz)) enYakin = y
    }
    return enYakin.at
  }

  const turDurumu = (b: EsxiVmBackup, x: BackupSlot): TurDurumu => {
    if (surenTur(b) === x.at)     return "aliniyor"
    /*  Alındıysa yeşil — geç alınmış olsa da (19.10.2026, kullanıcı isteği).
     *  Gecikme ayrı bir alarm değil; turun hiç dönmemesi asıl sorun.    */
    if (x.vms.includes(b.vmName)) return "var"
    if (x.status === "pending")   return "bekliyor"
    /*  Makine o tarihte yedek isinde degildi (ilk yedegi daha sonra).
     *  Terminal 2 ise bugun eklendi; dunu kirmizi gostermek yanlis.    */
    const ilk = b.times.length ? new Date(b.times[0]).getTime() : NaN
    if (isFinite(ilk) && ilk > new Date(x.at).getTime() + TUR_TOLERANS_MS) return "bekliyor"
    return "yok"
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div
          className="min-w-0 truncate text-[9px] font-medium uppercase"
          style={{ color: eksik || yedeksiz.length > 0 ? RED : TXT_DIM, letterSpacing: "0.26em" }}
        >
          İmaj Yedekleri
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
        /*  Tablo düzeni: saatler TEK kez başlıkta, her makine tek satır
         *  (ad solda, tur hücreleri sağda). Önce her makinenin altında
         *  saat yazılı dört kutu vardı; makine sayısı 11'e çıkınca kart
         *  ekrana sığmadı. Saat sütun başlığından okunuyor.              */
        <div
          className="mt-2 grid items-center gap-x-1 gap-y-[5px]"
          style={{ gridTemplateColumns: `minmax(64px,1fr) repeat(${list.length}, 28px)` }}
        >
          <span />
          {list.map((x) => (
            <span
              key={x.at}
              className="text-center font-mono text-[9px] tabular-nums"
              style={{ color: TXT_DIM }}
            >
              {new Date(x.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          ))}
          {isinde.map((b) => (
            <Fragment key={b.vmName}>
              <span className="min-w-0 truncate text-[11px] leading-[14px]" style={{ color: TXT }}>
                {kisaAd(b.vmName)}
              </span>
              {list.map((x) => (
                <TurKutusu key={x.at} durum={turDurumu(b, x)} />
              ))}
            </Fragment>
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

/* ══════════════════════════════════════════════════════════
   SQL hatalı giriş (29.10.2026)
══════════════════════════════════════════════════════════ */

/*  Son 24 saatin seviye sayıları + son üç parola/kullanıcı hatası.
 *  "Veritabanı açılamadı" son denemeler listesine girmez: yanlış ayarlı
 *  müşteri programı dakikada bir deniyor, liste hep onunla dolardı;
 *  müdahale sayısında görünüyor. Yeni denemede alt ortada ayrıca uyarı
 *  çıkıyor (sql-giris.tsx).                                            */
export function SqlGirisCard({ data }: { data: SqlGirisVeri }) {
  const okumaEski = !data.okuma || Date.now() - Date.parse(data.okuma) > 5 * 60_000
  const son = data.satirlar
    .filter((x) => x.neden !== "veritabani_acilamadi")
    .sort((a, b) => Date.parse(b.son) - Date.parse(a.son))
    .slice(0, 3)
  const renk = (s: string) => (s === "guvenlik" ? RED : s === "destek" ? AMBER : TXT)
  const saat = (iso: string) => new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })

  return (
    <Card>
      <Title accent={data.ozet.guvenlik > 0 ? RED : okumaEski ? AMBER : undefined}>SQL Hatalı Giriş · 24 sa</Title>
      <div className="mt-2">
        <Row name="Güvenlik" value={String(data.ozet.guvenlik)} color={data.ozet.guvenlik > 0 ? RED : TXT} />
        <Row name="Müdahale" value={String(data.ozet.destek)} color={data.ozet.destek > 0 ? AMBER : TXT} />
        <Row name="Tek seferlik" value={String(data.ozet.bilgi)} />
        {okumaEski && <Row name="İzleme" value="okuma yok" color={AMBER} />}
      </div>
      {son.length > 0 && (
        <>
          <Divider />
          {son.map((x) => (
            <Row key={`${x.ip}|${x.kullanici}|${x.neden}`} name={x.kullanici} value={saat(x.son)} color={renk(x.seviye)} />
          ))}
        </>
      )}
    </Card>
  )
}
