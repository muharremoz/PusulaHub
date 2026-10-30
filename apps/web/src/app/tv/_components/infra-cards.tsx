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

import { Fragment, useEffect, useState } from "react"
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
      className="h-full rounded-[12px]"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex h-full flex-col px-5 py-3.5">{children}</div>
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

/**
 * Halka gösterge — saatin saniye halkasıyla aynı dil.
 *
 * Animasyon (hepsi CSS, kare başına JS yok):
 *   · açılışta halka 0'dan değerine dolarak çizilir
 *   · ışıma yavaşça nefes alır
 *   · yayın ucunda nabız atan bir nokta — değerin "canlı" olduğunu söyler
 */
function Halka({ percent, label, sub }: { percent: number; label: string; sub: string }) {
  const R = 25
  const C = 2 * Math.PI * R
  const p = Math.max(0, Math.min(100, percent))
  const color = pctColor(p)
  /* Normal değerde halka mor; eşik aşılınca kehribar/kırmızı */
  const stroke = color === TXT ? "#A78BFA" : color

  /* İlk karede 0, sonra gerçek değer → transition çizerek doldurur */
  const [gosterilen, setGosterilen] = useState(0)
  useEffect(() => {
    const t = requestAnimationFrame(() => setGosterilen(p))
    return () => cancelAnimationFrame(t)
  }, [p])

  /* Yay ucu: nokta sağda (svg -90° döndürülmüş → tepe) duruyor, grup
     değer kadar döndürülüyor; böylece uç yayla birlikte akarak ilerliyor. */
  const ucDerece = (gosterilen / 100) * 360

  return (
    <div className="flex flex-col items-center">
      <div className="relative size-[60px] shrink-0">
        <svg width={60} height={60} viewBox="0 0 60 60" className="-rotate-90 overflow-visible">
          <circle cx={30} cy={30} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
          <circle
            cx={30} cy={30} r={R} fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round"
            strokeDasharray={`${(gosterilen / 100) * C} ${C}`}
            className="tv-halka-nefes"
            style={{
              ["--halka" as string]: stroke,
              transition: "stroke-dasharray 1.4s cubic-bezier(.2,.8,.2,1)",
            }}
          />
          {p > 0 && (
            <g style={{
              transform: `rotate(${ucDerece}deg)`,
              transformOrigin: "30px 30px",
              transition: "transform 1.4s cubic-bezier(.2,.8,.2,1)",
            }}>
              <circle cx={30 + R} cy={30} r={2.6} fill={stroke} className="tv-halka-uc" />
              <circle cx={30 + R} cy={30} r={1.6} fill="#fff" />
            </g>
          )}
        </svg>
        <div className="absolute inset-0 flex items-baseline justify-center pt-[19px] tabular-nums" style={{ color }}>
          <span className="text-[19px] font-light leading-none">{p}</span>
          <span className="text-[9px]" style={{ color: TXT_DIM }}>%</span>
        </div>
      </div>
      <div className="mt-1.5 max-w-full text-center">
        <div className="text-[9px] font-medium uppercase" style={{ color: TXT_DIM, letterSpacing: "0.22em" }}>{label}</div>
        <div className="mt-0.5 whitespace-nowrap text-[10px] tracking-[-0.01em] tabular-nums" style={{ color: TXT }}>{sub}</div>
      </div>
      <style>{`
        @keyframes tv-halka-nefes {
          0%,100% { filter: drop-shadow(0 0 2px var(--halka)) }
          50%     { filter: drop-shadow(0 0 7px var(--halka)) }
        }
        @keyframes tv-halka-uc { 0%,100% { r: 2.6; opacity: .9 } 50% { r: 4.2; opacity: .35 } }
        .tv-halka-nefes { animation: tv-halka-nefes 3.2s ease-in-out infinite }
        .tv-halka-uc    { animation: tv-halka-uc 1.6s ease-in-out infinite }
      `}</style>
    </div>
  )
}

/** Alt şeritteki bilgi hücresi — kutu yok, ince ayraçlarla bölünmüş tek şerit */
function Kutucuk({ label, value, color = TXT, nokta }: { label: string; value: string; color?: string; nokta?: string }) {
  return (
    <div className="min-w-0 flex-1 border-l px-2 text-center first:border-l-0" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
      <div className="text-[15px] font-light leading-none tabular-nums whitespace-nowrap" style={{ color }}>{value}</div>
      <div className="mt-1.5 flex items-center justify-center gap-1">
        {nokta && <span className="size-[5px] rounded-full" style={{ background: nokta }} />}
        <span className="truncate text-[8px] font-medium uppercase" style={{ color: TXT_DIM, letterSpacing: "0.2em" }}>{label}</span>
      </div>
    </div>
  )
}

