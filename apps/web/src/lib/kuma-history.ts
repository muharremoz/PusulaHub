import "server-only"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

/**
 * Heartbeat geçmişi — Kuma SQLite'tan SSH üzerinden okur.
 *
 * Kuma UI'daki gibi her bar tek bir heartbeat'i temsil eder (dakikalık
 * veri). Son 100 beat'i çeker; monitörün interval'ı 60sn ise ~100 dk
 * pencere olur. Status bar Kuma'daki gibi yeşil/sarı/kırmızı renklerde.
 *
 * Neden SSH? Kuma 1.23 REST API sağlamıyor; sadece /metrics ve
 * /api/badge var. Heartbeat verisine erişim için DB'ye direkt bakıyoruz.
 *
 * Cache TTL: 30 sn — Kuma /metrics cache'iyle (30sn) senkron.
 *
 * Env (apps/web/.env.local):
 *   KUMA_SSH_HOST=10.15.2.6
 *   KUMA_SSH_USER=root
 *   KUMA_SSH_PASSWORD=...
 *   KUMA_DB_PATH=/opt/uptime-kuma/data/kuma.db
 *   KUMA_PLINK_PATH=C:/Program Files/PuTTY/plink.exe
 */

const execFileAsync = promisify(execFile)

export type BeatStatus = "up" | "down" | "pending" | "maintenance"

export interface BeatPoint {
  /** up | down | pending | maintenance */
  status: BeatStatus
  /** ISO string (Kuma local time olarak kaydediyor) */
  time:   string
  /** ms cinsinden ping — null = timeout/hata */
  ping:   number | null
}

export interface MonitorHistory {
  name:      string
  /** En eskiden yeniye sıralı, en fazla BEAT_LIMIT tane. */
  beats:     BeatPoint[]
  /** beats üstünden uptime % (up_count / total × 100). Boşsa null. */
  uptimePct: number | null
}

/** Kuma varsayılanı gibi 100 bar. */
const BEAT_LIMIT = 100

/* ── 60 sn cache ────────────────────────────────────────── */
// TV sayfası 30sn'de bir refresh yapıyor; aynı veriyi her seferinde
// SSH ile çekmek gereksiz. 60sn cache → her 2 refresh'ten birinde fresh.
let cache: { at: number; data: Record<string, MonitorHistory> } | null = null
const TTL_MS = 60 * 1000

/**
 * SSH ile uzaktan sqlite3 çalıştırıp CSV al.
 */
async function runRemoteSqlite(sql: string): Promise<string> {
  const host     = process.env.KUMA_SSH_HOST
  const user     = process.env.KUMA_SSH_USER
  const password = process.env.KUMA_SSH_PASSWORD
  const dbPath   = process.env.KUMA_DB_PATH ?? "/opt/uptime-kuma/data/kuma.db"
  const plinkPath = process.env.KUMA_PLINK_PATH ?? "C:/Program Files/PuTTY/plink.exe"

  if (!host || !user || !password) {
    throw new Error("KUMA_SSH_HOST/USER/PASSWORD env tanımlı değil.")
  }

  const remoteCmd = `sqlite3 -csv ${dbPath} "${sql.replace(/\n\s*/g, " ")}"`

  const { stdout } = await execFileAsync(
    plinkPath,
    ["-ssh", "-l", user, "-pw", password, host, remoteCmd],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 20_000, windowsHide: true }
  )
  return stdout
}

function mapStatus(raw: number): BeatStatus {
  // Kuma: 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE
  if (raw === 1) return "up"
  if (raw === 0) return "down"
  if (raw === 3) return "maintenance"
  return "pending"
}

/**
 * Her monitör için son 100 heartbeat'i getirir.
 *
 * SQLite window function (ROW_NUMBER) ile monitor_id bazında sıralayıp
 * son N kaydı alıyoruz. Tek sorgu, tüm monitörler.
 */
export async function fetchKumaHistory(force = false): Promise<Record<string, MonitorHistory>> {
  const now = Date.now()
  if (!force && cache && now - cache.at < TTL_MS) return cache.data

  // PERF: heartbeat tablosu binlerce satır biriktiriyor (her monitor 60sn'de
  // bir beat × günler). ROW_NUMBER OVER PARTITION tüm tabloyu okuyup
  // sıralıyor → yavaş. WHERE time > -7 days ile partition giriş kümesini
  // küçültüyoruz; 100 beat (×60sn = ~100dk) zaten son birkaç saatlik
  // pencerede mevcut, 7 gün fazlasıyla yeterli.
  const sql = `
    SELECT name, status, time, ping FROM (
      SELECT m.name         AS name,
             h.status       AS status,
             h.time         AS time,
             h.ping         AS ping,
             ROW_NUMBER() OVER (PARTITION BY h.monitor_id ORDER BY h.time DESC) AS rn
        FROM heartbeat h
        JOIN monitor   m ON m.id = h.monitor_id
       WHERE h.time > datetime('now', '-7 days')
    ) sub
    WHERE rn <= ${BEAT_LIMIT}
    ORDER BY name, time ASC
  `

  const csv = await runRemoteSqlite(sql)

  const byMonitor = new Map<string, BeatPoint[]>()

  for (const line of csv.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const cols = parseCsvLine(trimmed)
    if (cols.length < 4) continue
    const [name, statusRaw, time, pingRaw] = cols
    const arr = byMonitor.get(name) ?? []
    const pingNum = Number(pingRaw)
    arr.push({
      status: mapStatus(Number(statusRaw)),
      time,
      ping:   pingRaw === "" || Number.isNaN(pingNum) ? null : pingNum,
    })
    byMonitor.set(name, arr)
  }

  const result: Record<string, MonitorHistory> = {}

  for (const [name, beats] of byMonitor) {
    let upCnt = 0
    let total = 0
    for (const b of beats) {
      if (b.status === "maintenance") continue // uptime hesabına dahil etme
      total++
      if (b.status === "up") upCnt++
    }
    result[name] = {
      name,
      beats,
      uptimePct: total === 0 ? null : (upCnt / total) * 100,
    }
  }

  cache = { at: now, data: result }
  return result
}

export function invalidateKumaHistoryCache(): void {
  cache = null
}

/* ── CSV parser (basit, tırnaklı ve virgül içeren değerler için) ───── */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else { inQ = false }
      } else {
        cur += ch
      }
    } else {
      if (ch === ',') { out.push(cur); cur = "" }
      else if (ch === '"' && cur.length === 0) { inQ = true }
      else { cur += ch }
    }
  }
  out.push(cur)
  return out
}
