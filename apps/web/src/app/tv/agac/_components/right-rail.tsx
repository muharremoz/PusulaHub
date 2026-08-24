"use client"

/**
 * Sağ şerit — trafik, çevrimdışı yedekler ve domain yenileme kartları.
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

import type { BandwidthData } from "@/lib/bandwidth"
import type { SpareBackupOffline } from "@/lib/sparebackup-offline"
import type { DomainExpiry } from "@/lib/domain-expiry"

const FLOW    = "#7DD3FC"
const TXT     = "#D4D4D8"
const TXT_DIM = "#8B8B93"
const AMBER   = "#FBBF24"
const RED     = "#F87171"

/** Listelerde en fazla kaç satır gösterilir */
const MAX_ROWS = 4

/* ══════════════════════════════════════════════════════════
   Ortak parçalar
══════════════════════════════════════════════════════════ */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[12px]"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="px-5 py-3.5">{children}</div>
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

function Rate({ dir, value }: { dir: "down" | "up"; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[12px] leading-none" style={{ color: TXT_DIM }}>
        {dir === "down" ? "↓" : "↑"}
      </span>
      <span
        className="font-mono text-[25px] font-bold leading-none tabular-nums"
        style={{ color: FLOW }}
      >
        {value}
      </span>
      <span
        className="text-[9px] font-medium uppercase"
        style={{ color: TXT_DIM, letterSpacing: "0.12em" }}
      >
        Mb/s
      </span>
    </div>
  )
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-[8px] font-medium uppercase"
        style={{ color: TXT_DIM, letterSpacing: "0.20em" }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 font-mono text-[14px] font-semibold leading-none tabular-nums"
        style={{ color: TXT }}
      >
        {value}
      </div>
    </div>
  )
}

function TrafficCard({ data }: { data: BandwidthData | null }) {
  return (
    <Card>
      <Title>İnternet Trafiği</Title>
      <div className="mt-3 flex items-baseline gap-7">
        <Rate dir="down" value={data ? formatMbps(data.live.rxMbps) : "—"} />
        <Rate dir="up"   value={data ? formatMbps(data.live.txMbps) : "—"} />
      </div>
      <Divider />
      {data ? (
        <div className="flex items-start gap-7">
          <Total label="Bugün" value={formatTraffic(data.daily.totalGB)} />
          <Total label="Bu ay"  value={formatTraffic(data.monthly.totalGB)} />
        </div>
      ) : (
        <Empty text="Servise ulaşılamadı" />
      )}
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════
   Çevrimdışı yedekler
══════════════════════════════════════════════════════════ */

function BackupsCard({ data }: { data: SpareBackupOffline | null }) {
  const list  = data?.offline ?? []
  const count = list.length
  const shown = list.slice(0, MAX_ROWS)
  const rest  = count - shown.length

  return (
    <Card>
      <Title>Çevrimdışı Yedekler</Title>

      {!data ? (
        <div className="mt-2"><Empty text="Servise ulaşılamadı" /></div>
      ) : count === 0 ? (
        <div className="mt-2"><Empty text="Tümü çevrimiçi" /></div>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className="font-mono text-[25px] font-bold leading-none tabular-nums"
              style={{ color: AMBER }}
            >
              {count}
            </span>
            <span className="font-mono text-[11px]" style={{ color: TXT_DIM }}>
              / {data.totalActive}
            </span>
            <span
              className="ml-auto text-[8px] font-medium uppercase"
              style={{ color: TXT_DIM, letterSpacing: "0.18em" }}
            >
              {data.thresholdMins} dk+
            </span>
          </div>
          <Divider />
          {shown.map((f) => (
            <Row
              key={f.firkod}
              name={f.firma}
              value={formatMinutesAgo(f.minutesAgo)}
              color={AMBER}
            />
          ))}
          {rest > 0 && (
            <div className="pt-1 text-[10px]" style={{ color: TXT_DIM }}>
              +{rest} firma daha
            </div>
          )}
        </>
      )}
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════
   Domain yenileme
══════════════════════════════════════════════════════════ */

function DomainsCard({ data }: { data: DomainExpiry[] | null }) {
  // Liste zaten kalan güne göre artan sıralı geliyor (lib/domain-expiry)
  const list  = data ?? []
  const shown = list.slice(0, MAX_ROWS)
  const rest  = list.length - shown.length

  return (
    <Card>
      <Title>Domain Yenileme</Title>

      {!data ? (
        <div className="mt-2"><Empty text="Sorgulanıyor…" /></div>
      ) : list.length === 0 ? (
        <div className="mt-2"><Empty text="Domain bulunamadı" /></div>
      ) : (
        <div className="mt-2">
          {shown.map((d) => (
            <Row
              key={d.domain}
              name={d.domain}
              value={d.daysLeft === null ? "—" : `${d.daysLeft} g`}
              color={domainColor(d.daysLeft)}
            />
          ))}
          {rest > 0 && (
            <div className="pt-1 text-[10px]" style={{ color: TXT_DIM }}>
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

interface Props {
  bandwidth:    BandwidthData | null
  offlineFirms: SpareBackupOffline | null
  domains:      DomainExpiry[] | null
}

export function RightRail({ bandwidth, offlineFirms, domains }: Props) {
  return (
    <>
      {/* Sağdan sola sönen karartı — kartların okunabilirlik zemini */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-[26%]"
        style={{
          background:
            "linear-gradient(270deg, rgba(6,8,14,0.94) 0%, rgba(6,8,14,0.72) 38%, rgba(6,8,14,0.30) 70%, rgba(6,8,14,0) 100%)",
        }}
      />

      <div className="pointer-events-none absolute right-6 top-6 flex w-[262px] select-none flex-col gap-3">
        <TrafficCard data={bandwidth} />
        <BackupsCard data={offlineFirms} />
        <DomainsCard data={domains} />
      </div>
    </>
  )
}
