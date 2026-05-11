/**
 * Pusula Aktarım — 10.15.2.6 Upload Servisi (v2 — full stack)
 *
 * Source of truth: yerel SQLite (/opt/pusula-aktarim/aktarim.db).
 * Hub'dan bağımsız çalışır — Hub yalnızca admin işlemlerini bu API'ye
 * X-Service-Key ile çağırır.
 *
 * Endpoint'ler:
 *   Admin (X-Service-Key auth):
 *     GET    /admin/sessions
 *     POST   /admin/sessions
 *     POST   /admin/sessions/:id/cancel
 *     DELETE /admin/sessions/:id
 *
 *   Müşteri (token-only):
 *     GET    /:token                       — HTML
 *     GET    /api/info/:token              — public bilgi
 *     POST   /api/upload/:token/data       — .bak yükle
 *     POST   /api/upload/:token/image      — resim yükle (relPath ile)
 *     POST   /api/upload/:token/images-done — toplu sayaç
 *     POST   /api/upload/:token/complete   — tamamlandı
 */

import Fastify from "fastify"
import multipart from "@fastify/multipart"
import Database from "better-sqlite3"
import { fileURLToPath } from "url"
import { dirname, join, normalize } from "path"
import { mkdir, stat, readdir, rm, readFile } from "fs/promises"
import { createWriteStream } from "fs"
import { pipeline } from "stream/promises"
import { randomBytes } from "crypto"
import { spawn } from "child_process"
import sql from "mssql"

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

const SERVICE_KEY  = process.env.TRANSFER_SERVICE_KEY ?? ""
const STAGING_ROOT = process.env.STAGING_ROOT ?? join(__dirname, "staging")
const DB_PATH      = process.env.DB_PATH ?? join(__dirname, "aktarim.db")
const PORT         = parseInt(process.env.PORT ?? "5000", 10)
const HOST         = "0.0.0.0"

if (!SERVICE_KEY) {
  console.error("TRANSFER_SERVICE_KEY env değişkeni tanımlı değil")
  process.exit(1)
}

// ── SQLite ──
const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id                  TEXT PRIMARY KEY,
    token               TEXT NOT NULL UNIQUE,
    companyId           TEXT NOT NULL,
    firmaName           TEXT NOT NULL,
    sqlServerName       TEXT,
    depoServerName      TEXT,
    status              TEXT NOT NULL DEFAULT 'pending',
    createdBy           TEXT,
    createdAt           TEXT NOT NULL DEFAULT (datetime('now')),
    expiresAt           TEXT NOT NULL,
    completedAt         TEXT,
    dataBytesTotal      INTEGER NOT NULL DEFAULT 0,
    dataBytesReceived   INTEGER NOT NULL DEFAULT 0,
    imageFilesTotal     INTEGER NOT NULL DEFAULT 0,
    imageFilesReceived  INTEGER NOT NULL DEFAULT 0,
    imageBytesTotal     INTEGER NOT NULL DEFAULT 0,
    imageBytesReceived  INTEGER NOT NULL DEFAULT 0,
    notes               TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_company ON sessions(companyId);
