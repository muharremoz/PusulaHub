/* ══════════════════════════════════════════════════════════
   PusulaHub — Agent Poller (Pull Model)
   DB'deki sunucuları periyodik olarak pollar.
   Her sunucunun agent'ına HTTP GET /api/report atar,
   gelen metrik verisini agent-store'a kaydeder.
══════════════════════════════════════════════════════════ */

import sql from "mssql"
import { upsertAgentFromPoll, getAllAgents, markMessageRead, markAgentOffline } from "./agent-store"
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

/* ── IIS ve SQL verilerini DB'ye yaz ── */
async function persistHeavyData(serverName: string, report: AgentReport): Promise<void> {
  try {
    const pool = await getPollerPool()

    // UserDailyUsage — günlük kümülatif ortalama (running average)
    if (report.userProcesses?.length) {
      const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

      // Sistem hesaplarını filtrele (dwm-*, umfd-*, system vb.)
      const SKIP_ACCOUNTS = new Set(["system", "local service", "network service"])
      const isSystemAccount = (u: string) => {
        const l = u.toLowerCase()
        return SKIP_ACCOUNTS.has(l) || l.startsWith("dwm-") || l.startsWith("umfd-")
      }

      for (const up of report.userProcesses) {
        if (isSystemAccount(up.username)) continue
        // ADUsers tablosundan FirmaNo'yu bul (OU = firmaNo)
        const firmaResult = await pool.request()
          .input("username", sql.NVarChar(200), up.username)
          .query("SELECT TOP 1 OU FROM ADUsers WHERE Username = @username")
        const firmaNo: string | null = firmaResult.recordset[0]?.OU ?? null

        await pool.request()
          .input("date",     sql.Date,         new Date(today))
          .input("username", sql.NVarChar(200), up.username)
          .input("server",   sql.NVarChar(100), serverName)
          .input("firmaNo",  sql.NVarChar(20),  firmaNo)
          .input("cpu",      sql.Float,         up.cpuPercent)
          .input("ram",      sql.Float,         up.ramMB)
          .query(`
            MERGE UserDailyUsage AS target
            USING (SELECT @date AS Date, @username AS Username, @server AS Server) AS src
              ON target.Date = src.Date AND target.Username = src.Username AND target.Server = src.Server
            WHEN MATCHED THEN UPDATE SET
              AvgCpu      = ROUND((target.AvgCpu * target.SampleCount + @cpu) / (target.SampleCount + 1), 2),
              AvgRamMB    = ROUND((target.AvgRamMB * target.SampleCount + @ram) / (target.SampleCount + 1), 1),
              SessionMinutes = target.SessionMinutes + 5,
              SampleCount = target.SampleCount + 1,
              FirmaNo     = COALESCE(target.FirmaNo, @firmaNo)
            WHEN NOT MATCHED THEN INSERT
              (Date, Username, FirmaNo, Server, AvgCpu, AvgRamMB, SessionMinutes, SampleCount)
              VALUES (@date, @username, @firmaNo, @server, @cpu, @ram, 5, 1);
          `)
      }
    }

    // AD Users — sunucuya ait tüm kullanıcıları sil, yeniden yaz
    if (report.ad?.companies?.length) {
      await pool.request()
        .input("server", sql.NVarChar(100), serverName)
        .query("DELETE FROM ADUsers WHERE Server = @server")

      for (const company of report.ad.companies) {
        for (const user of company.users) {
          const lastLogin = user.lastLogin && user.lastLogin !== "Hiç" && user.lastLogin !== ""
            ? new Date(user.lastLogin)
            : null

          await pool.request()
            .input("id",          sql.NVarChar(50),  `${serverName}_${user.username}`.replace(/\s/g, "_"))
            .input("server",      sql.NVarChar(100), serverName)
            .input("username",    sql.NVarChar(200), user.username)
            .input("displayName", sql.NVarChar(200), user.displayName ?? "")
            .input("email",       sql.NVarChar(200), user.email ?? "")
            .input("ou",          sql.NVarChar(200), company.firmaNo)
            .input("enabled",     sql.Bit,           user.enabled ? 1 : 0)
            .input("lastLogin",   sql.DateTime2,     lastLogin)
            .query(`
              IF NOT EXISTS (SELECT 1 FROM ADUsers WHERE Id = @id)
                INSERT INTO ADUsers (Id, Server, Username, DisplayName, Email, OU, Enabled, LastLogin, CreatedAt)
                VALUES (@id, @server, @username, @displayName, @email, @ou, @enabled, @lastLogin, CAST(GETDATE() AS DATE))
              ELSE
                UPDATE ADUsers SET Server=@server, Username=@username, DisplayName=@displayName,
                  Email=@email, OU=@ou, Enabled=@enabled, LastLogin=@lastLogin
                WHERE Id=@id
            `)
        }
      }
    }

    // IIS Sites — sunucuya ait tüm satırları sil, yeniden yaz
    if (report.iis?.sites?.length) {
      await pool.request()
        .input("server", sql.NVarChar(100), serverName)
        .query("DELETE FROM IISSites WHERE Server = @server")

      for (const site of report.iis.sites) {
        await pool.request()
          .input("id",          sql.NVarChar(50),  `${serverName}_${site.name}`.replace(/\s/g, "_"))
          .input("name",        sql.NVarChar(200), site.name)
          .input("server",      sql.NVarChar(100), serverName)
          .input("status",      sql.NVarChar(20),  site.status ?? "Unknown")
          .input("binding",     sql.NVarChar(500), site.binding ?? "")
          .input("appPool",     sql.NVarChar(200), site.appPool ?? "")
          .input("physicalPath",sql.NVarChar(500), site.physicalPath ?? "")
          .query(`
            IF NOT EXISTS (SELECT 1 FROM IISSites WHERE Id = @id)
              INSERT INTO IISSites (Id, Name, Server, Status, Binding, AppPool, PhysicalPath)
              VALUES (@id, @name, @server, @status, @binding, @appPool, @physicalPath)
            ELSE
              UPDATE IISSites SET Name=@name, Status=@status, Binding=@binding, AppPool=@appPool, PhysicalPath=@physicalPath
              WHERE Id=@id
          `)
      }
    }

    // SQL Databases — sunucuya ait tüm satırları sil, yeniden yaz
    if (report.sql?.databases?.length) {
      await pool.request()
        .input("server", sql.NVarChar(100), serverName)
        .query("DELETE FROM SQLDatabases WHERE Server = @server")

      const SKIP_DBS = new Set(["master", "tempdb", "model", "msdb"])

      for (const db of report.sql.databases) {
        if (SKIP_DBS.has(db.name.toLowerCase())) continue

        // Firma no: başındaki sayısal prefix, örn. "6754_Muhasebe" → "6754"
        const firmaNoMatch = db.name.match(/^(\d+)/)
        const firmaNo = firmaNoMatch ? firmaNoMatch[1] : null

        const lastBackup = db.lastBackup && db.lastBackup !== "Hiç" && db.lastBackup !== ""
          ? new Date(db.lastBackup)
          : null

        await pool.request()
          .input("id",         sql.NVarChar(50),   `${serverName}_${db.name}`.replace(/\s/g, "_"))
          .input("name",       sql.NVarChar(200),  db.name)
          .input("server",     sql.NVarChar(100),  serverName)
          .input("firmaNo",    sql.NVarChar(20),   firmaNo)
          .input("sizeMB",     sql.Int,            db.sizeMB ?? 0)
          .input("status",     sql.NVarChar(20),   db.status ?? "Online")
          .input("lastBackup", sql.DateTime2,      lastBackup)
          .input("tables",     sql.Int,            db.tables ?? 0)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM SQLDatabases WHERE Id = @id)
              INSERT INTO SQLDatabases (Id, Name, Server, FirmaNo, SizeMB, Status, LastBackup, Tables)
              VALUES (@id, @name, @server, @firmaNo, @sizeMB, @status, @lastBackup, @tables)
            ELSE
              UPDATE SQLDatabases SET Name=@name, FirmaNo=@firmaNo, SizeMB=@sizeMB, Status=@status, LastBackup=@lastBackup, Tables=@tables
              WHERE Id=@id
          `)
      }
    }
  } catch (err) {
    console.log(`[Poller] persistHeavyData hatası (${serverName}):`, err instanceof Error ? err.message : err)
  }
}

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
      markAgentOffline(server.Id)
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
      ad:            data.ad ?? undefined,
      localUsers:    data.localUsers ?? undefined,
      security:      data.security ?? undefined,
      logs:          data.logs ?? undefined,
      userProcesses: data.userProcesses ?? undefined,
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

    // Ağır veri: AD / IIS / SQL / UserProcesses — agent 5 dk'da bir gönderir, DB'ye yaz
    if (report.ad?.companies || report.iis || report.sql || report.userProcesses) {
      persistHeavyData(server.Name, report)
    }

    // Bekleyen okundu bilgilerini işle
    const pendingAcks: { msgId: string; username: string }[] = data.pendingAcks ?? []
    for (const ack of pendingAcks) {
      if (ack.msgId && ack.username) {
        markMessageRead(ack.msgId, ack.username)
      }
    }

    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes("abort")) {
      console.log(`[Poller] ${server.Name} (${server.IP}:${port}) — ${msg}`)
    }
    markAgentOffline(server.Id)
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
