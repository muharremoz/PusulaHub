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
import { mkdir, stat } from "fs/promises"
import { createWriteStream } from "fs"
import { pipeline } from "stream/promises"
import { randomBytes } from "crypto"

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

function newId()    { return randomBytes(8).toString("hex") }
function newToken() { return randomBytes(18).toString("base64url") }

const stmts = {
  insert: db.prepare(`
    INSERT INTO sessions (id, token, companyId, firmaName, sqlServerName, depoServerName,
                          status, createdBy, expiresAt, notes)
    VALUES (@id, @token, @companyId, @firmaName, @sqlServerName, @depoServerName,
            'pending', @createdBy, @expiresAt, @notes)
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
  const days = Math.max(1, Math.min(60, body.expiresInDays ?? 7))
  const expiresAt = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 19).replace("T", " ")

  const id    = newId()
  const token = newToken()
  stmts.insert.run({
    id, token,
    companyId:      body.companyId,
    firmaName:      body.firmaName,
    sqlServerName:  body.sqlServerName  ?? null,
    depoServerName: body.depoServerName ?? null,
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
  stmts.remove.run(req.params.id)
  return { ok: true }
})

// ─────────────────────────────────────────────────
// PUBLIC endpoints (müşteri, token only)
// ─────────────────────────────────────────────────

fastify.get("/api/info/:token", async (req, reply) => {
  const v = getActiveSession(req.params.token)
  if (v.error) return reply.code(v.error === "not_found" ? 404 : 410).send({ ok: false, reason: v.error })
  const s = v.session
  return {
    ok: true,
    firmaId:             s.companyId,
    firmaName:           s.firmaName,
    status:              s.status,
    createdAt:           s.createdAt,
    expiresAt:           s.expiresAt,
    dataBytesTotal:      s.dataBytesTotal,
    dataBytesReceived:   s.dataBytesReceived,
    imageFilesTotal:     s.imageFilesTotal,
    imageFilesReceived:  s.imageFilesReceived,
    imageBytesTotal:     s.imageBytesTotal,
    imageBytesReceived:  s.imageBytesReceived,
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

fastify.post("/api/upload/:token/complete", async (req, reply) => {
  stmts.setStatus.run("completed", "completed", req.params.token)
  return reply.send({ ok: true })
})

// ─────────────────────────────────────────────────
// Müşteri HTML sayfası
// ─────────────────────────────────────────────────

fastify.get("/:token", async (req, reply) => {
  const { token } = req.params
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return reply.code(404).type("text/html").send("<h1>Geçersiz link</h1>")
  }
  reply.type("text/html").send(renderHtml(token))
})

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

  .footer-code { text-align:center; padding:18px 0 0 0; color:var(--muted); font-size:10px; font-family:ui-monospace,SFMono-Regular,monospace }

  .hidden { display:none !important }

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

    <div id="doneBanner" class="done-banner hidden">
      <span class="icon">${ICON_CHECK}</span>
      <div>
        <h2>Aktarım tamamlandı</h2>
        <p>Ekibimiz devamını sağlayacak. Bu pencereyi kapatabilirsiniz.</p>
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
async function loadInfo() {
  try {
    const r = await fetch("/api/info/" + TOKEN);
    const d = await r.json();
    if (!r.ok) {
      const map = { not_found:"Bu aktarım linki bulunamadı.", expired:"Bu aktarımın süresi geçti.", cancelled:"Bu aktarım iptal edilmiş.", completed:"Bu aktarım daha önce tamamlandı." };
      $("error").textContent = map[d.reason] || ("Hata: " + (d.reason || "Bilinmiyor"));
      $("error").classList.remove("hidden");
      $("loading").classList.add("hidden");
      return;
    }
    $("firmaName").textContent = d.firmaName;
    if (d.notes) { $("notes").textContent = d.notes; $("notes").classList.remove("hidden"); }
    $("loading").classList.add("hidden");
    $("main").classList.remove("hidden");
  } catch (e) {
    $("error").textContent = "Bağlantı hatası: " + e.message;
    $("error").classList.remove("hidden");
    $("loading").classList.add("hidden");
  }
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

function refreshStart() {
  $("startBtn").disabled = uploading || (selectedDataFiles.length === 0 && selectedImages.length === 0);
}

// ── Aktarımı başlat ───────────────────
$("startBtn").addEventListener("click", startUpload);

async function startUpload() {
  if (uploading) return;
  uploading = true;
  $("startBtn").disabled = true;
  $("dataClear").classList.add("hidden");
  $("imgClear").classList.add("hidden");

  // Drop alanlarını kapat
  $("dataDrop").style.pointerEvents = "none";
  $("imgDrop").style.pointerEvents = "none";
  $("dataDrop").style.opacity = ".5";
  $("imgDrop").style.opacity = ".5";

  try {
    if (selectedDataFiles.length > 0) await uploadData();
    if (selectedImages.length > 0) await uploadImages();
    await fetch("/api/upload/" + TOKEN + "/complete", { method:"POST" });
    $("doneBanner").classList.remove("hidden");
  } catch (err) {
    alert("Yükleme sırasında hata: " + err.message);
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
  badge.textContent = "Tamamlandı"; badge.className = "status-badge done";
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
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name;
    const fd = new FormData(); fd.append("relPath", rel); fd.append("file", f);
    try { await xhrUpload("/api/upload/" + TOKEN + "/image", fd, () => {}); uploaded++; uploadedBytes += f.size }
    catch (err) { console.error("img upload failed", rel, err) }
    const pct = total > 0 ? Math.round((uploadedBytes / total) * 100) : 0;
    $("imgBar").style.width = pct + "%";
    $("imgPct").textContent = pct + "%";
    $("imgStat").textContent = uploaded + " / " + files.length + " dosya · " + fmtBytes(uploadedBytes) + " / " + fmtBytes(total);
    if (uploaded % 25 === 0 || uploaded === files.length) {
      reportImgs(files.length, total, uploaded, uploadedBytes);
    }
  }
  badge.textContent = "Tamamlandı"; badge.className = "status-badge done";
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

try {
  await fastify.listen({ port: PORT, host: HOST })
  fastify.log.info({ port: PORT, db: DB_PATH, staging: STAGING_ROOT }, "Pusula Aktarım v2 (SQLite) ayakta")
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
