/* ══════════════════════════════════════════════════════════
   PusulaHub — Agent Poller (Pull Model)
   hub.servers'daki sunucuları periyodik pollar; her agent'a HTTP
   GET /api/report atar, metrikleri agent-store'a (in-memory) yazar,
   ağır veriyi (AD/IIS/SQL/usage/failed-logon) hub'a RPC'lerle yazar.

   Faz 4: DB katmanı mssql → Supabase (service-role, Coolify'da agent'larla
   aynı 10.15.2.x ağında çalışır). Karmaşık MERGE/aggregation'lar hub.*_rpc'lerde.
   DEĞİŞMEZ: agent fetch, agent-store, harici SQL toplama (withSqlConnection), execOnAgent.
══════════════════════════════════════════════════════════ */

import { getSupabaseAdmin } from "./supabase/admin"
import { upsertAgentFromPoll, markMessageRead, markAgentOffline } from "./agent-store"
import { markReadByMsgId, getPendingForServer, markRecipientDelivered, markServerFailed } from "./messages-db"
import type { AgentReport } from "./agent-types"
import { withSqlConnection } from "./sql-external"
import { decrypt } from "./crypto"

const hub = () => getSupabaseAdmin().schema("hub")

/* Hub → harici SQL sunucusu: DB metadata'sını SA ile doğrudan topla. */
interface SqlDbRow {
  name:                string
  sizeMB:              number
  status:              string
  lastBackup:          Date | null
  lastDiffBackup:      Date | null
  lastBackupStart:     Date | null
  lastDiffBackupStart: Date | null
  recoveryModel:       string
  owner:               string
  dataFilePath:        string
  logFilePath:         string
}

async function collectSqlFromServer(serverIp: string, user: string, password: string): Promise<SqlDbRow[] | null> {
  try {
    return await withSqlConnection(
      { server: serverIp, user, password, database: "master", requestTimeout: 15000 },
      async (pool) => {
        const res = await pool.request().query<SqlDbRow>(`
          -- READ UNCOMMITTED: msdb.backupset'i kilitlemeden oku (yoksa BACKUP/RESTORE
          -- bloke olur, restore %100'de takılır). Birkaç sn eski tarih monitoring için önemsiz.
          SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
          SELECT
            d.name AS name,
            CAST(ISNULL((SELECT SUM(CAST(f.size AS BIGINT) * 8 / 1024) FROM sys.master_files f WHERE f.database_id=d.database_id AND f.type=0), 0) AS INT) AS sizeMB,
            d.state_desc AS status,
            (SELECT MAX(b.backup_finish_date) FROM msdb.dbo.backupset b WHERE b.database_name=d.name AND b.type='D') AS lastBackup,
            (SELECT MAX(b.backup_finish_date) FROM msdb.dbo.backupset b WHERE b.database_name=d.name AND b.type='I') AS lastDiffBackup,
            (SELECT TOP 1 b.backup_start_date FROM msdb.dbo.backupset b WHERE b.database_name=d.name AND b.type='D' ORDER BY b.backup_finish_date DESC) AS lastBackupStart,
            (SELECT TOP 1 b.backup_start_date FROM msdb.dbo.backupset b WHERE b.database_name=d.name AND b.type='I' ORDER BY b.backup_finish_date DESC) AS lastDiffBackupStart,
            d.recovery_model_desc AS recoveryModel,
            ISNULL(SUSER_SNAME(d.owner_sid), '') AS owner,
            ISNULL((SELECT TOP 1 physical_name FROM sys.master_files WHERE database_id=d.database_id AND type=0 ORDER BY file_id), '') AS dataFilePath,
            ISNULL((SELECT TOP 1 physical_name FROM sys.master_files WHERE database_id=d.database_id AND type=1 ORDER BY file_id), '') AS logFilePath
          FROM sys.databases d
          WHERE d.name NOT IN ('master','tempdb','model','msdb')
        `)
        return res.recordset as SqlDbRow[]
      },
    )
  } catch (err) {
    console.log(`[Poller] SQL direct collect hatası (${serverIp}):`, err instanceof Error ? err.message : err)
    return null
  }
}

interface ServerRow {
  Id:        string
  Name:      string
  IP:        string
  OS:        string
  ApiKey:    string | null
  AgentPort: number | null
}