`)

// ── Migration: SMB push için sunucu credential'ları ──
function ensureColumn(name, type) {
  const cols = db.prepare("PRAGMA table_info(sessions)").all().map(c => c.name)
  if (!cols.includes(name)) {
    db.exec(`ALTER TABLE sessions ADD COLUMN ${name} ${type}`)
  }
}
ensureColumn("sqlServerIp",   "TEXT")
ensureColumn("sqlUsername",   "TEXT")
ensureColumn("sqlPassword",   "TEXT")
ensureColumn("depoServerIp",  "TEXT")
ensureColumn("depoUsername",  "TEXT")
ensureColumn("depoPassword",  "TEXT")
ensureColumn("pushProgress",  "INTEGER NOT NULL DEFAULT 0")   // 0-100 toplam
ensureColumn("pushStage",     "TEXT")                          // 'data' | 'images' | null
ensureColumn("pushError",     "TEXT")
ensureColumn("sqlAuthUsername", "TEXT")    // SQL Auth (BACKUP DATABASE)
ensureColumn("sqlAuthPassword", "TEXT")

function newId()    { return randomBytes(8).toString("hex") }
function newToken() { return randomBytes(18).toString("base64url") }

const stmts = {
  insert: db.prepare(`
    INSERT INTO sessions (id, token, companyId, firmaName, sqlServerName, depoServerName,
                          sqlServerIp, sqlUsername, sqlPassword,
                          sqlAuthUsername, sqlAuthPassword,
                          depoServerIp, depoUsername, depoPassword,
                          status, createdBy, expiresAt, notes)
    VALUES (@id, @token, @companyId, @firmaName, @sqlServerName, @depoServerName,
            @sqlServerIp, @sqlUsername, @sqlPassword,
            @sqlAuthUsername, @sqlAuthPassword,
            @depoServerIp, @depoUsername, @depoPassword,
            'pending', @createdBy, @expiresAt, @notes)
  `),
  updatePush: db.prepare(`
    UPDATE sessions
    SET pushProgress = @progress,
        pushStage    = @stage,
        pushError    = @error,
        status       = COALESCE(@status, status),
        completedAt  = CASE WHEN @status IN ('completed','push_failed') THEN datetime('now') ELSE completedAt END
    WHERE token = @token
  `),
  byToken: db.prepare(`SELECT * FROM sessions WHERE token = ?`),
  byId:    db.prepare(`SELECT * FROM sessions WHERE id = ?`),
  list:    db.prepare(`SELECT * FROM sessions ORDER BY createdAt DESC LIMIT ?`),
  cancel:  db.prepare(`
    UPDATE sessions
    SET status = 'cancelled', completedAt = datetime('now')
    WHERE id = ? AND status IN ('pending','active')
  `),
  remove:  db.prepare(`DELETE FROM sessions WHERE id = ?`),
  setStatus: db.prepare(`
    UPDATE sessions
    SET status = ?,
        completedAt = CASE WHEN ? IN ('completed','cancelled','expired') THEN datetime('now') ELSE completedAt END
    WHERE token = ?
  `),
  updateProgress: db.prepare(`
    UPDATE sessions
    SET dataBytesTotal     = COALESCE(@dataBytesTotal,     dataBytesTotal),
        dataBytesReceived  = COALESCE(@dataBytesReceived,  dataBytesReceived),
        imageFilesTotal    = COALESCE(@imageFilesTotal,    imageFilesTotal),
        imageFilesReceived = COALESCE(@imageFilesReceived, imageFilesReceived),
        imageBytesTotal    = COALESCE(@imageBytesTotal,    imageBytesTotal),
        imageBytesReceived = COALESCE(@imageBytesReceived, imageBytesReceived),
        status             = COALESCE(@status, status)
    WHERE token = @token
  `),
}

// ── Server ──
const fastify = Fastify({
  logger: { level: "info" },
  bodyLimit: 20 * 1024 * 1024 * 1024,
})

await fastify.register(multipart, {
  limits: { fileSize: 20 * 1024 * 1024 * 1024, files: 1 },
})

// ── Auth helper ──
function checkAdmin(req, reply) {
  if (req.headers["x-service-key"] !== SERVICE_KEY) {
    reply.code(401).send({ error: "unauthorized" })
    return false
  }
  return true
}

// ── Public session validation (token only) ──
function getActiveSession(token) {
  const s = stmts.byToken.get(token)
  if (!s) return { error: "not_found" }
  if (s.status === "cancelled" || s.status === "expired") return { error: s.status }
  if (s.status === "completed") return { error: "completed" }
  // 'pushing' / 'push_failed' / 'active' upload aşamasında değil, info için OK
  // ama upload endpoint'leri bunlara izin vermemeli
  if (s.status === "pushing")     return { error: "pushing" }
  if (s.status === "push_failed") return { error: "push_failed" }
  // Süresi geçtiyse otomatik expired
  if (new Date(s.expiresAt) < new Date()) {
    stmts.setStatus.run("expired", "expired", token)
    return { error: "expired" }
  }
  return { session: s }
}

// ─────────────────────────────────────────────────
// ADMIN endpoints (Hub'dan gelir, X-Service-Key)
// ─────────────────────────────────────────────────

fastify.get("/admin/sessions", async (req, reply) => {
  if (!checkAdmin(req, reply)) return
  return stmts.list.all(500)
})

fastify.post("/admin/sessions", async (req, reply) => {
  if (!checkAdmin(req, reply)) return
  const body = req.body ?? {}
  if (!body.companyId || !body.firmaName) {
    return reply.code(400).send({ error: "companyId ve firmaName zorunludur" })
  }
  // Default 365 gün — admin manuel iptal/silme yapar, sınır pratikte yok
  const days = Math.max(1, Math.min(3650, body.expiresInDays ?? 365))
  const expiresAt = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 19).replace("T", " ")

  const id    = newId()
  const token = newToken()
  stmts.insert.run({
    id, token,
    companyId:      body.companyId,
    firmaName:      body.firmaName,
    sqlServerName:  body.sqlServerName  ?? null,
    depoServerName: body.depoServerName ?? null,
    sqlServerIp:     body.sqlServerIp     ?? null,
    sqlUsername:     body.sqlUsername     ?? null,
    sqlPassword:     body.sqlPassword     ?? null,
    sqlAuthUsername: body.sqlAuthUsername ?? null,
    sqlAuthPassword: body.sqlAuthPassword ?? null,
    depoServerIp:   body.depoServerIp   ?? null,
    depoUsername:   body.depoUsername   ?? null,
    depoPassword:   body.depoPassword   ?? null,
    createdBy:      body.createdBy ?? null,
    expiresAt,
    notes:          body.notes ?? null,
  })
  return stmts.byId.get(id)
})

fastify.post("/admin/sessions/:id/cancel", async (req, reply) => {
  if (!checkAdmin(req, reply)) return
  stmts.cancel.run(req.params.id)
  return { ok: true }
})

fastify.delete("/admin/sessions/:id", async (req, reply) => {
  if (!checkAdmin(req, reply)) return
  const sess = stmts.byId.get(req.params.id)
  stmts.remove.run(req.params.id)
  // Staging klasörünü de temizle
  if (sess?.token) {
    try { await rm(join(STAGING_ROOT, sess.token), { recursive: true, force: true }) }
    catch { /* ignore */ }
  }
  return { ok: true }
})

// ─────────────────────────────────────────────────
// PUBLIC endpoints (müşteri, token only)
// ─────────────────────────────────────────────────

fastify.get("/api/info/:token", async (req, reply) => {
  const s = stmts.byToken.get(req.params.token)
  if (!s) return reply.code(404).send({ ok: false, reason: "not_found" })

  // Süresi geçti mi (active aşamada)?
  if (["pending","active"].includes(s.status) && new Date(s.expiresAt) < new Date()) {
    stmts.setStatus.run("expired", "expired", req.params.token)
    return reply.code(410).send({ ok: false, reason: "expired" })
  }

  // Completed link kullanım dışı — 410 dön, link erişilmesin
  if (s.status === "completed") {
    return reply.code(410).send({ ok: false, reason: "completed" })
  }
  // Cancelled, expired → 410
  if (!["pending","active","pushing","push_failed"].includes(s.status)) {
    return reply.code(410).send({ ok: false, reason: s.status })
  }

  return {
    ok: true,
    firmaId:             s.companyId,
    firmaName:           s.firmaName,
    status:              s.status,
    createdAt:           s.createdAt,
    expiresAt:           s.expiresAt,
    completedAt:         s.completedAt,
    dataBytesTotal:      s.dataBytesTotal,
    dataBytesReceived:   s.dataBytesReceived,
    imageFilesTotal:     s.imageFilesTotal,
    imageFilesReceived:  s.imageFilesReceived,
    imageBytesTotal:     s.imageBytesTotal,
    imageBytesReceived:  s.imageBytesReceived,
    pushProgress:        s.pushProgress ?? 0,
    pushStage:           s.pushStage,
    pushError:           s.pushError,
    notes:               s.notes,
  }
})

const ALLOWED_DATA_EXT  = /\.(bak|rar|zip|ldf|mdf)$/i
const ALLOWED_IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|avif)$/i

fastify.post("/api/upload/:token/data", async (req, reply) => {
  const v = getActiveSession(req.params.token)
  if (v.error) return reply.code(410).send({ error: v.error })

  const data = await req.file()
  if (!data) return reply.code(400).send({ error: "Dosya yok" })

  if (!ALLOWED_DATA_EXT.test(data.filename || "")) {
    // İstemci validation atlatılmış — akışı tüket ve reddet
    await data.toBuffer().catch(() => {})
    return reply.code(400).send({ error: "Geçersiz dosya tipi. Sadece .bak/.rar/.zip kabul edilir." })
  }

  const filename = sanitizeFilename(data.filename || "data.bak")
  const targetDir = join(STAGING_ROOT, req.params.token, "data")
  await mkdir(targetDir, { recursive: true })
  const targetPath = join(targetDir, filename)

  await pipeline(data.file, createWriteStream(targetPath))
  const s = await stat(targetPath)
  // Cumulative progress için client /data-progress'i çağırır.
  // Burada yalnız status'u active'e çek.
  stmts.setStatus.run("active", "active", req.params.token)
  return reply.send({ ok: true, filename, size: s.size })
})

fastify.post("/api/upload/:token/image", async (req, reply) => {
  const v = getActiveSession(req.params.token)
  if (v.error) return reply.code(410).send({ error: v.error })

  const data = await req.file()
  if (!data) return reply.code(400).send({ error: "Dosya yok" })

  const relPath = data.fields.relPath?.value ?? data.filename
  const safeRel = sanitizeRelPath(String(relPath))
  if (!safeRel) return reply.code(400).send({ error: "Geçersiz dosya yolu" })

  if (!ALLOWED_IMAGE_EXT.test(safeRel)) {
    await data.toBuffer().catch(() => {})
    return reply.code(400).send({ error: "Geçersiz dosya tipi. Sadece resim dosyaları kabul edilir." })
  }

  const targetPath = join(STAGING_ROOT, req.params.token, "images", safeRel)
  await mkdir(dirname(targetPath), { recursive: true })
  await pipeline(data.file, createWriteStream(targetPath))
  const s = await stat(targetPath)
  return reply.send({ ok: true, path: safeRel, size: s.size })
})

fastify.post("/api/upload/:token/data-progress", async (req, reply) => {
  const v = getActiveSession(req.params.token)
  if (v.error) return reply.code(410).send({ error: v.error })
  const b = req.body ?? {}
  stmts.updateProgress.run({
    token: req.params.token,
    status: "active",
    dataBytesTotal:    b.totalBytes    ?? null,
    dataBytesReceived: b.uploadedBytes ?? null,
    imageFilesTotal: null, imageFilesReceived: null,
    imageBytesTotal: null, imageBytesReceived: null,
  })
  return reply.send({ ok: true })
})

fastify.post("/api/upload/:token/images-done", async (req, reply) => {
  const v = getActiveSession(req.params.token)
  if (v.error) return reply.code(410).send({ error: v.error })
  const b = req.body ?? {}
  stmts.updateProgress.run({
    token: req.params.token,
    status: "active",
    dataBytesTotal: null, dataBytesReceived: null,
    imageFilesTotal:    b.totalFiles    ?? null,
    imageFilesReceived: b.uploadedFiles ?? null,
    imageBytesTotal:    b.totalBytes    ?? null,
    imageBytesReceived: b.uploadedBytes ?? null,
  })
  return reply.send({ ok: true })
})

// ─────────────────────────────────────────────────
// SQL'den otomatik yedek (müşteri sayfasından çağrılır)
// Hub admin aktarım oluştururken seçilen SQL sunucusu kullanılır —
// müşteri credential girmez. SQL Auth bilgileri session'da hazır.
// ─────────────────────────────────────────────────

async function sqlPool(serverIp, port, user, password) {
  if (!serverIp || !user || !password) {
    throw new Error("SQL bağlantı bilgileri eksik")
  }
  const pool = new sql.ConnectionPool({
    server:   serverIp,
    port:     port || 1433,
    user, password,
    database: "master",
    options:  { trustServerCertificate: true, encrypt: false },
    connectionTimeout: 8000,
    requestTimeout:    600000,
    pool: { max: 2, min: 0, idleTimeoutMillis: 5000 },
  })
  await pool.connect()
  return pool
}

// POST yerine GET kullanılıyordu — credential body için POST'a çevir
fastify.post("/api/sql/databases/:token", async (req, reply) => {
  const v = getActiveSession(req.params.token)
  if (v.error) return reply.code(410).send({ error: v.error })

  const body = req.body ?? {}
  const { server, port, user, password } = body
  if (!server || !user || !password) {
    return reply.code(400).send({ error: "Sunucu, kullanıcı ve şifre zorunlu" })
  }

  let pool
  try {
    pool = await sqlPool(server, port, user, password)
    const r = await pool.request().query(`
      SELECT d.name, d.recovery_model_desc AS recoveryModel,
             CAST((SELECT SUM(size * 8.0 / 1024) FROM sys.master_files WHERE database_id = d.database_id) AS DECIMAL(18,1)) AS sizeMB
      FROM sys.databases d
      WHERE d.database_id > 4 AND d.state_desc = 'ONLINE'
      ORDER BY d.name
    `)
    const dbs = r.recordset.map(row => ({
      name: row.name, sizeMB: Number(row.sizeMB) || 0, recoveryModel: row.recoveryModel,
    }))
    return reply.send({ ok: true, databases: dbs })
  } catch (err) {
    return reply.code(500).send({ error: err.message })
  } finally {
    if (pool) try { await pool.close() } catch {}
  }
})

fastify.post("/api/sql/backup/:token", async (req, reply) => {
  const v = getActiveSession(req.params.token)
  if (v.error) return reply.code(410).send({ error: v.error })
  const sess = v.session

  const body = req.body ?? {}
  const dbs = Array.isArray(body.databases) ? body.databases.filter(d => typeof d === "string" && d.length > 0) : []
  if (dbs.length === 0) return reply.code(400).send({ error: "Yedeklenecek DB seçilmedi" })

  const { server: srcServer, port: srcPort, user: srcUser, password: srcPassword } = body
  if (!srcServer || !srcUser || !srcPassword) {
    return reply.code(400).send({ error: "SQL bağlantı bilgileri eksik" })
  }

  // Async başlat — frontend polling ile takip eder
  reply.send({ ok: true, started: true })

  ;(async () => {
    let pool
    // Ubuntu'nun samba share path'i — SQL Server doğrudan buraya yazar (UNC)
    // sql-inbox samba share = /opt/pusula-aktarim/sql-inbox/
    const sambaInbox  = "/opt/pusula-aktarim/sql-inbox"
    const tokenInbox  = join(sambaInbox, sess.token)
    const stagingDir  = join(STAGING_ROOT, sess.token, "data")

    try {
      pool = await sqlPool(srcServer, srcPort, srcUser, srcPassword)
      await mkdir(tokenInbox, { recursive: true })
      await mkdir(stagingDir, { recursive: true })

      stmts.updateProgress.run({
        token: sess.token, status: "active",
        dataBytesTotal: 0, dataBytesReceived: 0,
        imageFilesTotal: null, imageFilesReceived: null,
        imageBytesTotal: null, imageBytesReceived: null,
      })

      // SQL Server BACKUP UNC yola yazsın (Ubuntu samba share)
      // \\10.15.2.6\sql-inbox\{token}\xxx.bak
      const uncBase = `\\\\10.15.2.6\\sql-inbox\\${sess.token}`
      for (const db of dbs) {
        const safe = db.replace(/[^A-Za-z0-9_]/g, "_")
        const bakUnc = `${uncBase}\\${safe}.bak`
        fastify.log.info({ db, bakUnc }, "SQL backup başlıyor (UNC)")
        const bakSql = `BACKUP DATABASE [${db.replace(/]/g, "]]")}] TO DISK = N'${bakUnc}'
          WITH INIT, FORMAT, COMPRESSION, COPY_ONLY`
        await pool.request().query(bakSql)
      }

      // BACKUP UNC'ye yazıldı — şimdi staging/data'ya taşı
      const files = await readdir(tokenInbox)
      for (const f of files) {
        const src = join(tokenInbox, f)
        const dst = join(stagingDir, f)
        await execCmd("mv", [src, dst])
      }
      // Boş inbox klasörünü temizle
      try { await rm(tokenInbox, { recursive: true, force: true }) } catch {}

      // Toplam boyutu hesapla
      let totalBytes = 0
      const stagingFiles = await readdir(stagingDir)
      for (const f of stagingFiles) {
        const s = await stat(join(stagingDir, f))
        totalBytes += s.size
      }
      stmts.updateProgress.run({
        token: sess.token, status: "active",
        dataBytesTotal: totalBytes, dataBytesReceived: totalBytes,
        imageFilesTotal: null, imageFilesReceived: null,
        imageBytesTotal: null, imageBytesReceived: null,
      })
      fastify.log.info({ token: sess.token, dbs: dbs.length, bytes: totalBytes }, "SQL backup tamamlandı")
    } catch (err) {
      fastify.log.error({ err: err.message }, "SQL backup hatası")
      // Yarıda kalan dosyaları temizleme — bir sonraki denemeyi engellemesin
      try { await rm(tokenInbox, { recursive: true, force: true }) } catch {}
      stmts.updatePush.run({
        token: sess.token, progress: 0, stage: null, error: "SQL yedek: " + err.message, status: "push_failed",
      })
    } finally {
      if (pool) try { await pool.close() } catch {}
    }
  })()
})

fastify.post("/api/upload/:token/complete", async (req, reply) => {
  const { token } = req.params
  const sess = stmts.byToken.get(token)
  if (!sess) return reply.code(404).send({ error: "not_found" })

  // 'pushing' statusüne geç ve push'u arkaplanda başlat
  stmts.updatePush.run({
    token, progress: 0, stage: "starting", error: null, status: "pushing",
  })
  startPushJob(token).catch((err) => {
    fastify.log.error({ err, token }, "push job crashed")
    stmts.updatePush.run({
      token, progress: 0, stage: null, error: String(err?.message ?? err), status: "push_failed",
    })
  })
  return reply.send({ ok: true })
})

// ─────────────────────────────────────────────────
// Müşteri HTML sayfası
// ─────────────────────────────────────────────────

// ─────────────────────────────────────────────────
// HELPER — Çift tıkla çalışan .bat wrapper
// /helper/:token         → .bat indirilir
// /helper-script/:token  → ham .ps1 (bat içinden fetch edilir)
// ─────────────────────────────────────────────────

async function renderHelperScript(token, baseUrl) {
  const sess = stmts.byToken.get(token)
  if (!sess) return null
  const isActive = ["pending", "active", "pushing", "push_failed"].includes(sess.status)
  if (!isActive) return null

  const template = await readFile(join(__dirname, "helper-template.ps1"), "utf8")
  return template
    .replace("'__TOKEN_PLACEHOLDER__'",    JSON.stringify(token))
    .replace("'__BASE_URL_PLACEHOLDER__'", JSON.stringify(baseUrl))
    .replace("'__FIRMA_PLACEHOLDER__'",    JSON.stringify(sess.firmaName))
}

fastify.get("/helper/:token", async (req, reply) => {
  const { token } = req.params
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return reply.code(404).send("Geçersiz token")
  }
  const sess = stmts.byToken.get(token)
  if (!sess) return reply.code(404).send("Aktarım bulunamadı")
  const isActive = ["pending", "active", "pushing", "push_failed"].includes(sess.status)
  if (!isActive) return reply.code(410).send("Aktarım aktif değil")

  const base = (req.headers["x-forwarded-proto"] || "http") + "://" + (req.headers.host || "aktarim.pusulanet.net")

  // .bat wrapper — PowerShell'i bypass ile başlatır, script'i Ubuntu'dan çekip çalıştırır
  // CRLF satır sonu (Windows .bat için)
  const bat = [
    `@echo off`,
    `chcp 65001 >nul`,
    `title Pusula Backup Helper - ${sess.firmaName}`,
    `echo.`,
    `echo  Pusula Backup Helper`,
    `echo  Firma: ${sess.firmaName}`,
    `echo.`,
    `echo  Yardimci script indiriliyor...`,
    `echo.`,
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { Invoke-Expression ((Invoke-WebRequest '${base}/helper-script/${token}' -UseBasicParsing).Content) } catch { Write-Host ''; Write-Host ('HATA: ' + $_.Exception.Message) -ForegroundColor Red; Read-Host 'Cikmak icin Enter' }`,
    ``,
  ].join("\r\n")

  reply
    .header("Content-Disposition", `attachment; filename="pusula-backup-${sess.companyId}.bat"`)
    .type("application/octet-stream")
    .send(bat)
})

