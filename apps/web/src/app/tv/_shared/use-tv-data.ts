"use client"

/**
 * /tv veri katmanı.
 *
 * Tüm polling, durum takibi ve türetilmiş gruplama burada; sayfa yalnızca
 * görselleştirmeyle ilgilenir. Aralıklar tek yerde tanımlı — CLAUDE.md
 * "Kaynak Tasarrufu": bağlı sunuculara gereksiz yük yok.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { SpareBackupOffline } from "@/lib/sparebackup-offline"
import type { DomainExpiry } from "@/lib/domain-expiry"
import type { BandwidthData } from "@/lib/bandwidth"
import {
  type KumaMonitor,
  type KumaStatus,
  type MonitoringResponse,
  type StatusEvent,
  type StatusTrack,
  groupOf,
  isInfoMonitor,
} from "./types"

/* ── Polling aralıkları (ms) ── */
const POLL_MONITORS  = 1_000
const POLL_FIRMS     = 60_000
const POLL_DOMAINS   = 60 * 60_000   // saatte bir (lib tarafında 12h cache)
const POLL_BANDWIDTH = 3_000         // canlı hız (lib tarafında 2sn cache)

/** Sparkline / 3D geçmiş penceresi — kaç ping noktası tutulur */
export const HISTORY_WINDOW = 40

/* ══════════════════════════════════════════════════════════
   Saat
══════════════════════════════════════════════════════════ */
export function useClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

/**
 * Her monitor'ün (status, since) durumunu takip eder — status değiştiğinde
 * `since` sıfırlanır. DOWN süresi ve olay log'u için referans.
 */
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
export function playBeep() {
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
   Alarm sesi — soundOn state'i + DOWN varken tekrar eden beep
══════════════════════════════════════════════════════════ */
export function useAlarmSound(lastDownAt: number | null, anyDown: boolean) {
  const [soundOn, setSoundOn] = useState(false)
  const lastBeepAtRef = useRef<number>(0)

  useEffect(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("tv.sound") : null
    if (v === "1") setSoundOn(true)
  }, [])
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("tv.sound", soundOn ? "1" : "0")
  }, [soundOn])

  // Yeni DOWN olayında hemen çift beep
  useEffect(() => {
    if (!soundOn || !lastDownAt) return
    if (lastDownAt <= lastBeepAtRef.current) return
    lastBeepAtRef.current = lastDownAt
    playBeep()
    setTimeout(() => playBeep(), 250)
  }, [lastDownAt, soundOn])

  // DOWN aktif kaldığı sürece 5 saniyede bir tekrar
  useEffect(() => {
    if (!soundOn || !anyDown) return
    const t = setInterval(() => playBeep(), 5000)
    return () => clearInterval(t)
  }, [soundOn, anyDown])

  return { soundOn, setSoundOn }
}

/* ══════════════════════════════════════════════════════════
   Ana hook
══════════════════════════════════════════════════════════ */

export interface TvData {
  /** Kuma'dan gelen ham yanıt (filtresiz) — null ise henüz yüklenmedi */
  raw:   MonitoringResponse | null
  error: string | null
  /** Bilgi monitörü ayıklanmış + test modu uygulanmış + sayımı yenilenmiş veri */
  data:  MonitoringResponse | null

  offlineFirms: SpareBackupOffline | null
  domains:      DomainExpiry[] | null
  bandwidth:    BandwidthData | null

  /** monitör adı → son HISTORY_WINDOW ping değeri */
  histories: Record<string, number[]>

  tracker:    Map<string, StatusTrack>
  events:     StatusEvent[]
  lastDownAt: number | null

  /** Gerçek arıza sayılan (bilgi monitörü olmayan) DOWN'lar */
  downMonitors:    KumaMonitor[]
  serverMonitors:  KumaMonitor[]
  serviceMonitors: KumaMonitor[]
  exchangeMonitors: KumaMonitor[]

  uptimePct: number

  /** Alarm testi — Active Directory'yi 8 sn yapay DOWN gösterir */
  testDown: boolean
  triggerTestDown: () => void
}

