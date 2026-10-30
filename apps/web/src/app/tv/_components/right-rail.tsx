"use client"

/**
 * Sağ şerit — trafik, Spare Backup ve domain yenileme kartları.
 *
 * ── Okunabilirlik ──────────────────────────────────────────────────────
 * Arkada hareketli bir yıldız alanı var; üstüne düz yazı koyunca yıldızlar
 * harflerin arasından geçiyor. Sağ kenara SOLA DOĞRU SÖNEN bir karartı
 * şeridi konuldu: sağda koyu, sola gidildikçe saydam. Sert bir sınır
 * oluşmuyor, sahne kesilmiyor, ama yazı zemini sakinleşiyor.
 *
 * ── Renk hiyerarşisi ───────────────────────────────────────────────────
 *   camgöbeği → canlı akış (anlık hız), dallardaki ışıkla aynı renk
 *   beyaz     → birikmiş / nötr değer
 *   kehribar  → dikkat gerektiren ama arıza olmayan durum
 *   kırmızı   → kritik
 * Yeşil bilerek kullanılmıyor: bu sayfada yeşil "monitör ayakta" demek,
 * yan kartlara taşarsa anlamı bulanıklaşır.
 *
 * Kartlar tıklamaları geçirir (`pointer-events-none`): altındaki boşluğa
 * tıklayınca genel görünüme dönmeyi engellemesinler.
 */

import { useEffect, useState } from "react"
import type { BandwidthData } from "@/lib/bandwidth"
import type { SpareBackupOffline } from "@/lib/sparebackup-offline"
import type { DomainExpiry } from "@/lib/domain-expiry"
import type { BackupStorage } from "./use-esxi"
import { formatAgo, type KurYazici } from "../_shared/types"

const FLOW    = "#7DD3FC"
const TXT     = "#D4D4D8"
const TXT_DIM = "#8B8B93"
const AMBER   = "#FBBF24"
const RED     = "#F87171"
const GREEN   = "#34D399"

/** Listelerde en fazla kaç satır gösterilir */
const MAX_ROWS = 4

/** Disk doluluk eşikleri — üstünde renk değişir */
const WARN_PCT = 80
const CRIT_PCT = 90

/* ══════════════════════════════════════════════════════════
   Ortak parçalar
══════════════════════════════════════════════════════════ */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="h-full rounded-[12px]"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex h-full flex-col px-5 py-3.5">{children}</div>
    </div>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[9px] font-medium uppercase"
      style={{ color: TXT_DIM, letterSpacing: "0.26em" }}
    >
      {children}
    </div>
  )
}

/** Ad solda, değer sağda — üç kartta da aynı satır düzeni */
function Row({
  name,
  value,
  color = TXT,
}: {
  name: string
  value: string
  color?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[3px]">
      <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: TXT }}>
        {name}
      </span>
      <span
        className="shrink-0 font-mono text-[11px] font-semibold tabular-nums"
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

