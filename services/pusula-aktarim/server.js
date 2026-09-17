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
 *     POST   /api/upload/:token/program    — program dosyası (.exe/.txt) yükle
 *     POST   /api/upload/:token/program-progress — program sayacı
 *     POST   /api/upload/:token/images-done — toplu sayaç
 *     POST   /api/upload/:token/complete   — tamamlandı
 */

import Fastify from "fastify"
import multipart from "@fastify/multipart"
import Database from "better-sqlite3"
import { fileURLToPath } from "url"
import { dirname, join, normalize } from "path"
import { mkdir, stat, readdir, rm, readFile, writeFile } from "fs/promises"
import { createWriteStream } from "fs"
import { pipeline } from "stream/promises"
import { randomBytes } from "crypto"
import { spawn } from "child_process"

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
// Program dosyaları (.exe) → firmanın terminal sunucusu C$\MUSTERI\{firmaId}\Aktarim
ensureColumn("rdpServerName",        "TEXT")
ensureColumn("rdpServerIp",          "TEXT")
ensureColumn("rdpUsername",          "TEXT")
ensureColumn("rdpPassword",          "TEXT")
ensureColumn("programFilesTotal",    "INTEGER NOT NULL DEFAULT 0")
ensureColumn("programFilesReceived", "INTEGER NOT NULL DEFAULT 0")
ensureColumn("programBytesTotal",    "INTEGER NOT NULL DEFAULT 0")
ensureColumn("programBytesReceived", "INTEGER NOT NULL DEFAULT 0")
// Hub kataloğundaki pusula-program hizmetleri: [{ name, exeName, paramFileName }]
ensureColumn("programOptions",       "TEXT")
// Müşteri tarayıcısında yüklenemeyen dosyalar (son bildirim, JSON) — destek için
ensureColumn("clientError",          "TEXT")

function programOptionsOf(sess) {
  try {
    const arr = JSON.parse(sess.programOptions || "[]")
    return Array.isArray(arr) ? arr.filter((o) => o && typeof o.name === "string" && o.name.trim()) : []
  } catch { return [] }
}
function programEnabledOf(sess) {
  return !!(sess.rdpServerIp && sess.rdpUsername && sess.rdpPassword) && programOptionsOf(sess).length > 0
}

function newId()    { return randomBytes(8).toString("hex") }
function newToken() { return randomBytes(18).toString("base64url") }

