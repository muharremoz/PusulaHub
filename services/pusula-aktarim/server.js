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

fastify.post("/api/upload/:token/data", async (req, reply) => {
  const v = getActiveSession(req.params.token)
  if (v.error) return reply.code(410).send({ error: v.error })

  const data = await req.file()
  if (!data) return reply.code(400).send({ error: "Dosya yok" })

  const filename = sanitizeFilename(data.filename || "data.bak")
  const targetDir = join(STAGING_ROOT, req.params.token, "data")
  await mkdir(targetDir, { recursive: true })
  const targetPath = join(targetDir, filename)

  await pipeline(data.file, createWriteStream(targetPath))
  const s = await stat(targetPath)

  stmts.updateProgress.run({
    token: req.params.token,
    status: "active",
    dataBytesTotal: s.size,
    dataBytesReceived: s.size,
    imageFilesTotal: null, imageFilesReceived: null,
    imageBytesTotal: null, imageBytesReceived: null,
  })
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

  const targetPath = join(STAGING_ROOT, req.params.token, "images", safeRel)
  await mkdir(dirname(targetPath), { recursive: true })
  await pipeline(data.file, createWriteStream(targetPath))
  const s = await stat(targetPath)
  return reply.send({ ok: true, path: safeRel, size: s.size })
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

const ICON_DATABASE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>`
const ICON_FOLDER   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/></svg>`
const ICON_FOLDER_OPEN = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14L2.96 17.04A2 2 0 0 0 4.39 20H18a2 2 0 0 0 2-1.7l1.7-7A1 1 0 0 0 20.7 10H7.5a2 2 0 0 0-1.4.6L4 12.7"/><path d="M2 10V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>`
const ICON_FILE     = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
const ICON_CHECK    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`

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
    --card: #ffffff;
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
  .page { max-width: 720px; margin: 0 auto; padding: 32px 16px 48px }
  .brand { display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:24px }
  .brand img { height:32px; width:auto }
  .brand-text { font-size:13px; color:var(--muted); letter-spacing:.5px; text-transform:uppercase; font-weight:500 }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 8px;
    box-shadow: var(--shadow); padding: 24px; margin-bottom: 14px;
  }
  .card-hdr { display:flex; align-items:center; gap:12px; margin-bottom: 16px }
  .card-hdr .icon {
    flex: 0 0 36px; width:36px; height:36px; border-radius:8px;
    background: var(--pusula-soft); color: var(--pusula);
    display:flex; align-items:center; justify-content:center;
  }
  .card-hdr h2 { margin:0; font-size:14px; font-weight:600; color:var(--text) }
  .card-hdr .meta { font-size:11px; color:var(--muted); margin-top:2px }

  h1 { margin: 0 0 4px 0; font-size: 22px; font-weight: 600; letter-spacing: -0.01em }
  .sub { color: var(--muted); font-size: 12px; line-height:1.5 }
  .note { margin-top:12px; padding:10px 12px; background:#fffbeb; border:1px solid #fde68a; border-radius:5px; color:#78350f; font-size:12px }

  .drop {
    display:block; width:100%;
    border: 2px dashed #d4d4d8; border-radius: 6px;
    padding: 32px 16px; text-align: center; background: #fafafa;
    cursor: pointer; transition: all .15s; color: var(--muted);
    font-size: 13px;
  }
  .drop:hover, .drop.over { border-color: var(--pusula); background: var(--pusula-soft); color: var(--pusula) }
  .drop input { display: none }
  .drop-icon { display:block; margin:0 auto 8px auto; opacity:.6 }
  .drop strong { display:block; color:var(--text); font-weight:600; margin-bottom:4px; font-size:13px }
  .drop:hover strong, .drop.over strong { color: var(--pusula) }

  .files { margin-top:14px; display:flex; flex-direction:column; gap:6px; max-height:240px; overflow-y:auto; font-size:11px }
  .file { display:grid; grid-template-columns:1fr 80px 60px; gap:8px; align-items:center; padding:8px 10px; background:#f9fafb; border:1px solid #f3f4f6; border-radius:5px; font-family:ui-monospace,SFMono-Regular,monospace }
  .file .name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  .file .size { color:var(--muted); text-align:right; tabular-nums }
  .file .pct  { text-align:right; tabular-nums; color:var(--muted) }
  .file.ok    { background:#ecfdf5; border-color:#a7f3d0 }
  .file.ok    .pct { color:#059669; font-weight:600 }
  .file.err   { background:#fef2f2; border-color:#fecaca; color:#b91c1c }

  .bar { height:6px; background:#e4e4e7; border-radius:3px; overflow:hidden; margin-top:14px }
  .bar > div { height:100%; background: var(--pusula); transition:width .25s; border-radius:3px }
  .stat { display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-top:8px }
  .stat .pct { font-weight:600; color:var(--text) }

  .actions { display:flex; justify-content:flex-end; margin-top:8px }
  .btn { padding:10px 20px; border-radius:5px; border:0; background: var(--pusula); color:#fff; font-size:13px; font-weight:500; cursor:pointer; transition:opacity .15s }
  .btn:hover { opacity:.9 }
  .btn:disabled { opacity:.5; cursor:not-allowed }

  .alert { padding: 16px; border-radius:8px; border:1px solid; font-size:13px }
  .alert-err { background:#fef2f2; border-color:#fecaca; color:#991b1b }
  .alert-ok  { background:#ecfdf5; border-color:#a7f3d0; color:#065f46 }

  .hidden { display:none !important }
  .footer-code { text-align:center; padding:24px 0 8px 0; color:var(--muted); font-size:11px; font-family:ui-monospace,SFMono-Regular,monospace }

  @media (max-width:480px) {
    .page { padding: 20px 12px 40px }
    .card { padding:18px }
    .drop { padding:24px 12px }
  }
</style>
</head>
<body>
<div class="page">
  <div class="brand">
    <img src="https://pusulanet.net/img/logo.png" alt="Pusula" onerror="this.style.display='none'">
    <span class="brand-text">Aktarım</span>
  </div>

  <div id="loading" class="card"><div class="sub">Yükleniyor…</div></div>

  <div id="error" class="alert alert-err hidden"></div>

  <div id="main" class="hidden">
    <div class="card">
      <h1 id="firmaName">—</h1>
      <p class="sub">Veritabanı (.bak) ve resim klasörlerinizi bu sayfa üzerinden güvenli şekilde aktarabilirsiniz. Ekibimiz devamını sağlayacak.</p>
      <div id="notes" class="note hidden"></div>
    </div>

    <div class="card">
      <div class="card-hdr">
        <span class="icon">${ICON_DATABASE}</span>
        <div>
          <h2>Veri Dosyası</h2>
          <div class="meta">.bak / .rar / .zip</div>
        </div>
      </div>
      <label class="drop" id="dataDrop">
        <input type="file" id="dataInput" accept=".bak,.rar,.zip">
        <span class="drop-icon">${ICON_FILE}</span>
        <strong>Dosyayı buraya bırakın</strong>
        <span>veya tıklayıp seçin</span>
      </label>
      <div id="dataFiles" class="files"></div>
    </div>

    <div class="card">
      <div class="card-hdr">
        <span class="icon">${ICON_FOLDER}</span>
        <div>
          <h2>Resim Klasörü</h2>
          <div class="meta">Tüm alt klasörler dahil yüklenir</div>
        </div>
      </div>
      <label class="drop" id="imgDrop">
        <input type="file" id="imgInput" webkitdirectory multiple>
        <span class="drop-icon">${ICON_FOLDER_OPEN}</span>
        <strong>Klasörü buraya sürükleyin</strong>
        <span>veya tıklayıp seçin</span>
      </label>
      <div id="imgFiles" class="files"></div>
      <div class="bar"><div id="imgBar" style="width:0%"></div></div>
      <div class="stat"><span id="imgStat">—</span><span id="imgPct" class="pct">0%</span></div>
    </div>

    <div class="card alert-ok hidden" id="doneCard">
      <div class="card-hdr">
        <span class="icon" style="background:#ecfdf5;color:#059669">${ICON_CHECK}</span>
        <h2 style="font-size:15px">Aktarım tamamlandı</h2>
      </div>
      <p class="sub" style="margin:0">Ekibimiz devamını sağlayacak. Bu pencereyi kapatabilirsiniz.</p>
    </div>

    <div class="actions">
      <button id="finishBtn" class="btn" disabled>Aktarımı Tamamla</button>
    </div>

    <div class="footer-code">Aktarım kodu: ${token}</div>
  </div>
</div>

<script>
const TOKEN = ${JSON.stringify(token)};
const $ = (id) => document.getElementById(id);
function fmtBytes(b) {
  if (!b) return "0 B";
  if (b >= 1024**3) return (b/1024**3).toFixed(2) + " GB";
  if (b >= 1024**2) return (b/1024**2).toFixed(1) + " MB";
  if (b >= 1024) return (b/1024).toFixed(0) + " KB";
  return b + " B";
}

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

let dataDone = false;
setupDrop($("dataDrop"), $("dataInput"));
$("dataInput").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const row = document.createElement("div");
  row.className = "file";
  row.innerHTML = "<span class=\\"name\\"></span><span class=\\"size\\"></span><span class=\\"pct\\">0%</span>";
  row.querySelector(".name").textContent = f.name;
  row.querySelector(".size").textContent = fmtBytes(f.size);
  $("dataFiles").innerHTML = ""; $("dataFiles").appendChild(row);
  const fd = new FormData(); fd.append("file", f);
  await xhrUpload("/api/upload/" + TOKEN + "/data", fd, (pct) => { row.querySelector(".pct").textContent = pct + "%" })
    .then(() => { row.classList.add("ok"); dataDone = true; refreshFinish(); })
    .catch((err) => { row.classList.add("err"); row.querySelector(".pct").textContent = "✗"; console.error(err); });
});

let imgUploaded=0, imgUploadedBytes=0, imgTotal=0;
setupDrop($("imgDrop"), $("imgInput"));
$("imgInput").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files);
  imgTotal = files.reduce((s,f) => s+f.size, 0);
  imgUploaded=0; imgUploadedBytes=0;
  $("imgFiles").innerHTML = "";
  $("imgStat").textContent = files.length + " dosya · " + fmtBytes(imgTotal);
  $("imgPct").textContent = "0%"; $("imgBar").style.width = "0%";

  await reportImgs(files.length, imgTotal, 0, 0);

  for (const f of files) {
    const rel = f.webkitRelativePath || f.name;
    const fd = new FormData(); fd.append("relPath", rel); fd.append("file", f);
    try { await xhrUpload("/api/upload/" + TOKEN + "/image", fd, () => {}); imgUploaded++; imgUploadedBytes += f.size }
    catch (err) { console.error("img upload failed", rel, err) }
    const pct = imgTotal > 0 ? Math.round((imgUploadedBytes / imgTotal) * 100) : 0;
    $("imgBar").style.width = pct + "%"; $("imgPct").textContent = pct + "%";
    $("imgStat").textContent = imgUploaded + " / " + files.length + " dosya · " + fmtBytes(imgUploadedBytes) + " / " + fmtBytes(imgTotal);
    if (imgUploaded % 25 === 0 || imgUploaded === files.length) {
      reportImgs(files.length, imgTotal, imgUploaded, imgUploadedBytes);
    }
  }
  refreshFinish();
});

async function reportImgs(totalFiles, totalBytes, uploadedFiles, uploadedBytes) {
  try {
    await fetch("/api/upload/" + TOKEN + "/images-done", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ totalFiles, totalBytes, uploadedFiles, uploadedBytes }),
    });
  } catch {}
}

function refreshFinish() {
  $("finishBtn").disabled = !(dataDone || imgUploaded > 0);
}

$("finishBtn").addEventListener("click", async () => {
  $("finishBtn").disabled = true;
  await fetch("/api/upload/" + TOKEN + "/complete", { method:"POST" });
  $("doneCard").classList.remove("hidden");
});

function xhrUpload(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
      else reject(new Error("HTTP " + xhr.status + ": " + xhr.responseText));
    });
    xhr.addEventListener("error", () => reject(new Error("Bağlantı hatası")));
    xhr.open("POST", url);
    xhr.send(formData);
  });
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
