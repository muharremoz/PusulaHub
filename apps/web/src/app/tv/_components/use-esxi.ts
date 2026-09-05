"use client"

/**
 * Fiziksel sunucu (ESXi) verisi — `/api/esxi` üzerinden.
 *
 * Aralık 60 saniye: donanım künyesi hiç değişmiyor, CPU/RAM kullanımı ve
 * güç kaynağı durumu dakikalık takip yeterli. Yedek listesi zaten lib
 * tarafında 5 dakika cache'li (CLAUDE.md "Kaynak Tasarrufu" — ESXi'ye
 * gereksiz yük bindirmiyoruz).
 *
 * Kimlik tanımlı değilse ya da host'a ulaşılamıyorsa `null` döner;
 * kartlar kendini gizler, TV ekranında boş kutu durmaz.
 */

import { useEffect, useState } from "react"

const POLL_MS = 60_000

export type SensorHealth = "green" | "yellow" | "red" | "unknown"

export interface EsxiPowerSupply {
  index: number
  health: SensorHealth
  summary: string
  inputWatts: number | null
  outputWatts: number | null
}

export interface EsxiDatastore {
  name: string; capacityGB: number; freeGB: number; usedGB: number; percent: number
}

export interface EsxiHost {
  model: string; vendor: string; cpuModel: string
  cpuPackages: number; cpuCores: number; cpuThreads: number
  cpuMhz: number; cpuTotalMhz: number; cpuUsedMhz: number
  ramTotalGB: number; ramUsedGB: number
  uptimeSeconds: number; bootTime: string | null
  powerSupplies: EsxiPowerSupply[]
  problemSensors: { name: string; health: SensorHealth; summary: string }[]
  overallHealth: SensorHealth
  datastores: EsxiDatastore[]
}

export interface EsxiVmBackup {
  vmName: string
  lastBackupAt: string | null
  running: boolean
  times: string[]
}

/** Bugun donmus bir yedek turu */
export interface BackupRun {
  at: string
  vmCount: number
}

export interface EsxiData {
  host: EsxiHost
  backups: EsxiVmBackup[] | null
  runs: BackupRun[] | null
  /** Yedek isinde olan makine sayisi — turun kapsami buna gore okunur */
  vmsInJob: number
}

export function useEsxi(): EsxiData | null {
  const [data, setData] = useState<EsxiData | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch("/api/esxi", { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        /*  ok:false → kimlik yok ya da host kapalı. Mevcut veriyi SİLME:
         *  geçici bir kesintide kart boşalmasın, son bilinen değer dursun. */
        if (!json?.ok || !json.host) return
        setData({ host: json.host, backups: json.backups ?? null, runs: json.runs ?? null, vmsInJob: json.vmsInJob ?? 0 })
      } catch {
        /* ağ hatası — mevcut değerler dursun */
      }
    }

    load()
    const t = setInterval(load, POLL_MS)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  return data
}

/* ══════════════════════════════════════════════════════════
   Yedek deposu (SFTP sunucusu)
══════════════════════════════════════════════════════════ */

export interface BackupStorage {
  host: string
  path: string
  totalGB: number
  usedGB: number
  freeGB: number
  percent: number
}

/**
 * Musteri yedeklerinin yazildigi SFTP sunucusunun disk dolulugu.
 *
 * Ayri bir uctan geliyor (bkz. /api/backup-storage): ESXi ile alakasi
 * yok ve birinin arizasi digerini bos birakmasin. Aralik 5 dakika —
 * sunucu tarafinda da 5 dk cache var, disk dolulugu daha sik bakmayi
 * gerektirmiyor.
 */
export function useBackupStorage(): BackupStorage | null {
  const [data, setData] = useState<BackupStorage | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch("/api/backup-storage", { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        /*  ok:false → kimlik yok ya da sunucu kapali. Mevcut degeri SILME. */
        if (!json?.ok || !json.storage) return
        setData(json.storage)
      } catch {
        /* ag hatasi — mevcut deger dursun */
      }
    }

    load()
    const t = setInterval(load, 5 * 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  return data
}
