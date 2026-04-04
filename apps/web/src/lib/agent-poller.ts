/* ══════════════════════════════════════════════════════════
   PusulaHub — Agent Poller (Pull Model)
   DB'deki sunucuları periyodik olarak pollar.
   Her sunucunun agent'ına HTTP GET /api/report atar,
   gelen metrik verisini agent-store'a kaydeder.
══════════════════════════════════════════════════════════ */

import sql from "mssql"
import { upsertAgentFromPoll, getAllAgents } from "./agent-store"
import type { AgentReport } from "./agent-types"

/* ── Poller'a özel DB pool (lazy init) ── */
let _pool: sql.ConnectionPool | null = null
async function getPollerPool(): Promise<sql.ConnectionPool> {
  if (_pool && _pool.connected) return _pool
  _pool = new sql.ConnectionPool({
    server:   process.env.DB_SERVER ?? "localhost",
    database: process.env.DB_NAME ?? "PusulaHub",
    user:     process.env.DB_USER ?? "SA",
    password: process.env.DB_PASSWORD ?? "",
    port:     parseInt(process.env.DB_PORT ?? "1433"),
    options:  { trustServerCertificate: true, encrypt: false },
    pool:     { max: 3, min: 0, idleTimeoutMillis: 60000 },
  })
  await _pool.connect()
  return _pool
}

async function pollerQuery<T>(queryText: string): Promise<T> {
  const pool = await getPollerPool()
  const result = await pool.request().query(queryText)
  return result.recordset as T
}

interface ServerRow {
  Id:        string
  Name:      string
  IP:        string
  OS:        string
  ApiKey:    string | null
  AgentPort: number | null
}

const POLL_INTERVAL_MS = 10_000  // 10 saniye

/* ── Tek bir agent'ı poll et ── */
async function pollAgent(server: ServerRow): Promise<boolean> {
  const port = server.AgentPort ?? 8585
  const url  = `http://${server.IP}:${port}/api/report`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const resp = await fetch(url, {
      headers: { "X-Api-Key": server.ApiKey ?? "" },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!resp.ok) {
      console.log(`[Poller] ${server.Name} (${server.IP}:${port}) — HTTP ${resp.status}`)
      return false
    }

    const data = await resp.json()

    // Agent'ın döndürdüğü veriyi AgentReport formatına dönüştür
    const report: AgentReport = {
      agentId:   server.Id,
      token:     "",
      timestamp: new Date().toISOString(),
      metrics: {
        cpu:             data.metrics?.cpu ?? 0,
        ram:             data.metrics?.ram ?? { totalMB: 0, usedMB: 0, freeMB: 0 },
        disks:           data.metrics?.disks ?? [],
        uptimeSeconds:   data.metrics?.uptimeSeconds ?? 0,
        networkAdapters: data.metrics?.network ?? [],
      },
      roles:    data.roles ?? [],
      sessions: data.sessions ?? undefined,
      iis:      data.iis ?? undefined,
      sql:      data.mssql ?? undefined,
      ad:       data.ad ?? undefined,
      security: data.security ?? undefined,
      logs:     data.logs ?? undefined,
    }

    // agent-store'a kaydet
    upsertAgentFromPoll({
      serverId:  server.Id,
      hostname:  data.hostname ?? server.Name,
      ip:        data.ip ?? server.IP,
      os:        (data.os === "linux" ? "linux" : "windows") as "windows" | "linux",
      version:   data.version ?? "unknown",
      port:      port,
      report,
    })

    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Abort hatası normal — timeout
    if (!msg.includes("abort")) {
      console.log(`[Poller] ${server.Name} (${server.IP}:${port}) — ${msg}`)
    }
    return false
  }
}

/* ── Tüm sunucuları poll et ── */
async function pollAll(): Promise<void> {
  try {
    const servers = await pollerQuery<ServerRow[]>(
      "SELECT Id, Name, IP, OS, ApiKey, AgentPort FROM Servers WHERE AgentPort IS NOT NULL AND ApiKey IS NOT NULL AND ApiKey != ''"
    )

    if (!servers.length) return

    // Paralel poll (max 10 concurrent)
    const batchSize = 10
    for (let i = 0; i < servers.length; i += batchSize) {
      const batch = servers.slice(i, i + batchSize)
      await Promise.allSettled(batch.map(pollAgent))
    }
  } catch (err) {
    console.error("[Poller] DB sorgu hatası:", err)
  }
}

/* ── Agent'a doğrudan komut gönder ── */
export async function execOnAgent(
  ip: string,
  port: number,
  apiKey: string,
  command: string,
  timeout = 30,
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  const url = `http://${ip}:${port}/api/exec`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), (timeout + 5) * 1000)

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ command, timeout }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!resp.ok) {
      return { exitCode: -1, stdout: "", stderr: `HTTP ${resp.status}`, timedOut: false }
    }

    return await resp.json()
  } catch (err: unknown) {
    clearTimeout(timer)
    const msg = err instanceof Error ? err.message : String(err)
    return { exitCode: -1, stdout: "", stderr: msg, timedOut: msg.includes("abort") }
  }
}

/* ── Polling döngüsünü başlat ── */
let _timer: ReturnType<typeof setInterval> | null = null

export function startPolling(): void {
  if (_timer) return
  console.log(`[Poller] Başlatıldı — ${POLL_INTERVAL_MS / 1000}s aralıkla`)

  // İlk poll'u 5 saniye sonra yap (Next.js env yüklenmesini bekle)
  setTimeout(pollAll, 5000)

  _timer = setInterval(pollAll, POLL_INTERVAL_MS)
}

export function stopPolling(): void {
  if (_timer) {
    clearInterval(_timer)
    _timer = null
  }
}