function mapServer(r: Record<string, unknown>): ServerRow {
  return {
    Id: r.id as string, Name: r.name as string, IP: r.ip as string, OS: (r.os as string) ?? "",
    ApiKey: (r.api_key as string | null) ?? null, AgentPort: (r.agent_port as number | null) ?? null,
  }
}

const POLL_INTERVAL_MS = 10_000  // 10 saniye
const toIso = (d: Date | null): string => (d ? d.toISOString() : "")

/* Agent state_desc UPPERCASE döner → normalize (eski CHECK constraint uyumu). */
function normalizeDbStatus(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toUpperCase()
  if (s === "RESTORING") return "Restoring"
  if (s === "OFFLINE")   return "Offline"
  return "Online"
}

/* ── Failed logon denemelerini hub'a yaz (dedup RPC) ── */
async function persistFailedLogons(serverId: string, serverName: string, report: AgentReport): Promise<void> {
  const failedLogins = report.logs?.failedLogins
  if (!failedLogins || !failedLogins.length) return
  try {
    const items = failedLogins
      .map((fl) => {
        const ts = fl.timestamp ? new Date(fl.timestamp) : null
        if (!ts || isNaN(ts.getTime())) return null
        return { timestamp: ts.toISOString(), username: (fl.username ?? "").trim() || "-", clientIp: (fl.clientIp ?? "").trim() || "-" }
      })
      .filter((x): x is { timestamp: string; username: string; clientIp: string } => x !== null)
    if (!items.length) return

    await hub().rpc("poller_failed_logons", { p_server_id: serverId, p_server_name: serverName, p_items: items })

    // 30 günden eski kayıtları nadiren temizle
    if (Math.random() < 0.01) {
      const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      await hub().from("failed_logon_attempts").delete().lt("timestamp", cutoff)
    }
  } catch (err) {
    console.log(`[Poller] persistFailedLogons hatası (${serverName}):`, err instanceof Error ? err.message : err)
  }
}

/* ── AD / IIS / SQL / UserProcesses verilerini hub'a yaz ── */
async function persistHeavyData(serverName: string, report: AgentReport): Promise<void> {
  try {
    // UserDailyUsage — running average (RPC). Sistem hesaplarını filtrele.
    if (report.userProcesses?.length) {
      const SKIP = new Set(["system", "local service", "network service"])
      const isSystem = (u: string) => { const l = u.toLowerCase(); return SKIP.has(l) || l.startsWith("dwm-") || l.startsWith("umfd-") }
      const items = report.userProcesses
        .filter((up) => !isSystem(up.username))
        .map((up) => ({ username: up.username, cpu: up.cpuPercent, ram: up.ramMB }))
      if (items.length) await hub().rpc("poller_user_usage", { p_server: serverName, p_items: items })
    }

    // AD Users — sunucudakileri sil + yeniden yaz (RPC)
    if (report.ad?.companies?.length) {
      const users: unknown[] = []
      for (const company of report.ad.companies) {
        for (const user of company.users) {
          let lastLogin: Date | null = null
          if (user.lastLogin && !["Hiç", "Yok", ""].includes(user.lastLogin)) {
            const p = new Date(user.lastLogin); if (!isNaN(p.getTime())) lastLogin = p
          }
          users.push({
            id: `${serverName}_${user.username}`.replace(/\s/g, "_"),
            username: user.username, displayName: user.displayName ?? "", email: user.email ?? "",
            ou: company.firmaNo, enabled: !!user.enabled, lastLogin: toIso(lastLogin),
          })
        }
      }
      await hub().rpc("poller_ad_users", { p_server: serverName, p_users: users })
    }

    // IIS Sites — sil + yeniden yaz (RPC)
    if (report.iis?.sites?.length) {
      const sites = report.iis.sites.map((site) => {
        const m = site.name.match(/^(\d+)/)
        return {
          id: `${serverName}_${site.name}`.replace(/\s/g, "_"),
          name: site.name, status: site.status ?? "Stopped", binding: site.binding ?? "",
          appPool: site.appPool ?? "", physicalPath: site.physicalPath ?? "", firma: m ? m[1] : null,
        }
      })
      await hub().rpc("poller_iis_sites", { p_server: serverName, p_sites: sites })
    }

    // SQL Databases — Hub'dan direkt SA (öncelik) > agent
    let directRows: SqlDbRow[] | null = null
    try {
      const { data: srv } = await hub().from("servers").select("ip, sql_username, sql_password").eq("name", serverName).maybeSingle()
      const s = srv as { ip: string; sql_username: string | null; sql_password: string | null } | null
      if (s?.sql_username && s?.sql_password) {
        const pw = decrypt(s.sql_password) ?? ""
        if (pw) directRows = await collectSqlFromServer(s.ip, s.sql_username, pw)
      }
    } catch (err) {
      console.log(`[Poller] SQL creds lookup hatası (${serverName}):`, err instanceof Error ? err.message : err)
    }

    type DbSource = {
      name: string; sizeMB: number; status: string
      lastBackup: Date | string | null; lastDiffBackup?: Date | string | null
      lastBackupStart?: Date | string | null; lastDiffBackupStart?: Date | string | null
      tables?: number; recoveryModel?: string | null; owner?: string | null
      dataFilePath?: string | null; logFilePath?: string | null
    }
    const sourceDbs: DbSource[] = directRows ? directRows : (report.sql?.databases ?? [])

    if (sourceDbs.length) {
      const SKIP_DBS = new Set(["master", "tempdb", "model", "msdb"])
      const parseDate = (raw: Date | string | null | undefined): string => {
        if (!raw) return ""
        if (raw instanceof Date) return !isNaN(raw.getTime()) ? raw.toISOString() : ""
        if (typeof raw === "string" && raw && !["Hiç", "Yok", "NULL", ""].includes(raw)) {
          const d = new Date(raw); return !isNaN(d.getTime()) ? d.toISOString() : ""
        }
        return ""
      }
      const dbs = sourceDbs
        .filter((db) => !SKIP_DBS.has(db.name.toLowerCase()))
        .map((db) => {
          const m = db.name.match(/^(\d+)/)
          return {
            id: `${serverName}_${db.name}`.replace(/\s/g, "_"),
            name: db.name, firmaNo: m ? m[1] : null, sizeMB: db.sizeMB ?? 0,
            status: normalizeDbStatus(db.status),
            lastBackup: parseDate(db.lastBackup), lastDiffBackup: parseDate(db.lastDiffBackup ?? null),
            lastBackupStart: parseDate(db.lastBackupStart ?? null), lastDiffBackupStart: parseDate(db.lastDiffBackupStart ?? null),
            tables: db.tables ?? 0, recoveryModel: db.recoveryModel ?? null, owner: db.owner ?? null,
            dataFilePath: db.dataFilePath ?? null, logFilePath: db.logFilePath ?? null,
          }
        })
      await hub().rpc("poller_sql_databases", { p_server: serverName, p_dbs: dbs })
    }
  } catch (err) {
    console.log(`[Poller] persistHeavyData hatası (${serverName}):`, err instanceof Error ? err.message : err)
  }
}

