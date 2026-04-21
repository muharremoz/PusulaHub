/* ══════════════════════════════════════════════════════════
   PusulaHub — Agent Poller (Pull Model)
   DB'deki sunucuları periyodik olarak pollar.
   Her sunucunun agent'ına HTTP GET /api/report atar,
   gelen metrik verisini agent-store'a kaydeder.
══════════════════════════════════════════════════════════ */

import sql from "mssql"
import { upsertAgentFromPoll, getAllAgents, markMessageRead, markAgentOffline } from "./agent-store"
import type { AgentReport } from "./agent-types"
import { withSqlConnection } from "./sql-external"
import { decrypt } from "./crypto"

/* Hub → harici SQL sunucusu: DB metadata'sını SA ile doğrudan topla.
   Böylece agent'ın LocalSystem yetki sınırlamasından etkilenmeyiz. */
interface SqlDbRow {
  name:           string
  sizeMB:         number
  status:         string
  lastBackup:          Date | null
  lastDiffBackup:      Date | null
  lastBackupStart:     Date | null
  lastDiffBackupStart: Date | null
  recoveryModel:       string
  owner:          string
  dataFilePath:   string
  logFilePath:    string
}

async function collectSqlFromServer(serverIp: string, user: string, password: string): Promise<SqlDbRow[] | null> {
  try {
    return await withSqlConnection(
      { server: serverIp, user, password, database: "master", requestTimeout: 15000 },
      async (pool) => {
        const res = await pool.request().query<SqlDbRow>(`
          SELECT
            d.name                                                                                                           AS name,
            CAST(ISNULL((SELECT SUM(CAST(f.size AS BIGINT) * 8 / 1024) FROM sys.master_files f WHERE f.database_id=d.database_id AND f.type=0), 0) AS INT) AS sizeMB,
            d.state_desc                                                                                                     AS status,
            (SELECT MAX(b.backup_finish_date) FROM msdb.dbo.backupset b WHERE b.database_name=d.name AND b.type='D')         AS lastBackup,
            (SELECT MAX(b.backup_finish_date) FROM msdb.dbo.backupset b WHERE b.database_name=d.name AND b.type='I')         AS lastDiffBackup,
            (SELECT TOP 1 b.backup_start_date FROM msdb.dbo.backupset b WHERE b.database_name=d.name AND b.type='D' ORDER BY b.backup_finish_date DESC) AS lastBackupStart,
            (SELECT TOP 1 b.backup_start_date FROM msdb.dbo.backupset b WHERE b.database_name=d.name AND b.type='I' ORDER BY b.backup_finish_date DESC) AS lastDiffBackupStart,
            d.recovery_model_desc                                                                                            AS recoveryModel,
            ISNULL(SUSER_SNAME(d.owner_sid), '')                                                                             AS owner,
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

/* SQLDatabases.Status CHECK constraint: 'Online'/'Offline'/'Restoring' yalnız.
   Agent state_desc'i UPPERCASE döner — burada normalize ediyoruz. */
function normalizeDbStatus(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toUpperCase()
  if (s === "RESTORING") return "Restoring"
  if (s === "OFFLINE")   return "Offline"
  return "Online" // default + ONLINE/SUSPECT/RECOVERING vb. hepsi
}

/* ── Failed logon denemelerini DB'ye yaz ──
   Agent her pollda son 20 tane 4625 event'ini döner. Duplicate'ları önlemek için
   (ServerId, Timestamp, Username, ClientIp) unique index kullanıyoruz. */
async function persistFailedLogons(
  serverId: string,
  serverName: string,
  report: AgentReport,
): Promise<void> {
  const failedLogins = report.logs?.failedLogins
  if (!failedLogins || !failedLogins.length) return

  try {
    const pool = await getPollerPool()

    // Şema: tablo + unique index (idempotent)
    await pool.request().query(`
      IF OBJECT_ID('FailedLogonAttempts','U') IS NULL
      BEGIN
        CREATE TABLE FailedLogonAttempts (
          Id          BIGINT         IDENTITY(1,1) PRIMARY KEY,
          ServerId    NVARCHAR(50)   NOT NULL,
          ServerName  NVARCHAR(100)  NOT NULL,
          [Timestamp] DATETIME2      NOT NULL,
          Username    NVARCHAR(200)  NULL,
          ClientIp    NVARCHAR(45)   NULL,
          CreatedAt   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
        )
        CREATE UNIQUE INDEX UX_FailedLogon_Dedup
          ON FailedLogonAttempts (ServerId, [Timestamp], Username, ClientIp)
          WHERE Username IS NOT NULL AND ClientIp IS NOT NULL
        CREATE INDEX IX_FailedLogon_Timestamp
          ON FailedLogonAttempts ([Timestamp] DESC)
      END
    `)

    for (const fl of failedLogins) {
      const ts = fl.timestamp ? new Date(fl.timestamp) : null
      if (!ts || isNaN(ts.getTime())) continue
      const user = (fl.username ?? "").trim() || "-"
      const ip   = (fl.clientIp ?? "").trim() || "-"

      await pool.request()
        .input("serverId",   sql.NVarChar(50),  serverId)
        .input("serverName", sql.NVarChar(100), serverName)
        .input("timestamp",  sql.DateTime2,     ts)
        .input("username",   sql.NVarChar(200), user)
        .input("clientIp",   sql.NVarChar(45),  ip)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM FailedLogonAttempts
            WHERE ServerId = @serverId
              AND [Timestamp] = @timestamp
              AND Username = @username
              AND ClientIp = @clientIp
          )
          INSERT INTO FailedLogonAttempts (ServerId, ServerName, [Timestamp], Username, ClientIp)
          VALUES (@serverId, @serverName, @timestamp, @username, @clientIp)
        `)
    }

    // 30 günden eski kayıtları temizle (nadiren çalışır — her 100. pollda bir)
    if (Math.random() < 0.01) {
      await pool.request().query(
        "DELETE FROM FailedLogonAttempts WHERE [Timestamp] < DATEADD(day, -30, SYSUTCDATETIME())"
      )
    }
  } catch (err) {
    console.log(`[Poller] persistFailedLogons hatası (${serverName}):`, err instanceof Error ? err.message : err)
  }
}

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
        // FirmaNo çözümü: 1) ADUsers.OU, 2) username prefix "NNNN.xxx" (DOMAIN\ prefix'i de tolere et)
        const firmaResult = await pool.request()
          .input("username", sql.NVarChar(200), up.username)
          .query("SELECT TOP 1 OU FROM ADUsers WHERE Username = @username")
        let firmaNo: string | null = firmaResult.recordset[0]?.OU ?? null
        if (!firmaNo) {
          const bare = up.username.includes("\\") ? up.username.split("\\").pop()! : up.username
          const m = bare.match(/^(\d+)\./)
          if (m) firmaNo = m[1]
        }

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
          let lastLogin: Date | null = null
          if (user.lastLogin && user.lastLogin !== "Hiç" && user.lastLogin !== "Yok" && user.lastLogin !== "") {
            const parsed = new Date(user.lastLogin)
            if (!isNaN(parsed.getTime())) lastLogin = parsed
          }

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
        // Firma no: site adının başındaki sayısal prefix — "6754_Site" → "6754"
        const siteIisFirmaMatch = site.name.match(/^(\d+)/)
        const siteIisFirma = siteIisFirmaMatch ? siteIisFirmaMatch[1] : null

        await pool.request()
          .input("id",          sql.NVarChar(50),  `${serverName}_${site.name}`.replace(/\s/g, "_"))
          .input("name",        sql.NVarChar(200), site.name)
          .input("server",      sql.NVarChar(100), serverName)
          .input("status",      sql.NVarChar(20),  site.status ?? "Stopped")
          .input("binding",     sql.NVarChar(500), site.binding ?? "")
          .input("appPool",     sql.NVarChar(200), site.appPool ?? "")
          .input("physicalPath",sql.NVarChar(500), site.physicalPath ?? "")
          .input("firma",       sql.NVarChar(200), siteIisFirma)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM IISSites WHERE Id = @id)
              INSERT INTO IISSites (Id, Name, Server, Status, Binding, AppPool, PhysicalPath, Firma)
              VALUES (@id, @name, @server, @status, @binding, @appPool, @physicalPath, @firma)
            ELSE
              UPDATE IISSites SET Name=@name, Status=@status, Binding=@binding, AppPool=@appPool,
                                  PhysicalPath=@physicalPath,
                                  Firma = COALESCE(@firma, Firma)
              WHERE Id=@id
          `)
      }
    }

    // SQL Databases — Hub'dan direkt SA ile topla (öncelik), yoksa agent verisi
    // Agent LocalSystem olduğu için sys.master_files erişimi kısıtlı → SizeMB/path boş kalıyor.
    // Servers tablosunda SA creds varsa direkt bağlanıp topluyoruz.
    let directRows: SqlDbRow[] | null = null
    try {
      const srvRes = await pool.request()
        .input("name", sql.NVarChar(100), serverName)
        .query<{ IP: string; SqlUsername: string | null; SqlPassword: string | null }>(
          "SELECT IP, SqlUsername, SqlPassword FROM Servers WHERE Name = @name"
        )
      const srv = srvRes.recordset[0]
      if (srv?.SqlUsername && srv?.SqlPassword) {
        const pw = decrypt(srv.SqlPassword) ?? ""
        if (pw) {
          directRows = await collectSqlFromServer(srv.IP, srv.SqlUsername, pw)
        }
      }
    } catch (err) {
      console.log(`[Poller] SQL creds lookup hatası (${serverName}):`, err instanceof Error ? err.message : err)
    }

    // Kaynak seçimi: direkt SA > agent raporu
    type DbSource = {
      name: string
      sizeMB: number
      status: string
      lastBackup: Date | string | null
      lastDiffBackup?: Date | string | null
      lastBackupStart?: Date | string | null
      lastDiffBackupStart?: Date | string | null
      tables?: number
      recoveryModel?: string | null
      owner?: string | null
      dataFilePath?: string | null
      logFilePath?: string | null
    }
    const sourceDbs: DbSource[] = directRows
      ? directRows.map((r) => ({
          name:           r.name,
          sizeMB:         r.sizeMB,
          status:         r.status,
          lastBackup:          r.lastBackup,
          lastDiffBackup:      r.lastDiffBackup,
          lastBackupStart:     r.lastBackupStart,
          lastDiffBackupStart: r.lastDiffBackupStart,
          recoveryModel:       r.recoveryModel,
          owner:          r.owner,
          dataFilePath:   r.dataFilePath,
          logFilePath:    r.logFilePath,
        }))
      : (report.sql?.databases ?? [])

    if (sourceDbs.length) {
      // Şema migration — yoksa yeni backup zamanı kolonlarını ekle
      await pool.request().query(`
        IF COL_LENGTH('SQLDatabases','LastDiffBackup') IS NULL
          ALTER TABLE SQLDatabases ADD LastDiffBackup datetime2 NULL
      `)
      await pool.request().query(`
        IF COL_LENGTH('SQLDatabases','LastBackupStart') IS NULL
          ALTER TABLE SQLDatabases ADD LastBackupStart datetime2 NULL
      `)
      await pool.request().query(`
        IF COL_LENGTH('SQLDatabases','LastDiffBackupStart') IS NULL
          ALTER TABLE SQLDatabases ADD LastDiffBackupStart datetime2 NULL
      `)

      await pool.request()
        .input("server", sql.NVarChar(100), serverName)
        .query("DELETE FROM SQLDatabases WHERE Server = @server")

      const SKIP_DBS = new Set(["master", "tempdb", "model", "msdb"])

      for (const db of sourceDbs) {
        if (SKIP_DBS.has(db.name.toLowerCase())) continue

        const firmaNoMatch = db.name.match(/^(\d+)/)
        const firmaNo = firmaNoMatch ? firmaNoMatch[1] : null

        const parseDate = (raw: Date | string | null | undefined): Date | null => {
          if (!raw) return null
          if (raw instanceof Date) return !isNaN(raw.getTime()) ? raw : null
          if (typeof raw === "string" && raw && !["Hiç","Yok","NULL",""].includes(raw)) {
            const d = new Date(raw)
            return !isNaN(d.getTime()) ? d : null
          }
          return null
        }
        const lastBackup          = parseDate(db.lastBackup)
        const lastDiffBackup      = parseDate(db.lastDiffBackup ?? null)
        const lastBackupStart     = parseDate(db.lastBackupStart ?? null)
        const lastDiffBackupStart = parseDate(db.lastDiffBackupStart ?? null)

        await pool.request()
          .input("id",         sql.NVarChar(50),   `${serverName}_${db.name}`.replace(/\s/g, "_"))
          .input("name",       sql.NVarChar(200),  db.name)
          .input("server",     sql.NVarChar(100),  serverName)
          .input("firmaNo",    sql.NVarChar(20),   firmaNo)
          .input("sizeMB",     sql.Int,            db.sizeMB ?? 0)
          .input("status",     sql.NVarChar(20),   normalizeDbStatus(db.status))
          .input("lastBackup", sql.DateTime2,      lastBackup)
          .input("lastDiffBackup", sql.DateTime2,  lastDiffBackup)
          .input("lastBackupStart",     sql.DateTime2, lastBackupStart)
          .input("lastDiffBackupStart", sql.DateTime2, lastDiffBackupStart)
          .input("tables",     sql.Int,            db.tables ?? 0)
          .input("recoveryModel", sql.NVarChar(30),  db.recoveryModel ?? null)
          .input("owner",         sql.NVarChar(200), db.owner ?? null)
          .input("dataFilePath",  sql.NVarChar(500), db.dataFilePath ?? null)
          .input("logFilePath",   sql.NVarChar(500), db.logFilePath ?? null)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM SQLDatabases WHERE Id = @id)
              INSERT INTO SQLDatabases (Id, Name, Server, FirmaNo, SizeMB, Status, LastBackup, LastDiffBackup, LastBackupStart, LastDiffBackupStart, Tables, RecoveryModel, [Owner], DataFilePath, LogFilePath)
              VALUES (@id, @name, @server, @firmaNo, @sizeMB, @status, @lastBackup, @lastDiffBackup, @lastBackupStart, @lastDiffBackupStart, @tables, @recoveryModel, @owner, @dataFilePath, @logFilePath)
            ELSE
              UPDATE SQLDatabases SET Name=@name, FirmaNo=@firmaNo, SizeMB=@sizeMB, Status=@status, LastBackup=@lastBackup, LastDiffBackup=@lastDiffBackup,
                LastBackupStart=@lastBackupStart, LastDiffBackupStart=@lastDiffBackupStart, Tables=@tables,
                RecoveryModel=@recoveryModel, [Owner]=@owner, DataFilePath=@dataFilePath, LogFilePath=@logFilePath
              WHERE Id=@id
          `)
      }
    }
  } catch (err) {
    console.log(`[Poller] persistHeavyData hatası (${serverName}):`, err instanceof Error ? err.message : err)
  }
}