fastify.get("/helper-script/:token", async (req, reply) => {
  const { token } = req.params
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return reply.code(404).send("# Geçersiz token")
  }
  const base = (req.headers["x-forwarded-proto"] || "http") + "://" + (req.headers.host || "aktarim.pusulanet.net")
  const script = await renderHelperScript(token, base)
  if (!script) return reply.code(410).send("# Aktarım aktif değil veya bulunamadı")

  reply.type("text/plain; charset=utf-8").send(script)
})

fastify.get("/:token", async (req, reply) => {
  const { token } = req.params
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return reply.code(404).type("text/html").send(notFoundHtml())
  }
  // DB'de aktif değilse (completed, cancelled, expired, not_found) → 404
  // Link hiç yokmuş gibi davran
  const sess = stmts.byToken.get(token)
  if (!sess) {
    return reply.code(404).type("text/html").send(notFoundHtml())
  }
  const isActive = ["pending", "active", "pushing", "push_failed"].includes(sess.status)
  if (!isActive) {
    return reply.code(404).type("text/html").send(notFoundHtml())
  }
  // Süresi dolmuş?
  if (new Date(sess.expiresAt) < new Date()) {
    stmts.setStatus.run("expired", "expired", token)
    return reply.code(404).type("text/html").send(notFoundHtml())
  }
  reply.type("text/html").send(renderHtml(token))
})

function notFoundHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>404</title></head><body style="margin:0;font-family:system-ui,sans-serif;background:#fafaf9;color:#71717a;display:flex;align-items:center;justify-content:center;height:100vh"><div style="text-align:center"><div style="font-size:64px;font-weight:300;color:#a1a1aa">404</div><div style="font-size:14px;margin-top:8px">Sayfa bulunamadı</div></div></body></html>`
}

fastify.get("/", async (_req, reply) => {
  reply.type("text/html").send("<h1>Pusula Aktarım</h1><p>Geçerli bir aktarım linki gerekiyor.</p>")
})

// ── Helpers ──
function sanitizeFilename(s) {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200)
}
function sanitizeRelPath(s) {
  const cleaned = s.replace(/\\/g, "/").replace(/^\/+/, "")
  if (cleaned.includes("..")) return null
  if (cleaned.length > 500) return null
  return normalize(cleaned)
}

const ICON_DATABASE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>`
const ICON_FOLDER   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/></svg>`
const ICON_UPLOAD   = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`
const ICON_CHECK    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
const ICON_CHECK_BIG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
const ICON_X        = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
const ICON_WARN     = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`

function renderHtml(token) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pusula Aktarım</title>
<style>
  *, *::before, *::after { box-sizing: border-box }
  :root {
    --pusula: #1d64ff;
    --pusula-soft: #eff5ff;
    --bg: #f4f2f0;
    --card: #fff;
    --border: #e4e4e7;
    --text: #18181b;
    --muted: #71717a;
    --shadow: 0 2px 4px rgba(0,0,0,0.06);
  }
  body {
    margin: 0; min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: var(--bg); color: var(--text);
  }

  /* ── Header ───────────────────────────── */
  header.topbar {
    background:#fff; border-bottom:1px solid var(--border);
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    position:sticky; top:0; z-index:10;
  }
  .topbar-inner {
    max-width:1080px; margin:0 auto; padding:14px 24px;
    display:flex; align-items:center; justify-content:space-between; gap:16px;
  }
  .topbar-brand { display:flex; align-items:center; gap:10px }
  .topbar-brand img { height:28px; width:auto }
  .topbar-brand .sep { width:1px; height:20px; background:var(--border) }
  .topbar-brand .label { font-size:12px; color:var(--muted); letter-spacing:.5px; text-transform:uppercase; font-weight:500 }
  .topbar-firma { text-align:right }
  .topbar-firma .l { font-size:10px; color:var(--muted); letter-spacing:.5px; text-transform:uppercase }
  .topbar-firma .v { font-size:14px; font-weight:600; color:var(--text); max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }

  .page { max-width: 1080px; margin: 0 auto; padding: 28px 24px 48px }

  /* ── Cards ────────────────────────────── */
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 8px;
    box-shadow: var(--shadow); padding: 24px;
  }
  .intro { margin-bottom:18px }
  .intro p { margin:0; color:var(--muted); font-size:13px; line-height:1.5 }
  .intro .note { margin-top:12px; padding:10px 12px; background:#fffbeb; border:1px solid #fde68a; border-radius:5px; color:#78350f; font-size:12px }

  /* ── 2 sütun grid ─────────────────────── */
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px }
  @media (max-width:880px) { .grid { grid-template-columns:1fr } }

  .card-hdr { display:flex; align-items:center; gap:12px; margin-bottom: 16px }
  .card-hdr .icon {
    flex: 0 0 40px; width:40px; height:40px; border-radius:8px;
    background: var(--pusula-soft); color: var(--pusula);
    display:flex; align-items:center; justify-content:center;
  }
  .card-hdr h2 { margin:0; font-size:15px; font-weight:600; color:var(--text) }
  .card-hdr .meta { font-size:11px; color:var(--muted); margin-top:2px }

  /* ── Drop zone ────────────────────────── */
  .drop {
    display:block; width:100%;
    border: 2px dashed #d4d4d8; border-radius: 6px;
    padding: 28px 16px; text-align: center; background: #fafafa;
    cursor: pointer; transition: all .15s; color: var(--muted);
    font-size: 12px;
  }
  .drop:hover, .drop.over { border-color: var(--pusula); background: var(--pusula-soft); color: var(--pusula) }
  .drop input { display: none }
  .drop-icon { display:block; margin:0 auto 8px auto; opacity:.55 }
  .drop strong { display:block; color:var(--text); font-weight:600; margin-bottom:4px; font-size:13px }
  .drop:hover strong, .drop.over strong { color: var(--pusula) }

  /* ── Özet ─────────────────────────────── */
  .summary { margin-top:14px; border:1px solid var(--border); border-radius:6px; overflow:hidden }
  .summary-row { display:grid; grid-template-columns:1fr auto; gap:8px; padding:8px 12px; align-items:center; font-size:12px }
  .summary-row + .summary-row { border-top:1px solid var(--border) }
  .summary-row .l { color:var(--muted) }
  .summary-row .v { font-weight:600; font-family:ui-monospace,SFMono-Regular,monospace; tabular-nums:true }
  .summary-row.danger { background:#fef2f2 }
  .summary-row.danger .l { color:#991b1b }
  .summary-row.danger .v { color:#991b1b }

  .clear-btn {
    margin-top:10px; width:100%; padding:6px; font-size:11px; color:var(--muted);
    background:transparent; border:1px solid var(--border); border-radius:5px; cursor:pointer;
  }
  .clear-btn:hover { background:#f4f4f5; color:var(--text) }

  /* ── Klasör ağacı ─────────────────────── */
  .tree {
    margin-top:12px; border:1px solid var(--border); border-radius:6px;
    background:#fafafa; max-height:240px; overflow-y:auto;
  }
  .tree-hdr {
    padding:8px 12px; font-size:10px; font-weight:600;
    color:var(--muted); letter-spacing:.5px; text-transform:uppercase;
    border-bottom:1px solid var(--border); background:#fff;
    position:sticky; top:0;
  }
  .tree-row {
    display:grid; grid-template-columns:1fr auto; gap:8px;
    padding:6px 12px; font-size:11px; align-items:center;
  }
  .tree-row + .tree-row { border-top:1px solid #e4e4e7 }
  .tree-path { font-family:ui-monospace,SFMono-Regular,monospace; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  .tree-meta { color:var(--muted); font-family:ui-monospace,SFMono-Regular,monospace; tabular-nums:true; white-space:nowrap }
  .tree-more { justify-content:center; color:var(--muted); font-style:italic; grid-template-columns:1fr }

  /* ── Sıkıştırma uyarısı ───────────────── */
  .compress-tip {
    margin-top:12px; padding:10px 12px; border-radius:5px;
    background:#fff7ed; border:1px solid #fed7aa; color:#9a3412;
    font-size:11px; display:flex; gap:8px; align-items:flex-start;
  }
  .compress-tip strong { display:block; color:#7c2d12; margin-bottom:2px; font-size:12px }
  .compress-tip a { color:#7c2d12; text-decoration:underline }

  /* ── Progress (yükleme sırasında) ─────── */
  .progress { margin-top:14px }
  .bar { height:6px; background:#e4e4e7; border-radius:3px; overflow:hidden }
  .bar > div { height:100%; background: var(--pusula); transition:width .25s; border-radius:3px }
  .stat { display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-top:6px }
  .stat .pct { font-weight:600; color:var(--text) }

  /* ── Status durum rozeti ──────────────── */
  .status-badge {
    display:inline-flex; align-items:center; gap:4px;
    font-size:10px; font-weight:500; padding:3px 8px; border-radius:99px;
    background:#f4f4f5; color:var(--muted);
  }
  .status-badge.uploading { background:var(--pusula-soft); color:var(--pusula) }
  .status-badge.done      { background:#ecfdf5; color:#059669 }
  .status-badge.err       { background:#fef2f2; color:#b91c1c }

  /* ── Footer / Aksiyon ─────────────────── */
  .actions { margin-top:24px; display:flex; justify-content:flex-end; gap:10px }
  .btn { padding:10px 24px; border-radius:5px; border:0; background: var(--pusula); color:#fff; font-size:13px; font-weight:500; cursor:pointer; transition:opacity .15s; display:inline-flex; align-items:center; gap:6px }
  .btn:hover { opacity:.9 }
  .btn:disabled { opacity:.4; cursor:not-allowed }
  .btn-ghost { background:transparent; color:var(--muted); border:1px solid var(--border) }
  .btn-ghost:hover { background:#f4f4f5; opacity:1 }

  .alert { padding: 16px; border-radius:8px; border:1px solid; font-size:13px }
  .alert-err { background:#fef2f2; border-color:#fecaca; color:#991b1b }

  .done-banner {
    margin-top:18px; padding:18px 20px; border-radius:8px;
    background:#ecfdf5; border:1px solid #a7f3d0; color:#065f46;
    display:flex; align-items:center; gap:12px;
  }
  .done-banner .icon { width:36px; height:36px; flex:0 0 36px; border-radius:50%; background:#fff; color:#059669; display:flex; align-items:center; justify-content:center }
  .done-banner h2 { margin:0 0 2px 0; font-size:14px; font-weight:600 }
  .done-banner p { margin:0; font-size:12px; opacity:.85 }

  .push-banner {
    margin-top:18px; padding:18px 20px; border-radius:8px;
    background:#eff6ff; border:1px solid #bfdbfe;
  }
  .spinner {
    width:24px; height:24px; flex:0 0 24px;
    border:3px solid #bfdbfe; border-top-color:#1d4ed8;
    border-radius:50%; animation:spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg) } }

  .push-fail-banner {
    margin-top:18px; padding:18px 20px; border-radius:8px;
    background:#fef2f2; border:1px solid #fecaca; color:#991b1b;
    display:flex; align-items:center; gap:12px;
  }
  .push-fail-banner .icon { width:36px; height:36px; flex:0 0 36px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center }
  .push-fail-banner h2 { margin:0 0 2px 0; font-size:14px; font-weight:600 }
  .push-fail-banner p { margin:0; font-size:12px; opacity:.85 }

  .footer-code { text-align:center; padding:18px 0 0 0; color:var(--muted); font-size:10px; font-family:ui-monospace,SFMono-Regular,monospace }

  .hidden { display:none !important }

  /* ── Tamamlandı tam ekran ─────────────── */
  .success-overlay {
    position:fixed; inset:0; z-index:200;
    background:linear-gradient(135deg, #ecfdf5 0%, #d1fae5 50%, #a7f3d0 100%);
    display:flex; align-items:center; justify-content:center;
    animation:fadeIn .4s ease-out;
  }
  @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
  .success-card {
    background:#fff; border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.15);
    padding:48px 40px; max-width:520px; width:90%; text-align:center;
    animation:popIn .5s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes popIn { from { opacity:0; transform:scale(.9) translateY(20px) } to { opacity:1; transform:scale(1) translateY(0) } }
  .success-icon-wrap {
    width:88px; height:88px; border-radius:50%; background:#ecfdf5;
    margin:0 auto 20px auto; display:flex; align-items:center; justify-content:center;
    color:#059669; animation:popCheck .6s .2s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes popCheck { from { transform:scale(0); opacity:0 } to { transform:scale(1); opacity:1 } }
  .success-icon-wrap svg { width:48px; height:48px }
  .success-card h1 { margin:0 0 8px 0; font-size:24px; font-weight:600; color:#064e3b }
  .success-card .sub { font-size:14px; color:#065f46; margin-bottom:24px; line-height:1.5 }
  .success-stats { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:24px }
  .success-stat {
    background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:14px 12px;
    text-align:center;
  }
  .success-stat .v { font-size:20px; font-weight:600; color:#111827; tabular-nums:true }
  .success-stat .l { font-size:11px; color:#6b7280; margin-top:2px; letter-spacing:.3px; text-transform:uppercase }
  .success-foot { margin-top:20px; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280 }

  @media (max-width:480px) {
    .success-card { padding:32px 24px }
    .success-card h1 { font-size:20px }
    .success-icon-wrap { width:72px; height:72px }
    .success-icon-wrap svg { width:40px; height:40px }
  }

  /* ── SQL DB liste ─────────────────────── */
  .sql-db-list {
    margin-top:12px; border:1px solid var(--border); border-radius:6px;
    background:#fafafa; max-height:280px; overflow-y:auto;
  }
  .sql-db-row {
    display:grid; grid-template-columns:24px 1fr 80px 80px; gap:8px;
    padding:8px 12px; align-items:center; font-size:12px; cursor:pointer;
    border-bottom:1px solid var(--border);
  }
  .sql-db-row:last-child { border-bottom:0 }
  .sql-db-row:hover { background:#f4f4f5 }
  .sql-db-row input[type=checkbox] { cursor:pointer }
  .sql-db-name { font-family:ui-monospace,SFMono-Regular,monospace }
  .sql-db-size { color:var(--muted); text-align:right; tabular-nums:true }
  .sql-db-recovery { color:var(--muted); text-align:right; font-size:10px }

  /* ── Toast ────────────────────────────── */
  .toast-wrap {
    position:fixed; top:80px; left:50%; transform:translateX(-50%);
    display:flex; flex-direction:column; gap:8px; z-index:100;
    pointer-events:none;
  }
  .toast {
    pointer-events:auto;
    padding:10px 16px; border-radius:6px; font-size:12px; font-weight:500;
    background:#1f2937; color:#fff; box-shadow:0 4px 12px rgba(0,0,0,0.15);
    animation: toastIn .2s ease-out;
  }
  .toast.err { background:#b91c1c }
  .toast.info { background:#1e40af }
  @keyframes toastIn { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:translateY(0) } }
</style>
</head>
<body>

<div id="toastWrap" class="toast-wrap"></div>

<!-- Tamamlandı tam ekran overlay -->
<div id="successOverlay" class="success-overlay hidden">
  <div class="success-card">
    <div class="success-icon-wrap">${ICON_CHECK_BIG}</div>
    <h1>Aktarım Tamamlandı</h1>
    <p class="sub" id="successFirma">—</p>
    <div class="success-stats">
      <div class="success-stat">
        <div class="v" id="successDataSize">—</div>
        <div class="l">Veri</div>
      </div>
      <div class="success-stat">
        <div class="v" id="successImgCount">—</div>
        <div class="l">Resim</div>
      </div>
    </div>
    <div class="success-foot">
      Tüm dosyalarınız güvenli şekilde sunucularımıza aktarıldı. Bu pencereyi kapatabilirsiniz.
    </div>
  </div>
</div>

<header class="topbar">
  <div class="topbar-inner">
    <div class="topbar-brand">
      <img src="https://pusulanet.net/img/logo.png" alt="Pusula" onerror="this.style.display='none'">
      <span class="sep"></span>
      <span class="label">Aktarım</span>
    </div>
    <div class="topbar-firma">
      <div class="l">Firma</div>
      <div class="v" id="firmaName">—</div>
    </div>
  </div>
</header>

<div class="page">
  <div id="loading" class="card"><div style="color:var(--muted);font-size:12px">Yükleniyor…</div></div>
  <div id="error" class="alert alert-err hidden"></div>

  <div id="main" class="hidden">

    <div class="intro card">
      <p>Veritabanı (.bak) ve resim klasörlerinizi aşağıdaki alanlardan seçin. Seçim sonrası özet görüntülenir; <strong>"Aktarımı Başlat"</strong> butonuna basana kadar yükleme başlamaz.</p>
      <div style="margin-top:10px; padding:10px 12px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:5px; font-size:12px; color:#1e3a8a; display:flex; align-items:center; gap:10px; flex-wrap:wrap">
        <strong>SQL yedeği için yardımcı uygulama:</strong>
        <span>SQL Server üzerinde manuel .bak almak istemiyorsanız, otomatik yardımcıyı indirip çalıştırın.</span>
        <a href="/helper/${token}" download style="padding:6px 12px; border-radius:5px; background:#1d4ed8; color:#fff; text-decoration:none; font-weight:500; white-space:nowrap">⬇ Helper İndir</a>
      </div>
      <div id="notes" class="note hidden"></div>
    </div>

    <div class="grid">

      <!-- Veri Dosyası -->
      <div class="card">
        <div class="card-hdr">
          <span class="icon">${ICON_DATABASE}</span>
          <div>
            <h2>Veri Dosyası</h2>
            <div class="meta">.bak / .rar / .zip / .mdf / .ldf</div>
          </div>
          <span id="dataBadge" class="status-badge" style="margin-left:auto" hidden>Bekliyor</span>
        </div>

        <label class="drop" id="dataDrop">
          <input type="file" id="dataInput" accept=".bak,.rar,.zip,.ldf,.mdf" multiple>
          <span class="drop-icon">${ICON_UPLOAD}</span>
          <strong>Dosyaları buraya bırakın</strong>
          <span>veya tıklayıp seçin · birden fazla dosya seçebilirsiniz</span>
        </label>

        <div id="dataSummary" class="summary hidden"></div>
        <div id="dataTree" class="tree hidden"></div>
        <button id="dataClear" class="clear-btn hidden" type="button">Dosyaları kaldır</button>

        <div id="dataProgress" class="progress hidden">
          <div class="bar"><div id="dataBar" style="width:0%"></div></div>
          <div class="stat"><span id="dataStat">—</span><span id="dataPct" class="pct">0%</span></div>
        </div>
      </div>

      <!-- SQL'den Otomatik Yedek -->
      <div class="card">
        <div class="card-hdr">
          <span class="icon">${ICON_DATABASE}</span>
          <div>
            <h2>SQL'den Otomatik Yedek</h2>
            <div class="meta">Sunucudaki veritabanlarını seç, yedek otomatik alınır</div>
          </div>
          <span id="sqlBadge" class="status-badge" style="margin-left:auto" hidden>Bekliyor</span>
        </div>

        <div id="sqlInit" style="display:flex; flex-direction:column; gap:8px">
          <div style="display:grid; grid-template-columns:1fr 80px; gap:8px">
            <input id="sqlServer" type="text" placeholder="SQL sunucu adresi (örn. 10.15.2.5)"
              style="height:34px; padding:0 10px; border:1px solid var(--border); border-radius:5px; font-size:12px; outline:none">
            <input id="sqlPort" type="number" placeholder="1433" value="1433"
              style="height:34px; padding:0 10px; border:1px solid var(--border); border-radius:5px; font-size:12px; outline:none; text-align:center">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
            <input id="sqlUser" type="text" placeholder="Kullanıcı (örn. sa)"
              style="height:34px; padding:0 10px; border:1px solid var(--border); border-radius:5px; font-size:12px; outline:none">
            <input id="sqlPass" type="password" placeholder="Şifre"
              style="height:34px; padding:0 10px; border:1px solid var(--border); border-radius:5px; font-size:12px; outline:none">
          </div>
          <button id="sqlListBtn" type="button" class="btn" style="align-self:flex-start; padding:8px 16px">
            <span>Bağlan ve Veritabanlarını Listele</span>
          </button>
          <div style="font-size:11px; color:var(--muted)">
            Şifreniz sadece yedek alma işlemi için kullanılır, kaydedilmez.
          </div>
        </div>

        <div id="sqlList" class="hidden"></div>

        <div id="sqlSummary" class="summary hidden"></div>
        <button id="sqlClear" class="clear-btn hidden" type="button">Seçimi temizle</button>

        <div id="sqlProgress" class="progress hidden">
          <div style="font-size:11px; color:var(--muted); margin-bottom:6px" id="sqlStat">—</div>
          <div class="bar"><div id="sqlBar" style="width:0%"></div></div>
        </div>
      </div>

      <!-- Resim Klasörü -->
      <div class="card">
        <div class="card-hdr">
          <span class="icon">${ICON_FOLDER}</span>
          <div>
            <h2>Resim Klasörü</h2>
            <div class="meta">Alt klasörler dahil yüklenir</div>
          </div>
          <span id="imgBadge" class="status-badge" style="margin-left:auto" hidden>Bekliyor</span>
        </div>

        <label class="drop" id="imgDrop">
          <input type="file" id="imgInput" webkitdirectory multiple accept="image/*">
          <span class="drop-icon">${ICON_UPLOAD}</span>
          <strong>Klasörü buraya sürükleyin</strong>
          <span>veya tıklayıp seçin · sadece resimler kabul edilir</span>
          <span style="display:block; margin-top:6px; font-size:10px; color:#a16207">⚠ Tarayıcı izin sorduğunda "Yükle" seçeneğine basınız</span>
        </label>

        <div id="imgSummary" class="summary hidden"></div>
        <div id="imgTree" class="tree hidden"></div>
        <div id="imgCompressTip" class="compress-tip hidden">
          <span style="color:#9a3412">${ICON_WARN}</span>
          <div>
            <strong>Sıkıştırma önerisi</strong>
            <span id="compressMsg"></span>
          </div>
        </div>
        <button id="imgClear" class="clear-btn hidden" type="button">Klasörü kaldır</button>

        <div id="imgProgress" class="progress hidden">
          <div class="bar"><div id="imgBar" style="width:0%"></div></div>
          <div class="stat"><span id="imgStat">—</span><span id="imgPct" class="pct">0%</span></div>
        </div>
      </div>

    </div>

    <div id="pushBanner" class="push-banner hidden">
      <div style="display:flex; align-items:center; gap:12px">
        <div class="spinner"></div>
        <div style="flex:1">
          <h2 style="margin:0 0 4px 0; font-size:14px; font-weight:600; color:#1e40af">Sunucuya aktarılıyor</h2>
          <p id="pushSubtext" style="margin:0; font-size:12px; color:#1e3a8a">Dosyalarınız hedef sunuculara taşınıyor — bu işlem birkaç dakika sürebilir, sayfayı kapatabilirsiniz.</p>
        </div>
        <div id="pushPctNum" style="font-size:18px; font-weight:600; color:#1e40af; tabular-nums:true">0%</div>
      </div>
      <div class="bar" style="margin-top:12px"><div id="pushBar" style="width:0%"></div></div>
    </div>

    <div id="doneBanner" class="done-banner hidden">
      <span class="icon">${ICON_CHECK}</span>
      <div>
        <h2>Aktarım tamamlandı</h2>
        <p>Dosyalarınız sunuculara aktarıldı. Bu pencereyi kapatabilirsiniz.</p>
      </div>
    </div>

    <div id="pushFailBanner" class="push-fail-banner hidden">
      <span class="icon" style="color:#b91c1c">${ICON_WARN}</span>
      <div>
        <h2>Sunucuya aktarım hatası</h2>
        <p id="pushFailMsg">Yükleme başarılı oldu ancak sunucuya aktarımda bir sorun oluştu. Ekibimiz inceliyor.</p>
      </div>
    </div>

    <div class="actions">
      <button id="startBtn" class="btn" disabled>${ICON_UPLOAD}<span>Aktarımı Başlat</span></button>
    </div>

    <div class="footer-code">Aktarım kodu: ${token}</div>
  </div>
</div>

<script>
const TOKEN = ${JSON.stringify(token)};
const LARGE_THRESHOLD = 500 * 1024;   // 500 KB
const DATA_EXT  = /\\.(bak|rar|zip|ldf|mdf)$/i;
const IMAGE_EXT = /\\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|avif)$/i;
const $ = (id) => document.getElementById(id);

function fmtBytes(b) {
  if (!b) return "0 B";
  if (b >= 1024**3) return (b/1024**3).toFixed(2) + " GB";
  if (b >= 1024**2) return (b/1024**2).toFixed(1) + " MB";
  if (b >= 1024) return (b/1024).toFixed(0) + " KB";
  return b + " B";
}

// ── Info yükle ────────────────────────
let pushPollInterval = null;
let lastInfo         = null;   // En son başarılı info — completed transition'ında kullanılır

async function loadInfo() {
  try {
    const r = await fetch("/api/info/" + TOKEN);
    const d = await r.json();
    if (!r.ok) {
      const map = {
        not_found:"Bu aktarım linki bulunamadı.",
        expired:  "Bu aktarımın süresi geçti.",
        cancelled:"Bu aktarım iptal edilmiş.",
        completed:"Bu aktarım daha önce tamamlandı. Link kullanım dışı.",
      };
      $("error").textContent = map[d.reason] || ("Hata: " + (d.reason || "Bilinmiyor"));
      $("error").classList.remove("hidden");
      $("loading").classList.add("hidden");
      return;
    }
    lastInfo = d;
    $("firmaName").textContent = d.firmaName;
    if (d.notes) { $("notes").textContent = d.notes; $("notes").classList.remove("hidden"); }
    $("loading").classList.add("hidden");
    $("main").classList.remove("hidden");
    applyStatus(d);
  } catch (e) {
    $("error").textContent = "Bağlantı hatası: " + e.message;
    $("error").classList.remove("hidden");
    $("loading").classList.add("hidden");
  }
}

function applyStatus(d) {
  if (d.status === "pushing") {
    showPushBanner(d);
    if (!pushPollInterval) pushPollInterval = setInterval(pollPush, 3000);
  } else if (d.status === "completed") {
    // Backend 410 dönmeden önce (extreme yarış durumu) buraya da gelebilir
    showSuccessOverlay(d);
    stopPushPoll();
  } else if (d.status === "push_failed") {
    $("pushBanner").classList.add("hidden");
    $("pushFailBanner").classList.remove("hidden");
    if (d.pushError) $("pushFailMsg").textContent = "Hata: " + d.pushError;
    $("startBtn").disabled = true;
    // Kart durumu da netleşsin — sadece yükleme tamamlandı ama aktarımda hata var
    if ((d.dataBytesReceived ?? 0) > 0) {
      $("dataBadge").textContent = "Yüklendi"; $("dataBadge").className = "status-badge done";
    }
    if ((d.imageFilesReceived ?? 0) > 0) {
      $("imgBadge").textContent = "Yüklendi"; $("imgBadge").className = "status-badge done";
    }
    stopPushPoll();
  }
}

function showPushBanner(d) {
  $("pushBanner").classList.remove("hidden");
  // Drop alanlarını kalıcı kilitle
  $("dataDrop").style.pointerEvents = "none"; $("dataDrop").style.opacity = ".5";
  $("imgDrop").style.pointerEvents  = "none"; $("imgDrop").style.opacity = ".5";
  $("startBtn").disabled = true;
  const pct = Math.max(0, Math.min(100, d.pushProgress ?? 0));
  $("pushPctNum").textContent = pct + "%";
  $("pushBar").style.width = pct + "%";
  if (d.pushStage === "data")   $("pushSubtext").textContent = "Veri dosyaları SQL sunucusuna aktarılıyor…";
  else if (d.pushStage === "images") $("pushSubtext").textContent = "Resimler depo sunucusuna aktarılıyor…";
}

function stopPushPoll() {
  if (pushPollInterval) { clearInterval(pushPollInterval); pushPollInterval = null; }
}

async function pollPush() {
  try {
    const r = await fetch("/api/info/" + TOKEN);
    const d = await r.json();
    if (r.status === 410 && d.reason === "completed" && lastInfo) {
      // Push tamamlandı, link artık erişilemez → client elinde son veri ile success göster
      showSuccessOverlay(lastInfo);
      stopPushPoll();
      return;
    }
    if (!r.ok) { stopPushPoll(); return; }
    lastInfo = d;
    applyStatus(d);
  } catch {}
}

function showSuccessOverlay(d) {
  $("pushBanner").classList.add("hidden");
  $("startBtn").disabled = true;
  $("successFirma").textContent = d.firmaName + " (" + d.firmaId + ")";
  $("successDataSize").textContent = (d.dataBytesReceived ?? 0) > 0 ? fmtBytes(d.dataBytesReceived) : "—";
  $("successImgCount").textContent = (d.imageFilesReceived ?? 0) > 0
    ? (d.imageFilesReceived.toLocaleString("tr") + " dosya")
    : "—";
  $("successOverlay").classList.remove("hidden");
}

// ── State (yükleme öncesi) ────────────
let selectedDataFiles = [];   // File[]
let dataTotalBytes    = 0;
let selectedImages    = [];   // File[]
let imgTotalBytes     = 0;
let imgLargeCount     = 0;
let imgLargeBytes     = 0;
let uploading         = false;

function setupDrop(zone, input) {
  ["dragenter","dragover"].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("over") }));
  ["dragleave","drop"].forEach(ev => zone.addEventListener(ev, () => zone.classList.remove("over")));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!e.dataTransfer.files.length) return;
    input.files = e.dataTransfer.files;
    input.dispatchEvent(new Event("change"));
  });
}

// ── Veri dosyaları seçimi ─────────────
setupDrop($("dataDrop"), $("dataInput"));
$("dataInput").addEventListener("change", (e) => {
  if (uploading) return;
  const all = Array.from(e.target.files);
  if (all.length === 0) return;
  const valid = all.filter((f) => DATA_EXT.test(f.name));
  const skipped = all.length - valid.length;
  if (skipped > 0) {
    showToast(skipped + " dosya geçersiz uzantı nedeniyle atlandı (yalnız .bak/.rar/.zip/.mdf/.ldf).");
  }
  if (valid.length === 0) {
    $("dataInput").value = "";
    return;
  }
  selectedDataFiles = valid;
  dataTotalBytes = valid.reduce((s, f) => s + f.size, 0);
  renderDataSummary();
  refreshStart();
});

function renderDataSummary() {
  const s = $("dataSummary");
  if (selectedDataFiles.length === 0) {
    s.classList.add("hidden");
    $("dataClear").classList.add("hidden");
    $("dataBadge").hidden = true;
    $("dataTree").classList.add("hidden");
    return;
  }
  let html = '' +
    '<div class="summary-row"><span class="l">Dosya sayısı</span><span class="v">' + selectedDataFiles.length.toLocaleString("tr") + '</span></div>' +
    '<div class="summary-row"><span class="l">Toplam boyut</span><span class="v">' + fmtBytes(dataTotalBytes) + '</span></div>';
  s.innerHTML = html;
  s.classList.remove("hidden");
  $("dataClear").classList.remove("hidden");
  $("dataBadge").hidden = false;
  $("dataBadge").textContent = "Hazır";
  $("dataBadge").className = "status-badge";

  // Dosya listesi
  const tree = $("dataTree");
  if (selectedDataFiles.length > 0) {
    let treeHtml = '<div class="tree-hdr">DOSYALAR</div>';
    for (const f of selectedDataFiles) {
      treeHtml += '<div class="tree-row">' +
        '<span class="tree-path">' + escapeHtml(f.name) + '</span>' +
        '<span class="tree-meta">' + fmtBytes(f.size) + '</span>' +
        '</div>';
    }
    tree.innerHTML = treeHtml;
    tree.classList.remove("hidden");
  } else {
    tree.classList.add("hidden");
  }
}
$("dataClear").addEventListener("click", () => {
  if (uploading) return;
  selectedDataFiles = []; dataTotalBytes = 0;
  $("dataInput").value = "";
  renderDataSummary();
  refreshStart();
});

// ── Resim klasörü seçimi ──────────────
let imgSkippedCount = 0;   // resim olmayan, atlanan dosya sayısı
setupDrop($("imgDrop"), $("imgInput"));
$("imgInput").addEventListener("change", (e) => {
  if (uploading) return;
  const all = Array.from(e.target.files);
  const images = all.filter((f) => IMAGE_EXT.test(f.name));
  imgSkippedCount = all.length - images.length;
  selectedImages = images;
  imgTotalBytes = images.reduce((s,f) => s+f.size, 0);
  imgLargeCount = images.filter((f) => f.size > LARGE_THRESHOLD).length;
  imgLargeBytes = images.filter((f) => f.size > LARGE_THRESHOLD).reduce((s,f) => s+f.size, 0);
  if (images.length === 0 && all.length > 0) {
    showToast("Seçilen klasörde resim dosyası bulunamadı.");
    $("imgInput").value = "";
    return;
  }
  if (imgSkippedCount > 0) {
    showToast(imgSkippedCount.toLocaleString("tr") + " resim olmayan dosya atlandı.", "info");
  }
  renderImgSummary();
  refreshStart();
});

function renderImgSummary() {
  const s = $("imgSummary");
  const tip = $("imgCompressTip");
  if (selectedImages.length === 0) {
    s.classList.add("hidden");
    tip.classList.add("hidden");
    $("imgTree").classList.add("hidden");
    $("imgClear").classList.add("hidden");
    $("imgBadge").hidden = true;
    return;
  }
  // Klasör dağılımı — webkitRelativePath'i dir'e böl
  const dirMap = new Map();
  for (const f of selectedImages) {
    const parts = (f.webkitRelativePath || f.name).split("/");
    const dir = parts.slice(0, -1).join("/") || "(kök)";
    let e = dirMap.get(dir);
    if (!e) { e = { count: 0, bytes: 0 }; dirMap.set(dir, e); }
    e.count++; e.bytes += f.size;
  }
  const dirs = Array.from(dirMap.entries()).sort((a, b) => a[0].localeCompare(b[0], "tr"));

  let html = '' +
    '<div class="summary-row"><span class="l">Resim sayısı</span><span class="v">' + selectedImages.length.toLocaleString("tr") + '</span></div>' +
    '<div class="summary-row"><span class="l">Toplam boyut</span><span class="v">' + fmtBytes(imgTotalBytes) + '</span></div>' +
    '<div class="summary-row"><span class="l">Klasör sayısı</span><span class="v">' + dirs.length.toLocaleString("tr") + '</span></div>';
  if (imgSkippedCount > 0) {
    html += '<div class="summary-row"><span class="l" style="color:#a16207">Atlanan (resim değil)</span><span class="v" style="color:#a16207">' + imgSkippedCount.toLocaleString("tr") + ' dosya</span></div>';
  }
  if (imgLargeCount > 0) {
    html += '<div class="summary-row danger"><span class="l">500 KB üzeri</span><span class="v">' + imgLargeCount.toLocaleString("tr") + ' dosya · ' + fmtBytes(imgLargeBytes) + '</span></div>';
  }
  s.innerHTML = html;

  // Klasör dağılımı listesi — birden fazla klasör varsa göster
  const tree = $("imgTree");
  if (dirs.length > 1) {
    let treeHtml = '<div class="tree-hdr">KLASÖR DAĞILIMI</div>';
    const maxShown = 50;
    const shown = dirs.slice(0, maxShown);
    for (const [dir, e] of shown) {
      treeHtml += '<div class="tree-row">' +
        '<span class="tree-path">' + escapeHtml(dir) + '</span>' +
        '<span class="tree-meta">' + e.count.toLocaleString("tr") + ' dosya · ' + fmtBytes(e.bytes) + '</span>' +
        '</div>';
    }
    if (dirs.length > maxShown) {
      treeHtml += '<div class="tree-row tree-more">… ve ' + (dirs.length - maxShown).toLocaleString("tr") + ' klasör daha</div>';
    }
    tree.innerHTML = treeHtml;
    tree.classList.remove("hidden");
  } else {
    tree.classList.add("hidden");
  }
  s.classList.remove("hidden");
  $("imgClear").classList.remove("hidden");
  $("imgBadge").hidden = false;
  $("imgBadge").textContent = "Hazır";
  $("imgBadge").className = "status-badge";

  if (imgLargeCount > 0) {
    $("compressMsg").textContent = imgLargeCount.toLocaleString("tr") + " adet resim 500 KB'tan büyük (toplam " + fmtBytes(imgLargeBytes) + "). Yükleme öncesi sıkıştırmanızı öneririz — yükleme süresi azalır ve depolama tasarrufu sağlanır.";
    tip.classList.remove("hidden");
  } else {
    tip.classList.add("hidden");
  }
}
$("imgClear").addEventListener("click", () => {
  if (uploading) return;
  selectedImages = []; imgTotalBytes = 0; imgLargeCount = 0; imgLargeBytes = 0;
  $("imgInput").value = "";
  renderImgSummary();
  refreshStart();
});

// ── SQL'den otomatik yedek ─────────────
let sqlDbs = [];
let selectedSqlDbs = new Set();
let sqlListed = false;

function getSqlCreds() {
  return {
    server:   $("sqlServer").value.trim(),
    port:     parseInt($("sqlPort").value, 10) || 1433,
    user:     $("sqlUser").value.trim(),
    password: $("sqlPass").value,
  };
}

$("sqlListBtn").addEventListener("click", async () => {
  const creds = getSqlCreds();
  if (!creds.server || !creds.user || !creds.password) {
    showToast("Sunucu adresi, kullanıcı adı ve şifre zorunlu");
    return;
  }
  $("sqlListBtn").disabled = true;
  const orig = $("sqlListBtn").innerHTML;
  $("sqlListBtn").textContent = "Bağlanılıyor...";
  try {
    const r = await fetch("/api/sql/databases/" + TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    const d = await r.json();
    if (!r.ok) {
      showToast(d.error || "DB listesi alınamadı");
      $("sqlListBtn").disabled = false;
      $("sqlListBtn").innerHTML = orig;
      return;
    }
    sqlDbs = d.databases || [];
    sqlListed = true;
    renderSqlList();
  } catch (err) {
    showToast("Hata: " + err.message);
    $("sqlListBtn").disabled = false;
    $("sqlListBtn").innerHTML = orig;
  }
});

function renderSqlList() {
  const wrap = $("sqlList");
  wrap.classList.remove("hidden");
  $("sqlInit").classList.add("hidden");

  if (sqlDbs.length === 0) {
    wrap.innerHTML = '<div style="padding:14px; color:#a16207; font-size:12px">Bu sunucuda kullanıcı veritabanı bulunamadı.</div>';
    return;
  }

  let html = '<div class="sql-db-list">';
  for (const d of sqlDbs) {
    const checked = selectedSqlDbs.has(d.name) ? "checked" : "";
    const sizeMB = d.sizeMB > 1024 ? (d.sizeMB / 1024).toFixed(1) + " GB" : d.sizeMB.toFixed(0) + " MB";
    html += '<label class="sql-db-row">' +
      '<input type="checkbox" data-db="' + escapeHtml(d.name) + '" ' + checked + '>' +
      '<span class="sql-db-name">' + escapeHtml(d.name) + '</span>' +
      '<span class="sql-db-size">' + sizeMB + '</span>' +
      '<span class="sql-db-recovery">' + (d.recoveryModel || "") + '</span>' +
      '</label>';
  }
  html += '</div>';
  wrap.innerHTML = html;

  wrap.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const name = e.target.dataset.db;
      if (e.target.checked) selectedSqlDbs.add(name);
      else selectedSqlDbs.delete(name);
      renderSqlSummary();
      refreshStart();
    });
  });
  renderSqlSummary();
}

function renderSqlSummary() {
  const s = $("sqlSummary");
  if (selectedSqlDbs.size === 0) {
    s.classList.add("hidden");
    $("sqlClear").classList.add("hidden");
    $("sqlBadge").hidden = true;
    return;
  }
  let total = 0;
  for (const d of sqlDbs) if (selectedSqlDbs.has(d.name)) total += d.sizeMB;
  const totalDisp = total > 1024 ? (total/1024).toFixed(1) + " GB" : total.toFixed(0) + " MB";
  s.innerHTML =
    '<div class="summary-row"><span class="l">Seçili veritabanı</span><span class="v">' + selectedSqlDbs.size + '</span></div>' +
    '<div class="summary-row"><span class="l">Tahmini boyut</span><span class="v">' + totalDisp + '</span></div>';
  s.classList.remove("hidden");
  $("sqlClear").classList.remove("hidden");
  $("sqlBadge").hidden = false;
  $("sqlBadge").textContent = "Hazır";
  $("sqlBadge").className = "status-badge";
}

$("sqlClear").addEventListener("click", () => {
  if (uploading) return;
  selectedSqlDbs.clear();
  renderSqlList();
  refreshStart();
});

function refreshStart() {
  $("startBtn").disabled = uploading || (
    selectedDataFiles.length === 0 &&
    selectedImages.length === 0 &&
    selectedSqlDbs.size === 0
  );
}

// ── Aktarımı başlat ───────────────────
$("startBtn").addEventListener("click", startUpload);

async function startUpload() {
  if (uploading) return;
  uploading = true;
  $("startBtn").disabled = true;
  $("dataClear").classList.add("hidden");
  $("imgClear").classList.add("hidden");
  $("sqlClear").classList.add("hidden");

  // Drop alanlarını kapat
  $("dataDrop").style.pointerEvents = "none";
  $("imgDrop").style.pointerEvents = "none";
  $("dataDrop").style.opacity = ".5";
  $("imgDrop").style.opacity = ".5";

  try {
    if (selectedDataFiles.length > 0) await uploadData();
    if (selectedImages.length > 0) await uploadImages();
    if (selectedSqlDbs.size > 0) await runSqlBackup();
    await fetch("/api/upload/" + TOKEN + "/complete", { method:"POST" });
    // Push job arkaplanda başladı — polling pollPush ile yönetilir
    showPushBanner({ pushProgress: 0, pushStage: "starting" });
    pushPollInterval = setInterval(pollPush, 3000);
  } catch (err) {
    showToast("Yükleme sırasında hata: " + err.message);
    uploading = false;
    refreshStart();
  }
}

async function uploadData() {
  const files = selectedDataFiles;
  const total = dataTotalBytes;
  const badge = $("dataBadge");
  badge.textContent = "Yükleniyor"; badge.className = "status-badge uploading";
  $("dataProgress").classList.remove("hidden");

  await reportData(total, 0);

  let completedBytes = 0;
  let uploadedCount = 0;
  let failed = 0;
  let lastReport = 0;   // throttled live-progress report

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const fd = new FormData(); fd.append("file", f);
    try {
      await xhrUpload("/api/upload/" + TOKEN + "/data", fd, (pct, loaded) => {
        const cur = completedBytes + (loaded || 0);
        const totalPct = total > 0 ? Math.round((cur / total) * 100) : 0;
        $("dataBar").style.width = totalPct + "%";
        $("dataPct").textContent = totalPct + "%";
        $("dataStat").textContent = (uploadedCount + 1) + " / " + files.length + " · " + f.name + " · " + fmtBytes(cur) + " / " + fmtBytes(total);
        // Hub'ın canlı progress için her ~2 sn'de bir raporla
        const now = Date.now();
        if (now - lastReport > 2000) {
          lastReport = now;
          reportData(total, cur);
        }
      });
      completedBytes += f.size;
      uploadedCount++;
      reportData(total, completedBytes);
    } catch (err) {
      failed++;
      console.error("data upload failed", f.name, err);
    }
  }

  $("dataBar").style.width = "100%";
  $("dataPct").textContent = "100%";
  $("dataStat").textContent = uploadedCount + " / " + files.length + " dosya · " + fmtBytes(completedBytes) + " / " + fmtBytes(total);

  if (failed > 0) {
    badge.textContent = "Hata"; badge.className = "status-badge err";
    throw new Error(failed + " dosya yüklenemedi");
  }
  badge.textContent = "Yüklendi"; badge.className = "status-badge done";
}

async function runSqlBackup() {
  const dbs = Array.from(selectedSqlDbs);
  const badge = $("sqlBadge");
  badge.textContent = "Yedek alınıyor..."; badge.className = "status-badge uploading";
  $("sqlProgress").classList.remove("hidden");
  $("sqlStat").textContent = dbs.length + " DB sunucuda yedekleniyor... bu işlem boyuta göre dakikalar sürebilir";
  $("sqlBar").style.width = "40%";

  const r = await fetch("/api/sql/backup/" + TOKEN, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ databases: dbs, ...getSqlCreds() }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error("SQL yedek başlatılamadı: " + (d.error || r.statusText));
  }
  // Server async iş başlattı — info polling ile takip ederiz
  // Status 'active'ten 'push_failed'a düşerse hata, 'completed'e geçerse OK
  $("sqlBar").style.width = "100%";
  $("sqlStat").textContent = "Sunucu işliyor — push aşamasında progress gösterilir";
  badge.textContent = "Yüklendi"; badge.className = "status-badge done";
}

async function reportData(totalBytes, uploadedBytes) {
  try {
    await fetch("/api/upload/" + TOKEN + "/data-progress", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ totalBytes, uploadedBytes }),
    });
  } catch {}
}

async function uploadImages() {
  const files = selectedImages;
  const total = imgTotalBytes;
  const badge = $("imgBadge");
  badge.textContent = "Yükleniyor"; badge.className = "status-badge uploading";
  $("imgProgress").classList.remove("hidden");

  await reportImgs(files.length, total, 0, 0);

  let uploaded = 0, uploadedBytes = 0;
  let lastReport = Date.now();
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name;
    const fd = new FormData(); fd.append("relPath", rel); fd.append("file", f);
    try { await xhrUpload("/api/upload/" + TOKEN + "/image", fd, () => {}); uploaded++; uploadedBytes += f.size }
    catch (err) { console.error("img upload failed", rel, err) }
    const pct = total > 0 ? Math.round((uploadedBytes / total) * 100) : 0;
    $("imgBar").style.width = pct + "%";
    $("imgPct").textContent = pct + "%";
    $("imgStat").textContent = uploaded + " / " + files.length + " dosya · " + fmtBytes(uploadedBytes) + " / " + fmtBytes(total);
    const now = Date.now();
    if (now - lastReport > 2000 || uploaded === files.length) {
      lastReport = now;
      reportImgs(files.length, total, uploaded, uploadedBytes);
    }
  }
  badge.textContent = "Yüklendi"; badge.className = "status-badge done";
}

async function reportImgs(totalFiles, totalBytes, uploadedFiles, uploadedBytes) {
  try {
    await fetch("/api/upload/" + TOKEN + "/images-done", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ totalFiles, totalBytes, uploadedFiles, uploadedBytes }),
    });
  } catch {}
}

function xhrUpload(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100), e.loaded);
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
      else reject(new Error("HTTP " + xhr.status + ": " + xhr.responseText));
    });
    xhr.addEventListener("error", () => reject(new Error("Bağlantı hatası")));
    xhr.open("POST", url);
    xhr.send(formData);
  });
}

function showToast(msg, type) {
  const t = document.createElement("div");
  t.className = "toast" + (type === "info" ? " info" : " err");
  t.textContent = msg;
  $("toastWrap").appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

loadInfo();
</script>
</body>
</html>`
}

