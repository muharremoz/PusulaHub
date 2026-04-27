"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { cn } from "@/lib/utils"
import { Activity, AlertTriangle, CheckCircle2, WifiOff, Volume2, VolumeX } from "lucide-react"
import { DottedGlowBackground } from "@/components/ui/dotted-glow-background"
import { HyperText } from "@/components/ui/hyper-text"

/* ══════════════════════════════════════════════════════════
   Proje stili — Dark varyantı
   ──────────────────────────────────────────────────────────
   Light'taki çift katmanlı kart:
     outer  #F4F2F0      → dark: #171717 (zinc-900)
     inner  #FFFFFF      → dark: #27272A (zinc-800)
     shadow 0 2px 4px…   → dark: 0 2px 6px rgba(0,0,0,.4)
   Aynı radius ve padding pattern: p-2 pb-0, rounded-[8px]/[4px].
   TV 4K 55" için font ölçekleri büyütülmüş ama tipografi mantığı aynı:
   uppercase tracking-wide label + tabular-nums büyük sayı.
══════════════════════════════════════════════════════════ */

const OUTER_BG = "bg-[#171717]"
const OUTER_BG_HEX = "#171717"
const INNER_BG = "bg-[#27272A]"
const INNER_SHADOW = { boxShadow: "0 2px 6px rgba(0,0,0,0.4)" } as const

/** Dış kart arka planına status rengiyle 135° çapraz çizgi pattern */
function stripedBg(color: string): React.CSSProperties {
  return {
    backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 1px, transparent 1px 10px), linear-gradient(${OUTER_BG_HEX},${OUTER_BG_HEX})`,
  }
}

const STRIPE_COLOR = {
  emerald: "rgba(52,211,153,0.09)",
  amber:   "rgba(251,191,36,0.12)",
  red:     "rgba(239,68,68,0.15)",
  sky:     "rgba(125,211,252,0.08)",
  zinc:    "rgba(255,255,255,0.05)",
} as const

type KumaStatus = "up" | "down" | "pending" | "maintenance" | "unknown"

interface KumaMonitor {
  name:       string
  type:       string
  hostname:   string | null
  url:        string | null
  port:       string | null
  status:     KumaStatus
  responseMs: number | null
}

interface ExchangeHealthEntry {
  status:        string
  state:         string
  lastUpdatedAt: string
  lastChangedAt: string
  lastError:     string | null
}
interface MonitoringResponse {
  ok:              true
  fetchedAt:       string
  counts:          { total: number; online: number; warning: number; offline: number }
  monitors:        KumaMonitor[]
  exchangeHealth?: Record<string, ExchangeHealthEntry> | null
}

/** Birkaç saniye önce / dakika önce / saat önce formatı */
function formatAgo(iso: string, now: Date): string {
  const diff = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return `${Math.round(diff)} sn önce`
  if (diff < 3600)  return `${Math.round(diff / 60)} dk önce`
  if (diff < 86400) return `${Math.round(diff / 3600)} sa önce`
  return `${Math.round(diff / 86400)} gün önce`
}

/** Döviz mini kartlarında kaynak adını health endpoint anahtarına eşle */
const EXCHANGE_HEALTH_KEY: Record<string, string> = {
  "Altınkaynak": "altinkaynak",
  "Datshop":     "datshop",
  "Ozankur":     "ozankur",
  "TCMB":        "tcmb",
  "Pusula":      "pusula",
}

type UiStatus = "online" | "warning" | "offline"

function mapStatus(s: KumaStatus): UiStatus {
  if (s === "up") return "online"
  if (s === "down") return "offline"
  return "warning"
}

function formatTarget(m: KumaMonitor): string {
  if (m.hostname) return m.hostname
  if (m.url) return m.url.replace(/^https?:\/\//, "")
  return "—"
}

/* ══════════════════════════════════════════════════════════
   Saat
══════════════════════════════════════════════════════════ */
function useClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** "3 dk" / "1 sa 4 dk" kısa süre formatı */
function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60)    return `${s} sn`
  const m = Math.floor(s / 60)
  if (m < 60)    return `${m} dk`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h} sa ${rm} dk` : `${h} sa`
}

/**
 * Her monitor'ün (status, since) durumunu takip eder — status değiştiğinde
 * `since` sıfırlanır. DOWN süresi ve olay log'u için referans.
 */
interface StatusTrack { status: KumaStatus; since: number }
interface StatusEvent { name: string; from: KumaStatus; to: KumaStatus; at: number }

function useStatusTracker(monitors: KumaMonitor[] | null): {
  tracker: Map<string, StatusTrack>
  events:  StatusEvent[]
  lastDownAt: number | null
} {
  const trackerRef = useRef<Map<string, StatusTrack>>(new Map())
  const [events, setEvents] = useState<StatusEvent[]>([])
  const [lastDownAt, setLastDownAt] = useState<number | null>(null)

  useEffect(() => {
    if (!monitors) return
    const now = Date.now()
    const map = trackerRef.current
    const newEvents: StatusEvent[] = []
    let anyNewDown = false

    for (const m of monitors) {
      const prev = map.get(m.name)
      if (!prev) {
        map.set(m.name, { status: m.status, since: now })
      } else if (prev.status !== m.status) {
        newEvents.push({ name: m.name, from: prev.status, to: m.status, at: now })
        if (m.status === "down" && prev.status !== "down") anyNewDown = true
        map.set(m.name, { status: m.status, since: now })
      }
    }
    if (newEvents.length > 0) {
      setEvents((prev) => [...newEvents, ...prev].slice(0, 20))
    }
    if (anyNewDown) setLastDownAt(now)
  }, [monitors])

  return { tracker: trackerRef.current, events, lastDownAt }
}

/** Kısa beep — DOWN olayında çalmak için. WebAudio, asset yok. */
function playBeep() {
  try {
    type WindowWithWebkit = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }
    const w = window as WindowWithWebkit
    const Ctx = window.AudioContext ?? w.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = "square"
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
    setTimeout(() => ctx.close(), 700)
  } catch {
    // sessiz fail
  }
}