/* ── Pending mesajları Active session'daki kullanıcıya ilet (DEĞİŞMEZ mantık) ── */
async function retryPendingForActiveUsers(server: ServerRow, port: number, report: AgentReport): Promise<void> {
  if (!server.ApiKey) return
  const activeUsers = new Set((report.sessions ?? []).filter(s => s.username && s.state === "Active").map(s => s.username.toLowerCase()))
  if (activeUsers.size === 0) return

  const pending = await getPendingForServer(server.Id)
  const eligible = pending.filter(p => activeUsers.has(p.username.toLowerCase()))
  if (eligible.length === 0) return

  for (const p of eligible) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 12_000)
      const res = await fetch(`http://${server.IP}:${port}/api/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": server.ApiKey },
        signal: ctrl.signal,
        body: JSON.stringify({ msgId: p.messageId, title: p.subject, body: p.body, type: p.type, from: p.senderName, sentAt: p.sentAt, targetUsernames: [p.username] }),
      })
      clearTimeout(timer)
      if (res.ok) {
        await markRecipientDelivered(p.messageId, server.Id, p.username)
        console.log(`[Poller] retry → ${server.Name}/${p.username} delivered (msg ${p.messageId.slice(0, 8)})`)
      } else {
        console.log(`[Poller] retry HTTP ${res.status} (${server.Name}/${p.username})`)
      }
    } catch (err) { void err }
  }
}

void markServerFailed // reserved

/* ── Tek bir agent'ı poll et (agent fetch + agent-store DEĞİŞMEZ) ── */
async function pollAgent(server: ServerRow, force = false): Promise<boolean> {
  const port = server.AgentPort ?? 8585
  const url = `http://${server.IP}:${port}/api/report${force ? "?force=1" : ""}`
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    const resp = await fetch(url, { headers: { "X-Api-Key": server.ApiKey ?? "" }, signal: controller.signal })
    clearTimeout(timeout)

    if (!resp.ok) {
      console.log(`[Poller] ${server.Name} (${server.IP}:${port}) — HTTP ${resp.status}`)
      markAgentOffline(server.Id)
      return false
    }

    const data = await resp.json()
    const report: AgentReport = {
      agentId: server.Id, token: "", timestamp: new Date().toISOString(),
      metrics: {
        cpu: data.metrics?.cpu ?? 0,
        ram: data.metrics?.ram ?? { totalMB: 0, usedMB: 0, freeMB: 0 },
        disks: data.metrics?.disks ?? [],
        uptimeSeconds: data.metrics?.uptimeSeconds ?? 0,
        networkAdapters: data.metrics?.network ?? [],
      },
      roles: data.roles ?? [], sessions: data.sessions ?? undefined, iis: data.iis ?? undefined,
      sql: data.mssql ?? undefined, ad: data.ad ?? undefined, localUsers: data.localUsers ?? undefined,
      security: data.security ?? undefined, logs: data.logs ?? undefined, userProcesses: data.userProcesses ?? undefined,
    }

    upsertAgentFromPoll({
      serverId: server.Id, hostname: data.hostname ?? server.Name, ip: data.ip ?? server.IP,
      os: (data.os === "linux" ? "linux" : "windows") as "windows" | "linux",
      version: data.version ?? "unknown", port, report,
    })

    const hasSqlRole = Array.isArray(report.roles) && report.roles.some((r) => String(r).toUpperCase() === "SQL")
    if (report.ad?.companies || report.iis || report.sql || report.userProcesses || hasSqlRole) {
      persistHeavyData(server.Name, report)
    }
    if (report.logs?.failedLogins?.length) {
      persistFailedLogons(server.Id, server.Name, report)
    }

    const pendingAcks: { msgId: string; username: string }[] = data.pendingAcks ?? []
    for (const ack of pendingAcks) {
      if (ack.msgId && ack.username) {
        markMessageRead(ack.msgId, ack.username)
        try { await markReadByMsgId(ack.msgId, ack.username) } catch { /* ignore */ }
      }
    }

    void retryPendingForActiveUsers(server, port, report).catch(err =>
      console.log(`[Poller] retryPending hata (${server.Name}):`, err instanceof Error ? err.message : err))

    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes("abort")) console.log(`[Poller] ${server.Name} (${server.IP}:${port}) — ${msg}`)
    markAgentOffline(server.Id)
    return false
  }
}

