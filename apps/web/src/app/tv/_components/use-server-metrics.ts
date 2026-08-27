"use client"

/**
 * Sunucu metrikleri (CPU / RAM / disk) — `/api/servers` üzerinden.
 *
 * ── Veri nereden geliyor? ──────────────────────────────────────────────
 * `/api/servers` önce agent store'a bakıyor (poller'ın canlı topladığı
 * değerler), agent bulunamazsa `hub.servers` tablosundaki son kayda
 * düşüyor. Yani prod'da canlı, agent düşmüşse son bilinen değer.
 *
 * ── Neden ayrı hook? ───────────────────────────────────────────────────
 * `useTvData` /tv ile ortak; oraya eklemek o sayfaya da gereksiz bir
 * istek bindirirdi. Bu veri yalnız ağaç sayfasında kullanılıyor.
 *
 * ── Aralık ─────────────────────────────────────────────────────────────
 * 30 saniye. CPU/RAM/disk saniyelik takip gerektirmiyor; monitör durumu
 * gibi hızlı değişmiyor (CLAUDE.md "Kaynak Tasarrufu").
 */

import { useEffect, useState } from "react"
import type { KumaMonitor } from "../_shared/types"

const POLL_MS = 30_000

export interface ServerMetrics {
  cpu:    number
  ram:    number
  disk:   number
  uptime: string
  /** Açık oturumu olan farklı kullanıcı sayısı. undefined = agent bildirmiyor. */
  aktifKullanici?: number
}

/** API yanıtından ihtiyacımız olan alanlar */
interface ServerRow {
  name: string
  ip:   string
  cpu:  number
  ram:  number
  disk: number
  uptime: string
  activeSessions?: number
}

/**
 * Anahtarlar hem IP hem küçük harfe indirgenmiş ad ile yazılıyor: monitör
 * eşleşmesi ikisinden biriyle tutabilsin.
 */
export type MetricsMap = Map<string, ServerMetrics>

export function useServerMetrics(enabled = true): MetricsMap {
  const [map, setMap] = useState<MetricsMap>(new Map())

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch("/api/servers", { cache: "no-store" })
        if (!res.ok) return          // 401/500 → sessizce geç, kart "—" gösterir
        const json = await res.json()
        const list: ServerRow[] = Array.isArray(json) ? json : (json.servers ?? [])
        if (cancelled) return

        const next: MetricsMap = new Map()
        for (const s of list) {
          const m: ServerMetrics = {
            cpu: s.cpu, ram: s.ram, disk: s.disk, uptime: s.uptime,
            aktifKullanici: s.activeSessions,
          }
          if (s.ip)   next.set(s.ip, m)
          if (s.name) next.set(s.name.trim().toLowerCase(), m)
        }
        setMap(next)
      } catch {
        /* ağ hatası — mevcut değerler dursun */
      }
    }

    load()
    const t = setInterval(load, POLL_MS)
    return () => { cancelled = true; clearInterval(t) }
  }, [enabled])

  return map
}

/**
 * Monitöre karşılık gelen sunucuyu bulur.
 *
 * Önce hostname (ping monitörlerinde bu bir IP), sonra ad. IP daha güvenilir:
 * Kuma'daki monitör adı ile `hub.servers` içindeki sunucu adı birbirinden
 * bağımsız değiştirilebiliyor, IP ikisinde de aynı kalıyor.
 */
export function metricsFor(m: KumaMonitor, map: MetricsMap): ServerMetrics | null {
  if (m.hostname) {
    const byIp = map.get(m.hostname.trim())
    if (byIp) return byIp
  }
  return map.get(m.name.trim().toLowerCase()) ?? null
}