export function PhysicalHostCard({ host }: { host: EsxiHost }) {
  const cpuPct = host.cpuTotalMhz ? Math.round((host.cpuUsedMhz / host.cpuTotalMhz) * 100) : 0
  const ramPct = host.ramTotalGB  ? Math.round((host.ramUsedGB / host.ramTotalGB) * 100)   : 0
  const datastores = host.datastores.filter((d) => d.capacityGB > 50)

  const saglik = host.overallHealth
  const saglikRenk = saglik === "red" ? RED : saglik === "yellow" ? AMBER : saglik === "green" ? GREEN : TXT_DIM
  const saglikYazi = saglik === "red" ? "Kritik" : saglik === "yellow" ? "Uyarı" : saglik === "green" ? "Sağlıklı" : "Bilinmiyor"

  /*  ESXi'nin API'si arıza SEBEBİNİ vermiyor, yalnız "kritik" diyor. Sebep
   *  watt değerinden çıkarılıyor: giriş 0 ise kaynağa şehir elektriği
   *  gelmiyor demektir (kablo, priz ya da ölü kaynak).                  */
  const psuDeger = (ps: EsxiHost["powerSupplies"][number]) =>
    ps.health === "red" || ps.health === "yellow"
      ? (ps.inputWatts === 0 ? "AC yok" : "arıza")
      : ps.inputWatts !== null ? `${Math.round(ps.inputWatts)} W` : "normal"

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <Title accent={saglik !== "green" ? saglikRenk : undefined}>Fiziksel Sunucu</Title>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="size-[6px] rounded-full" style={{ background: saglikRenk, boxShadow: `0 0 8px ${saglikRenk}` }} />
          <span className="text-[9px] font-medium uppercase" style={{ color: saglikRenk, letterSpacing: "0.18em" }}>
            {saglikYazi}
          </span>
        </span>
      </div>

      <div className="mt-1.5 truncate text-[10px]" style={{ color: TXT_DIM }}>
        {host.cpuCores} çekirdek · {host.cpuThreads} iş parçacığı · {formatGB(host.ramTotalGB)}
      </div>

      {/*  Veri depoları da halka. 50 GB altı elenir: ESXi'nin önyükleme
           bankaları ve scratch bölümleri gerçek depolama değil.          */}
      <div className="mt-3.5 grid grid-cols-3 gap-1">
        <Halka percent={cpuPct} label="İşlemci" sub={`${(host.cpuUsedMhz / 1000).toFixed(0)} / ${(host.cpuTotalMhz / 1000).toFixed(0)} GHz`} />
        <Halka percent={ramPct} label="Bellek" sub={`${host.ramUsedGB.toFixed(0)} / ${Math.round(host.ramTotalGB)} GB`} />
        {datastores.map((d) => (
          <Halka
            key={d.name}
            percent={Math.round(d.percent)}
            label={datastores.length > 1 ? d.name : "Disk"}
            sub={`${formatGB(d.freeGB)} boş`}
          />
        ))}
      </div>

      <div className="mt-3.5 flex border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        {host.powerSupplies.length > 0 ? (
          host.powerSupplies.map((ps) => (
            <Kutucuk
              key={ps.index}
              label={`Güç ${ps.index}`}
              value={psuDeger(ps)}
              color={healthColor(ps.health)}
              nokta={ps.health === "green" ? GREEN : ps.health === "unknown" ? TXT_DIM : healthColor(ps.health)}
            />
          ))
        ) : (
          <Kutucuk label="Güç" value="veri yok" color={TXT_DIM} />
        )}
        <Kutucuk label="Çalışma" value={formatUptime(host.uptimeSeconds)} />
      </div>
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════
   Disk doluluğu — veri deposu + sunucular
══════════════════════════════════════════════════════════ */

const DISK_SEGMENT = 20