/* ── File sunucusundan firma klasör boyutları → companies.file_storage_mb ── */
async function collectFileStorage(): Promise<void> {
  try {
    const { data } = await hub().from("companies")
      .select("company_id, file_server_id, user_count, file_storage_mb")
      .not("company_id", "is", null).not("file_server_id", "is", null)
    const firmas = ((data ?? []) as { company_id: string; file_server_id: string; user_count: number | null; file_storage_mb: number | null }[])
      .filter((c) => (c.user_count ?? 0) > 0 || (c.file_storage_mb ?? 0) > 0)
    if (!firmas.length) return

    const byServer = new Map<string, string[]>()
    for (const f of firmas) {
      const arr = byServer.get(f.file_server_id) ?? []
      arr.push(f.company_id); byServer.set(f.file_server_id, arr)
    }

    for (const [serverId, companyIds] of byServer) {
      try {
        const { data: srv } = await hub().from("servers").select("ip, agent_port, api_key")
          .eq("id", serverId).not("agent_port", "is", null).not("api_key", "is", null).maybeSingle()
        const s = srv as { ip: string; agent_port: number; api_key: string } | null
        if (!s) continue

        const CHUNK = 100
        const results: { firkod: string; mb: number }[] = []
        for (let i = 0; i < companyIds.length; i += CHUNK) {
          const chunk = companyIds.slice(i, i + CHUNK)
          const firmaList = chunk.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")
          const cmd = `$root='D:\\Resimler'; foreach ($f in @(${firmaList})) { $p = Join-Path $root $f; if (Test-Path $p) { $b = (Get-ChildItem $p -Recurse -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum; if (-not $b) { $b = 0 }; Write-Output ($f + '|' + [int64]$b) } else { Write-Output ($f + '|0') } }`
          const res = await execOnAgent(s.ip, s.agent_port, s.api_key, cmd, 60)
          if (res.exitCode !== 0 || !res.stdout) continue
          for (const line of res.stdout.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean)) {
            const [firkod, bytesStr] = line.split("|")
            if (!firkod) continue
            const mb = Math.round((Number.parseInt(bytesStr ?? "0", 10) || 0) / (1024 * 1024))
            results.push({ firkod, mb })
          }
        }
        if (results.length) await hub().rpc("poller_set_file_storage", { p_items: results })
      } catch (err) {
        console.log(`[Poller] collectFileStorage sunucu ${serverId} hatası:`, err instanceof Error ? err.message : err)
      }
    }
  } catch (err) {
    console.log("[Poller] collectFileStorage hatası:", err instanceof Error ? err.message : err)
  }
}