export function useTvData(): TvData {
  const [raw, setRaw]     = useState<MonitoringResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [testDown, setTestDown] = useState(false)
  const testDownUntilRef = useRef<number>(0)

  const [offlineFirms, setOfflineFirms] = useState<SpareBackupOffline | null>(null)
  const [domains, setDomains]           = useState<DomainExpiry[] | null>(null)
  const [bandwidth, setBandwidth]       = useState<BandwidthData | null>(null)

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/monitoring`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok || !json.ok) setError(json.error ?? `HTTP ${res.status}`)
      else { setRaw(json); setError(null) }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata")
    }
  }, [])

  const loadOfflineFirms = useCallback(async () => {
    try {
      const res  = await fetch(`/api/sparebackup/offline`, { cache: "no-store" })
      const json = await res.json()
      setOfflineFirms(json.ok ? json : null)
    } catch {
      setOfflineFirms(null)
    }
  }, [])

  const loadDomains = useCallback(async () => {
    try {
      const res  = await fetch(`/api/domains/expiry`, { cache: "no-store" })
      const json = await res.json()
      setDomains(json.ok ? json.domains : null)
    } catch {
      setDomains(null)
    }
  }, [])

  const loadBandwidth = useCallback(async () => {
    try {
      const res  = await fetch(`/api/tv/bandwidth`, { cache: "no-store" })
      const json = await res.json()
      setBandwidth(json.ok ? json : null)
    } catch {
      setBandwidth(null)
    }
  }, [])

  useEffect(() => {
    load()
    loadOfflineFirms()
    loadDomains()
    loadBandwidth()
    const t  = setInterval(load, POLL_MONITORS)
    const t2 = setInterval(loadOfflineFirms, POLL_FIRMS)
    const t3 = setInterval(loadDomains, POLL_DOMAINS)
    const t4 = setInterval(loadBandwidth, POLL_BANDWIDTH)
    return () => { clearInterval(t); clearInterval(t2); clearInterval(t3); clearInterval(t4) }
  }, [load, loadOfflineFirms, loadDomains, loadBandwidth])

  const triggerTestDown = useCallback(() => {
    setTestDown(true)
    testDownUntilRef.current = Date.now() + 8000
    setTimeout(() => {
      if (Date.now() >= testDownUntilRef.current - 50) setTestDown(false)
    }, 8000)
  }, [])

  // SpareBackup "offline firmalar" bilgi monitörünü grid + KPI sayımından çıkar
  // (ayrı kart olarak gösteriliyor). testDown aktifken AD'yi yapay DOWN yap.
  const data = useMemo<MonitoringResponse | null>(() => {
    if (!raw) return raw
    let mons = raw.monitors.filter((m) => !isInfoMonitor(m))
    if (testDown) {
      mons = mons.map((m) =>
        m.name === "Active Directory"
          ? { ...m, status: "down" as KumaStatus, responseMs: null }
          : m,
      )
    }
    const online  = mons.filter((m) => m.status === "up").length
    const warning = mons.filter((m) => m.status === "pending" || m.status === "maintenance").length
    const offline = mons.filter((m) => m.status === "down").length
    return { ...raw, monitors: mons, counts: { total: mons.length, online, warning, offline } }
  }, [raw, testDown])

  const { tracker, events, lastDownAt } = useStatusTracker(data?.monitors ?? null)

  const downMonitors = useMemo(
    () => (data?.monitors ?? []).filter((m) => m.status === "down" && !isInfoMonitor(m)),
    [data],
  )

  const { serverMonitors, serviceMonitors, exchangeMonitors } = useMemo(() => {
    const mons = data?.monitors ?? []
    const rank = (s: KumaStatus) => (s === "down" ? 0 : s === "pending" || s === "maintenance" ? 1 : 2)
    const sort = (a: KumaMonitor, b: KumaMonitor) =>
      rank(a.status) - rank(b.status) || a.name.localeCompare(b.name, "tr")
    return {
      // Döviz kartı API sırasını koruyor — bilerek sıralanmıyor
      exchangeMonitors: mons.filter((m) => groupOf(m) === "exchange"),
      serverMonitors:   mons.filter((m) => groupOf(m) === "server").sort(sort),
      serviceMonitors:  mons.filter((m) => groupOf(m) === "service").sort(sort),
    }
  }, [data])

  /* ── Yanıt geçmişi ──
   * Açılışta Kuma'dan son beat'leri çekiyoruz (sparkline/3D boş açılmasın),
   * sonra her refresh'te yeni responseMs sona ekleniyor.
   */
  const [histories, setHistories] = useState<Record<string, number[]>>({})

  useEffect(() => {
    let abort = false
    fetch("/api/monitoring?history=1")
      .then((r) => r.json())
      .then((d) => {
        if (abort || !d?.history) return
        const initial: Record<string, number[]> = {}
        for (const [name, h] of Object.entries(
          d.history as Record<string, { beats: { ping: number | null }[] }>,
        )) {
          const pings = h.beats.slice(-HISTORY_WINDOW).map((b) => b.ping ?? 0)
          if (pings.length > 0) initial[name] = pings
        }
        setHistories((prev) => ({ ...initial, ...prev }))  // canlı eklenenler korunsun
      })
      .catch(() => { /* sessizce geç — geçmiş normal akışla dolacak */ })
    return () => { abort = true }
  }, [])

  useEffect(() => {
    const monitors = data?.monitors
    if (!monitors) return
    setHistories((prev) => {
      const next = { ...prev }
      for (const m of monitors) {
        const arr = next[m.name] ? [...next[m.name]] : []
        // DOWN ise 0 ms olarak işle ki çizgi düşüş gösterebilsin
        arr.push(m.responseMs === null ? 0 : m.responseMs)
        if (arr.length > HISTORY_WINDOW) arr.splice(0, arr.length - HISTORY_WINDOW)
        next[m.name] = arr
      }
      return next
    })
  }, [data])

  const counts    = data?.counts
  const uptimePct = !counts || counts.total === 0 ? 0 : (counts.online / counts.total) * 100

  return {
    raw, error, data,
    offlineFirms, domains, bandwidth,
    histories,
    tracker, events, lastDownAt,
    downMonitors, serverMonitors, serviceMonitors, exchangeMonitors,
    uptimePct,
    testDown, triggerTestDown,
  }
}
