"use client"

/**
 * Sahte veri — YALNIZCA tasarımı görmek için.
 *
 * Lokalde bazı env değişkenleri tanımlı olmadığı için ilgili servisler null
 * dönüyor ve kartlar "Servise ulaşılamadı" gösteriyor:
 *   · BANDWIDTH_API_URL         → İnternet trafiği
 *   · SPAREBACKUP_OFFLINE_URL   → Çevrimdışı yedekler
 * (Domain yenileme gerçek veriyle çalışıyor: Kuma monitörlerinden alan
 * adlarını çıkarıp RDAP sorguluyor, env gerekmiyor.)
 *
 * ── Sessizce devreye GİRMEZ ────────────────────────────────────────────
 * Yalnız URL'de `?mock=1` varken çalışır. Aksi halde gerçek veri ne
 * diyorsa o gösterilir — sahte sayıların gerçek sanılması ihtimali yok.
 *
 * Tasarım kesinleşince bu dosya silinecek.
 */

import { useEffect, useState } from "react"
import type { BandwidthData } from "@/lib/bandwidth"
import type { SpareBackupOffline } from "@/lib/sparebackup-offline"
import type { MetricsMap } from "./use-server-metrics"

const GB = 1024 ** 3

/** Değeri sınırlar içinde tutarak küçük bir adım attır */
function walk(prev: number, step: number, min: number, max: number): number {
  const next = prev + (Math.random() - 0.5) * step
  return Math.min(max, Math.max(min, next))
}

/* ══════════════════════════════════════════════════════════
   İnternet trafiği
══════════════════════════════════════════════════════════ */

function buildBandwidth(
  rxMbps: number, txMbps: number, dailyGB: number, monthlyGB: number,
): BandwidthData {
  return {
    ok: true,
    interface: "ens192",
    live: {
      rxBps: (rxMbps * 1_000_000) / 8,
      txBps: (txMbps * 1_000_000) / 8,
      rxMbps,
      txMbps,
    },
    daily: {
      date: new Date().toISOString().slice(0, 10),
      rxBytes: dailyGB * 0.78 * GB,
      txBytes: dailyGB * 0.22 * GB,
      rxGB: dailyGB * 0.78,
      txGB: dailyGB * 0.22,
      totalGB: dailyGB,
    },
    monthly: {
      month: new Date().toISOString().slice(0, 7),
      rxBytes: monthlyGB * 0.78 * GB,
      txBytes: monthlyGB * 0.22 * GB,
      rxGB: monthlyGB * 0.78,
      txGB: monthlyGB * 0.22,
      totalGB: monthlyGB,
      totalTB: monthlyGB / 1000,
    },
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Değerler rastgele sıçramıyor, rastgele YÜRÜYOR: her adımda küçük bir
 * miktar değişiyor. Gerçek trafik gibi salınıyor, rakamlar okunamayacak
 * kadar zıplamıyor.
 */
export function useMockBandwidth(enabled: boolean): BandwidthData | null {
  // Başlangıç değerleri sabit: sunucu ve ilk istemci render'ı aynı kalsın
  const [s, setS] = useState({ rx: 46.2, tx: 8.4, daily: 84.3, monthly: 1240 })

  useEffect(() => {
    if (!enabled) return
    const t = setInterval(() => {
      setS((p) => ({
        rx: walk(p.rx, 26, 6, 180),
        tx: walk(p.tx, 8, 1.5, 48),
        // Sayaçlar yalnız artar
        daily:   p.daily + 0.02,
        monthly: p.monthly + 0.02,
      }))
    }, 2000)
    return () => clearInterval(t)
  }, [enabled])

  if (!enabled) return null
  return buildBandwidth(s.rx, s.tx, s.daily, s.monthly)
}

/* ══════════════════════════════════════════════════════════
   Çevrimdışı yedekler
══════════════════════════════════════════════════════════ */

const MOCK_FIRMS = [
  { firkod: 4127, firma: "ORHAN TEKSTİL SAN. TİC.", minutesAgo: 1290 },
  { firkod: 2038, firma: "DENİZ GIDA A.Ş.",          minutesAgo: 187  },
  { firkod: 5511, firma: "ANADOLU KUYUMCULUK",       minutesAgo: 74   },
  { firkod: 1902, firma: "BEYAZ LOJİSTİK LTD.",      minutesAgo: 4320 },
  { firkod: 3345, firma: "EGE PLASTİK",              minutesAgo: 96   },
]

export function useMockOfflineFirms(enabled: boolean): SpareBackupOffline | null {
  if (!enabled) return null
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    thresholdMins: 60,
    totalActive: 128,
    onlineCount: 128 - MOCK_FIRMS.length,
    offlineCount: MOCK_FIRMS.length,
    offline: MOCK_FIRMS.map((f) => ({
      ...f,
      lastHeartbeat: new Date(Date.now() - f.minutesAgo * 60_000).toISOString(),
      lastIp: "10.15.2.0",
      version: "3.4.1",
    })),
  }
}


/* ══════════════════════════════════════════════════════════
   Sunucu metrikleri
══════════════════════════════════════════════════════════ */

/**
 * `/api/servers` kendi yetki kontrolunu yapiyor (requirePermission), bu
 * yuzden lokalde oturum olmadan 401 donuyor ve metrikler bos geliyor.
 * Tasarimi gorebilmek icin sahte degerler.
 *
 * Anahtarlar gercek IP ler: metricsFor() once hostname ile bakiyor.
 */
// kullanici: yalniz terminal sunucusunda anlamli — digerlerinde
// undefined birakiliyor ki satir hic cikmasin (gercek veride de oyle).
const MOCK_SERVERS: Record<string, {
  cpu: number; ram: number; disk: number; uptime: string; kullanici?: number
}> = {
  "10.15.2.4":       { cpu: 12, ram: 48, disk: 71, uptime: "42g 6s" },
  "10.15.2.2":       { cpu: 34, ram: 67, disk: 58, uptime: "18g 3s" },
  "10.15.2.5":       { cpu: 8,  ram: 39, disk: 44, uptime: "7g 21s", kullanici: 14 },
  "10.15.2.200":     { cpu: 3,  ram: 22, disk: 88, uptime: "96g 2s" },
  "10.15.2.3":       { cpu: 19, ram: 55, disk: 33, uptime: "31g 9s" },
  "192.168.169.203": { cpu: 6,  ram: 28, disk: 62, uptime: "11g 4s" },
}

export function useMockServerMetrics(enabled: boolean): MetricsMap {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const t = setInterval(() => setTick((v) => v + 1), 4000)
    return () => clearInterval(t)
  }, [enabled])

  if (!enabled) return new Map()

  // CPU ve RAM hafifce salinsin; disk neredeyse sabit kalsin
  const map: MetricsMap = new Map()
  for (const [ip, v] of Object.entries(MOCK_SERVERS)) {
    const j = (seed: number, amp: number) =>
      Math.round(Math.sin(tick * 0.7 + seed) * amp)
    map.set(ip, {
      cpu:  Math.min(99, Math.max(1, v.cpu + j(ip.length, 6))),
      ram:  Math.min(99, Math.max(1, v.ram + j(ip.length + 2, 3))),
      disk: v.disk,
      uptime: v.uptime,
      aktifKullanici: v.kullanici,
    })
  }
  return map
}