/* ══════════════════════════════════════════════════════════
   KPI Kartı — /monitoring'deki StatsCard'ın dark + TV ölçekli hali
══════════════════════════════════════════════════════════ */
function KpiCard({
  title, value, subtitle, trend, accent, pulse,
}: {
  title:    string
  value:    string | number
  subtitle: string
  trend?:   { value: string; positive: boolean }
  accent:   "emerald" | "amber" | "red" | "zinc"
  pulse?:   boolean
}) {
  const palette =
    accent === "emerald" ? { txt: "text-emerald-400", rgb: "52,211,153" } :
    accent === "amber"   ? { txt: "text-amber-400",   rgb: "251,191,36" } :
    accent === "red"     ? { txt: "text-red-400",     rgb: "239,68,68"  } :
                           { txt: "text-zinc-100",    rgb: "161,161,170" }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[6px] border border-white/5",
        pulse && "animate-[pulse_1.6s_ease-in-out_infinite]",
      )}
      style={{
        background: `linear-gradient(145deg, rgba(${palette.rgb},0.08) 0%, rgba(20,20,23,0.95) 55%, rgba(14,14,16,1) 100%)`,
        boxShadow: `0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 40px rgba(${palette.rgb},0.04)`,
      }}
    >
      {/* Üst accent şeridi — status renkli gradient ışık çizgisi */}
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, transparent, rgba(${palette.rgb},1), transparent)`,
          boxShadow: `0 0 10px rgba(${palette.rgb},0.6)`,
        }}
      />

      {/* Değerin arkasındaki yumuşak renk halosu */}
      <div
        className="pointer-events-none absolute left-4 top-8 h-16 w-24 rounded-full opacity-50"
        style={{
          background: `radial-gradient(ellipse at center, rgba(${palette.rgb},0.35), transparent 70%)`,
          filter: "blur(18px)",
        }}
      />

      <div className="relative px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-1.5 rounded-full"
            style={{
              backgroundColor: `rgb(${palette.rgb})`,
              boxShadow: `0 0 8px rgba(${palette.rgb},0.9)`,
            }}
          />
          <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-zinc-400">{title}</p>
        </div>
        <p className={cn("mt-1.5 font-mono text-[44px] font-black tabular-nums leading-none", palette.txt)}>
          {value}
        </p>
        {trend && (
          <p className={cn("mt-2 text-[11px] font-semibold tracking-wide", trend.positive ? "text-emerald-300/90" : "text-red-300/90")}>
            {trend.value}
          </p>
        )}
        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">{subtitle}</p>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Saat Kartı — KPI row'a hizalı
══════════════════════════════════════════════════════════ */
function ClockCard({ fetchedAt }: { fetchedAt?: string }) {
  const now = useClock()
  const time = now?.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? "—"
  const date = now?.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long" }) ?? ""
  const updatedTime = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null

  return (
    <div
      className="group relative overflow-hidden rounded-[6px] border border-white/5"
      style={{
        background: "linear-gradient(145deg, rgba(125,211,252,0.08) 0%, rgba(20,20,23,0.95) 55%, rgba(14,14,16,1) 100%)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 40px rgba(125,211,252,0.04)",
      }}
    >
      {/* Üst cyan ışık şeridi */}
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(125,211,252,1), transparent)",
          boxShadow: "0 0 10px rgba(125,211,252,0.6)",
        }}
      />

      {/* Canlı bağlantı dot'u sağ üst */}
      <span className="absolute top-2 right-2 z-10">
        <LiveDot ui="online" size="size-2" />
      </span>

      <div className="relative px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-1.5 rounded-full"
            style={{ backgroundColor: "rgb(125,211,252)", boxShadow: "0 0 8px rgba(125,211,252,0.9)" }}
          />
          <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-zinc-400">Saat</p>
        </div>
        <p className="mt-1.5 font-mono text-[44px] font-black tabular-nums leading-none text-zinc-100">{time}</p>
        <p className="mt-2 text-[11px] text-zinc-400 capitalize">{date}</p>
        {updatedTime && (
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
            Son güncelleme <span className="text-zinc-300 font-mono tabular-nums normal-case">{updatedTime}</span>
          </p>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Monitor Tile — MonitorCard'ın dark TV hali
══════════════════════════════════════════════════════════ */
const STATUS_CONFIG: Record<UiStatus, { label: string; dot: string; dotPing: string; badge: string; bg: string; ring: string; name: string; target: string }> = {
  online: {
    label: "Çevrimiçi",
    dot:    "bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]",
    dotPing: "bg-emerald-400",
    badge:  "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
    bg:     "bg-black",
    ring:   "",
    name:   "text-zinc-100",
    target: "text-zinc-500",
  },
  warning: {
    label: "Uyarı",
    dot:    "bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.8)]",
    dotPing: "bg-amber-400",
    badge:  "text-amber-200 bg-amber-500/15 border-amber-500/40",
    bg:     "bg-black",
    ring:   "ring-1 ring-amber-500/30",
    name:   "text-amber-100",
    target: "text-amber-200/50",
  },
  offline: {
    label: "Çevrimdışı",
    dot:    "bg-red-500 shadow-[0_0_18px_rgba(239,68,68,1)]",
    dotPing: "bg-red-500",
    badge:  "text-red-200 bg-red-500/15 border-red-500/40",
    bg:     "bg-black",
    ring:   "ring-2 ring-red-500/50 animate-[pulse_1.5s_ease-in-out_infinite]",
    name:   "text-red-100",
    target: "text-red-200/60",
  },
}

/**
 * Canlı yayın noktası — dolu bir daire + genişleyip kaybolan ping halkası
 * (radar efekti). Tailwind `animate-ping` opacity 1→0 + scale 1→2.
 */
function LiveDot({ ui, size = "size-4", className }: { ui: UiStatus; size?: string; className?: string }) {
  const cfg = STATUS_CONFIG[ui]
  return (
    <span className={cn("relative inline-flex shrink-0", size, className)}>
      <span className={cn("absolute inset-0 rounded-full opacity-75 animate-ping", cfg.dotPing)} />
      <span className={cn("relative inline-block rounded-full w-full h-full", cfg.dot)} />
    </span>
  )
}

/** Bir grup başlık + o grubun monitor kartları */
function MonitorGroup({ title, count, monitors, tracker }: { title: string; count: number; monitors: KumaMonitor[]; tracker: Map<string, StatusTrack> }) {
  const downCount = monitors.filter((m) => mapStatus(m.status) === "offline").length
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-3 px-1">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400">{title}</h2>
        <span className="text-[10px] font-mono text-zinc-600">{count} monitor</span>
        {downCount > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-300 bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 rounded-[3px]">
            {downCount} çevrimdışı
          </span>
        )}
        <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 to-transparent" />
      </div>
      <div className="grid content-start gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {monitors.map((m) => <MonitorTile key={m.name} m={m} since={tracker.get(m.name)?.since} />)}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   DOWN Alarm Banner — ekranın en üstünde tam genişlik kırmızı şerit
══════════════════════════════════════════════════════════ */
function DownBanner({ monitors, tracker }: { monitors: KumaMonitor[]; tracker: Map<string, StatusTrack> }) {
  const now = useClock()
  // En uzun süredir DOWN olan en başta
  const sorted = [...monitors].sort((a, b) => (tracker.get(a.name)?.since ?? 0) - (tracker.get(b.name)?.since ?? 0))

  return (
    <div className="rounded-[8px] bg-red-950/80 border-2 border-red-500/60 px-4 py-3 flex items-center gap-4 animate-[pulse_1.2s_ease-in-out_infinite] shadow-[0_0_30px_rgba(239,68,68,0.4)]">
      <AlertTriangle className="size-8 text-red-300 shrink-0 animate-pulse" />
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-red-300">
          {monitors.length === 1 ? "1 SİSTEM ÇEVRİMDIŞI" : `${monitors.length} SİSTEM ÇEVRİMDIŞI`}
        </p>
        <div className="flex items-center gap-4 mt-1 flex-wrap">
          {sorted.map((m) => {
            const since = tracker.get(m.name)?.since
            const dur   = since && now ? formatDuration(now.getTime() - since) : null
            return (
              <span key={m.name} className="text-[20px] font-bold text-white inline-flex items-baseline gap-2">
                <span>{m.name}</span>
                {dur && <span className="text-[13px] font-mono text-red-200/80">· {dur}</span>}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   DOWN SPOTLIGHT — tek monitör çevrimdışıyken tüm ekranı karart,
   ilgili kartı ortada büyük göster, sağında sorun + çözüm anlat
══════════════════════════════════════════════════════════ */

interface Troubleshoot {
  title: string
  problem: string[]
  solution: string[]
}

function troubleshootFor(m: KumaMonitor): Troubleshoot {
  const target = m.hostname ?? m.url ?? m.name
  switch (m.type) {
    case "ping":
      return {
        title: "Sunucuya ulaşılamıyor",
        problem: [
          `${target} adresine ICMP (ping) yanıtı gelmiyor.`,
          "Sunucu kapalı, network bağlantısı kopuk veya ICMP firewall tarafından engelleniyor olabilir.",
        ],
        solution: [
          "1. Sunucu fiziksel olarak açık mı kontrol et (güç + ekran).",
          "2. Network kablosu / switch portu link veriyor mu bak.",
          "3. RDP / KVM ile giriş dene — sadece ICMP mi engelli?",
          "4. Windows Defender Firewall → ICMPv4-In kuralı açık mı.",
          "5. Switch / router üzerinde VLAN değişikliği oldu mu kontrol et.",
        ],
      }
    case "http":
    case "keyword":
      return {
        title: "HTTP servisi yanıt vermiyor",
        problem: [
          `${target} HTTP isteğine cevap vermiyor (timeout veya 5xx).`,
          "Web servisi çökmüş, port dinlenmiyor veya uygulama başlatılamamış olabilir.",
        ],
        solution: [
          "1. Sunucuya RDP ile bağlan, IIS / pm2 / docker durumunu kontrol et.",
          `2. PowerShell: Test-NetConnection ${m.hostname ?? "<host>"} -Port ${m.port ?? "80"}`,
          "3. Servis loglarına bak: pm2 logs <name>  veya  Event Viewer → Application.",
          "4. Disk doluluk + RAM tüketimi kontrolü (servis OOM olmuş olabilir).",
          "5. Servisi yeniden başlat: pm2 restart <name>  veya  iisreset.",
        ],
      }
    case "dns":
      return {
        title: "DNS çözümlemesi başarısız",
        problem: [
          `${target} için DNS sorgusu cevap vermiyor.`,
          "DNS sunucu kapalı, zone bozuk veya UDP/53 portu engelli olabilir.",
        ],
        solution: [
          "1. DNS sunucu host'unu ping ile kontrol et.",
          "2. nslookup veya Resolve-DnsName ile manuel sorgu çek.",
          "3. DNS Server servisi (Windows) çalışıyor mu — services.msc.",
          "4. Zone dosyası / forwarder konfigürasyonu değişmiş mi.",
          "5. UDP/53 firewall kuralı açık mı kontrol et.",
        ],
      }
    case "port":
      return {
        title: "Port erişilemiyor",
        problem: [
          `${target}:${m.port ?? "?"} TCP portu kapalı veya yanıt vermiyor.`,
          "Servis çökmüş, port değişmiş veya firewall engelliyor olabilir.",
        ],
        solution: [
          "1. Sunucu üzerinde: netstat -ano | findstr :<port> — port LISTENING mi.",
          "2. Servisi başlat / yeniden başlat.",
          "3. Windows Firewall inbound kuralı kontrolü.",
          "4. LAN üzerinden başka bir PC'den telnet / Test-NetConnection ile dene.",
        ],
      }
    default:
      return {
        title: "Servis çevrimdışı",
        problem: [
          `${m.name} (${m.type}) monitörü hata veriyor.`,
          "Servisin türüne özel kontrol gerekebilir.",
        ],
        solution: [
          "1. Uptime Kuma panelinden monitör detayına bak (10.15.2.6:3001).",
          "2. Son heartbeat hata mesajını incele.",
          "3. İlgili sunucuda servis loglarını kontrol et.",
          "4. Servisi yeniden başlat ve tekrar test et.",
        ],
      }
  }
}

function DownSpotlight({
  monitors,
  tracker,
  histories,
  onDismiss,
}: {
  monitors: KumaMonitor[]
  tracker: Map<string, { since: number }>
  histories: Record<string, number[]>
  onDismiss?: () => void
}) {
  const [idx, setIdx] = useState(0)
  // Birden fazla DOWN varsa 8 saniyede bir döndür
  useEffect(() => {
    if (monitors.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % monitors.length), 8000)
    return () => clearInterval(t)
  }, [monitors.length])
  const safeIdx = Math.min(idx, monitors.length - 1)
  const m       = monitors[safeIdx]
  if (!m) return null
  const since   = tracker.get(m.name)?.since
  const tip     = troubleshootFor(m)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-8 backdrop-blur-md bg-black/85"
      style={{ animation: "tv-spotlight-in 220ms ease-out" }}
    >
      <style>{`
        @keyframes tv-spotlight-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes tv-spotlight-card-in {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <div
        className="grid w-full max-w-[1600px] gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] items-stretch"
        style={{ animation: "tv-spotlight-card-in 320ms ease-out" }}
      >
        {/* SOL — büyük down monitör kartı */}
        <div className="flex">
          <div
            className="w-full rounded-[10px] relative overflow-hidden ring-2 ring-red-500/70 bg-red-950/40"
            style={{ boxShadow: "0 0 0 1px rgba(239,68,68,0.4), 0 0 60px rgba(239,68,68,0.35), 0 20px 60px rgba(0,0,0,0.7)" }}
          >
            <DottedGlowBackground
              gap={16}
              radius={1.8}
              color="rgb(239,68,68)"
              darkColor="rgb(239,68,68)"
              glowColor="rgb(239,68,68)"
              darkGlowColor="rgb(239,68,68)"
              opacity={0.55}
              speedScale={2.4}
              className="pointer-events-none"
            />
            <div
              className="relative z-10 m-3 rounded-[8px] overflow-hidden border border-red-400/40 backdrop-blur-[6px]"
              style={{
                background: "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.04))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              <div className="p-8 min-h-[480px] flex flex-col">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 text-red-300">
                      <AlertTriangle className="size-5 animate-pulse" />
                      <span className="text-[12px] font-bold uppercase tracking-[0.3em]">Çevrimdışı</span>
                    </div>
                    <HyperText
                      as="div"
                      duration={500}
                      animateOnHover={false}
                      className="mt-3 truncate text-[44px] font-bold text-white !py-0 !text-[44px] tracking-tight"
                    >
                      {m.name}
                    </HyperText>
                    <div className="mt-1 truncate font-mono text-[16px] text-red-200/80">
                      {m.hostname ?? m.url ?? "—"}{m.port ? `:${m.port}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-[5px] border border-red-400/40 bg-red-500/15 px-3 py-1 font-mono text-[14px] font-semibold uppercase tracking-wider text-red-200">
                    {m.type}
                  </span>
                </div>

                <div className="mt-auto pt-8 space-y-5">
                  {/* Yanıt çizgisi — son 40 ölçüm, DOWN'a düşüş görünür */}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-300/80 mb-2">Yanıt Geçmişi</div>
                    <Sparkline data={histories[m.name] ?? []} color="rgb(239,68,68)" width={800} height={120} />
                  </div>
                  <div className="flex items-end justify-between gap-6 flex-wrap">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-300/80">Yanıt</div>
                      <div className="font-mono text-[64px] font-bold text-red-300 tabular-nums leading-none">—</div>
                    </div>
                    {since && <DownTimer since={since} />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SAĞ — sorun + çözüm */}
        <div className="flex">
          <div
            className="w-full rounded-[10px] bg-zinc-900/70 border border-zinc-700/60 backdrop-blur-[6px] flex flex-col"
            style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)" }}
          >
            <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between gap-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-400">Olası Sorun ve Çözüm</div>
              {monitors.length > 1 && (
                <div className="text-[10px] font-mono text-zinc-500 tabular-nums">
                  {safeIdx + 1} / {monitors.length} · 8sn
                </div>
              )}
            </div>

            <div className="p-6 flex-1 overflow-auto">
              <div className="text-[24px] font-bold text-white mb-4">{tip.title}</div>

              <div className="rounded-[6px] bg-red-950/40 border border-red-500/30 p-4 mb-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-300 mb-2">Sorun</div>
                <ul className="space-y-1.5">
                  {tip.problem.map((p, i) => (
                    <li key={i} className="text-[15px] text-red-100/90 leading-relaxed">{p}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[6px] bg-emerald-950/30 border border-emerald-500/30 p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-300 mb-2">Çözüm Adımları</div>
                <ol className="space-y-2">
                  {tip.solution.map((s, i) => (
                    <li key={i} className="text-[15px] text-emerald-50/90 leading-relaxed font-mono">{s}</li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-zinc-800/80 flex items-center justify-between gap-3">
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                Uptime Kuma · 10.15.2.6:3001
              </div>
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-200 px-2 py-1 rounded-[4px] hover:bg-zinc-800/60"
                  title="Kapat (sistem yeniden DOWN olursa tekrar açılır)"
                >
                  Kapat
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Sadece spotlight için — büyük tabular DOWN süre sayacı */
function DownTimer({ since }: { since: number }) {
  const now = useClock()
  if (!now) return null
  return (
    <div className="text-right">
      <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-300/80">Süre</div>
      <div className="font-mono text-[40px] font-bold text-red-200 tabular-nums leading-none">
        {formatDuration(now.getTime() - since)}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Event Log — son durum değişiklikleri
══════════════════════════════════════════════════════════ */
function EventLog({ events }: { events: StatusEvent[] }) {
  const visible = events.slice(0, 5)
  const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  const statusLabel = (s: KumaStatus) => s === "up" ? "UP" : s === "down" ? "DOWN" : s === "pending" ? "BEKLEMEDE" : s === "maintenance" ? "BAKIM" : "?"
  const statusColor = (s: KumaStatus) =>
    s === "up" ? "text-emerald-300" :
    s === "down" ? "text-red-300" :
    "text-amber-300"

  return (
    <div className="rounded-[6px] bg-zinc-900/60 border border-zinc-800/60 px-3 py-2 flex items-center gap-4 overflow-hidden">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 shrink-0">Son Olaylar</span>
      <div className="flex items-center gap-4 overflow-hidden flex-1 min-w-0">
        {visible.map((e, i) => (
          <span key={`${e.name}-${e.at}-${i}`} className="text-[11px] font-mono text-zinc-400 inline-flex items-center gap-1.5 shrink-0">
            <span className="text-zinc-600 tabular-nums">{fmtTime(e.at)}</span>
            <span className="text-zinc-200">{e.name}</span>
            <span className={cn("text-zinc-600")}>{statusLabel(e.from)}</span>
            <span className="text-zinc-600">→</span>
            <span className={cn("font-bold", statusColor(e.to))}>{statusLabel(e.to)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Grafana/Prometheus tarzı canlı sparkline çizgisi (akış + kuyruk efektli) */
function Sparkline({ data, color, width = 200, height = 28 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) {
    return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block w-full" />
  }
  const pad = 2
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const span = Math.max(max - min, 1)
  const w = width - pad * 2
  const h = height - pad * 2
  const step = data.length > 1 ? w / (data.length - 1) : w
  const points = data.map((v, i) => {
    const x = pad + i * step
    const y = pad + h - ((v - min) / span) * h
    return { x, y }
  })
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${height} L${points[0].x.toFixed(1)},${height} Z`
  const last = points[points.length - 1]
  const key     = color.replace(/[^a-z0-9]/gi, "")
  const gradId  = `spark-g-${key}`
  const sweepId = `spark-sw-${key}`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block w-full overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        {/* Soldan sağa akan parlaklık şeridi — "live data streaming" hissi */}
        <linearGradient id={sweepId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"   stopColor={color} stopOpacity="0" />
          <stop offset="45%"  stopColor={color} stopOpacity="0" />
          <stop offset="55%"  stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="65%"  stopColor={color} stopOpacity="0" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
          <animate attributeName="x1" values="-1;1" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="x2" values="0;2"  dur="2.4s" repeatCount="indefinite" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      {/* Ana çizgi */}
      <path d={line} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {/* Soldan sağa akan parlak şerit — çizginin üstünü gezer */}
      <path d={line} fill="none" stroke={`url(#${sweepId})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Son noktadan geri doğru kuyruk (glow trail) */}
      <path
        d={points.slice(-8).map((p, i, arr) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeOpacity="0.6"
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
      {/* Uç nokta — atım */}
      <circle cx={last.x} cy={last.y} r="2" fill={color}>
        <animate attributeName="r" values="2;3.5;2" dur="1.2s" repeatCount="indefinite" />
      </circle>
      <circle cx={last.x} cy={last.y} r="4" fill={color} opacity="0.35">
        <animate attributeName="r"       values="2;8;2"     dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0;0.6" dur="1.2s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}

function MonitorTile({ m, since }: { m: KumaMonitor; since?: number }) {
  const ui  = mapStatus(m.status)
  const cfg = STATUS_CONFIG[ui]
  const now = useClock()
  const respClass =
    m.responseMs === null ? "text-red-400" :
    m.responseMs < 30     ? "text-emerald-300" :
    m.responseMs < 80     ? "text-amber-300" :
                            "text-red-300"
  const downDuration = ui === "offline" && since && now ? formatDuration(now.getTime() - since) : null

  // Yanıt süresi geçmişi — son 40 ölçüm (canlı sparkline)
  const [history, setHistory] = useState<number[]>([])
  useEffect(() => {
    if (m.responseMs === null) return
    setHistory((h) => {
      const next = [...h, m.responseMs as number]
      return next.length > 40 ? next.slice(next.length - 40) : next
    })
  }, [m.responseMs])

  // Dotted glow — tam doygun status rengi (alpha animasyonu component içinde)
  const glow =
    ui === "online"  ? { dot: "rgb(52,211,153)",  glow: "rgb(52,211,153)",  speed: 0.8, tintA: "rgba(52,211,153,0.22)",  tintB: "rgba(52,211,153,0.05)" } :
    ui === "warning" ? { dot: "rgb(251,191,36)",  glow: "rgb(251,191,36)",  speed: 1.4, tintA: "rgba(251,191,36,0.25)",  tintB: "rgba(251,191,36,0.05)" } :
                       { dot: "rgb(239,68,68)",   glow: "rgb(239,68,68)",   speed: 2.2, tintA: "rgba(239,68,68,0.28)",   tintB: "rgba(239,68,68,0.06)" }

  const isDown = ui === "offline"

  return (
    <div className={cn("min-w-0", isDown && "tv-down-pulse")}>
      {/* Dış kart — glow'lu ana kart */}
      <div
        className={cn(
          "rounded-[5px] relative overflow-hidden p-2",
          cfg.bg,
          isDown ? "ring-2 ring-red-500/70" : cfg.ring,
        )}
        style={{
          ...INNER_SHADOW,
          ...(isDown && { boxShadow: "0 0 0 1px rgba(239,68,68,0.3), 0 0 10px rgba(239,68,68,0.2), 0 4px 16px rgba(0,0,0,0.5)" }),
        }}
      >
        {/* Dotted glow katmanı — duruma göre renk ve hız */}
        <DottedGlowBackground
          gap={14}
          radius={1.5}
          color={glow.dot}
          darkColor={glow.dot}
          glowColor={glow.glow}
          darkGlowColor={glow.glow}
          opacity={isDown ? 0.45 : 0.3}
          speedScale={glow.speed}
          className="pointer-events-none"
        />

        {/* İç kart — glow'un üstüne binen cam (glassmorphism) katman */}
        <div
          className={cn(
            "relative z-10 rounded-[4px] overflow-hidden backdrop-blur-[4px] border",
            isDown ? "border-red-400/40" : "border-white/5",
          )}
          style={{
            background: isDown
              ? "linear-gradient(135deg, rgba(239,68,68,0.22), rgba(239,68,68,0.04))"
              : "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
            boxShadow: "0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          <div className="min-h-[140px] p-3 flex flex-col">
            {/* Ad satırı — solda isim, sağda DOWN rozeti */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5" title={m.name}>
                  <HyperText
                    as="div"
                    duration={700}
                    animateOnHover={false}
                    className="truncate text-[16px] font-semibold text-zinc-100 !py-0 !text-[16px] tracking-normal"
                  >
                    {m.name}
                  </HyperText>
                </div>
                <div
                  className="mt-1 truncate font-mono text-[12px] text-zinc-400"
                  title={m.hostname ?? m.url ?? ""}
                >
                  {m.hostname ?? m.url ?? "—"}
                  {m.port ? `:${m.port}` : ""}
                </div>
              </div>
              {downDuration ? (
                <div className="shrink-0 flex flex-col items-end animate-pulse">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-red-300">Down</span>
                  <span className="text-[12px] font-mono font-bold text-red-200 tabular-nums leading-tight">{downDuration}</span>
                </div>
              ) : (
                <span
                  className="shrink-0 rounded-[3px] border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-300"
                  title={`Tür: ${m.type}`}
                >
                  {m.type}
                </span>
              )}
            </div>

            {/* Yanıt süresi + canlı sparkline */}
            <div className="mt-auto flex items-end justify-between gap-3 pt-3">
              <div className="flex items-baseline gap-1">
                <span className={cn("font-mono text-2xl font-bold tabular-nums", respClass)}>
                  {m.responseMs === null ? "—" : m.responseMs.toFixed(0)}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">ms</span>
              </div>
              <div className="flex-1 min-w-0">
                <Sparkline data={history} color={glow.dot} height={40} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Döviz Grup Tile — ExchangeCard'ın dark TV hali
══════════════════════════════════════════════════════════ */
const EXCHANGE_PREFIX = "Döviz - "

function stripExchangePrefix(name: string): string {
  return name.startsWith(EXCHANGE_PREFIX) ? name.slice(EXCHANGE_PREFIX.length) : name
}

function aggregateStatus(monitors: KumaMonitor[]): UiStatus {
  if (monitors.some((m) => mapStatus(m.status) === "offline")) return "offline"
  if (monitors.some((m) => mapStatus(m.status) === "warning")) return "warning"
  return "online"
}

function ExchangeTile({ monitors, health }: { monitors: KumaMonitor[]; health?: Record<string, ExchangeHealthEntry> | null }) {
  const ui    = aggregateStatus(monitors)
  const cfg   = STATUS_CONFIG[ui]
  const sorted = [...monitors].sort((a, b) => a.name.localeCompare(b.name, "tr"))
  const downSources    = monitors.filter((m) => mapStatus(m.status) === "offline").length
  const warningSources = monitors.filter((m) => mapStatus(m.status) === "warning").length
  const now = useClock()

  // Dış kart glow rengi — aggregate status
  const glow =
    ui === "online"  ? { dot: "rgb(52,211,153)",  speed: 0.8 } :
    ui === "warning" ? { dot: "rgb(251,191,36)",  speed: 1.4 } :
                       { dot: "rgb(239,68,68)",   speed: 2.2 }

  return (
    <div className="flex flex-col shrink-0 w-full lg:w-[260px] xl:w-[300px]">
      {/* Dış kart — dotted glow (monitör kartlarıyla aynı dil) */}
      <div
        className={cn("rounded-[5px] relative overflow-hidden p-2 flex flex-col flex-1", cfg.bg, cfg.ring)}
        style={INNER_SHADOW}
      >
        <DottedGlowBackground
          gap={14}
          radius={1.5}
          color={glow.dot}
          darkColor={glow.dot}
          glowColor={glow.dot}
          darkGlowColor={glow.dot}
          opacity={0.3}
          speedScale={glow.speed}
          className="pointer-events-none"
        />

        {/* İç cam katman */}
        <div
          className="relative z-10 rounded-[4px] overflow-hidden border border-white/5 backdrop-blur-[4px] flex flex-col flex-1"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
            boxShadow: "0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* Başlık satırı */}
          <div className="px-3 pt-2.5 pb-2 flex items-center gap-2 border-b border-white/5">
            <LiveDot ui={ui} size="size-2.5" />
            <h3 className="text-[13px] font-bold leading-none flex-1 truncate text-zinc-100">Döviz Kurları</h3>
            <span className={cn("text-[8px] font-bold uppercase tracking-wider shrink-0", ui === "online" ? "text-emerald-300" : ui === "warning" ? "text-amber-300" : "text-red-300")}>
              {ui === "online" ? `${monitors.length}/${monitors.length}` : ui === "offline" ? `${downSources} DOWN` : `${warningSources} UYARI`}
            </span>
          </div>

          {/* 5 kaynak — mini kart grid */}
          <div className="p-2 grid grid-cols-1 gap-2">
            {sorted.map((m) => {
              const s   = mapStatus(m.status)
              const ping = m.responseMs === null ? "—" : String(Math.max(1, Math.round(m.responseMs)))
              const respClass =
                m.responseMs === null ? "text-red-400" :
                m.responseMs < 30     ? "text-emerald-300" :
                m.responseMs < 80     ? "text-amber-300" :
                                        "text-red-300"
              const rowTint =
                s === "offline" ? "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.04))" :
                s === "warning" ? "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.03))" :
                                  "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))"
              const rowBorder =
                s === "offline" ? "border-red-400/30" :
                s === "warning" ? "border-amber-400/30" :
                                  "border-white/10"
              return (
                <div
                  key={m.name}
                  className={cn(
                    "relative rounded-[5px] overflow-hidden border px-3 py-2 flex items-center justify-between gap-2",
                    rowBorder,
                  )}
                  style={{ background: rowTint }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <LiveDot ui={s} size="size-1.5" />
                    <HyperText
                      as="span"
                      duration={700}
                      animateOnHover={false}
                      className="text-[17px] font-semibold truncate text-zinc-100 !py-0 !text-[17px] inline-block"
                    >
                      {stripExchangePrefix(m.name)}
                    </HyperText>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className={cn("text-[20px] font-black tabular-nums leading-none", respClass)}>{ping}</span>
                    {(() => {
                      const key = EXCHANGE_HEALTH_KEY[stripExchangePrefix(m.name)]
                      const hs  = key && health ? health[key] : null
                      if (!hs || !now) return null
                      return (
                        <span className="text-[11px] font-mono font-semibold text-zinc-300 tabular-nums">
                          {formatAgo(hs.lastUpdatedAt, now)}
                        </span>
                      )
                    })()}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Ana Sayfa
══════════════════════════════════════════════════════════ */
export default function TvMonitoringPage() {
  const [data, setData]   = useState<MonitoringResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  /* ── Test modu: fake DOWN monitor enjekte et (Active Directory'yi yapay DOWN göster) ── */
  const [testDown, setTestDown] = useState(false)
  const testDownUntilRef = useRef<number>(0)

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/monitoring`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok || !json.ok) setError(json.error ?? `HTTP ${res.status}`)
      else { setData(json); setError(null) }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata")
    }
  }, [])

  // Test butonu aktifken data'yı mutasyona uğrat — Active Directory'yi DOWN yap
  const dataForRender = useMemo<MonitoringResponse | null>(() => {
    if (!data || !testDown) return data
    const mutated = data.monitors.map((m) =>
      m.name === "Active Directory"
        ? { ...m, status: "down" as KumaStatus, responseMs: null }
        : m,
    )
    const online  = mutated.filter((m) => m.status === "up").length
    const warning = mutated.filter((m) => m.status === "pending" || m.status === "maintenance").length
    const offline = mutated.filter((m) => m.status === "down").length
    return { ...data, monitors: mutated, counts: { total: mutated.length, online, warning, offline } }
  }, [data, testDown])

  useEffect(() => {
    load()
    const t = setInterval(load, 1_000)
    return () => clearInterval(t)
  }, [load])

  const { exchangeMonitors, regularMonitors } = useMemo(() => {
    if (!dataForRender) return { exchangeMonitors: [], regularMonitors: [] as KumaMonitor[] }
    return {
      exchangeMonitors: dataForRender.monitors.filter((m) => m.name.startsWith(EXCHANGE_PREFIX)),
      regularMonitors:  dataForRender.monitors.filter((m) => !m.name.startsWith(EXCHANGE_PREFIX)),
    }
  }, [dataForRender])

  const { serverMonitors, serviceMonitors } = useMemo(() => {
    const rank = (s: KumaStatus) => (s === "down" ? 0 : s === "pending" || s === "maintenance" ? 1 : 2)
    const sort = (a: KumaMonitor, b: KumaMonitor) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name, "tr")
    // ping monitors → sunucular, geri kalan (http/keyword/dns) → servisler
    const servers  = regularMonitors.filter((m) => m.type === "ping").sort(sort)
    const services = regularMonitors.filter((m) => m.type !== "ping").sort(sort)
    return { serverMonitors: servers, serviceMonitors: services }
  }, [regularMonitors])

  /* ── Alarm tracker (DOWN süresi + olay log) ── */
  const { tracker, events, lastDownAt } = useStatusTracker(dataForRender?.monitors ?? null)
  const downMonitors = useMemo(
    () => (dataForRender?.monitors ?? []).filter((m) => m.status === "down"),
    [dataForRender],
  )

  /* ── Tüm monitörler için yanıt geçmişi (spotlight + ileride başka kart için) ── */
  const [histories, setHistories] = useState<Record<string, number[]>>({})
  useEffect(() => {
    const monitors = dataForRender?.monitors
    if (!monitors) return
    setHistories((prev) => {
      const next = { ...prev }
      for (const m of monitors) {
        const arr = next[m.name] ? [...next[m.name]] : []
        // DOWN ise 0 ms olarak işle ki spotlight'taki sparkline çizgisi düşüş gösterebilsin
        const v = m.responseMs === null ? 0 : m.responseMs
        arr.push(v)
        if (arr.length > 40) arr.splice(0, arr.length - 40)
        next[m.name] = arr
      }
      return next
    })
  }, [dataForRender])

  /* ── Ses toggle (localStorage) ── */
  const [soundOn, setSoundOn] = useState(false)
  useEffect(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("tv.sound") : null
    if (v === "1") setSoundOn(true)
  }, [])
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("tv.sound", soundOn ? "1" : "0")
  }, [soundOn])

  /* ── Alarm sesi —
     · Yeni DOWN olduğunda hemen çal (çift beep)
     · DOWN aktif kaldığı sürece her 5 saniyede bir tekrar
     · Tüm sistemler UP olunca sus
  ── */
  const lastBeepAtRef = useRef<number>(0)
  const anyDown = downMonitors.length > 0
  useEffect(() => {
    if (!soundOn || !lastDownAt) return
    if (lastDownAt <= lastBeepAtRef.current) return
    lastBeepAtRef.current = lastDownAt
    // Yeni olay → daha belirgin: iki kısa beep
    playBeep()
    setTimeout(() => playBeep(), 250)
  }, [lastDownAt, soundOn])

  useEffect(() => {
    if (!soundOn || !anyDown) return
    const t = setInterval(() => playBeep(), 5000)
    return () => clearInterval(t)
  }, [soundOn, anyDown])

  /* ── Loading ── */
  if (!data && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-4 text-zinc-400">
          <Activity className="size-10 animate-pulse" />
          <span className="text-[28px]">Uptime Kuma'ya bağlanılıyor…</span>
        </div>
      </div>
    )
  }

  /* ── Error ── */
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-16">
        <div className={cn("rounded-[8px] p-2 pb-0 max-w-2xl w-full", OUTER_BG)}>
          <div className={cn("rounded-[4px] text-center px-10 py-12", INNER_BG)} style={INNER_SHADOW}>
            <AlertTriangle className="size-20 text-amber-400 mx-auto mb-6" />
            <p className="text-[28px] font-bold mb-2 text-zinc-100">Uptime Kuma'ya ulaşılamadı</p>
            <p className="text-[16px] text-zinc-400">{error ?? "Bilinmeyen hata"}</p>
          </div>
          <div className="h-2" />
        </div>
      </div>
    )
  }

  const { counts, fetchedAt } = dataForRender ?? data
  const uptimePct = counts.total === 0 ? 0 : (counts.online / counts.total) * 100

  return (
    <div className="min-h-screen flex flex-col p-3 md:p-5 gap-3 bg-[#0E0E0E]">
      <style>{`
        @keyframes tv-down-pulse {
          0%,100% { transform: scale(1);     filter: drop-shadow(0 0 0px rgba(239,68,68,0)); }
          50%     { transform: scale(1.01); filter: drop-shadow(0 0 8px rgba(239,68,68,0.3)); }
        }
        .tv-down-pulse { animation: tv-down-pulse 1.6s ease-in-out infinite; }
      `}</style>
      {/* ── DOWN Alarm Banner — tam genişlik, yanıp söner ── */}
      {downMonitors.length > 0 && (
        <DownBanner monitors={downMonitors} tracker={tracker} />
      )}

      {/* ── Başlık şeridi (kompakt) ── */}
      <div className="flex items-center justify-between gap-2 px-2 md:px-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-6 rounded-[4px] bg-sky-950 flex items-center justify-center shrink-0">
            <Activity className="size-3.5 text-sky-300" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="text-[12px] md:text-[13px] font-bold tracking-tight text-zinc-100 truncate">DEVOPS İZLEME MERKEZİ</h1>
            <div className="text-[9px] md:text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500 truncate">Pusula Yazılım</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              setTestDown(true)
              testDownUntilRef.current = Date.now() + 8000
              setTimeout(() => {
                if (Date.now() >= testDownUntilRef.current - 50) setTestDown(false)
              }, 8000)
            }}
            disabled={testDown}
            className={cn(
              "h-7 px-2 rounded-[4px] text-[10px] font-bold uppercase tracking-widest transition-colors",
              testDown
                ? "bg-red-500/20 text-red-300 border border-red-500/40 cursor-wait animate-pulse"
                : "bg-zinc-800 text-zinc-400 hover:bg-red-500/20 hover:text-red-300 border border-zinc-700 hover:border-red-500/40",
            )}
            title="Test: Active Directory'yi 8 sn boyunca DOWN göster"
          >
            {testDown ? "Test aktif…" : "Alarm Testi"}
          </button>
          <button
            type="button"
            onClick={() => setSoundOn((v) => !v)}
            className={cn(
              "size-7 rounded-[4px] flex items-center justify-center transition-colors",
              soundOn ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                      : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700",
            )}
            title={soundOn ? "Ses açık — kapatmak için tıkla" : "Ses kapalı — açmak için tıkla"}
          >
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <div className="hidden sm:block text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
            Uptime Kuma · 10.15.2.6:3001
          </div>
        </div>
      </div>

      {/* ── KPI Row — 5 kart (saat dahil) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          title="Canlı Uptime"
          value={`%${uptimePct.toFixed(1)}`}
          subtitle="Anlık durum"
          trend={{ value: `${counts.online}/${counts.total} çevrimiçi`, positive: counts.offline === 0 }}
          accent={counts.offline > 0 ? "red" : counts.warning > 0 ? "amber" : "emerald"}
          pulse={counts.offline > 0}
        />
        <KpiCard
          title="Çevrimiçi"
          value={counts.online}
          subtitle={`${counts.total} monitörden`}
          trend={{ value: "Sorunsuz çalışıyor", positive: true }}
          accent="emerald"
        />
        <KpiCard
          title="Uyarı"
          value={counts.warning}
          subtitle="Beklemede / Bakım"
          trend={{ value: counts.warning > 0 ? "Dikkat gerekiyor" : "Sorun yok", positive: counts.warning === 0 }}
          accent={counts.warning > 0 ? "amber" : "zinc"}
        />
        <KpiCard
          title="Çevrimdışı"
          value={counts.offline}
          subtitle="Müdahale gerekiyor"
          trend={{ value: counts.offline > 0 ? "Erişilemiyor" : "Hepsi erişilebilir", positive: counts.offline === 0 }}
          accent={counts.offline > 0 ? "red" : "zinc"}
          pulse={counts.offline > 0}
        />
        <ClockCard fetchedAt={fetchedAt} />
      </div>

      {/* ── İçerik: mobilde üstte Döviz + altta gruplar; lg+ solda sidebar + sağda gruplar ── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-3">
        {exchangeMonitors.length > 0 && (
          <ExchangeTile monitors={exchangeMonitors} health={(dataForRender ?? data).exchangeHealth} />
        )}
        <div className="flex flex-col flex-1 gap-3 min-w-0">
          {serverMonitors.length > 0 && (
            <MonitorGroup title="Sunucular" count={serverMonitors.length} monitors={serverMonitors} tracker={tracker} />
          )}
          {serviceMonitors.length > 0 && (
            <MonitorGroup title="Servisler & Web" count={serviceMonitors.length} monitors={serviceMonitors} tracker={tracker} />
          )}
        </div>
      </div>

      {/* ── Son olaylar (event log) ── */}
      {events.length > 0 && <EventLog events={events} />}

      {/* ── DOWN Spotlight — herhangi bir monitör çevrimdışıysa tüm ekranı karart ── */}
      {downMonitors.length > 0 && (
        <DownSpotlight monitors={downMonitors} tracker={tracker} histories={histories} />
      )}

    </div>
  )
}