/* ── Tek bir agent'ı poll et ── */
async function pollAgent(server: ServerRow, force = false): Promise<boolean> {
  const port = server.AgentPort ?? 8585
  const url  = `http://${server.IP}:${port}/api/report${force ? "?force=1" : ""}`

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
    const hasSqlRole = Array.isArray(report.roles) && report.roles.some((r) => String(r).toUpperCase() === "SQL")
    if (report.ad?.companies || report.iis || report.sql || report.userProcesses || hasSqlRole) {
      persistHeavyData(server.Name, report)
    }

    // Failed RDP logon denemeleri (4625 event'leri)
    if (report.logs?.failedLogins?.length) {
      persistFailedLogons(server.Id, server.Name, report)
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

/* ── File sunucusu üzerinden firma klasör boyutlarını topla ──
   Her firma için D:\Resimler\<CompanyId> klasörünün MB boyutunu getirir,
   Companies.FileStorageMB'ye yazar. FileServerId atanmamış firmalar atlanır. */
interface FileFirmaRow {
  CompanyId: string
  FileServerId: string
}
async function collectFileStorage(pool: sql.ConnectionPool): Promise<void> {
  try {
    // File sunucusu atanmış AKTİF firmalar (UserCount > 0 ya da daha önce ölçülmüş olan)
    // — boş klasör taramasıyla sunucuyu meşgul etmeyelim
    const rows = await pool.request().query<FileFirmaRow>(`
      SELECT c.CompanyId, c.FileServerId
      FROM Companies c
      WHERE c.CompanyId IS NOT NULL
        AND c.FileServerId IS NOT NULL
        AND (ISNULL(c.UserCount, 0) > 0 OR ISNULL(c.FileStorageMB, 0) > 0)
    `)
    const firmas = rows.recordset as FileFirmaRow[]
    if (!firmas.length) return

    // Her sunucu için firma listesini grupla (tek çağrıda birkaç firma ölçümü)
    const byServer = new Map<string, string[]>()
    for (const f of firmas) {
      const arr = byServer.get(f.FileServerId) ?? []
      arr.push(f.CompanyId)
      byServer.set(f.FileServerId, arr)
    }

    for (const [serverId, companyIds] of byServer) {
      try {
        // Sunucu credentials
        const srvRows = await pool.request()
          .input("id", sql.NVarChar(50), serverId)
          .query<{ IP: string; AgentPort: number; ApiKey: string }>(
            "SELECT IP, AgentPort, ApiKey FROM Servers WHERE Id = @id AND AgentPort IS NOT NULL AND ApiKey IS NOT NULL"
          )
        const srv = srvRows.recordset[0]
        if (!srv) continue

        // Chunk: tek komutta 100 firma (Windows komut satırı 8191 byte limit'i)
        const CHUNK = 100
        for (let i = 0; i < companyIds.length; i += CHUNK) {
          const chunk = companyIds.slice(i, i + CHUNK)

          // PS komutu: her firma klasörünün boyutunu satır satır yaz (firkod|bytes)
          // Tek tırnak kullan (CLAUDE.md kuralı — agent parser double quote parse edemiyor)
          const firmaList = chunk.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")
          const cmd = `$root='D:\\Resimler'; foreach ($f in @(${firmaList})) { $p = Join-Path $root $f; if (Test-Path $p) { $b = (Get-ChildItem $p -Recurse -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum; if (-not $b) { $b = 0 }; Write-Output ($f + '|' + [int64]$b) } else { Write-Output ($f + '|0') } }`

          const res = await execOnAgent(srv.IP, srv.AgentPort, srv.ApiKey, cmd, 60)
          if (res.exitCode !== 0 || !res.stdout) continue

          for (const line of res.stdout.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean)) {
            const [firkod, bytesStr] = line.split("|")
            if (!firkod) continue
            const bytes = Number.parseInt(bytesStr ?? "0", 10) || 0
            const mb = Math.round(bytes / (1024 * 1024))
            await pool.request()
              .input("companyId", sql.NVarChar(20), firkod)
              .input("mb",        sql.Int,           mb)
              .query("UPDATE Companies SET FileStorageMB = @mb WHERE CompanyId = @companyId")
          }
        }
      } catch (err) {
        console.log(`[Poller] collectFileStorage sunucu ${serverId} hatası:`, err instanceof Error ? err.message : err)
      }
    }
  } catch (err) {
    console.log("[Poller] collectFileStorage hatası:", err instanceof Error ? err.message : err)
  }
}

/* ── Firma kullanım istatistiklerini güncelle (5 dk'da bir) ──
   1. Companies.UserCount  ← ADUsers OU bazlı sayım
   2. Companies.UsageCpu   ← bugünkü UserDailyUsage AVG(AvgCpu)
   3. Companies.UsageRam   ← bugünkü UserDailyUsage SUM(AvgRamMB)/1024 GB
   4. CompanyUsageDaily    ← bugünkü firma CPU/RAM/DB/Disk özeti (UPSERT). Haftalık
                             ve 30-günlük grafikler bu tabloyu okur.
*/
async function updateCompanyUsage(): Promise<void> {
  try {
    const pool = await getPollerPool()

    // 0 — Schema migration: FileServerId + FileStorageMB (idempotent)
    await pool.request().query(`
      IF COL_LENGTH('Companies','FileServerId') IS NULL
        ALTER TABLE Companies ADD FileServerId NVARCHAR(50) NULL
    `)
    await pool.request().query(`
      IF COL_LENGTH('Companies','FileStorageMB') IS NULL
        ALTER TABLE Companies ADD FileStorageMB INT NULL DEFAULT 0
    `)
    // Default kotalar: DB 1 GB, Disk 25 GB — henüz atanmamış firmalara uygula
    await pool.request().query(`
      UPDATE Companies SET DbQuota   = 1  WHERE ISNULL(DbQuota, 0)   = 0
    `)
    await pool.request().query(`
      UPDATE Companies SET QuotaDisk = 25 WHERE ISNULL(QuotaDisk, 0) = 0
    `)
    // FileServerId atanmamış AKTİF firmalar için sistemdeki ilk File-rolündeki
    // sunucuyu fallback olarak ata. Sadece UserCount > 0 olanlar — böylece
    // binlerce boş eski kaydı gezmekten kaçınırız.
    await pool.request().query(`
      UPDATE c
      SET c.FileServerId = (
        SELECT TOP 1 s.Id
        FROM Servers s
        INNER JOIN ServerRoles r ON r.ServerId = s.Id
        WHERE r.Role = 'File'
      )
      FROM Companies c
      WHERE c.FileServerId IS NULL
        AND ISNULL(c.UserCount, 0) > 0
        AND EXISTS (SELECT 1 FROM Servers s INNER JOIN ServerRoles r ON r.ServerId = s.Id WHERE r.Role = 'File')
    `)

    // 1 — UserCount: AD'deki OU = CompanyId olan kullanıcı sayısı
    await pool.request().query(`
      UPDATE c
      SET c.UserCount = (
        SELECT COUNT(*) FROM ADUsers a WHERE a.OU = c.CompanyId
      )
      FROM Companies c
      WHERE c.CompanyId IS NOT NULL
    `)

    // 1.5 — FileStorageMB: file sunucusundaki D:\Resimler\<firkod> klasör boyutu
    await collectFileStorage(pool)

    // 2+3 — Bugünkü CPU/RAM kullanımı (UserDailyUsage → firma bazında özet)
    await pool.request().query(`
      UPDATE c
      SET
        c.UsageCpu = ISNULL((
          SELECT ROUND(AVG(u.AvgCpu), 1)
          FROM UserDailyUsage u
          WHERE u.FirmaNo = c.CompanyId
            AND u.Date = CAST(GETDATE() AS DATE)
        ), 0),
        c.UsageRam = ISNULL((
          SELECT ROUND(SUM(u.AvgRamMB) / 1024.0, 2)
          FROM UserDailyUsage u
          WHERE u.FirmaNo = c.CompanyId
            AND u.Date = CAST(GETDATE() AS DATE)
        ), 0)
      FROM Companies c
      WHERE c.CompanyId IS NOT NULL
    `)

    // 4 — CompanyUsageDaily: firma başına günlük özet — satış için geçmiş trend
    //     Tablo yoksa oluştur (idempotent)
    await pool.request().query(`
      IF OBJECT_ID('CompanyUsageDaily','U') IS NULL
      BEGIN
        CREATE TABLE CompanyUsageDaily (
          CompanyId   NVARCHAR(20)  NOT NULL,
          Date        DATE          NOT NULL,
          AvgCpu      FLOAT         NULL,
          PeakCpu     FLOAT         NULL,
          AvgRamMB    FLOAT         NULL,
          PeakRamMB   FLOAT         NULL,
          UserCount   INT           NULL,
          DbMB        INT           NULL,
          DiskMB      INT           NULL,
          UpdatedAt   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_CompanyUsageDaily PRIMARY KEY (CompanyId, Date)
        )
      END
    `)
    // DiskMB kolonu sonradan eklenmişse migrate et (idempotent)
    await pool.request().query(`
      IF COL_LENGTH('CompanyUsageDaily','DiskMB') IS NULL
        ALTER TABLE CompanyUsageDaily ADD DiskMB INT NULL
    `)

    // Bugünkü özeti firma başına UPSERT et
    await pool.request().query(`
      ;WITH FirmaToday AS (
        SELECT
          u.FirmaNo,
          CAST(GETDATE() AS DATE)               AS D,
          ROUND(AVG(u.AvgCpu), 1)               AS AvgCpu,
          ROUND(MAX(u.AvgCpu), 1)               AS PeakCpu,
          ROUND(SUM(u.AvgRamMB), 1)             AS AvgRamMB,
          ROUND(MAX(u.AvgRamMB), 1)             AS PeakRamMB,
          COUNT(DISTINCT u.Username)            AS UserCount
        FROM UserDailyUsage u
        WHERE u.Date = CAST(GETDATE() AS DATE)
          AND u.FirmaNo IS NOT NULL
        GROUP BY u.FirmaNo
      ),
      FirmaDb AS (
        SELECT FirmaNo, CAST(SUM(SizeMB) AS INT) AS DbMB
        FROM SQLDatabases
        WHERE FirmaNo IS NOT NULL
        GROUP BY FirmaNo
      ),
      FirmaDisk AS (
        SELECT CompanyId AS FirmaNo, FileStorageMB AS DiskMB
        FROM Companies
        WHERE CompanyId IS NOT NULL
      )
      MERGE CompanyUsageDaily AS t
      USING (
        SELECT
          COALESCE(f.FirmaNo, d.FirmaNo, k.FirmaNo) AS CompanyId,
          COALESCE(f.D, CAST(GETDATE() AS DATE))    AS D,
          f.AvgCpu, f.PeakCpu, f.AvgRamMB, f.PeakRamMB, f.UserCount,
          d.DbMB,
          k.DiskMB
        FROM FirmaToday f
        FULL OUTER JOIN FirmaDb d   ON d.FirmaNo = f.FirmaNo
        FULL OUTER JOIN FirmaDisk k ON k.FirmaNo = COALESCE(f.FirmaNo, d.FirmaNo)
        WHERE COALESCE(f.FirmaNo, d.FirmaNo, k.FirmaNo) IS NOT NULL
          AND (f.AvgCpu IS NOT NULL OR d.DbMB IS NOT NULL OR k.DiskMB IS NOT NULL)
      ) AS s
      ON t.CompanyId = s.CompanyId AND t.Date = s.D
      WHEN MATCHED THEN UPDATE SET
        AvgCpu    = s.AvgCpu,
        PeakCpu   = s.PeakCpu,
        AvgRamMB  = s.AvgRamMB,
        PeakRamMB = s.PeakRamMB,
        UserCount = s.UserCount,
        DbMB      = s.DbMB,
        DiskMB    = s.DiskMB,
        UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT
        (CompanyId, Date, AvgCpu, PeakCpu, AvgRamMB, PeakRamMB, UserCount, DbMB, DiskMB)
        VALUES (s.CompanyId, s.D, s.AvgCpu, s.PeakCpu, s.AvgRamMB, s.PeakRamMB, s.UserCount, s.DbMB, s.DiskMB);
    `)

    console.log("[Poller] Firma istatistikleri güncellendi")
  } catch (err) {
    console.log("[Poller] updateCompanyUsage hatası:", err instanceof Error ? err.message : err)
  }
}

let _usageCounter = 0
const USAGE_EVERY  = 30  // 30 × 10s = 5 dakika

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
      await Promise.allSettled(batch.map((s) => pollAgent(s)))
    }

    // Her 5 dakikada bir firma istatistiklerini güncelle
    _usageCounter++
    if (_usageCounter >= USAGE_EVERY) {
      _usageCounter = 0
      updateCompanyUsage()
    }
  } catch (err) {
    console.error("[Poller] DB sorgu hatası:", err)
  }
}