// ─────────────────────────────────────────────────
// PUSH JOB — Staging'den hedef sunuculara SMB
// ─────────────────────────────────────────────────

function execCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts })
    let stdout = "", stderr = ""
    p.stdout.on("data", (d) => stdout += d.toString())
    p.stderr.on("data", (d) => stderr += d.toString())
    p.on("error", reject)
    p.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`Exit ${code}: ${stderr || stdout || cmd}`))
    })
  })
}

/** Bir klasördeki tüm dosyaları cifs mount edilmiş hedefe kopyalar.
 *  Recursive cp; klasör ağacı korunur. */
async function copyTreeRecursive(srcDir, dstDir) {
  await mkdir(dstDir, { recursive: true })
  await execCmd("cp", ["-r", srcDir + "/.", dstDir])
}

async function withCifsMount(ip, share, username, password, fn) {
  const mountPoint = `/tmp/pusula-aktarim-mnt-${randomBytes(6).toString("hex")}`
  await mkdir(mountPoint, { recursive: true })
  // mount.cifs çağrısı — credential komut satırından geçer (kısa süreli, log'a düşmez)
  const opts = `username=${username},password=${password},vers=3.0,uid=0,gid=0,file_mode=0664,dir_mode=0775`
  try {
    await execCmd("mount", ["-t", "cifs", `//${ip}/${share}`, mountPoint, "-o", opts])
  } catch (err) {
    // SMB 3.0 hata verirse 2.1/2.0 dene
    try {
      const fallback = opts.replace("vers=3.0", "vers=2.1")
      await execCmd("mount", ["-t", "cifs", `//${ip}/${share}`, mountPoint, "-o", fallback])
    } catch (err2) {
      throw new Error(`SMB mount hatası: ${err2.message}`)
    }
  }
  try {
    return await fn(mountPoint)
  } finally {
    try { await execCmd("umount", [mountPoint]) } catch { /* ignore */ }
    try { await rm(mountPoint, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

async function startPushJob(token) {
  const sess = stmts.byToken.get(token)
  if (!sess) throw new Error("Session bulunamadı")

  const stagingData   = join(STAGING_ROOT, token, "data")
  const stagingImages = join(STAGING_ROOT, token, "images")

  // ── 1) Veri dosyaları → SQL sunucusu D$\SQLData\{firmaId}\aktarim ──
  const hasData = await safeReadDir(stagingData)
  if (hasData.length > 0) {
    if (!sess.sqlServerIp || !sess.sqlUsername || !sess.sqlPassword) {
      throw new Error("SQL sunucusu credential'ları eksik")
    }
    stmts.updatePush.run({ token, progress: 5, stage: "data", error: null, status: "pushing" })
    await withCifsMount(sess.sqlServerIp, "D$", sess.sqlUsername, sess.sqlPassword, async (mnt) => {
      const dst = join(mnt, "SQLData", sess.companyId, "aktarim")
      await mkdir(dst, { recursive: true })
      await execCmd("cp", ["-r", stagingData + "/.", dst])
    })
    stmts.updatePush.run({ token, progress: 50, stage: "data", error: null, status: "pushing" })
  }

  // ── 2) Resimler → Depo sunucusu \\depo\Resimler\{firmaId}\... ──
  const hasImg = await safeReadDir(stagingImages)
  if (hasImg.length > 0) {
    if (!sess.depoServerIp || !sess.depoUsername || !sess.depoPassword) {
      throw new Error("Depo sunucusu credential'ları eksik")
    }
    stmts.updatePush.run({ token, progress: 55, stage: "images", error: null, status: "pushing" })
    await withCifsMount(sess.depoServerIp, "Resimler", sess.depoUsername, sess.depoPassword, async (mnt) => {
      const dst = join(mnt, sess.companyId)
      await mkdir(dst, { recursive: true })
      // Müşterinin webkitRelativePath ile yüklediği klasör ağacı korunur
      await execCmd("cp", ["-r", stagingImages + "/.", dst])
    })
    stmts.updatePush.run({ token, progress: 95, stage: "images", error: null, status: "pushing" })
  }

  // ── 3) Bitir ──
  stmts.updatePush.run({ token, progress: 100, stage: null, error: null, status: "completed" })

  // ── 4) Staging temizliği — başarılı push sonrası dosyalar artık hedef sunucuda ──
  try {
    await rm(join(STAGING_ROOT, token), { recursive: true, force: true })
  } catch (err) {
    fastify.log.warn({ err, token }, "staging temizleme hatası (push yine de başarılı)")
  }
}

async function safeReadDir(p) {
  try { return await readdir(p) } catch { return [] }
}

// info endpoint'ine push alanlarını ekle (zaten Object.spread değil — manuel sürdür)
// Aşağıdaki override, müşterinin push progress'ini görebilmesini sağlar.

try {
  await fastify.listen({ port: PORT, host: HOST })
  fastify.log.info({ port: PORT, db: DB_PATH, staging: STAGING_ROOT }, "Pusula Aktarım v2 (SQLite) ayakta")
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