/* ── Firma kullanım istatistikleri (5 dk'da bir): pre → fileStorage → post ── */
async function updateCompanyUsage(): Promise<void> {
  try {
    await hub().rpc("update_company_usage_pre")
    await collectFileStorage()
    await hub().rpc("update_company_usage_post")
    console.log("[Poller] Firma istatistikleri güncellendi")
  } catch (err) {
    console.log("[Poller] updateCompanyUsage hatası:", err instanceof Error ? err.message : err)
  }
}

let _usageCounter = 0
const USAGE_EVERY = 30  // 30 × 10s = 5 dakika

/* ── Tüm sunucuları poll et ── */
async function pollAll(): Promise<void> {
  try {
    const { data } = await hub().from("servers")
      .select("id, name, ip, os, api_key, agent_port")
      .not("agent_port", "is", null).not("api_key", "is", null).neq("api_key", "")
    const servers = ((data ?? []) as Record<string, unknown>[]).map(mapServer)
    if (!servers.length) return

    const batchSize = 10
    for (let i = 0; i < servers.length; i += batchSize) {
      const batch = servers.slice(i, i + batchSize)
      await Promise.allSettled(batch.map((s) => pollAgent(s)))
    }

    _usageCounter++
    if (_usageCounter >= USAGE_EVERY) { _usageCounter = 0; updateCompanyUsage() }
  } catch (err) {
    console.error("[Poller] DB sorgu hatası:", err)
  }
}

/* ── On-demand tek sunucu poll (UI "Yenile") ── */
function slugifyName(name: string): string {
  return name.toLowerCase()
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export async function pollSingleAgent(idOrSlug: string, force = false): Promise<boolean> {
  try {
    const cols = "id, name, ip, os, api_key, agent_port"
    let server: ServerRow | null = null
    const { data: byId } = await hub().from("servers").select(cols).eq("id", idOrSlug).maybeSingle()
    if (byId) {
      server = mapServer(byId as Record<string, unknown>)
    } else {
      const { data: all } = await hub().from("servers").select(cols)
      const match = ((all ?? []) as Record<string, unknown>[]).map(mapServer).find((s) => slugifyName(s.Name) === idOrSlug)
      if (match) server = match
    }
    if (!server || !server.ApiKey || !server.AgentPort) return false
    return await pollAgent(server, force)
  } catch (err) {
    console.error("[Poller] pollSingleAgent hatası:", err)
    return false
  }
}

/* ── Agent'a doğrudan komut gönder (DEĞİŞMEZ) ── */
export async function execOnAgent(
  ip: string, port: number, apiKey: string, command: string, timeout = 30,
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  const url = `http://${ip}:${port}/api/exec`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), (timeout + 5) * 1000)
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({ command, timeout }), signal: controller.signal,
    })
    clearTimeout(timer)
    if (!resp.ok) return { exitCode: -1, stdout: "", stderr: `HTTP ${resp.status}`, timedOut: false }
    return await resp.json()
  } catch (err: unknown) {
    clearTimeout(timer)
    const msg = err instanceof Error ? err.message : String(err)
    return { exitCode: -1, stdout: "", stderr: msg, timedOut: msg.includes("abort") }
  }
}

/* ── Polling döngüsü ── */
let _timer: ReturnType<typeof setInterval> | null = null

export function startPolling(): void {
  if (_timer) return
  console.log(`[Poller] Başlatıldı — ${POLL_INTERVAL_MS / 1000}s aralıkla`)
  setTimeout(pollAll, 5000)
  setTimeout(updateCompanyUsage, 8000)
  _timer = setInterval(pollAll, POLL_INTERVAL_MS)
}

export function stopPolling(): void {
  if (_timer) { clearInterval(_timer); _timer = null }
}