const stmts = {
  insert: db.prepare(`
    INSERT INTO sessions (id, token, companyId, firmaName, sqlServerName, depoServerName,
                          sqlServerIp, sqlUsername, sqlPassword,
                          depoServerIp, depoUsername, depoPassword,
                          rdpServerName, rdpServerIp, rdpUsername, rdpPassword, programOptions,
                          status, createdBy, expiresAt, notes)
    VALUES (@id, @token, @companyId, @firmaName, @sqlServerName, @depoServerName,
            @sqlServerIp, @sqlUsername, @sqlPassword,
            @depoServerIp, @depoUsername, @depoPassword,
            @rdpServerName, @rdpServerIp, @rdpUsername, @rdpPassword, @programOptions,
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
        programFilesTotal    = COALESCE(@programFilesTotal,    programFilesTotal),
        programFilesReceived = COALESCE(@programFilesReceived, programFilesReceived),
        programBytesTotal    = COALESCE(@programBytesTotal,    programBytesTotal),
        programBytesReceived = COALESCE(@programBytesReceived, programBytesReceived),
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
    sqlServerIp:    body.sqlServerIp   ?? null,
    sqlUsername:    body.sqlUsername   ?? null,
    sqlPassword:    body.sqlPassword   ?? null,
    depoServerIp:   body.depoServerIp  ?? null,
    depoUsername:   body.depoUsername   ?? null,
    depoPassword:   body.depoPassword   ?? null,
    rdpServerName:  body.rdpServerName  ?? null,
    rdpServerIp:    body.rdpServerIp    ?? null,
    rdpUsername:    body.rdpUsername    ?? null,
    rdpPassword:    body.rdpPassword    ?? null,
    programOptions: Array.isArray(body.programOptions) ? JSON.stringify(body.programOptions) : null,
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

/**
 * Yarıda kalan push'u yeniden başlatır. Staging duruyorsa dosyalar tekrar
 * yüklenmeden hedefe gönderilir; rsync kopyalanmış dosyaları atlar.
 * Yalnız push_failed durumundaki oturumlar için.
 */
fastify.post("/admin/sessions/:id/retry-push", async (req, reply) => {
  if (!checkAdmin(req, reply)) return
  const sess = stmts.byId.get(req.params.id)
  if (!sess) return reply.code(404).send({ error: "not_found" })
  if (sess.status !== "push_failed") {
    return reply.code(409).send({ error: `Yalnız başarısız aktarımlar tekrar denenebilir (durum: ${sess.status})` })
  }

  const stagingDir = join(STAGING_ROOT, sess.token)
  try { await stat(stagingDir) }
  catch { return reply.code(409).send({ error: "Staging klasörü yok — dosyalar silinmiş, müşterinin yeniden yüklemesi gerekiyor" }) }

  stmts.updatePush.run({ token: sess.token, progress: 0, stage: "starting", error: null, status: "pushing" })
  startPushJob(sess.token).catch((err) => {
    fastify.log.error({ err, token: sess.token }, "retry push job crashed")
    stmts.updatePush.run({
      token: sess.token, progress: 0, stage: null, error: String(err?.message ?? err), status: "push_failed",
    })
  })
  return reply.send({ ok: true })
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
    programFilesTotal:    s.programFilesTotal,
    programFilesReceived: s.programFilesReceived,
    programBytesTotal:    s.programBytesTotal,
    programBytesReceived: s.programBytesReceived,
    // Program alanı yalnız firmanın terminal sunucusu biliniyorsa açılır
    programEnabled:       programEnabledOf(s),
    programOptions:       programOptionsOf(s).map((o) => ({ name: o.name, exeName: o.exeName ?? null, paramFileName: o.paramFileName ?? null })),
    pushProgress:        s.pushProgress ?? 0,
    pushStage:           s.pushStage,
    pushError:           s.pushError,
    notes:               s.notes,
  }
})

const ALLOWED_DATA_EXT  = /\.(bak|rar|zip|ldf|mdf)$/i
const ALLOWED_IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|avif)$/i
const PROGRAM_KIND_EXT = { exe: /\.exe$/i, param: /\.txt$/i, extra: /^.+$/ }   // extra: ek dosyalar, tüm türler
const PROGRAM_NULL = { programFilesTotal: null, programFilesReceived: null, programBytesTotal: null, programBytesReceived: null }

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

fastify.post("/api/upload/:token/program", async (req, reply) => {
  const v = getActiveSession(req.params.token)
  if (v.error) return reply.code(410).send({ error: v.error })
  if (!programEnabledOf(v.session)) {
    return reply.code(409).send({ error: "Bu aktarım için program dosyası yükleme kapalı" })
  }

  const data = await req.file()
  if (!data) return reply.code(400).send({ error: "Dosya yok" })
  const drain = () => data.toBuffer().catch(() => {})

  // Hangi programa ait (Perakende, Toptan…) — yalnız Hub kataloğundaki adlar
  const program = String(data.fields.program?.value ?? "")
  const kind    = String(data.fields.kind?.value ?? "")
  if (!programOptionsOf(v.session).some((o) => o.name === program)) {
    await drain()
    return reply.code(400).send({ error: "Geçersiz program" })
  }
  if (!PROGRAM_KIND_EXT[kind]) {
    await drain()
    return reply.code(400).send({ error: "Geçersiz dosya türü" })
  }
  if (!PROGRAM_KIND_EXT[kind].test(data.filename || "")) {
    await drain()
    return reply.code(400).send({ error: kind === "exe" ? "Program dosyası .exe olmalı" : "Parametre dosyası .txt olmalı" })
  }

  const filename = sanitizeFilename(data.filename || (kind === "exe" ? "program.exe" : kind === "param" ? "parametre.txt" : "dosya"))
  // Klasör adı katalogdan geldiği için güvenli (Hub kontrolünde, / ve .. içermez)
  const targetDir = join(STAGING_ROOT, req.params.token, "program", program.replace(/[\\/]/g, "_"))
  await mkdir(targetDir, { recursive: true })
  const targetPath = join(targetDir, filename)
  await pipeline(data.file, createWriteStream(targetPath))
  const st = await stat(targetPath)
  if (kind === "param") {
    // Push'ta DATA KODU / OPEN OFFICE yazılacak dosyayı işaretle
    const kayit = join(STAGING_ROOT, req.params.token, "program-param.json")
    let m = {}
    try { m = JSON.parse(await readFile(kayit, "utf8")) } catch { m = {} }
    m[program] = filename
    await writeFile(kayit, JSON.stringify(m))
  }
  stmts.setStatus.run("active", "active", req.params.token)
  return reply.send({ ok: true, program, kind, filename, size: st.size })
})

fastify.post("/api/upload/:token/program-progress", async (req, reply) => {
  const v = getActiveSession(req.params.token)
  if (v.error) return reply.code(410).send({ error: v.error })
  const b = req.body ?? {}
  stmts.updateProgress.run({
    token: req.params.token,
    status: "active",
    dataBytesTotal: null, dataBytesReceived: null,
    imageFilesTotal: null, imageFilesReceived: null,
    imageBytesTotal: null, imageBytesReceived: null,
    programFilesTotal:    b.totalFiles    ?? null,
    programFilesReceived: b.uploadedFiles ?? null,
    programBytesTotal:    b.totalBytes    ?? null,
    programBytesReceived: b.uploadedBytes ?? null,
  })
  return reply.send({ ok: true })
})

/** Sunucuda duran (yüklenmiş) dosyalar — tarayıcı aynı ad + boyuttakileri atlar,
 *  yarıda kalan aktarımda yalnız eksikler gönderilir. */
async function listeleDosyalar(kok, alt = "") {
  const out = []
  let girdiler = []
  try { girdiler = await readdir(join(kok, alt), { withFileTypes: true }) } catch { return out }
  for (const g of girdiler) {
    const rel = alt ? alt + "/" + g.name : g.name
    if (g.isDirectory()) out.push(...await listeleDosyalar(kok, rel))
    else if (g.isFile()) {
      try { out.push({ path: rel, size: (await stat(join(kok, rel))).size }) } catch { /* yarışta silinmiş */ }
    }
  }
  return out
}

fastify.get("/api/upload/:token/staged", async (req, reply) => {
  const v = getActiveSession(req.params.token)
  if (v.error) return reply.code(410).send({ error: v.error })
  const kok = join(STAGING_ROOT, req.params.token)
  return {
    data:    await listeleDosyalar(join(kok, "data")),
    images:  await listeleDosyalar(join(kok, "images")),
    program: await listeleDosyalar(join(kok, "program")),
  }
})

/** Tarayıcıda yüklenemeyen dosyaları kaydeder (müşteri yalnız "Hata" görse de
 *  hangi dosyanın neden kaldığı sunucu logunda ve clientError kolonunda durur). */
fastify.post("/api/upload/:token/client-error", async (req, reply) => {
  const sess = stmts.byToken.get(req.params.token)
  if (!sess) return reply.code(404).send({ error: "not_found" })
  const b = req.body ?? {}
  const items = Array.isArray(b.items) ? b.items.slice(0, 200).map((x) => ({
    area: String(x?.area ?? "").slice(0, 20),
    name: String(x?.name ?? "").slice(0, 300),
    size: Number(x?.size) || 0,
    reason: String(x?.reason ?? "").slice(0, 300),
  })) : []
  const kayit = { at: new Date().toISOString(), userAgent: String(req.headers["user-agent"] ?? "").slice(0, 200), items }
  db.prepare("UPDATE sessions SET clientError = ? WHERE token = ?").run(JSON.stringify(kayit), req.params.token)
  fastify.log.warn({ token: req.params.token, firma: sess.companyId, items }, "musteri tarayicisinda yuklenemeyen dosyalar")
  return reply.send({ ok: true })
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
    ...PROGRAM_NULL,
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
    ...PROGRAM_NULL,
  })
  return reply.send({ ok: true })
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
  if (cleaned.length > 500) return null
  // Yol atlamasi yalniz TAM bir ".." parcasidir. Dosya adinin icinde gecen
  // art arda noktalar mesru: "M-BLK-109...jpg" gibi adlar gercek veride var.
  if (cleaned.split("/").some((p) => p === "." || p === "..")) return null
  const n = normalize(cleaned)
  // normalize sonrasi da disari cikmamali (mutlak yol / surucu harfi / ".." ile baslama)
  if (n.startsWith("/") || n.startsWith("..") || /^[a-zA-Z]:/.test(n)) return null
  return n
}

const ICON_DATABASE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>`
const ICON_FOLDER   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/></svg>`
const ICON_UPLOAD   = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`
const ICON_CHECK    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
const ICON_CHECK_BIG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
const ICON_X        = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
const ICON_MESSAGE  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
const ICON_APP      = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M7 6.5h.01"/><path d="M10 6.5h.01"/></svg>`
const ICON_WARN     = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`

function renderHtml(token) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pusula Aktarım</title>
<style>
  /* Hub / PusulaCRM tasarım dili — token'lar globals.css ile aynı */
  *, *::before, *::after { box-sizing: border-box }
  :root {
    --page-bg: #F7F7F8;
    --section-bg: #F0F0F0;
    --card: #FFFFFF;
    --card-shadow: 0 1px 2px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.04);
    --border: #E4E4E7;
    --text: #171717;
    --muted: #71717A;
    --primary: #171717;
    --primary-fg: #FFFFFF;
    --primary-10: rgba(23,23,23,.08);
    --primary-20: rgba(23,23,23,.16);
    --ok: #047857;   --ok-bg: rgba(16,185,129,.15);
    --warn: #B45309; --warn-bg: rgba(245,158,11,.15);
    --err: #B91C1C;  --err-bg: rgba(239,68,68,.15);
    --info: #1D4ED8; --info-bg: rgba(59,130,246,.15);
    --mono: ui-monospace, SFMono-Regular, "Cascadia Code", Menlo, monospace;
  }
  :root { color-scheme: light }
  body {
    margin: 0; min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 14px; background: var(--page-bg); color: var(--text);
    -webkit-font-smoothing: antialiased;
  }
  .hidden { display:none !important }

  /* ── Üst çubuk ───────────────────────── */
  header.topbar { background:var(--card); border-bottom:1px solid var(--border); position:sticky; top:0; z-index:10 }
  .topbar-inner { max-width:1360px; margin:0 auto; padding:0 24px; height:56px; display:flex; align-items:center; justify-content:space-between; gap:16px }
  .topbar-brand { display:flex; align-items:center; gap:12px }
  .topbar-brand img { height:52px; width:auto; display:block }
  .topbar-brand .sep { width:1px; height:18px; background:var(--border) }
  .topbar-brand .label { font-size:14px; font-weight:600; color:var(--text); letter-spacing:-.005em }
  .topbar-firma { display:flex; align-items:center; gap:10px; min-width:0 }
  .topbar-firma .kod { font-family:var(--mono); font-size:12px; font-weight:500; color:var(--muted); background:var(--section-bg); padding:2px 7px; border-radius:5px; white-space:nowrap }
  .topbar-firma .v { font-size:14px; font-weight:600; max-width:360px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  .topbar-firma .dot { width:1px; height:18px; background:var(--border) }
  .hdr-status { display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:500; padding:2px 8px; border-radius:5px; background:var(--primary-10); color:var(--muted); white-space:nowrap }
  .hdr-status::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor }
  .hdr-status.pending   { background:var(--warn-bg); color:var(--warn) }
  .hdr-status.active    { background:var(--info-bg); color:var(--info) }
  .hdr-status.pushing   { background:var(--info-bg); color:var(--info) }
  .hdr-status.push_failed { background:var(--err-bg); color:var(--err) }
  .hdr-status.completed { background:var(--ok-bg); color:var(--ok) }
  @media (max-width:640px) { .topbar-brand .sep, .topbar-brand .label, .topbar-firma .dot { display:none } .topbar-firma .v { max-width:160px } }

  .page { max-width:1360px; margin:0 auto; padding:28px 24px 48px }

  /* ── Sayfa başlığı ───────────────────── */
  .page-head { margin-bottom:16px }
  .page-head h1 { margin:0; font-size:20px; font-weight:600; letter-spacing:-.01em }
  .page-head p { margin:6px 0 0; font-size:13px; line-height:1.55; color:var(--muted); max-width:720px }
  /* ── Müşteriye mesaj ───────────────── */
  .message { margin-bottom:12px; background:var(--section-bg); border-radius:8px; padding:8px }
  .message-card { background:var(--card); border-radius:5px; box-shadow:var(--card-shadow); padding:16px 18px; display:flex; gap:14px; align-items:flex-start }
  .message-icon { flex:0 0 36px; width:36px; height:36px; border-radius:5px; background:var(--primary-10); color:var(--primary); box-shadow:inset 0 0 0 1px var(--primary-20); display:flex; align-items:center; justify-content:center }
  .message-icon svg { width:18px; height:18px }
  .message-label { font-size:10px; font-weight:500; color:var(--muted); letter-spacing:.06em; text-transform:uppercase }
  .message-text { margin-top:4px; font-size:15px; line-height:1.55; color:var(--text); white-space:pre-wrap; word-break:break-word }

  /* ── Bölüm paneli + kartlar ──────────── */
  .section { background:var(--section-bg); border-radius:8px; padding:8px }
  .card { background:var(--card); border-radius:5px; box-shadow:var(--card-shadow); padding:18px }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:8px }
  .grid.three { grid-template-columns:repeat(3, 1fr) }

  /* ── Program satırları ──────────────── */
  .prog-rows { display:flex; flex-direction:column; gap:8px }
  .prog-row { border:1px solid var(--border); border-radius:5px; padding:10px; background:var(--page-bg) }
  .prog-row-hdr { display:flex; gap:6px; align-items:center; margin-bottom:8px }
  .dd { position:relative; flex:1; min-width:0 }
  .dd-trigger { width:100%; height:32px; padding:0 8px 0 10px; border:1px solid var(--border); border-radius:5px; background:var(--card); color:var(--text); font-size:13px; font-family:inherit; display:flex; align-items:center; gap:8px; cursor:pointer; text-align:left }
  .dd-trigger:hover { border-color:var(--muted) }
  .dd.open .dd-trigger { border-color:var(--primary); box-shadow:0 0 0 3px var(--primary-10) }
  .dd-trigger:disabled { cursor:not-allowed; opacity:.55 }
  .dd-val { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  .dd-val.ph { color:var(--muted) }
  .dd-chev { color:var(--muted); flex:0 0 auto; transition:transform .15s }
  .dd.open .dd-chev { transform:rotate(180deg) }
  .dd-menu { position:absolute; left:0; width:100%; top:calc(100% + 4px); z-index:50; background:var(--card); border:1px solid var(--border); border-radius:5px; box-shadow:0 8px 24px rgba(0,0,0,.12); padding:4px; max-height:240px; overflow-y:auto }
  .dd-item { width:100%; display:flex; align-items:center; gap:8px; padding:6px 8px; border:0; border-radius:4px; background:transparent; color:var(--text); font-size:13px; font-family:inherit; cursor:pointer; text-align:left }
  .dd-item:hover { background:var(--primary-10) }
  .dd-item .t { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  .dd-item .h { color:var(--muted); font-size:11px; font-family:var(--mono); white-space:nowrap }
  .dd-item .c { width:14px; flex:0 0 14px; color:var(--primary); display:flex }
  .dd-item:disabled { opacity:.4; cursor:not-allowed; background:transparent }
  .prog-del { width:32px; height:32px; flex:0 0 32px; border:1px solid var(--border); border-radius:5px; background:var(--card); color:var(--muted); cursor:pointer; display:flex; align-items:center; justify-content:center }
  .prog-del:hover { color:var(--err); border-color:var(--err) }
  .prog-file { display:flex; align-items:center; gap:10px; padding:7px 10px; border:1px dashed var(--border); border-radius:5px; background:var(--card); cursor:pointer; font-size:12px; min-width:0 }
  .prog-file + .prog-file { margin-top:6px }
  .prog-file:hover { border-color:var(--primary) }
  .prog-file.set { border-style:solid }
  .prog-file input { display:none }
  .prog-file .k { flex:0 0 84px; white-space:nowrap; font-size:10px; font-weight:500; color:var(--muted); letter-spacing:.06em; text-transform:uppercase }
  .prog-file .n { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted) }
  .prog-file.set .n { color:var(--text); font-family:var(--mono) }
  .prog-file .sz { color:var(--muted); font-family:var(--mono); white-space:nowrap }
  .prog-file.disabled { pointer-events:none; opacity:.55 }
  .prog-warn { margin-top:6px; font-size:11px; color:var(--warn) }
  .prog-extras { margin-top:4px; border:1px solid var(--border); border-radius:5px; background:var(--card); max-height:150px; overflow-y:auto }
  .prog-extra { display:flex; align-items:center; gap:8px; padding:4px 6px 4px 10px; font-size:12px }
  .prog-extra + .prog-extra { border-top:1px solid var(--border) }
  .prog-extra .n { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--mono) }
  .prog-extra .sz { color:var(--muted); font-family:var(--mono); white-space:nowrap }
  .prog-extra-del { width:22px; height:22px; flex:0 0 22px; border:0; border-radius:4px; background:transparent; color:var(--muted); cursor:pointer; display:flex; align-items:center; justify-content:center }
  .prog-extra-del:hover { color:var(--err); background:var(--err-bg) }
  .prog-extra-del svg { width:12px; height:12px }
  .prog-add { margin-top:8px; width:100%; height:32px; font-size:12px; font-weight:500; color:var(--text); background:transparent; border:1px dashed var(--border); border-radius:5px; cursor:pointer }
  .prog-add:hover { border-color:var(--primary); background:var(--primary-10) }
  .prog-add:disabled { opacity:.4; cursor:not-allowed }
  @media (max-width:1000px) { .grid.three { grid-template-columns:1fr 1fr } }
  @media (max-width:880px) { .grid, .grid.three { grid-template-columns:1fr } }

  .card-hdr { display:flex; align-items:center; gap:12px; margin-bottom:14px }
  .card-hdr .icon {
    flex:0 0 36px; width:36px; height:36px; border-radius:5px;
    background:var(--primary-10); color:var(--primary); box-shadow:inset 0 0 0 1px var(--primary-20);
    display:flex; align-items:center; justify-content:center;
  }
  .card-hdr .icon svg { width:18px; height:18px }
  .card-hdr h2 { margin:0; font-size:15px; font-weight:600 }
  .card-hdr .meta { font-size:12px; color:var(--muted); margin-top:1px }

  /* ── Bırakma alanı ───────────────────── */
  .drop {
    display:block; width:100%; border:1.5px dashed var(--border); border-radius:5px;
    padding:26px 16px; text-align:center; background:var(--page-bg);
    cursor:pointer; transition:border-color .15s, background .15s; color:var(--muted); font-size:12px;
  }
  .drop:hover, .drop.over { border-color:var(--primary); background:var(--primary-10) }
  .drop input { display:none }
  .drop-icon { display:block; margin:0 auto 8px; color:var(--muted) }
  .drop-icon svg { width:24px; height:24px }
  .drop strong { display:block; color:var(--text); font-weight:500; margin-bottom:3px; font-size:13px }
  .drop .hint { display:flex; width:fit-content; align-items:center; gap:6px; margin:10px auto 0; padding:3px 8px; border-radius:5px; background:var(--warn-bg); color:var(--warn); font-size:11px; font-weight:500 }

  /* ── Özet / ağaç ─────────────────────── */
  .summary { margin-top:12px; border:1px solid var(--border); border-radius:5px; overflow:hidden }
  .summary-row { display:grid; grid-template-columns:1fr auto; gap:8px; padding:7px 12px; align-items:center; font-size:12px }
  .summary-row + .summary-row { border-top:1px solid var(--border) }
  .summary-row .l { color:var(--muted) }
  .summary-row .v { font-weight:600; font-family:var(--mono); font-variant-numeric:tabular-nums }
  .summary-row.danger { background:var(--err-bg) }
  .summary-row.danger .l, .summary-row.danger .v { color:var(--err) }

  .clear-btn {
    margin-top:8px; width:100%; height:30px; font-size:12px; font-weight:500; color:var(--muted);
    background:transparent; border:1px solid var(--border); border-radius:5px; cursor:pointer;
  }
  .clear-btn:hover { background:var(--primary-10); color:var(--text) }

  .tree { margin-top:10px; border:1px solid var(--border); border-radius:5px; max-height:240px; overflow-y:auto; background:var(--card) }
  .tree-hdr {
    padding:7px 12px; font-size:10px; font-weight:500; color:var(--muted); letter-spacing:.06em; text-transform:uppercase;
    border-bottom:1px solid var(--border); background:var(--section-bg); position:sticky; top:0;
  }
  .tree-row { display:grid; grid-template-columns:1fr auto; gap:8px; padding:6px 12px; font-size:12px; align-items:center }
  .tree-row + .tree-row { border-top:1px solid var(--border) }
  .tree-path { font-family:var(--mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  .tree-meta { color:var(--muted); font-family:var(--mono); font-variant-numeric:tabular-nums; white-space:nowrap }
  .tree-more { justify-content:center; color:var(--muted); font-style:italic; grid-template-columns:1fr }

  .upload-err { margin:0 0 12px; border-radius:5px; background:var(--err-bg); color:var(--err); padding:10px 12px; font-size:12px; line-height:1.45 }
  .upload-err strong { display:block; font-size:13px; margin-bottom:4px }
  .upload-err ul { margin:6px 0 0; padding:0; list-style:none; max-height:160px; overflow-y:auto }
  .upload-err li { display:flex; gap:8px; padding:4px 0; border-top:1px solid rgba(185,28,28,.15) }
  .upload-err li:first-child { border-top:0 }
  .upload-err .n { font-family:var(--mono); font-weight:600; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:0 1 auto; max-width:45% }
  .upload-err .w { flex:1; min-width:0; color:var(--text) }
  .upload-err .tip { margin-top:8px; padding-top:8px; border-top:1px solid rgba(185,28,28,.2); color:var(--text) }
  .compress-tip { margin-top:10px; padding:10px 12px; border-radius:5px; background:var(--warn-bg); color:var(--warn); font-size:12px; display:flex; gap:8px; align-items:flex-start; line-height:1.45 }
  .compress-tip strong { display:block; margin-bottom:2px; font-size:12px }
  .compress-tip a { color:inherit; text-decoration:underline }

  /* ── İlerleme ────────────────────────── */
  .progress { margin:0 0 12px; padding:10px 12px; border-radius:5px; background:var(--section-bg) }
  .progress .bar { background:var(--primary-20) }
  .total { flex:1; min-width:0; max-width:520px; margin:0 12px }
  .total-top { display:flex; align-items:baseline; gap:8px; margin-bottom:6px; font-variant-numeric:tabular-nums }
  .total-l { font-size:10px; font-weight:500; color:var(--muted); letter-spacing:.06em; text-transform:uppercase }
  .total-s { flex:1; min-width:0; font-size:12px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  .total-p { font-size:15px; font-weight:700 }
  .total .bar { height:8px }
  @media (max-width:700px) { .actions { flex-wrap:wrap } .total { order:3; flex-basis:100%; max-width:none; margin:4px 0 0 } }
  .bar { height:6px; background:var(--primary-10); border-radius:99px; overflow:hidden }
  .bar > div { height:100%; background:var(--primary); transition:width .25s; border-radius:99px }
  .stat { display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-top:6px; font-variant-numeric:tabular-nums }
  .stat .pct { font-weight:600; color:var(--text) }

  /* ── Rozet ───────────────────────────── */
  .status-badge { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:500; padding:2px 8px; border-radius:5px; background:var(--primary-10); color:var(--muted); white-space:nowrap }
  .status-badge.uploading { background:var(--info-bg); color:var(--info) }
  .status-badge.done      { background:var(--ok-bg); color:var(--ok) }
  .status-badge.err       { background:var(--err-bg); color:var(--err) }

  /* ── Aksiyon çubuğu ──────────────────── */
  .actions { margin-top:8px; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 10px 10px 14px }
  .footer-code { color:var(--muted); font-size:11px; font-family:var(--mono) }
  .footer-code b { font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; font-weight:500; font-size:10px; letter-spacing:.06em; text-transform:uppercase; margin-right:6px }
  .btn { height:36px; padding:0 16px; border-radius:5px; border:0; background:var(--primary); color:var(--primary-fg); font-size:13px; font-weight:500; cursor:pointer; transition:opacity .15s; display:inline-flex; align-items:center; gap:8px }
  .btn svg { width:16px; height:16px }
  .btn:hover { opacity:.88 }
  .btn:disabled { opacity:.35; cursor:not-allowed }
  .btn-ghost { background:transparent; color:var(--text); border:1px solid var(--border) }
  .btn-ghost:hover { background:var(--primary-10); opacity:1 }

  .alert { padding:14px 16px; border-radius:5px; font-size:13px }
  .alert-err { background:var(--err-bg); color:var(--err) }
  .loading-card { color:var(--muted); font-size:13px }
  .skel { height:12px; border-radius:5px; background:var(--primary-10); animation:pulse 1.4s ease-in-out infinite }
  @keyframes pulse { 50% { opacity:.45 } }

  /* ── Durum bantları ──────────────────── */
  .banner { margin-top:8px; padding:14px 16px; border-radius:5px; display:flex; align-items:center; gap:12px }
  .banner h2 { margin:0 0 2px; font-size:14px; font-weight:600 }
  .banner p { margin:0; font-size:12px; color:var(--muted); line-height:1.45 }
  .banner .icon { width:34px; height:34px; flex:0 0 34px; border-radius:5px; display:flex; align-items:center; justify-content:center }
  .push-banner { margin-top:8px; padding:14px 16px; border-radius:5px; background:var(--card); box-shadow:var(--card-shadow) }
  .push-banner h2 { margin:0 0 2px; font-size:14px; font-weight:600 }
  .push-banner p { margin:0; font-size:12px; color:var(--muted) }
  .push-pct { font-size:18px; font-weight:600; font-variant-numeric:tabular-nums }
  .done-banner { background:var(--ok-bg) }
  .done-banner h2 { color:var(--ok) }
  .done-banner .icon { background:var(--card); color:var(--ok) }
  .push-fail-banner { background:var(--err-bg) }
  .push-fail-banner h2, .push-fail-banner p { color:var(--err) }
  .push-fail-banner .icon { background:var(--card); color:var(--err) }
  .spinner { width:22px; height:22px; flex:0 0 22px; border:2.5px solid var(--primary-20); border-top-color:var(--primary); border-radius:50%; animation:spin .8s linear infinite }
  @keyframes spin { to { transform:rotate(360deg) } }

  /* ── Tamamlandı ──────────────────────── */
  .success-overlay { position:fixed; inset:0; z-index:200; background:rgba(15,17,19,.45); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:16px; animation:fadeIn .25s ease-out }
  @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
  .success-card { background:var(--card); border-radius:10px; box-shadow:0 20px 60px rgba(0,0,0,.25); max-width:460px; width:100%; overflow:hidden; animation:popIn .35s cubic-bezier(.16,1,.3,1) }
  @keyframes popIn { from { opacity:0; transform:scale(.96) translateY(8px) } to { opacity:1; transform:none } }
  .success-head { background:var(--section-bg); border-bottom:1px solid var(--border); padding:18px 20px; display:flex; align-items:center; gap:12px }
  .success-icon-wrap { width:36px; height:36px; flex:0 0 36px; border-radius:5px; background:var(--ok-bg); color:var(--ok); display:flex; align-items:center; justify-content:center; animation:popCheck .45s .15s cubic-bezier(.16,1,.3,1) both }
  @keyframes popCheck { from { transform:scale(0) } to { transform:scale(1) } }
  .success-icon-wrap svg { width:20px; height:20px }
  .success-head h1 { margin:0; font-size:15px; font-weight:600 }
  .success-head .sub { margin:1px 0 0; font-size:12px; color:var(--muted) }
  .success-body { padding:16px 20px 20px }
  .success-stats { display:grid; grid-template-columns:1fr 1fr; gap:8px }
  .success-stats.three { grid-template-columns:1fr 1fr 1fr }
  .success-stat { background:var(--section-bg); border-radius:5px; padding:12px }
  .success-stat .l { font-size:10px; font-weight:500; color:var(--muted); letter-spacing:.06em; text-transform:uppercase }
  .success-stat .v { font-size:22px; font-weight:700; font-variant-numeric:tabular-nums; margin-top:2px }
  .success-foot { margin-top:14px; font-size:12px; color:var(--muted); line-height:1.5 }

  /* ── Bildirim (sonner benzeri) ───────── */
  .toast-wrap { position:fixed; top:16px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; gap:8px; z-index:300; pointer-events:none; width:min(420px, calc(100% - 32px)) }
  .toast { pointer-events:auto; padding:11px 14px; border-radius:8px; font-size:13px; font-weight:500; background:var(--card); color:var(--text); border:1px solid var(--border); box-shadow:0 8px 24px rgba(0,0,0,.12); animation:toastIn .2s ease-out }
  .toast.err { color:var(--err) }
  .toast.info { color:var(--info) }
  @keyframes toastIn { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:none } }
</style>
</head>
<body>

<div id="toastWrap" class="toast-wrap"></div>

<!-- Tamamlandı -->
<div id="successOverlay" class="success-overlay hidden">
  <div class="success-card">
    <div class="success-head">
      <div class="success-icon-wrap">${ICON_CHECK_BIG}</div>
      <div>
        <h1>Aktarım Tamamlandı</h1>
        <p class="sub" id="successFirma">—</p>
      </div>
    </div>
    <div class="success-body">
      <div class="success-stats" id="successStats">
        <div class="success-stat">
          <div class="l">Veri</div>
          <div class="v" id="successDataSize">—</div>
        </div>
        <div class="success-stat">
          <div class="l">Resim</div>
          <div class="v" id="successImgCount">—</div>
        </div>
        <div class="success-stat hidden" id="successProgBox">
          <div class="l">Program</div>
          <div class="v" id="successProgCount">—</div>
        </div>
      </div>
      <div class="success-foot">Tüm dosyalarınız güvenli şekilde sunucularımıza aktarıldı. Bu pencereyi kapatabilirsiniz.</div>
    </div>
  </div>
</div>

<header class="topbar">
  <div class="topbar-inner">
    <div class="topbar-brand">
      <img src="https://pusulanet.net/img/logo.png" alt="Pusula" onerror="this.style.display='none'">
      <span class="sep"></span>
      <span class="label">Veri Aktarımı</span>
    </div>
    <div class="topbar-firma">
      <span class="kod hidden" id="firmaKod"></span>
      <span class="v" id="firmaName">—</span>
      <span class="dot"></span>
      <span class="hdr-status hidden" id="hdrStatus"></span>
    </div>
  </div>
</header>

<div class="page">
  <div id="loading" class="section">
    <div class="card loading-card">
      <div class="skel" style="width:40%"></div>
      <div class="skel" style="width:70%; margin-top:10px"></div>
    </div>
  </div>
  <div id="error" class="alert alert-err hidden"></div>

  <div id="main" class="hidden">

    <div id="notesWrap" class="message hidden">
      <div class="message-card">
        <span class="message-icon">${ICON_MESSAGE}</span>
        <div style="min-width:0">
          <div class="message-label">Not</div>
          <div id="notes" class="message-text"></div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="grid" id="uploadGrid">

        <!-- Veri Dosyası -->
        <div class="card">
          <div class="card-hdr">
            <span class="icon">${ICON_DATABASE}</span>
            <div>
              <h2>Veri Dosyası</h2>
              <div class="meta">.bak · .rar · .zip · .mdf · .ldf</div>
            </div>
            <span id="dataBadge" class="status-badge" style="margin-left:auto" hidden>Bekliyor</span>
          </div>

          <div id="dataErr" class="upload-err hidden"></div>
          <div id="dataProgress" class="progress hidden">
            <div class="bar"><div id="dataBar" style="width:0%"></div></div>
            <div class="stat"><span id="dataStat">—</span><span id="dataPct" class="pct">0%</span></div>
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

          <div id="imgErr" class="upload-err hidden"></div>
          <div id="imgProgress" class="progress hidden">
            <div class="bar"><div id="imgBar" style="width:0%"></div></div>
            <div class="stat"><span id="imgStat">—</span><span id="imgPct" class="pct">0%</span></div>
          </div>

          <label class="drop" id="imgDrop">
            <input type="file" id="imgInput" webkitdirectory multiple accept="image/*">
            <span class="drop-icon">${ICON_UPLOAD}</span>
            <strong>Klasörü buraya sürükleyin</strong>
            <span>veya tıklayıp seçin · sadece resimler kabul edilir</span>
            <span class="hint">${ICON_WARN} Tarayıcı izin sorduğunda "Yükle"yi seçin</span>
          </label>

          <div id="imgSummary" class="summary hidden"></div>
          <div id="imgTree" class="tree hidden"></div>
          <div id="imgCompressTip" class="compress-tip hidden">
            <span>${ICON_WARN}</span>
            <div>
              <strong>Sıkıştırma önerisi</strong>
              <span id="compressMsg"></span>
            </div>
          </div>
          <button id="imgClear" class="clear-btn hidden" type="button">Klasörü kaldır</button>

        </div>

        <!-- Program Dosyaları (yalnız firmanın terminal sunucusu biliniyorsa) -->
        <div class="card hidden" id="progCard">
          <div class="card-hdr">
            <span class="icon">${ICON_APP}</span>
            <div>
              <h2>Program Dosyaları</h2>
              <div class="meta">Her program için .exe, parametre (.txt) ve ek dosyalar</div>
            </div>
            <span id="progBadge" class="status-badge" style="margin-left:auto" hidden>Bekliyor</span>
          </div>

          <div id="progErr" class="upload-err hidden"></div>
          <div id="progProgress" class="progress hidden">
            <div class="bar"><div id="progBar" style="width:0%"></div></div>
            <div class="stat"><span id="progStat">—</span><span id="progPct" class="pct">0%</span></div>
          </div>

          <div id="progRows" class="prog-rows"></div>
          <button id="progAdd" class="prog-add" type="button">+ Program ekle</button>

        </div>

      </div>

      <div id="pushBanner" class="push-banner hidden">
        <div style="display:flex; align-items:center; gap:12px">
          <div class="spinner"></div>
          <div style="flex:1; min-width:0">
            <h2>Sunucuya aktarılıyor</h2>
            <p id="pushSubtext">Dosyalarınız hedef sunuculara taşınıyor — bu işlem birkaç dakika sürebilir, sayfayı kapatabilirsiniz.</p>
          </div>
          <div id="pushPctNum" class="push-pct">0%</div>
        </div>
        <div class="bar" style="margin-top:12px"><div id="pushBar" style="width:0%"></div></div>
      </div>

      <div id="doneBanner" class="banner done-banner hidden">
        <span class="icon">${ICON_CHECK}</span>
        <div>
          <h2>Aktarım tamamlandı</h2>
          <p>Dosyalarınız sunuculara aktarıldı. Bu pencereyi kapatabilirsiniz.</p>
        </div>
      </div>

      <div id="pushFailBanner" class="banner push-fail-banner hidden">
        <span class="icon">${ICON_WARN}</span>
        <div>
          <h2>Sunucuya aktarım hatası</h2>
          <p id="pushFailMsg">Yükleme başarılı oldu ancak sunucuya aktarımda bir sorun oluştu. Ekibimiz inceliyor.</p>
        </div>
      </div>

      <div class="card actions">
        <div class="footer-code"><b>Aktarım kodu</b>${token}</div>
        <div id="totalProgress" class="total hidden">
          <div class="total-top"><span class="total-l">Toplam</span><span id="totalStat" class="total-s">—</span><span id="totalPct" class="total-p">0%</span></div>
          <div class="bar"><div id="totalBar" style="width:0%"></div></div>
        </div>
        <button id="startBtn" class="btn" disabled>${ICON_UPLOAD}<span>Aktarımı Başlat</span></button>
      </div>
    </div>
  </div>
</div>

<script>
const TOKEN = ${JSON.stringify(token)};
const LARGE_THRESHOLD = 500 * 1024;   // 500 KB
const DATA_EXT  = /\\.(bak|rar|zip|ldf|mdf)$/i;
const IMAGE_EXT = /\\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|avif)$/i;
const ICON_X_JS = ${JSON.stringify(ICON_X)};
const ICON_CHECK_JS = ${JSON.stringify(ICON_CHECK.replace('width="18" height="18"', 'width="14" height="14"'))};
const ICON_CHEVRON_JS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
let PROGRAM_OPTIONS = [];   // [{ name, exeName, paramFileName }] — Hub kataloğu
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
    if (d.firmaId) { $("firmaKod").textContent = d.firmaId; $("firmaKod").classList.remove("hidden"); }
    if (d.notes) { $("notes").textContent = d.notes; $("notesWrap").classList.remove("hidden"); }
    if (d.programEnabled) {
      PROGRAM_OPTIONS = Array.isArray(d.programOptions) ? d.programOptions : [];
      if (progRows.length === 0) addProgRow();
      $("progCard").classList.remove("hidden");
      $("uploadGrid").classList.add("three");
    }
    $("loading").classList.add("hidden");
    $("main").classList.remove("hidden");
    applyStatus(d);
  } catch (e) {
    $("error").textContent = "Bağlantı hatası: " + e.message;
    $("error").classList.remove("hidden");
    $("loading").classList.add("hidden");
  }
}

const HDR_STATUS = {
  pending:     "Bekliyor",
  active:      "Yükleniyor",
  pushing:     "Sunucuya aktarılıyor",
  push_failed: "Aktarım hatası",
  completed:   "Tamamlandı",
};
function setHdrStatus(status) {
  const el = $("hdrStatus");
  if (!HDR_STATUS[status]) { el.classList.add("hidden"); return; }
  el.textContent = HDR_STATUS[status];
  el.className = "hdr-status " + status;
}

function applyStatus(d) {
  // Yükleme henüz başlamadıysa (pending/active ama tarayıcıda yükleme yok) Bekliyor göster
  setHdrStatus(d.status === "active" && !uploading ? "pending" : d.status);
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
    if ((d.programFilesReceived ?? 0) > 0) {
      $("progBadge").textContent = "Yüklendi"; $("progBadge").className = "status-badge done";
    }
    stopPushPoll();
  }
}

function showPushBanner(d) {
  $("pushBanner").classList.remove("hidden");
  // Drop alanlarını kalıcı kilitle
  $("dataDrop").classList.add("hidden");
  $("imgDrop").classList.add("hidden");
  renderProgRows();
  $("startBtn").disabled = true;
  const pct = Math.max(0, Math.min(100, d.pushProgress ?? 0));
  $("pushPctNum").textContent = pct + "%";
  $("pushBar").style.width = pct + "%";
  if (d.pushStage === "data")   $("pushSubtext").textContent = "Veri dosyaları SQL sunucusuna aktarılıyor…";
  else if (d.pushStage === "images") $("pushSubtext").textContent = "Resimler depo sunucusuna aktarılıyor…";
  else if (d.pushStage === "program") $("pushSubtext").textContent = "Program dosyaları terminal sunucusuna aktarılıyor…";
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
  if ((d.programFilesReceived ?? 0) > 0) {
    $("successProgCount").textContent = d.programFilesReceived.toLocaleString("tr") + " dosya";
    $("successProgBox").classList.remove("hidden");
    $("successStats").classList.add("three");
  }
  setHdrStatus("completed");
  $("successOverlay").classList.remove("hidden");
}

// ── State (yükleme öncesi) ────────────
let selectedDataFiles = [];   // File[]
let dataTotalBytes    = 0;
let selectedImages    = [];   // File[]
let imgTotalBytes     = 0;
let imgLargeCount     = 0;
let imgLargeBytes     = 0;
let progRows          = [];   // [{ id, program, exe: File|null, param: File|null }]
let progRowSeq        = 0;
let progOpenId        = null;   // açık program menüsü (satır id)
let uploading         = false;
let totalBytesAll     = 0;
const totalDone       = { data: 0, img: 0, prog: 0 };
function totalUpdate(kind, bytes) {
  totalDone[kind] = bytes;
  const done = totalDone.data + totalDone.img + totalDone.prog;
  const p = totalBytesAll > 0 ? Math.min(100, Math.round((done / totalBytesAll) * 100)) : 0;
  $("totalBar").style.width = p + "%";
  $("totalPct").textContent = p + "%";
  $("totalStat").textContent = fmtBytes(done) + " / " + fmtBytes(totalBytesAll);
}

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
    html += '<div class="summary-row"><span class="l" style="color:var(--warn)">Atlanan (resim değil)</span><span class="v" style="color:var(--warn)">' + imgSkippedCount.toLocaleString("tr") + ' dosya</span></div>';
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

// ── Program dosyaları (program başına exe + parametre) ──
function progOption(name) { return PROGRAM_OPTIONS.find((o) => o.name === name) || null; }
function progFiles() {
  const out = [];
  for (const row of progRows) {
    if (!row.program) continue;
    if (row.exe) out.push({ row, kind: "exe", file: row.exe });
    if (row.param) out.push({ row, kind: "param", file: row.param });
    for (const x of row.extras) out.push({ row, kind: "extra", file: x });
  }
  return out;
}
function progReady() {
  // Dosya seçilmiş ama programı seçilmemiş satır varsa başlatma
  return progRows.every((row) => row.program || (!row.exe && !row.param && row.extras.length === 0));
}
function addProgRow() {
  if (uploading) return;
  progRows.push({ id: ++progRowSeq, program: "", exe: null, param: null, extras: [] });
  renderProgRows();
}
$("progAdd").addEventListener("click", addProgRow);

function renderProgRows() {
  const box = $("progRows");
  const used = progRows.map((row) => row.program).filter(Boolean);
  let html = "";
  for (const row of progRows) {
    const opt = progOption(row.program);
    const open = progOpenId === row.id && !uploading;
    let sel = '<div class="dd' + (open ? " open" : "") + '">' +
      '<button type="button" class="dd-trigger" data-id="' + row.id + '"' + (uploading ? " disabled" : "") + '>' +
        '<span class="dd-val' + (row.program ? "" : " ph") + '">' + escapeHtml(row.program || "Program seçin…") + '</span>' +
        '<span class="dd-chev">' + ICON_CHEVRON_JS + '</span>' +
      '</button>';
    if (open) {
      sel += '<div class="dd-menu">';
      for (const o of PROGRAM_OPTIONS) {
        const taken = used.includes(o.name) && o.name !== row.program;
        sel += '<button type="button" class="dd-item" data-id="' + row.id + '" data-value="' + escapeHtml(o.name) + '"' + (taken ? " disabled" : "") + '>' +
          '<span class="t">' + escapeHtml(o.name) + '</span>' +
          (o.exeName ? '<span class="h">' + escapeHtml(o.exeName) + '</span>' : "") +
          '<span class="c">' + (o.name === row.program ? ICON_CHECK_JS : "") + '</span>' +
        '</button>';
      }
      sel += '</div>';
    }
    sel += '</div>';
    const dis = uploading || !row.program ? " disabled" : "";
    const exeHint = opt && opt.exeName ? "Beklenen: " + opt.exeName : ".exe seçin";
    const parHint = opt && opt.paramFileName ? "Beklenen: " + opt.paramFileName : ".txt seçin";
    let warn = "";
    if (opt && row.exe && opt.exeName && row.exe.name.toLowerCase() !== opt.exeName.toLowerCase()) warn += "Exe adı beklenenden farklı (" + opt.exeName + "). ";
    if (opt && row.param && opt.paramFileName && row.param.name.toLowerCase() !== opt.paramFileName.toLowerCase()) warn += "Parametre adı beklenenden farklı (" + opt.paramFileName + ").";
    html += '<div class="prog-row">' +
      '<div class="prog-row-hdr">' + sel +
        (uploading ? "" : '<button type="button" class="prog-del" data-id="' + row.id + '" title="Kaldır">' + ICON_X_JS + '</button>') +
      '</div>' +
      '<label class="prog-file' + (row.exe ? " set" : "") + dis + '">' +
        '<input type="file" accept=".exe" data-id="' + row.id + '" data-kind="exe">' +
        '<span class="k">Program</span>' +
        '<span class="n">' + escapeHtml(row.exe ? row.exe.name : exeHint) + '</span>' +
        (row.exe ? '<span class="sz">' + fmtBytes(row.exe.size) + '</span>' : "") +
      '</label>' +
      '<label class="prog-file' + (row.param ? " set" : "") + dis + '">' +
        '<input type="file" accept=".txt" data-id="' + row.id + '" data-kind="param">' +
        '<span class="k">Parametre</span>' +
        '<span class="n">' + escapeHtml(row.param ? row.param.name : parHint) + '</span>' +
        (row.param ? '<span class="sz">' + fmtBytes(row.param.size) + '</span>' : "") +
      '</label>' +
      '<label class="prog-file' + (row.extras.length ? " set" : "") + dis + '">' +
        '<input type="file" multiple data-id="' + row.id + '" data-kind="extra">' +
        '<span class="k">Ek dosyalar</span>' +
        '<span class="n">' + (row.extras.length ? row.extras.length + " dosya eklendi · eklemek için tıklayın" : "Tüm dosya türleri · birden fazla seçilebilir") + '</span>' +
        (row.extras.length ? '<span class="sz">' + fmtBytes(row.extras.reduce((t, x) => t + x.size, 0)) + '</span>' : "") +
      '</label>' +
      (row.extras.length ? '<div class="prog-extras">' + row.extras.map((x, i) =>
        '<div class="prog-extra"><span class="n">' + escapeHtml(x.name) + '</span><span class="sz">' + fmtBytes(x.size) + '</span>' +
        (uploading ? "" : '<button type="button" class="prog-extra-del" data-id="' + row.id + '" data-idx="' + i + '" title="Kaldır">' + ICON_X_JS + '</button>') +
        '</div>').join("") + '</div>' : "") +
      (warn ? '<div class="prog-warn">' + escapeHtml(warn) + '</div>' : "") +
    '</div>';
  }
  box.innerHTML = html;
  $("progAdd").disabled = uploading || progRows.length >= PROGRAM_OPTIONS.length;
  $("progAdd").classList.toggle("hidden", uploading);

  const count = progFiles().length;
  if (count > 0 && !uploading) {
    $("progBadge").hidden = false; $("progBadge").textContent = "Hazır"; $("progBadge").className = "status-badge";
  } else if (!uploading) {
    $("progBadge").hidden = true;
  }
  refreshStart();
}

document.addEventListener("click", (e) => {
  if (progOpenId !== null && !e.target.closest(".dd")) { progOpenId = null; renderProgRows(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && progOpenId !== null) { progOpenId = null; renderProgRows(); }
});

$("progRows").addEventListener("change", (e) => {
  if (uploading) return;
  const t = e.target;
  const row = progRows.find((x) => String(x.id) === t.dataset.id);
  if (!row) return;
  if (t.type === "file" && t.dataset.kind === "extra" && t.files && t.files.length) {
    for (const file of Array.from(t.files)) {
      const i = row.extras.findIndex((x) => x.name.toLowerCase() === file.name.toLowerCase());
      if (i >= 0) row.extras[i] = file; else row.extras.push(file);
    }
  } else if (t.type === "file" && t.files && t.files[0]) {
    const file = t.files[0];
    const ok = t.dataset.kind === "exe" ? /\\.exe$/i.test(file.name) : /\\.txt$/i.test(file.name);
    if (!ok) { showToast(t.dataset.kind === "exe" ? "Program dosyası .exe olmalı." : "Parametre dosyası .txt olmalı."); return; }
    row[t.dataset.kind] = file;
  }
  renderProgRows();
});
$("progRows").addEventListener("click", (e) => {
  if (uploading) return;
  const trig = e.target.closest(".dd-trigger");
  if (trig) {
    progOpenId = progOpenId === Number(trig.dataset.id) ? null : Number(trig.dataset.id);
    renderProgRows();
    return;
  }
  const item = e.target.closest(".dd-item");
  if (item) {
    if (item.disabled) return;
    const row = progRows.find((x) => String(x.id) === item.dataset.id);
    if (row) row.program = item.dataset.value;
    progOpenId = null;
    renderProgRows();
    return;
  }
  const xd = e.target.closest(".prog-extra-del");
  if (xd) {
    const row = progRows.find((x) => String(x.id) === xd.dataset.id);
    if (row) row.extras.splice(Number(xd.dataset.idx), 1);
    renderProgRows();
    return;
  }
  const b = e.target.closest(".prog-del");
  if (!b) return;
  progRows = progRows.filter((x) => String(x.id) !== b.dataset.id);
  if (progRows.length === 0) addProgRow(); else renderProgRows();
});

function refreshStart() {
  const hasProg = progFiles().length > 0;
  $("startBtn").disabled = uploading || !progReady() || (selectedDataFiles.length === 0 && selectedImages.length === 0 && !hasProg);
}

// ── Aktarımı başlat ───────────────────
$("startBtn").addEventListener("click", startUpload);

// Tarayıcıdaki sanitizeFilename ile aynı (sunucuda dosya adı böyle saklanır)
function sunucuAdi(ad) { return String(ad).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200); }
function sunucuYolu(rel) { return String(rel).replace(/\\\\/g, "/").replace(/^\\/+/, ""); }

/** Dosya okunabiliyor mu? Kilitli dosyada (ör. SQL Server'a bağlı .mdf/.ldf)
 *  tarayıcı NotReadableError verir — yüklemeye hiç başlamadan yakala. */
async function okunabilirMi(file) {
  try { await file.slice(0, Math.min(file.size, 64)).arrayBuffer(); return null; }
  catch (e) { return hataNedeni(e, file); }
}

function hataNedeni(err, file) {
  const ad = err && err.name ? err.name : "";
  const kilitli = /\\.(mdf|ldf|ndf)$/i.test(file ? file.name : "");
  if (ad === "NotReadableError" || ad === "NotFoundError" || ad === "SecurityError") {
    return kilitli
      ? "Dosya kullanımda: SQL Server bu veritabanını hâlâ açık tutuyor."
      : "Dosya okunamadı: başka bir program kullanıyor ya da silinmiş/taşınmış.";
  }
  const m = err && err.message ? err.message : String(err);
  if (/Bağlantı hatası/.test(m)) {
    return kilitli
      ? "Yüklenemedi: dosya okunurken kesildi (SQL Server'da açık olabilir) ya da bağlantı koptu."
      : "Bağlantı koptu: internet bağlantınızı kontrol edip tekrar deneyin.";
  }
  const hm = m.match(/^HTTP (\\d+): (.*)$/);
  if (hm) {
    let detay = hm[2];
    try { const j = JSON.parse(hm[2]); detay = j.error || detay; } catch {}
    if (hm[1] === "413") return "Dosya çok büyük (sunucu sınırı aşıldı).";
    return "Sunucu reddetti (" + hm[1] + "): " + detay;
  }
  return m;
}

function hataKutusu(pfx, hatalar) {
  const box = $(pfx + "Err");
  if (!hatalar.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const kilitli = hatalar.some((h) => /SQL Server/.test(h.reason));
  box.innerHTML =
    "<strong>" + hatalar.length + " dosya yüklenemedi</strong>" +
    "<ul>" + hatalar.map((h) => '<li><span class="n">' + escapeHtml(h.name) + '</span><span class="w">' + escapeHtml(h.reason) + "</span></li>").join("") + "</ul>" +
    '<div class="tip">' + (kilitli
      ? "Ne yapmalı: SQL Server Management Studio'da bu veritabanlarını ayırın (Detach) ya da SQL Server servisini durdurun, ardından <b>Eksikleri Yükle</b>'ye basın. Yüklenmiş dosyalar tekrar gönderilmez."
      : "Sorunu giderip <b>Eksikleri Yükle</b>'ye basın. Yüklenmiş dosyalar tekrar gönderilmez.") + "</div>";
  box.classList.remove("hidden");
}

async function sunucudakiler() {
  try {
    const r = await fetch("/api/upload/" + TOKEN + "/staged", { cache: "no-store" });
    const d = r.ok ? await r.json() : {};
    const harita = (arr) => { const m = new Map(); (Array.isArray(arr) ? arr : []).forEach((x) => m.set(x.path, x.size)); return m; };
    return { data: harita(d.data), images: harita(d.images), program: harita(d.program) };
  } catch { return { data: new Map(), images: new Map(), program: new Map() }; }
}

async function hatalariBildir(hatalar) {
  try {
    await fetch("/api/upload/" + TOKEN + "/client-error", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: hatalar }),
    });
  } catch {}
}

async function startUpload() {
  if (uploading) return;
  uploading = true;
  setHdrStatus("active");
  $("startBtn").disabled = true;
  $("dataClear").classList.add("hidden");
  $("imgClear").classList.add("hidden");
  hataKutusu("data", []); hataKutusu("img", []); hataKutusu("prog", []);

  // Drop alanlarını kapat
  $("dataDrop").classList.add("hidden");
  $("imgDrop").classList.add("hidden");
  totalBytesAll = dataTotalBytes + imgTotalBytes + progFiles().reduce((t, it) => t + it.file.size, 0);
  totalDone.data = 0; totalDone.img = 0; totalDone.prog = 0;
  $("totalProgress").classList.remove("hidden");
  totalUpdate("data", 0);
  renderProgRows();

  const onceki = await sunucudakiler();
  const hatalar = [];
  try {
    if (selectedDataFiles.length > 0) hatalar.push(...await uploadData(onceki.data));
    if (selectedImages.length > 0) hatalar.push(...await uploadImages(onceki.images));
    if (progFiles().length > 0) hatalar.push(...await uploadProgram(onceki.program));
  } catch (err) {
    hatalar.push({ area: "genel", name: "—", size: 0, reason: hataNedeni(err) });
  }

  if (hatalar.length > 0) {
    hatalariBildir(hatalar);
    hataKutusu("data", hatalar.filter((h) => h.area === "data" || h.area === "genel"));
    hataKutusu("img", hatalar.filter((h) => h.area === "img"));
    hataKutusu("prog", hatalar.filter((h) => h.area === "prog"));
    showToast(hatalar.length + " dosya yüklenemedi — ayrıntı ilgili kartta.");
    uploading = false;
    setHdrStatus("pending");
    $("totalProgress").classList.add("hidden");
    // Müşteri seçimi değiştirebilsin (ör. ayrılmış veritabanı dosyalarını yeniden seçmek)
    $("dataDrop").classList.remove("hidden");
    $("imgDrop").classList.remove("hidden");
    if (selectedDataFiles.length) $("dataClear").classList.remove("hidden");
    if (selectedImages.length) $("imgClear").classList.remove("hidden");
    $("startBtn").querySelector("span").textContent = "Eksikleri Yükle";
    renderProgRows();
    refreshStart();
    const ilk = hatalar[0];
    const kutu = $((ilk.area === "img" ? "img" : ilk.area === "prog" ? "prog" : "data") + "Err");
    if (kutu && kutu.scrollIntoView) kutu.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  try {
    await fetch("/api/upload/" + TOKEN + "/complete", { method:"POST" });
    // Push job arkaplanda başladı — polling pollPush ile yönetilir
    setHdrStatus("pushing");
    showPushBanner({ pushProgress: 0, pushStage: "starting" });
    pushPollInterval = setInterval(pollPush, 3000);
  } catch (err) {
    showToast("Aktarım başlatılamadı: " + hataNedeni(err));
    uploading = false;
    setHdrStatus("pending");
    refreshStart();
  }
}

async function uploadData(onceki) {
  const files = selectedDataFiles;
  const total = dataTotalBytes;
  const badge = $("dataBadge");
  badge.textContent = "Yükleniyor"; badge.className = "status-badge uploading";
  $("dataProgress").classList.remove("hidden");

  await reportData(total, 0);

  let completedBytes = 0;
  let uploadedCount = 0;
  let lastReport = 0;   // throttled live-progress report
  const hatalar = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    // Sunucuda aynı ad ve boyutta duruyorsa (önceki denemede yüklenmiş) atla
    if (onceki && onceki.get(sunucuAdi(f.name)) === f.size) {
      completedBytes += f.size; uploadedCount++;
      totalUpdate("data", completedBytes);
      continue;
    }
    const neden = await okunabilirMi(f);
    if (neden) { hatalar.push({ area: "data", name: f.name, size: f.size, reason: neden }); continue; }
    const fd = new FormData(); fd.append("file", f);
    try {
      await xhrUpload("/api/upload/" + TOKEN + "/data", fd, (pct, loaded) => {
        const cur = completedBytes + (loaded || 0);
        const totalPct = total > 0 ? Math.round((cur / total) * 100) : 0;
        $("dataBar").style.width = totalPct + "%";
        totalUpdate("data", cur);
        $("dataPct").textContent = totalPct + "%";
        $("dataStat").textContent = (uploadedCount + 1) + " / " + files.length + " · " + f.name + " · " + fmtBytes(cur) + " / " + fmtBytes(total);
        const now = Date.now();
        if (now - lastReport > 2000) { lastReport = now; reportData(total, cur); }
      });
      completedBytes += f.size;
      uploadedCount++;
      reportData(total, completedBytes);
    } catch (err) {
      hatalar.push({ area: "data", name: f.name, size: f.size, reason: hataNedeni(err, f) });
      console.error("data upload failed", f.name, err);
    }
  }

  const pct = total > 0 ? Math.round((completedBytes / total) * 100) : 100;
  $("dataBar").style.width = pct + "%";
  totalUpdate("data", completedBytes);
  $("dataPct").textContent = pct + "%";
  $("dataStat").textContent = uploadedCount + " / " + files.length + " dosya · " + fmtBytes(completedBytes) + " / " + fmtBytes(total);
  reportData(total, completedBytes);

  if (hatalar.length > 0) { badge.textContent = "Eksik"; badge.className = "status-badge err"; }
  else { badge.textContent = "Yüklendi"; badge.className = "status-badge done"; }
  return hatalar;
}

async function reportData(totalBytes, uploadedBytes) {
  try {
    await fetch("/api/upload/" + TOKEN + "/data-progress", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ totalBytes, uploadedBytes }),
    });
  } catch {}
}

async function uploadImages(onceki) {
  const files = selectedImages;
  const total = imgTotalBytes;
  const badge = $("imgBadge");
  badge.textContent = "Yükleniyor"; badge.className = "status-badge uploading";
  $("imgProgress").classList.remove("hidden");

  await reportImgs(files.length, total, 0, 0);

  let uploaded = 0, uploadedBytes = 0;
  let lastReport = Date.now();
  const hatalar = [];
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name;
    if (onceki && onceki.get(sunucuYolu(rel)) === f.size) {
      uploaded++; uploadedBytes += f.size;
    } else {
      const neden = await okunabilirMi(f);
      if (neden) hatalar.push({ area: "img", name: rel, size: f.size, reason: neden });
      else {
        const fd = new FormData(); fd.append("relPath", rel); fd.append("file", f);
        try {
          await xhrUpload("/api/upload/" + TOKEN + "/image", fd, (p, loaded) => { totalUpdate("img", uploadedBytes + (loaded || 0)); });
          uploaded++; uploadedBytes += f.size;
        } catch (err) {
          hatalar.push({ area: "img", name: rel, size: f.size, reason: hataNedeni(err, f) });
          console.error("img upload failed", rel, err);
        }
      }
    }
    const pct = total > 0 ? Math.round((uploadedBytes / total) * 100) : 0;
    $("imgBar").style.width = pct + "%";
    totalUpdate("img", uploadedBytes);
    $("imgPct").textContent = pct + "%";
    $("imgStat").textContent = uploaded + " / " + files.length + " dosya · " + fmtBytes(uploadedBytes) + " / " + fmtBytes(total);
    const now = Date.now();
    if (now - lastReport > 2000) { lastReport = now; reportImgs(files.length, total, uploaded, uploadedBytes); }
  }
  await reportImgs(files.length, total, uploaded, uploadedBytes);
  if (hatalar.length > 0) { badge.textContent = "Eksik"; badge.className = "status-badge err"; }
  else { badge.textContent = "Yüklendi"; badge.className = "status-badge done"; }
  return hatalar;
}

async function reportImgs(totalFiles, totalBytes, uploadedFiles, uploadedBytes) {
  try {
    await fetch("/api/upload/" + TOKEN + "/images-done", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ totalFiles, totalBytes, uploadedFiles, uploadedBytes }),
    });
  } catch {}
}

async function uploadProgram(onceki) {
  const items = progFiles();
  const total = items.reduce((t, it) => t + it.file.size, 0);
  const badge = $("progBadge");
  badge.hidden = false; badge.textContent = "Yükleniyor"; badge.className = "status-badge uploading";
  $("progProgress").classList.remove("hidden");
  await reportProgram(items.length, total, 0, 0);

  let uploaded = 0, done = 0;
  const hatalar = [];
  for (const it of items) {
    const ad = it.row.program + " · " + it.file.name;
    const anahtar = it.row.program.replace(/[\\\\/]/g, "_") + "/" + sunucuAdi(it.file.name);
    // Parametre dosyası sunucuda güncellenebildiği için boyut karşılaştırması yapılmaz — her seferinde gönderilir
    if (it.kind !== "param" && onceki && onceki.get(anahtar) === it.file.size) {
      uploaded++; done += it.file.size; totalUpdate("prog", done);
      continue;
    }
    const neden = await okunabilirMi(it.file);
    if (neden) { hatalar.push({ area: "prog", name: ad, size: it.file.size, reason: neden }); continue; }
    const fd = new FormData();
    fd.append("program", it.row.program);   // alanlar dosyadan ÖNCE eklenmeli (multipart sırası)
    fd.append("kind", it.kind);
    fd.append("file", it.file);
    try {
      await xhrUpload("/api/upload/" + TOKEN + "/program", fd, (pct, loaded) => {
        const cur = done + (loaded || 0);
        const p = total > 0 ? Math.round((cur / total) * 100) : 0;
        $("progBar").style.width = p + "%";
        totalUpdate("prog", cur);
        $("progPct").textContent = p + "%";
        $("progStat").textContent = (uploaded + 1) + " / " + items.length + " · " + ad;
      });
      uploaded++; done += it.file.size;
    } catch (err) {
      hatalar.push({ area: "prog", name: ad, size: it.file.size, reason: hataNedeni(err, it.file) });
      console.error("program upload failed", ad, err);
    }
  }
  const p = total > 0 ? Math.round((done / total) * 100) : 100;
  $("progBar").style.width = p + "%";
  totalUpdate("prog", done);
  $("progPct").textContent = p + "%";
  $("progStat").textContent = uploaded + " / " + items.length + " dosya · " + fmtBytes(done);
  await reportProgram(items.length, total, uploaded, done);
  if (hatalar.length > 0) { badge.textContent = "Eksik"; badge.className = "status-badge err"; }
  else { badge.textContent = "Yüklendi"; badge.className = "status-badge done"; }
  return hatalar;
}

async function reportProgram(totalFiles, totalBytes, uploadedFiles, uploadedBytes) {
  try {
    await fetch("/api/upload/" + TOKEN + "/program-progress", {
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

// ── Yerel tasarım önizlemesi: localhost + ?demo ─────────────
// Yerelde yükleme anında bittiği için ilerleme ekranı görülemiyor. Bu modda
// dosyalar gönderilmez, ilerleme yavaşça canlandırılır ve sunucuya aktarım
// başlatılmaz. Canlı alan adında (aktarim.pusulanet.net) hiçbir etkisi yok.
if ((location.hostname === "localhost" || location.hostname === "127.0.0.1") && new URLSearchParams(location.search).has("demo")) {
  xhrUpload = function (url, fd, onProgress) {
    return new Promise(function (resolve) {
      const file = fd.get("file");
      const size = file ? file.size : 1000;
      let loaded = 0;
      const step = Math.max(1, Math.round(size / 30));
      const t = setInterval(function () {
        loaded = Math.min(size, loaded + step);
        onProgress(Math.round(loaded / size * 100), loaded);
        if (loaded >= size) { clearInterval(t); resolve("{}"); }
      }, 100);
    });
  };
  const gercekFetch = window.fetch.bind(window);
  window.fetch = function (u, o) {
    const adres = String(u);
    if (adres.indexOf("/api/upload/") >= 0) {
      if (adres.indexOf("/staged") >= 0) return Promise.resolve(new Response(JSON.stringify({ data: [], images: [], program: [] }), { status: 200 }));
      if (adres.indexOf("/complete") >= 0) {
        setTimeout(function () { showToast("Demo modu: sunucuya aktarım başlatılmadı.", "info"); }, 300);
        return new Promise(function () {});
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    }
    return gercekFetch(u, o);
  };
  showToast("Demo modu: dosyalar gönderilmez, yükleme canlandırılır.", "info");
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
 *  Recursive; klasör ağacı korunur.
 *
 *  rsync varsa rsync kullanılır: kopyalanmış dosyaları atlar, yani tekrar
 *  denemede yalnız eksikler gider. Yoksa cp'ye düşer.
 *
 *  Neden tekrar deneme: Windows tarafındaki geçici dosya kilitleri (ör.
 *  Defender'ın yeni yazılan resimleri taraması) binlerce dosyalık kopyada
 *  "Permission denied" verip işi yarıda bırakabiliyor — 2026-09-13'te
 *  firma 3143'ün 13.412 resminin 2.900'ü böyle düştü. Aynı komut birkaç
 *  saniye sonra sorunsuz çalışıyor. */
async function copyTreeRecursive(srcDir, dstDir) {
  await mkdir(dstDir, { recursive: true })
  let hasRsync = true
  try { await execCmd("sh", ["-c", "command -v rsync"]) } catch { hasRsync = false }

  const dene = async () => {
    if (hasRsync) {
      // --no-perms/-owner/-group: cifs mount'ta sahiplik değiştirilemez
      await execCmd("rsync", ["-rt", "--no-perms", "--no-owner", "--no-group", srcDir + "/", dstDir + "/"])
    } else {
      await execCmd("cp", ["-r", srcDir + "/.", dstDir])
    }
  }

  const MAX = 3
  for (let i = 1; i <= MAX; i++) {
    try {
      await dene()
      return
    } catch (err) {
      if (i === MAX) throw err
      fastify.log.warn({ err: String(err?.message ?? err), deneme: i }, "kopyalama hatasi - tekrar denenecek")
      await new Promise((r) => setTimeout(r, 5000 * i))
    }
  }
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
    stmts.updatePush.run({ token, progress: 90, stage: "images", error: null, status: "pushing" })
  }

  // ── 3) Program dosyaları → firmanın terminal sunucusu C$\MUSTERI\{firmaId}\Aktarim\{Program} ──
  const stagingProgram = join(STAGING_ROOT, token, "program")
  const hasProgram = await safeReadDir(stagingProgram)
  if (hasProgram.length > 0) {
    if (!sess.rdpServerIp || !sess.rdpUsername || !sess.rdpPassword) {
      throw new Error("Terminal sunucusu credential'ları eksik")
    }
    stmts.updatePush.run({ token, progress: 92, stage: "program", error: null, status: "pushing" })
    await parametreleriGuncelle(token, sess)
    await withCifsMount(sess.rdpServerIp, "C$", sess.rdpUsername, sess.rdpPassword, async (mnt) => {
      await copyTreeRecursive(stagingProgram, join(mnt, "MUSTERI", sess.companyId, "Aktarim"))
    })
    stmts.updatePush.run({ token, progress: 98, stage: "program", error: null, status: "pushing" })
  }

  // ── 4) Bitir ──
  stmts.updatePush.run({ token, progress: 100, stage: null, error: null, status: "completed" })

  // ── 5) Staging temizliği — başarılı push sonrası dosyalar artık hedef sunucuda ──
  try {
    await rm(join(STAGING_ROOT, token), { recursive: true, force: true })
  } catch (err) {
    fastify.log.warn({ err, token }, "staging temizleme hatası (push yine de başarılı)")
  }
}

/* Parametre dosyalarına kurulum sihirbazıyla aynı kuralı uygular:
 *   Perakende (programCode 909): yalnız <DATAKODU> firmaId </DATAKODU> bloğu (Open Office yazılmaz)
 *   Diğerleri: [DATA KODU] firmaId ve [OPEN OFFICE] 1 satırları
 * Var olan değer güncellenir, yoksa sona eklenir. Dosya latin1 okunup yazılır:
 * baytlar aynen korunur (Windows-1254 Türkçe karakterler bozulmaz), yalnız ASCII
 * etiketler değişir. Satır sonu dosyadakiyle aynı tutulur. */
function parametreMetni(metin, firmaId, perakende) {
  const nl = metin.includes("\r\n") ? "\r\n" : "\n"
  if (perakende) {
    // Perakende: yalnız DATAKODU — Open Office ayarı Perakende parametresine yazılmaz
    for (const [etiket, deger] of [["DATAKODU", firmaId]]) {
      const blok = "<" + etiket + ">" + nl + deger + nl + "</" + etiket + ">"
      const re = new RegExp("<" + etiket + ">[\\s\\S]*?</" + etiket + ">", "i")
      if (re.test(metin)) metin = metin.replace(re, blok)
      else metin = metin.replace(/\s+$/, "") + nl + blok + nl
    }
    return metin
  }
  const sonNl = metin.endsWith(nl)
  let satirlar = metin.split(nl)
  if (sonNl) satirlar.pop()
  let dk = false, oo = false
  satirlar = satirlar.map((l) => {
    if (/^\[DATA KODU\]/.test(l)) { dk = true; return "[DATA KODU] " + firmaId }
    if (/^\s*\[OPEN ?OFFICE\]/i.test(l)) { oo = true; return "[OPEN OFFICE] 1" }
    return l
  })
  if (!dk) satirlar.push("[DATA KODU] " + firmaId)
  if (!oo) satirlar.push("[OPEN OFFICE] 1")
  return satirlar.join(nl) + nl
}

async function parametreleriGuncelle(token, sess) {
  let kayit = {}
  try { kayit = JSON.parse(await readFile(join(STAGING_ROOT, token, "program-param.json"), "utf8")) } catch { return }
  const secenekler = programOptionsOf(sess)
  for (const [program, dosya] of Object.entries(kayit)) {
    const yol = join(STAGING_ROOT, token, "program", program.replace(/[\\/]/g, "_"), dosya)
    try {
      const opt = secenekler.find((o) => o.name === program)
      const perakende = String(opt?.programCode ?? "").trim() === "909" || program.toLocaleLowerCase("tr") === "perakende"
      const eski = await readFile(yol, "latin1")
      await writeFile(yol, parametreMetni(eski, sess.companyId, perakende), "latin1")
    } catch (err) {
      fastify.log.warn({ err: String(err?.message ?? err), program, dosya }, "parametre guncellenemedi (aktarim devam ediyor)")
    }
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