/** Ad + değer + altında çubuk (altyapı kartlarıyla aynı görünüm) */
function Meter({ name, value, percent }: { name: string; value: string; percent: number }) {
  const color = percent >= CRIT_PCT ? RED : percent >= WARN_PCT ? AMBER : TXT
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

function Empty({ text }: { text: string }) {
  return (
    <div
      className="py-1 font-mono text-[10px] uppercase"
      style={{ color: TXT_DIM, letterSpacing: "0.14em" }}
    >
      {text}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Biçimlendirme
══════════════════════════════════════════════════════════ */

/** 10 altı bir ondalık, üstü tam sayı — rakam boyu sabit kalsın */
function formatMbps(v: number): string {
  if (!isFinite(v) || v < 0) return "0"
  return v < 10 ? v.toFixed(1) : Math.round(v).toString()
}

/** GB → 1000 üstü TB, altı GB */
function formatTraffic(gb: number): string {
  if (!isFinite(gb)) return "—"
  if (gb >= 1000) return `${(gb / 1000).toFixed(2)} TB`
  if (gb < 100)   return `${gb.toFixed(1)} GB`
  return `${Math.round(gb)} GB`
}

/** GB → 1000 üstü TB */
function formatGB(gb: number): string {
  if (!isFinite(gb)) return "—"
  if (gb >= 1000) return `${(gb / 1000).toFixed(2)} TB`
  return `${Math.round(gb)} GB`
}

/** Dakika → kısa Türkçe süre */
function formatMinutesAgo(mins: number): string {
  if (mins < 60)   return `${mins} dk`
  if (mins < 1440) return `${Math.floor(mins / 60)} sa`
  return `${Math.floor(mins / 1440)} g`
}

/** Kalan gün → renk. 30 gün altı kritik, 90 altı dikkat. */
function domainColor(daysLeft: number | null): string {
  if (daysLeft === null) return TXT_DIM
  if (daysLeft < 30) return RED
  if (daysLeft < 90) return AMBER
  return TXT
}

/* ══════════════════════════════════════════════════════════
   Trafik
══════════════════════════════════════════════════════════ */

const TX_RENK = "#A78BFA"
const ORNEK   = 48   // grafikte tutulan son ölçüm sayısı (~2,5 dk, 3 sn'de bir)

/** Canlı hız — saatle aynı dil: ince büyük rakam, renkli küçük etiket */
function Rate({ dir, value, renk }: { dir: "down" | "up"; value: string; renk: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="size-[6px] rounded-full" style={{ background: renk, boxShadow: `0 0 6px ${renk}` }} />
        <span className="text-[8px] font-medium uppercase" style={{ color: TXT_DIM, letterSpacing: "0.2em" }}>
          {dir === "down" ? "İndirme" : "Yükleme"}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1 tabular-nums">
        <span className="text-[30px] font-extralight leading-none tracking-[-0.03em]" style={{ color: "#F4F4F5" }}>{value}</span>
        <span className="text-[9px]" style={{ color: TXT_DIM }}>Mb/s</span>
      </div>
    </div>
  )
}

/** Son ölçümlerin akan grafiği: indirme dolu alan, yükleme çizgi */
function Akis({ rx, tx }: { rx: number[]; tx: number[] }) {
  const W = 220, H = 40
  const max = Math.max(1, ...rx, ...tx) * 1.15
  const nokta = (arr: number[]) =>
    arr.map((v, i) => `${((i + (ORNEK - arr.length)) / (ORNEK - 1)) * W},${H - (v / max) * H}`).join(" ")
  const rxP = nokta(rx)
  const ilkX = ((ORNEK - rx.length) / (ORNEK - 1)) * W
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[40px] w-full">
      <defs>
        <linearGradient id="tv-akis-rx" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={FLOW} stopOpacity="0.35" />
          <stop offset="100%" stopColor={FLOW} stopOpacity="0" />
        </linearGradient>
      </defs>
      {rx.length > 1 && (
        <>
          <polygon points={`${ilkX},${H} ${rxP} ${W},${H}`} fill="url(#tv-akis-rx)" />
          <polyline points={rxP} fill="none" stroke={FLOW} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <polyline points={nokta(tx)} fill="none" stroke={TX_RENK} strokeWidth={1.3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeDasharray="3 2" />
        </>
      )}
    </svg>
  )
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-[8px] font-medium uppercase" style={{ color: TXT_DIM, letterSpacing: "0.20em" }}>{label}</div>
      <div className="mt-1 text-[15px] font-light leading-none tabular-nums" style={{ color: TXT }}>{value}</div>
    </div>
  )
}

export function TrafficCard({ data }: { data: BandwidthData | null }) {
  /*  Geçmiş istemcide birikiyor: her yeni ölçüm bir nokta. Anahtar ölçülen
   *  değerin kendisi — sayfa başka sebeple yeniden çizildiğinde (monitör
   *  yoklaması saniyede bir) aynı ölçüm tekrar eklenmesin. Sunucuya ek yük
   *  yok — zaten 3 sn'de bir çekilen veriden.                            */
  const [gecmis, setGecmis] = useState<{ rx: number[]; tx: number[] }>({ rx: [], tx: [] })
  const anahtar = data ? `${data.live.rxBps}|${data.live.txBps}` : null

  /*  ?mock=1 (tasarım görünümü): grafik boş başlamasın, geçmiş örnek
   *  değerlerle önceden doldurulur. Gerçek ekranda bu blok çalışmaz.   */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mock") !== "1") return
    const rx: number[] = [], tx: number[] = []
    let r = 40, t = 8
    for (let i = 0; i < ORNEK - 1; i++) {
      r = Math.max(6, Math.min(170, r + (Math.random() - 0.48) * 22))
      t = Math.max(1.5, Math.min(40, t + (Math.random() - 0.48) * 6))
      rx.push(r); tx.push(t)
    }
    setGecmis((g) => (g.rx.length > 2 ? g : { rx: [...rx, ...g.rx].slice(-ORNEK), tx: [...tx, ...g.tx].slice(-ORNEK) }))
  }, [])
  useEffect(() => {
    if (!data) return
    setGecmis((g) => ({
      rx: [...g.rx, data.live.rxMbps].slice(-ORNEK),
      tx: [...g.tx, data.live.txMbps].slice(-ORNEK),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anahtar])

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <Title>İnternet Trafiği</Title>
        {data && (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="relative flex size-[6px]">
              <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: FLOW }} />
              <span className="relative size-[6px] rounded-full" style={{ background: FLOW }} />
            </span>
            <span className="text-[9px] font-medium uppercase" style={{ color: TXT_DIM, letterSpacing: "0.18em" }}>Canlı</span>
          </span>
        )}
      </div>

      {data ? (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-3">
            <Rate dir="down" value={formatMbps(data.live.rxMbps)} renk={FLOW} />
            <Rate dir="up"   value={formatMbps(data.live.txMbps)} renk={TX_RENK} />
          </div>
          <div className="mt-2.5">
            <Akis rx={gecmis.rx} tx={gecmis.tx} />
          </div>
          <div className="mt-2.5 flex gap-3 border-t pt-2.5" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <Total label="Bugün" value={formatTraffic(data.daily.totalGB)} />
            <Total label="Bu ay" value={formatTraffic(data.monthly.totalGB)} />
          </div>
        </>
      ) : (
        <div className="mt-2"><Empty text="Servise ulaşılamadı" /></div>
      )}
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════
   Spare Backup — çevrimdışı firmalar + deponun diski
══════════════════════════════════════════════════════════ */

/**
 * Tek kartta iki soru: yedek GELIYOR mu (cevrimdisi firmalar) ve yedegin
 * YAZACAGI yer var mi (depo diski). Ikisi de ayni servisin durumu; disk
 * dolunca firmalar tek tek cevrimdisina dusecek, yan yana duruncaya
 * kadar bu bag ekranda gorunmuyordu.
 */
export function BackupsCard({
  data, storage,
}: {
  data: SpareBackupOffline | null
  storage: BackupStorage | null
}) {
  const list  = data?.offline ?? []
  const count = list.length
  const shown = list.slice(0, MAX_ROWS)
  const rest  = count - shown.length
  const cevrimici = data ? Math.max(0, data.totalActive - count) : 0
  const pay = data && data.totalActive > 0 ? (cevrimici / data.totalActive) * 100 : 0

  /* Şeritler açılışta dolarak gelsin */
  const [hazir, setHazir] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setHazir(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const diskRenk = storage ? (storage.percent >= CRIT_PCT ? RED : storage.percent >= WARN_PCT ? AMBER : "#A78BFA") : TXT_DIM

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <Title>Spare Backup</Title>
        {data && (
          <span
            className="shrink-0 rounded-[4px] px-1.5 py-[2px] text-[9px] font-semibold uppercase tabular-nums"
            style={{
              color: count > 0 ? AMBER : GREEN,
              background: count > 0 ? "rgba(251,191,36,0.12)" : "rgba(52,211,153,0.12)",
              letterSpacing: "0.14em",
            }}
          >
            {count > 0 ? `${count} çevrimdışı` : "tümü çevrimiçi"}
          </span>
        )}
      </div>

      {!data ? (
        <div className="mt-2"><Empty text="Servise ulaşılamadı" /></div>
      ) : (
        <>
          {/* Çevrimiçi firma — kartın kahramanı */}
          <div className="mt-1.5 flex items-baseline gap-2 tabular-nums">
            <span className="text-[34px] font-extralight leading-none tracking-[-0.04em]" style={{ color: "#F4F4F5" }}>
              {cevrimici}
            </span>
            <span className="text-[16px] font-light leading-none" style={{ color: TXT }}>
              <span style={{ color: TXT_DIM }}>/ </span>{data.totalActive}
            </span>
            <span className="ml-auto text-[8px] font-medium uppercase" style={{ color: TXT_DIM, letterSpacing: "0.18em" }}>
              {data.thresholdMins} dk eşik
            </span>
          </div>

          {/* Çevrimiçi / çevrimdışı payı */}
          <div className="mt-2.5 flex h-[5px] w-full gap-[2px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
            <span
              className="h-full rounded-full"
              style={{
                width: hazir ? `${pay}%` : "0%",
                background: GREEN,
                boxShadow: `0 0 8px ${GREEN}88`,
                transition: "width 1.2s cubic-bezier(.2,.8,.2,1)",
              }}
            />
            {count > 0 && <span className="h-full min-w-[4px] flex-1 rounded-full" style={{ background: AMBER }} />}
          </div>

          {count > 0 && (
            <div className="mt-3 space-y-1.5">
              {shown.map((f) => (
                <div key={f.firkod} className="flex items-center gap-2">
                  <span className="size-[6px] shrink-0 rounded-full" style={{ background: AMBER, boxShadow: `0 0 6px ${AMBER}` }} />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium" style={{ color: TXT }}>{f.firma}</span>
                  <span
                    className="shrink-0 rounded-[4px] px-1.5 py-[1px] text-[10px] font-medium tabular-nums"
                    style={{ color: AMBER, background: "rgba(251,191,36,0.10)" }}
                  >
                    {formatMinutesAgo(f.minutesAgo)}
                  </span>
                </div>
              ))}
              {rest > 0 && (
                <div className="text-[9px] uppercase" style={{ color: TXT_DIM, letterSpacing: "0.14em" }}>
                  +{rest} firma daha
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/*  Depo diski en altta: firma listesi haber, disk ise zemin.
           Ulaşılamıyorsa satır hiç çizilmiyor - boş kutu durmasın.   */}
      {storage && (
        <div className="mt-3 border-t pt-2.5" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[9px] font-medium uppercase" style={{ color: TXT_DIM, letterSpacing: "0.18em" }}>Depo diski</span>
            <span className="tabular-nums">
              <span className="text-[13px] font-light" style={{ color: diskRenk === "#A78BFA" ? TXT : diskRenk }}>%{Math.round(storage.percent)}</span>
              <span className="ml-1.5 text-[10px]" style={{ color: TXT_DIM }}>{formatGB(storage.freeGB)} boş</span>
            </span>
          </div>
          <div className="mt-1.5 h-[3px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: hazir ? `${storage.percent}%` : "0%",
                background: diskRenk,
                boxShadow: `0 0 6px ${diskRenk}88`,
                transition: "width 1.2s cubic-bezier(.2,.8,.2,1)",
              }}
            />
          </div>
        </div>
      )}
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════
   Domain yenileme
══════════════════════════════════════════════════════════ */

export function DomainsCard({ data }: { data: DomainExpiry[] | null }) {
  // Liste zaten kalan güne göre artan sıralı geliyor (lib/domain-expiry)
  const list  = data ?? []
  const shown = list.slice(0, MAX_ROWS)
  const rest  = list.length - shown.length

  /* Süre çubukları açılışta dolarak gelsin */
  const [hazir, setHazir] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setHazir(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const yakin = list.filter((d) => d.daysLeft !== null && d.daysLeft < 90).length

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <Title>Domain Yenileme</Title>
        {list.length > 0 && (
          <span
            className="shrink-0 rounded-[4px] px-1.5 py-[2px] text-[9px] font-semibold uppercase tabular-nums"
            style={{
              color: yakin > 0 ? AMBER : TXT_DIM,
              background: yakin > 0 ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.05)",
              letterSpacing: "0.14em",
            }}
          >
            {yakin > 0 ? `${yakin} yaklaşıyor` : `${list.length} domain`}
          </span>
        )}
      </div>

      {!data ? (
        <div className="mt-2"><Empty text="Sorgulanıyor…" /></div>
      ) : list.length === 0 ? (
        <div className="mt-2"><Empty text="Domain bulunamadı" /></div>
      ) : (
        <div className="mt-2.5 space-y-2.5">
          {shown.map((d, i) => {
            const renk = domainColor(d.daysLeft)
            const dolgu = renk === TXT ? "#A78BFA" : renk
            /* Çubuk: bir yıllık yenileme döngüsünde kalan süre */
            const pct = d.daysLeft === null ? 0 : Math.max(2, Math.min(100, (d.daysLeft / 365) * 100))
            const tarih = d.expiresAt
              ? new Date(d.expiresAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })
              : null
            return (
              <div key={d.domain}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium" style={{ color: TXT }}>{d.domain}</span>
                  <span className="shrink-0 tabular-nums" style={{ color: renk }}>
                    <span className="text-[17px] font-light leading-none">{d.daysLeft ?? "—"}</span>
                    <span className="ml-0.5 text-[9px]" style={{ color: TXT_DIM }}>gün</span>
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: hazir ? `${pct}%` : "0%",
                        background: dolgu,
                        boxShadow: `0 0 6px ${dolgu}88`,
                        transition: "width 1.2s cubic-bezier(.2,.8,.2,1)",
                        transitionDelay: `${i * 90}ms`,
                      }}
                    />
                  </div>
                  {tarih && <span className="shrink-0 text-[9px] tabular-nums" style={{ color: TXT_DIM }}>{tarih}</span>}
                </div>
              </div>
            )
          })}
          {rest > 0 && (
            <div className="text-[9px] uppercase" style={{ color: TXT_DIM, letterSpacing: "0.14em" }}>
              +{rest} domain daha
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════
   Şerit
══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   Kur yazıcıları — kur-api'nin PUSLICANCE (SQL) ve pusula.txt (FTP)
   yazımları. İkisi de dakikada bir yazar; durursa müşterilerin kur
   ekranı sessizce bayatlar, alarm üretmez. Bu yüzden sürekli gözde.
══════════════════════════════════════════════════════════ */

/** Son yazma bundan eskiyse dikkat / kritik (yazma aralığı 1 dk) */
const KUR_UYARI_DK = 3
const KUR_KRITIK_DK = 10

function kurYaziciDurumu(w: KurYazici | null | undefined, now: Date): { value: string; color: string; alt: string | null } {
  if (!w) return { value: "—", color: TXT_DIM, alt: null }
  if (!w.enabled) return { value: "Kapalı", color: TXT_DIM, alt: null }
  if (!w.lastAt) return { value: "Yazmadı", color: RED, alt: w.lastError }
  const dk = (now.getTime() - new Date(w.lastAt).getTime()) / 60_000
  const color = dk >= KUR_KRITIK_DK || w.state === "error" ? RED : dk >= KUR_UYARI_DK || w.lastError ? AMBER : TXT
  return { value: formatAgo(w.lastAt, now), color, alt: w.lastError }
}

/**
 * Yazıcı satırı — ortada veri akışı. Yazıcı yazıyorsa paketler hedefe
 * doğru akar; durmuşsa akış kesilir. Uzaktan bakınca "canlı mı" sorusu
 * akışın kendisinden okunuyor.
 */
function KurSatiri({ ad, alt, w, now, gecikme }: { ad: string; alt: string; w: KurYazici | null | undefined; now: Date; gecikme: number }) {
  const d = kurYaziciDurumu(w, now)
  const canli = d.color === TXT
  const renk = canli ? GREEN : d.color
  return (
    <div className="flex items-center gap-3">
      <div className="w-[62px] shrink-0">
        <div className="text-[17px] font-semibold leading-none" style={{ color: TXT }}>{ad}</div>
        <div className="mt-1.5 truncate text-[10px]" style={{ color: TXT_DIM }}>{alt}</div>
      </div>

      {/* Kenarlarda sönme maske ile — çizgi kutudan çıkmıyormuş gibi */}
      <div
        className="relative h-[24px] min-w-0 flex-1 overflow-hidden"
        style={{
          maskImage: "linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent)",
        }}
      >
        {/*  Veri akışı: kesikli hat üzerinde paketler hedefe doğru akar.
             Yazıcı durmuşsa paket yok, hat soluk ve durum renginde.     */}
        <div
          className="absolute inset-x-0 top-1/2 h-0 -translate-y-1/2 border-t border-dashed"
          style={{ borderColor: canli ? "rgba(255,255,255,0.14)" : `${renk}88` }}
        />
        {canli && [0, 1, 2].map((p) => (
          <span
            key={p}
            className="tv-kur-paket absolute top-1/2 h-[5px] w-[18px] -translate-y-1/2 rounded-full"
            style={{
              background: `linear-gradient(90deg, transparent, ${renk})`,
              boxShadow: `0 0 8px ${renk}`,
              animationDelay: `${gecikme + p * 0.8}s`,
            }}
          />
        ))}
      </div>

      <div className="w-[70px] shrink-0 text-right">
        <div className="truncate text-[15px] font-light leading-none tabular-nums" style={{ color: d.color }}>{d.value}</div>
        {w?.lastCount != null && <div className="mt-1.5 text-[10px] tabular-nums" style={{ color: TXT_DIM }}>{w.lastCount} kur</div>}
      </div>
    </div>
  )
}

export function KurYazicilarCard({ data }: { data: { sql: KurYazici | null; ftp: KurYazici | null } | null | undefined }) {
  const now = new Date()
  const hatalar = [data?.sql, data?.ftp].map((w) => w?.lastError).filter(Boolean)
  return (
    <Card>
      <Title>Kur Yazıcıları</Title>
      {!data ? (
        <div className="mt-2.5"><Empty text="Kur API'ye ulaşılamadı" /></div>
      ) : (
        /*  Satırlar kartın boyuna eşit dağılır — kart satırdaki komşularıyla
            aynı boya uzadığında içi boş kalmasın.                       */
        <div className="mt-2 flex flex-1 flex-col justify-evenly gap-3">
          <KurSatiri ad="SQL" alt="PUSLICANCE" w={data.sql} now={now} gecikme={0} />
          <KurSatiri ad="FTP" alt="pusula.txt" w={data.ftp} now={now} gecikme={-0.8} />
          {hatalar.map((h, i) => (
            <div key={i} className="truncate text-[9px]" style={{ color: AMBER }}>{h}</div>
          ))}
        </div>
      )}
      <style>{`
        @keyframes tv-kur-paket { 0% { left: 0%; opacity: 0 } 15% { opacity: 1 } 80% { opacity: 1 } 100% { left: 88%; opacity: 0 } }
        .tv-kur-paket { animation: tv-kur-paket 2.4s linear infinite; left: 0 }

      `}</style>
    </Card>
  )
}


/**
 * Sağ taraftaki karartı. Kartlar artık page.tsx'teki 3×3 ızgarada
 * (satırları hizalı); bu bileşen yalnız okunabilirlik zeminini çiziyor.
 */
export function RightRail() {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 right-0 w-[50%]"
      style={{
        background:
          "linear-gradient(270deg, rgba(6,8,14,0.94) 0%, rgba(6,8,14,0.72) 45%, rgba(6,8,14,0.30) 75%, rgba(6,8,14,0) 100%)",
      }}
    />
  )
}
