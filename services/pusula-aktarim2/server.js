/**
 * Pusula Aktarım 2 — müşteri PC'sindeki uygulamanın (apps/aktarim-istemci) servisi.
 *
 * Eski web aktarımından (services/pusula-aktarim) BAĞIMSIZ: ayrı port, ayrı pm2
 * adı, ayrı SQLite, ayrı staging. Plan: docs/aktarim2/PLAN.md
 *
 * Akış: Hub → admin API (X-Service-Key) oturum + kod üretir. Müşteri uygulamayı
 * açıp kodu girer → Bearer token alır. İstemci yalnız bu servisle konuşur; hedef
 * sunucu bilgileri (SQL/Depo/terminal) yalnız burada durur, istemciye verilmez.
 *
 * Endpoint'ler
 *   Admin (X-Service-Key):
 *     GET    /admin/oturumlar
 *     POST   /admin/oturumlar                 { firmaId, firmaAdi, hedefler, programlar, gunSayisi, notlar, olusturan }
 *     GET    /admin/oturumlar/:id             (keşif raporu dahil)
 *     POST   /admin/oturumlar/:id/iptal
 *     DELETE /admin/oturumlar/:id
 *   İstemci:
 *     POST   /api/giris                       { kod, surum, makine } → { token, oturum }
 *     GET    /api/oturum                      (Bearer)
 *     POST   /api/kesif                       (Bearer) keşif raporu
 */

import Fastify from "fastify"
import Database from "better-sqlite3"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { mkdir } from "fs/promises"
import { randomBytes, createHash, timingSafeEqual } from "crypto"

const __dirname = dirname(fileURLToPath(import.meta.url))

const SERVICE_KEY  = process.env.TRANSFER_SERVICE_KEY ?? ""
const STAGING_ROOT = process.env.STAGING_ROOT ?? join(__dirname, "staging")
const DB_PATH      = process.env.DB_PATH ?? join(__dirname, "aktarim2.db")
const PORT         = parseInt(process.env.PORT ?? "5100", 10)
const HOST         = process.env.HOST ?? "0.0.0.0"
/** Bu sürümden eski istemci giriş yapamaz (426) — SQL Konsol'daki min_app_version gibi. */
const MIN_SURUM    = process.env.MIN_ISTEMCI_SURUM ?? "0.1.0"

if (!SERVICE_KEY) {
  console.error("TRANSFER_SERVICE_KEY env değişkeni tanımlı değil")
  process.exit(1)
}
await mkdir(STAGING_ROOT, { recursive: true })

// ── SQLite ──
const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")
db.exec(`
  CREATE TABLE IF NOT EXISTS oturumlar (
    id           TEXT PRIMARY KEY,
    kodOzet      TEXT NOT NULL UNIQUE,   -- sha256(kod) — kodun kendisi saklanmaz
    firmaId      TEXT NOT NULL,
    firmaAdi     TEXT NOT NULL,
    hedefler     TEXT,                   -- JSON: { sql:{ip,kullanici,sifre}, depo:{…}, rdp:{…} } — istemciye GİTMEZ
    programlar   TEXT,                   -- JSON: [{ name, exeName, paramFileName }]
    durum        TEXT NOT NULL DEFAULT 'bekliyor',   -- bekliyor | bagli | yukleniyor | aktariliyor | tamamlandi | hata | iptal | suresi_doldu
    notlar       TEXT,
    olusturan    TEXT,
    olusturma    TEXT NOT NULL DEFAULT (datetime('now')),
    bitis        TEXT NOT NULL,
    sonGiris     TEXT,
    makine       TEXT,
    istemciSurum TEXT,
    kesif        TEXT,                   -- JSON keşif raporu
    kesifZamani  TEXT,
    hata         TEXT
  );
  CREATE TABLE IF NOT EXISTS tokenlar (
    ozet       TEXT PRIMARY KEY,         -- sha256(token)
    oturumId   TEXT NOT NULL REFERENCES oturumlar(id) ON DELETE CASCADE,
    olusturma  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tokenlar_oturum ON tokenlar(oturumId);
`)
db.pragma("foreign_keys = ON")