export function DiskCard({ servers }: { servers: DiskCardServer[] }) {
  /*  Her disk ayrı satır, ama aynı sunucunun diskleri alt alta: sunucular
   *  en dolu disklerine göre sıralı (dolmak üzere olan üstte), sunucu
   *  içinde sürücü sırası. Eskiden ilk 6 satırla sınırlıydı; sunucu sayısı
   *  arttıkça (T5–T7) diskler listeden düşüyordu — artık hepsi.          */
  const ham = servers
    .flatMap((s) =>
      (s.disks?.length
        ? s.disks.map((d) => ({
            key:     `${s.id}-${d.drive}`,
            sunucu:  s.id,
            ad:      kisaAd(s.name),
            /*  Tek diskli sunucuda sürücü harfi gürültü; iki diskliyse şart. */
            surucu:  (s.disks?.length ?? 0) > 1 ? d.drive.replace(/[:\\]/g, "") : "",
            percent: d.percent,
            bos:     Math.max(0, d.totalGB - d.usedGB),
          }))
        : s.disk > 0
          ? [{ key: s.id, sunucu: s.id, ad: kisaAd(s.name), surucu: "", percent: s.disk, bos: null as number | null }]
          : []),
    )
  const enDolu = new Map<string, number>()
  for (const r of ham) enDolu.set(r.sunucu, Math.max(enDolu.get(r.sunucu) ?? 0, r.percent))
  const rows = ham.sort((a, b) =>
    (enDolu.get(b.sunucu)! - enDolu.get(a.sunucu)!) ||
    a.sunucu.localeCompare(b.sunucu) ||
    a.surucu.localeCompare(b.surucu),
  )

  const dikkat = rows.filter((r) => r.percent >= WARN_PCT).length


  /* Segmentler açılışta soldan sağa sırayla yansın */
  const [hazir, setHazir] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setHazir(true))
    return () => cancelAnimationFrame(t)
  }, [])

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <Title accent={dikkat > 0 ? AMBER : undefined}>Disk Doluluğu</Title>
        {rows.length > 0 && (
          <span
            className="shrink-0 rounded-[4px] px-1.5 py-[2px] text-[9px] font-semibold uppercase tabular-nums"
            style={{
              color: dikkat > 0 ? AMBER : TXT_DIM,
              background: dikkat > 0 ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.05)",
              letterSpacing: "0.14em",
            }}
          >
            {dikkat > 0 ? `${dikkat} dolu` : `${rows.length} disk`}
          </span>
        )}
      </div>

      {rows.length > 0 ? (
        <div className={rows.length > 10 ? "mt-2 space-y-[4px]" : "mt-2.5 space-y-[6px]"}>
          {rows.map((r, ri) => {
            const renk = pctColor(r.percent)
            const dolu = renk === TXT ? "#A78BFA" : renk
            const yanan = Math.round((r.percent / 100) * DISK_SEGMENT)
            return (
              <div key={r.key} className="flex items-center gap-2.5">
                {/* Grubun ilk satırında sunucu adı, sonrakilerde yalnız sürücü harfi */}
                <span className="w-[42px] shrink-0 truncate text-[11px] font-semibold" style={{ color: TXT }}>
                  <span style={{ visibility: ri > 0 && rows[ri - 1].sunucu === r.sunucu ? "hidden" : "visible" }}>{r.ad}</span>
                  {r.surucu && <span className="ml-1 font-normal" style={{ color: TXT_DIM }}>{r.surucu}</span>}
                </span>
                <div className="flex flex-1 gap-[2px]">
                  {Array.from({ length: DISK_SEGMENT }, (_, i) => {
                    const acik = i < yanan
                    return (
                      <span
                        key={i}
                        className="h-[9px] flex-1 rounded-[1px]"
                        style={{
                          background: acik && hazir ? dolu : "rgba(255,255,255,0.07)",
                          boxShadow: acik && hazir && i === yanan - 1 ? `0 0 6px ${dolu}` : undefined,
                          opacity: acik && hazir ? 0.45 + (0.55 * (i + 1)) / Math.max(1, yanan) : 1,
                          transition: "background 300ms, opacity 300ms",
                          transitionDelay: `${ri * 40 + i * 25}ms`,
                        }}
                      />
                    )
                  })}
                </div>
                <span className="w-[30px] shrink-0 text-right text-[11px] font-medium tabular-nums" style={{ color: renk }}>
                  {Math.round(r.percent)}%
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="py-1 text-[10px] uppercase" style={{ color: TXT_DIM, letterSpacing: "0.14em" }}>
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

/** "Terminal 3 - Bilkar" → "T3", "Active Directory" → "AD"; diğerlerinde ilk kelime */
function kisaAd(ad: string): string {
  if (/active\s*directory/i.test(ad)) return "AD"
  const m = ad.match(/terminal\s*(\d+)/i)
  return m ? `T${m[1]}` : ad.split(/\s+/)[0].slice(0, 5)
}

export function RdpUsersCard({ servers }: { servers: RdpCardServer[] }) {
  const rdp = servers
    .filter((s) => (s.roles ?? []).some((r) => r.toUpperCase() === "RDP"))
    .sort((a, b) => a.name.localeCompare(b.name, "tr", { numeric: true }))

  const bilinen = rdp.filter((s) => s.status !== "offline" && typeof s.activeSessions === "number")
  const toplam  = bilinen.reduce((t, s) => t + (s.activeSessions ?? 0), 0)
  /*  Kayıtlı kullanıcı: sunucuya atanmış firmaların AD kullanıcıları.
   *  "293 / 890" — o an bağlı / toplam. Hiçbir sunucuda bilinmiyorsa
   *  yalnız bağlı sayı gösterilir.                                      */
  const kayitli = rdp.reduce((t, s) => t + (s.assignedUsers ?? 0), 0)

  /* Sütunlar açılışta 0'dan büyüyerek gelsin */
  const [hazir, setHazir] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setHazir(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const SUTUN_H = 46

  return (
    <Card>
      {/*  Toplam kartın kahramanı: yalnız büyük rakam. Başlık yok — rakamın ne
           olduğunu altındaki terminal sütunları anlatıyor.              */}
      <Title>Bağlı Kullanıcı</Title>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className="text-[56px] font-extralight leading-[0.9] tracking-[-0.045em] tabular-nums"
          style={{ color: "#F4F4F5", textShadow: "0 0 24px rgba(167,139,250,0.35)" }}
        >
          {bilinen.length > 0 ? toplam : "—"}
        </span>
        {kayitli > 0 && (
          <span className="text-[26px] font-light leading-none tabular-nums" style={{ color: TXT }}>
            <span style={{ color: TXT_DIM }}>/ </span>{kayitli}
          </span>
        )}
      </div>

      {rdp.length === 0 ? (
        <div className="mt-2 py-1 text-[10px] uppercase" style={{ color: TXT_DIM, letterSpacing: "0.14em" }}>
          rdp sunucusu yok
        </div>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 items-stretch gap-1.5">
          {rdp.map((s, i) => {
            const kapali  = s.status === "offline"
            const bilinmez = !kapali && typeof s.activeSessions !== "number"
            const n = s.activeSessions ?? 0
            const pct = Math.min(100, (n / RDP_KAPASITE) * 100)
            const renk = kapali ? RED : pctColor(pct) === TXT ? "#A78BFA" : pctColor(pct)
            const deger = kapali ? "×" : bilinmez ? "—" : String(n)
            return (
              <div key={s.id} className="flex min-w-0 flex-1 flex-col items-center">
                <span className="text-[11px] font-medium tabular-nums" style={{ color: kapali ? RED : bilinmez ? TXT_DIM : TXT }}>
                  {deger}
                </span>
                <div
                  className="relative mt-1 w-full flex-1 overflow-hidden rounded-[3px]"
                  style={{
                    minHeight: SUTUN_H,
                    background: "rgba(255,255,255,0.05)",
                    outline: kapali ? `1px dashed ${RED}99` : undefined,
                  }}
                >
                  {kapali && (
                    <span
                      className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold uppercase"
                      style={{ color: RED, writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: "0.25em" }}
                    >
                      Kapalı
                    </span>
                  )}
                  {!kapali && !bilinmez && (
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-[3px]"
                      style={{
                        height: hazir ? `${Math.max(4, pct)}%` : "0%",
                        background: `linear-gradient(180deg, ${renk}, ${renk}55)`,
                        boxShadow: `0 0 10px ${renk}66`,
                        transition: "height 1.2s cubic-bezier(.2,.8,.2,1)",
                        transitionDelay: `${i * 70}ms`,
                      }}
                    >
                      {/* Tepe çizgisi — nefes alan parlak kenar */}
                      <div className="tv-sutun-tepe absolute inset-x-0 top-0 h-[2px] rounded-full" style={{ background: "#fff", animationDelay: `${i * 0.3}s` }} />
                      {/* Yukarı akan ışık süpürmesi — sütunlar sırayla, birlikte değil */}
                      <div className="absolute inset-0 overflow-hidden rounded-[3px]">
                        <div
                          className="tv-sutun-akis absolute inset-x-0 h-1/2"
                          style={{
                            background: "linear-gradient(0deg, transparent, rgba(255,255,255,0.28), transparent)",
                            animationDelay: `${i * 0.35}s`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <span className="mt-1.5 text-[11px] font-semibold uppercase" style={{ color: kapali ? RED : TXT, letterSpacing: "0.06em" }}>
                  {kisaAd(s.name)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes tv-sutun-akis { 0% { top: 100% } 60%,100% { top: -50% } }
        @keyframes tv-sutun-tepe { 0%,100% { opacity: .35 } 50% { opacity: .95 } }
        .tv-sutun-akis { animation: tv-sutun-akis 2.8s ease-in-out infinite }
        .tv-sutun-tepe { animation: tv-sutun-tepe 2.4s ease-in-out infinite }
      `}</style>
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
  /*  Hücre bir nokta: alındı → dolu yeşil, alınmadı → kırmızı + nabız,
   *  sürüyor → mavi halka yanıp söner, bekliyor → boş ince halka.
   *  Saat sütun başlığında, durumu rengin kendisi anlatıyor.          */
  if (durum === "bekliyor") {
    return <span className="mx-auto block size-[9px] rounded-full" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)" }} />
  }
  const renk = durum === "var" ? GREEN : durum === "yok" ? RED : FLOW
  return (
    <span className="relative mx-auto flex size-[9px]">
      {durum !== "var" && (
        <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: renk }} />
      )}
      <span
        className="relative size-[9px] rounded-full"
        style={{
          background: durum === "aliniyor" ? "transparent" : renk,
          boxShadow: durum === "aliniyor" ? `inset 0 0 0 2px ${renk}` : `0 0 6px ${renk}99`,
        }}
      />
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
  backups, slots,
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

  /*  Sunucu iki günlük pencere gönderiyor; gün seçimi burada.          */
  const bugunKey = now.toDateString()
  const dunKey   = new Date(nowMs - 86_400_000).toDateString()
  const list     = (slots ?? []).filter(
    (x) => new Date(x.at).toDateString() === (gun === "bugun" ? bugunKey : dunKey),
  )

  const eksik = list.some((x) => x.status === "missed" || x.status === "partial")

  /*  Kahraman sayı: seçili günün son SONUÇLANMIŞ turunda kaç makine alındı */
  const sonTur = [...list].reverse().find((x) => x.status !== "pending") ?? null
  const sonTurAlinan = sonTur ? isinde.filter((b) => sonTur.vms.includes(b.vmName)).length : 0
  const sonTurTam = sonTur ? sonTurAlinan === isinde.length : true

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
          className="shrink-0 whitespace-nowrap text-[9px] font-medium uppercase"
          style={{ color: eksik || yedeksiz.length > 0 ? RED : TXT_DIM, letterSpacing: "0.2em" }}
        >
          İmaj Yedekleri
        </div>
        {/*  Son sonuçlanmış turda alınan / işteki makine — başlık satırında,
             kart yüksekliği artmasın (sağ şerit ekrana tam sığıyor).    */}
        {sonTur && (
          <span className="ml-auto shrink-0 text-[13px] font-light tabular-nums" style={{ color: sonTurTam ? TXT : RED }}>
            {sonTurAlinan}<span style={{ color: TXT_DIM }}> / {isinde.length}</span>
          </span>
        )}
        <GunSecici gun={gun} onChange={setGun} />
      </div>


      {list.length === 0 ? (
        /*  Program çıkarılamadı ya da o gün hiç tur yok. Sayı uydurmak
         *  yerine bunu söylüyoruz.                                      */
        <div className="mt-2 py-1 text-[10px] uppercase" style={{ color: TXT_DIM, letterSpacing: "0.14em" }}>
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
              className="text-center text-[9px] font-medium tabular-nums"
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
    .slice(0, 2)
  const renk = (s: string) => (s === "guvenlik" ? RED : s === "destek" ? AMBER : "#A78BFA")
  const saat = (iso: string) => new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })

  const { guvenlik, destek, bilgi } = data.ozet
  const toplam = guvenlik + destek + bilgi
  const seviyeler = [
    { ad: "Güvenlik",     n: guvenlik, renk: RED },
    { ad: "Müdahale",     n: destek,   renk: AMBER },
    { ad: "Tek seferlik", n: bilgi,    renk: "#A78BFA" },
  ]

  /* Dağılım şeridi açılışta soldan dolsun */
  const [hazir, setHazir] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setHazir(true))
    return () => cancelAnimationFrame(t)
  }, [])

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <Title accent={guvenlik > 0 ? RED : okumaEski ? AMBER : undefined}>SQL Hatalı Giriş</Title>
        <span className="shrink-0 text-[9px] font-medium uppercase" style={{ color: okumaEski ? AMBER : TXT_DIM, letterSpacing: "0.18em" }}>
          {okumaEski ? "okuma yok" : "son 24 saat"}
        </span>
      </div>

      {toplam === 0 ? (
        /*  Boş hâl: son 24 saatte hatalı giriş yok. İzleme okuması bayatsa
            "temiz" DEMİYORUZ — veri gelmiyor olabilir; o zaman kehribar uyarı. */
        <div className="flex flex-1 items-center gap-4 py-2">
          <div className="relative flex size-[52px] shrink-0 items-center justify-center">
            <span
              className="tv-sql-temiz absolute inset-0 rounded-full"
              style={{ boxShadow: `inset 0 0 0 2px ${okumaEski ? AMBER : GREEN}`, opacity: 0.35 }}
            />
            <span
              className="absolute inset-[7px] rounded-full"
              style={{ background: okumaEski ? "rgba(251,191,36,0.10)" : "rgba(52,211,153,0.10)" }}
            />
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" className="relative"
              stroke={okumaEski ? AMBER : GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              {okumaEski
                ? <><path d="M12 8v5" /><path d="M12 16.5v.5" /></>
                : <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z M9 12l2 2 4-4" />}
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[34px] font-extralight leading-none tracking-[-0.04em] tabular-nums" style={{ color: "#F4F4F5" }}>
              0
            </div>
            <div className="mt-1.5 text-[11px] font-medium" style={{ color: okumaEski ? AMBER : GREEN }}>
              {okumaEski ? "İzleme verisi gelmiyor" : "Hatalı giriş yok"}
            </div>
            <div className="mt-0.5 text-[9px] uppercase tabular-nums" style={{ color: TXT_DIM, letterSpacing: "0.16em" }}>
              {data.okuma ? `son okuma ${saat(data.okuma)}` : "okuma yok"}
            </div>
          </div>
          <style>{`
            @keyframes tv-sql-temiz { 0%,100% { transform: scale(1); opacity: .35 } 50% { transform: scale(1.08); opacity: .7 } }
            .tv-sql-temiz { animation: tv-sql-temiz 3.2s ease-in-out infinite }
          `}</style>
        </div>
      ) : (
        <>
        {/* Toplam deneme — kartın kahramanı */}
        <div
          className="mt-1 text-[34px] font-extralight leading-none tracking-[-0.04em] tabular-nums"
          style={{ color: guvenlik > 0 ? RED : "#F4F4F5" }}
        >
          {toplam}
        </div>

        {/* Seviyelerin dağılımı — tek şerit */}
        <div className="mt-2.5 flex h-[5px] w-full gap-[2px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
          {toplam > 0 && seviyeler.filter((x) => x.n > 0).map((x) => (
            <span
              key={x.ad}
              className="h-full rounded-full"
              style={{
                width: hazir ? `${(x.n / toplam) * 100}%` : "0%",
                background: x.renk,
                boxShadow: `0 0 8px ${x.renk}88`,
                transition: "width 1.2s cubic-bezier(.2,.8,.2,1)",
              }}
            />
          ))}
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          {seviyeler.map((x) => (
            <div key={x.ad} className="min-w-0">
              <div className="text-[16px] font-light leading-none tabular-nums" style={{ color: x.n > 0 ? x.renk : TXT_DIM }}>{x.n}</div>
              <div className="mt-1 truncate text-[8px] font-medium uppercase" style={{ color: TXT_DIM, letterSpacing: "0.16em" }}>{x.ad}</div>
            </div>
          ))}
        </div>

        {son.length > 0 && (
          <div className="mt-2.5 space-y-1 border-t pt-2" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            {son.map((x) => (
              <div key={`${x.ip}|${x.kullanici}|${x.neden}`} className="flex items-center gap-2">
                <span className="size-[6px] shrink-0 rounded-full" style={{ background: renk(x.seviye), boxShadow: `0 0 6px ${renk(x.seviye)}` }} />
                <div className="min-w-0 flex-1 truncate text-[11px]">
                  <span className="font-semibold" style={{ color: TXT }}>{x.kullanici}</span>
                  {x.nedenAd && <span style={{ color: TXT_DIM }}> · {x.nedenAd}</span>}
                </div>
                <span className="shrink-0 text-[11px] font-medium tabular-nums" style={{ color: TXT }}>{saat(x.son)}</span>
              </div>
            ))}
          </div>
        )}
        </>
      )}
    </Card>
  )
}