/* ── On-demand: tek sunucuyu anlık poll et ──
   UI'daki "Yenile" butonu için. Id veya slug(name) ile eşleşir. */
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export async function pollSingleAgent(idOrSlug: string, force = false): Promise<boolean> {
  try {
    // Önce Id ile dene
    let rows = await pollerQuery<ServerRow[]>(
      `SELECT Id, Name, IP, OS, ApiKey, AgentPort FROM Servers WHERE Id = '${idOrSlug.replace(/'/g, "''")}'`
    )

    // Bulunamazsa tüm sunucuları çekip slug ile eşleştir
    if (!rows.length) {
      const all = await pollerQuery<ServerRow[]>(
        "SELECT Id, Name, IP, OS, ApiKey, AgentPort FROM Servers"
      )
      const match = all.find((s) => slugifyName(s.Name) === idOrSlug)
      if (match) rows = [match]
    }

    if (!rows.length) return false
    const server = rows[0]
    if (!server.ApiKey || !server.AgentPort) return false

    return await pollAgent(server, force)
  } catch (err) {
    console.error("[Poller] pollSingleAgent hatası:", err)
    return false
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

  // Firma istatistiklerini başlangıçta bir kez hemen güncelle
  setTimeout(updateCompanyUsage, 8000)

  _timer = setInterval(pollAll, POLL_INTERVAL_MS)
}

export function stopPolling(): void {
  if (_timer) {
    clearInterval(_timer)
    _timer = null
  }
}