const sql = {
  ekle: db.prepare(`INSERT INTO oturumlar (id, kodOzet, firmaId, firmaAdi, hedefler, programlar, notlar, olusturan, bitis)
                    VALUES (@id, @kodOzet, @firmaId, @firmaAdi, @hedefler, @programlar, @notlar, @olusturan, @bitis)`),
  liste: db.prepare(`SELECT id, firmaId, firmaAdi, durum, notlar, olusturan, olusturma, bitis, sonGiris, makine,
                            istemciSurum, kesifZamani, hata FROM oturumlar ORDER BY olusturma DESC LIMIT 500`),
  byId: db.prepare(`SELECT * FROM oturumlar WHERE id = ?`),
  byKod: db.prepare(`SELECT * FROM oturumlar WHERE kodOzet = ?`),
  byToken: db.prepare(`SELECT o.* FROM tokenlar t JOIN oturumlar o ON o.id = t.oturumId WHERE t.ozet = ?`),
  tokenEkle: db.prepare(`INSERT INTO tokenlar (ozet, oturumId) VALUES (?, ?)`),
  girisYaz: db.prepare(`UPDATE oturumlar SET sonGiris = datetime('now'), makine = ?, istemciSurum = ?,
                          durum = CASE WHEN durum = 'bekliyor' THEN 'bagli' ELSE durum END WHERE id = ?`),
  durum: db.prepare(`UPDATE oturumlar SET durum = ? WHERE id = ?`),
  kesifYaz: db.prepare(`UPDATE oturumlar SET kesif = ?, kesifZamani = datetime('now') WHERE id = ?`),
  sil: db.prepare(`DELETE FROM oturumlar WHERE id = ?`),
}

// ── Yardımcılar ──
const ozet = (s) => createHash("sha256").update(String(s)).digest("hex")

/** Okunaklı kod: karışan harfler yok (0/O, 1/I/L). Biçim XXXX-XXXX. */
function yeniKod() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  const b = randomBytes(8)
  let k = ""
  for (let i = 0; i < 8; i++) k += abc[b[i] % abc.length]
  return k.slice(0, 4) + "-" + k.slice(4)
}
const kodNormal = (k) => String(k ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(.{4})(.{4})$/, "$1-$2")

function surumKarsilastir(a, b) {
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0)
  const pb = String(b).split(".").map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < 3; i++) { if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0) }
  return 0
}

function anahtarDogru(v) {
  const a = Buffer.from(String(v ?? "")), b = Buffer.from(SERVICE_KEY)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Oturum istemciye gösterilebilir mi — hedef credential'lar ASLA dönmez. */
function istemciGorunumu(o) {
  let programlar = []
  try { programlar = JSON.parse(o.programlar || "[]") } catch {}
  return {
    id: o.id, firmaId: o.firmaId, firmaAdi: o.firmaAdi, durum: o.durum,
    notlar: o.notlar, bitis: o.bitis, programlar,
  }
}

function kullanilabilir(o) {
  if (!o) return "Kod geçersiz."
  if (o.durum === "iptal") return "Bu aktarım iptal edilmiş."
  if (o.durum === "tamamlandi") return "Bu aktarım tamamlanmış."
  if (new Date(o.bitis.replace(" ", "T") + "Z") < new Date()) {
    if (o.durum !== "suresi_doldu") sql.durum.run("suresi_doldu", o.id)
    return "Bu aktarımın süresi dolmuş."
  }
  return null
}

// ── Sunucu ──
const fastify = Fastify({ logger: { level: "info" }, bodyLimit: 10 * 1024 * 1024 })

function yonetici(req, reply) {
  if (!anahtarDogru(req.headers["x-service-key"])) { reply.code(401).send({ hata: "yetkisiz" }); return false }
  return true
}

/** Bearer token → oturum; geçersizse yanıtı yazar ve null döner. */
function istemciOturumu(req, reply) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")
  const o = m ? sql.byToken.get(ozet(m[1].trim())) : null
  const neden = kullanilabilir(o)
  if (neden) { reply.code(o ? 410 : 401).send({ hata: o ? neden : "Oturum geçersiz, kodla yeniden giriş yapın." }); return null }
  return o
}

// ── Admin ──
fastify.get("/admin/oturumlar", async (req, reply) => {
  if (!yonetici(req, reply)) return
  return sql.liste.all()
})

fastify.post("/admin/oturumlar", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const b = req.body ?? {}
  if (!b.firmaId || !b.firmaAdi) return reply.code(400).send({ hata: "firmaId ve firmaAdi gerekli" })
  const gun = Math.max(1, Math.min(90, Number(b.gunSayisi) || 14))
  const id = randomBytes(8).toString("hex")
  // Çakışma olasılığı çok düşük ama UNIQUE ihlalinde yeniden dene.
  for (let deneme = 0; deneme < 5; deneme++) {
    const kod = yeniKod()
    try {
      sql.ekle.run({
        id, kodOzet: ozet(kod),
        firmaId: String(b.firmaId), firmaAdi: String(b.firmaAdi),
        hedefler: b.hedefler ? JSON.stringify(b.hedefler) : null,
        programlar: Array.isArray(b.programlar) ? JSON.stringify(b.programlar) : null,
        notlar: b.notlar ?? null, olusturan: b.olusturan ?? null,
        bitis: new Date(Date.now() + gun * 86400000).toISOString().replace("T", " ").slice(0, 19),
      })
      // Kod yalnız bu yanıtta döner, sonra geri okunamaz (yalnız özeti saklı).
      return { id, kod }
    } catch (e) {
      if (!/UNIQUE/.test(String(e?.message))) throw e
    }
  }
  return reply.code(500).send({ hata: "Kod üretilemedi" })
})

fastify.get("/admin/oturumlar/:id", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const o = sql.byId.get(req.params.id)
  if (!o) return reply.code(404).send({ hata: "bulunamadi" })
  const { kodOzet, hedefler, ...kalan } = o
  let kesif = null
  try { kesif = o.kesif ? JSON.parse(o.kesif) : null } catch {}
  return { ...kalan, kesif, programlar: JSON.parse(o.programlar || "[]") }
})

fastify.post("/admin/oturumlar/:id/iptal", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const r = sql.durum.run("iptal", req.params.id)
  if (!r.changes) return reply.code(404).send({ hata: "bulunamadi" })
  return { tamam: true }
})

fastify.delete("/admin/oturumlar/:id", async (req, reply) => {
  if (!yonetici(req, reply)) return
  sql.sil.run(req.params.id)
  return { tamam: true }
})

// ── İstemci ──
/** Kod tahmini engeli: IP başına 15 dakikada 10 hatalı giriş. Bellekte — yeniden
 *  başlatmada sıfırlanır, kod uzayı (31^8) zaten tahmine kapalı; bu ek önlem. */
const hataliGiris = new Map()
function girisEngelli(ip) {
  const k = hataliGiris.get(ip)
  if (!k) return false
  if (Date.now() - k.ilk > 15 * 60000) { hataliGiris.delete(ip); return false }
  return k.adet >= 10
}
function hataliSay(ip) {
  const k = hataliGiris.get(ip)
  if (!k || Date.now() - k.ilk > 15 * 60000) hataliGiris.set(ip, { ilk: Date.now(), adet: 1 })
  else k.adet++
}

fastify.post("/api/giris", async (req, reply) => {
  const ip = String(req.headers["x-real-ip"] ?? req.ip)
  if (girisEngelli(ip)) return reply.code(429).send({ hata: "Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin." })
  const b = req.body ?? {}
  const surum = String(b.surum ?? "0.0.0")
  if (surumKarsilastir(surum, MIN_SURUM) < 0) {
    return reply.code(426).send({ hata: "Uygulamanın yeni sürümü gerekli (en az " + MIN_SURUM + "). Güncel uygulamayı indirip tekrar açın.", minSurum: MIN_SURUM })
  }
  const o = sql.byKod.get(ozet(kodNormal(b.kod)))
  const neden = kullanilabilir(o)
  if (neden) {
    if (!o) hataliSay(ip)
    return reply.code(o ? 410 : 401).send({ hata: neden })
  }
  hataliGiris.delete(ip)

  const token = randomBytes(32).toString("base64url")
  sql.tokenEkle.run(ozet(token), o.id)
  sql.girisYaz.run(String(b.makine ?? "").slice(0, 100), surum.slice(0, 20), o.id)
  req.log.info({ oturum: o.id, firma: o.firmaId, makine: b.makine, surum }, "istemci giris")
  return { token, oturum: istemciGorunumu(sql.byId.get(o.id)) }
})

fastify.get("/api/oturum", async (req, reply) => {
  const o = istemciOturumu(req, reply)
  if (!o) return
  return istemciGorunumu(o)
})

fastify.post("/api/kesif", async (req, reply) => {
  const o = istemciOturumu(req, reply)
  if (!o) return
  const rapor = req.body
  if (!rapor || typeof rapor !== "object") return reply.code(400).send({ hata: "Rapor boş" })
  sql.kesifYaz.run(JSON.stringify(rapor), o.id)
  return { tamam: true }
})

fastify.get("/saglik", async () => ({ tamam: true, surum: "aktarim2", minIstemci: MIN_SURUM }))

await fastify.listen({ port: PORT, host: HOST })
fastify.log.info({ port: PORT, db: DB_PATH, staging: STAGING_ROOT }, "Pusula Aktarım 2 ayakta")
