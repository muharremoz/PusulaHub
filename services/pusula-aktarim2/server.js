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
 *     GET    /api/dosyalar                    (Bearer) yüklenen/yarım dosyalar
 *     POST   /api/dosya                       (Bearer) { tur, yol, boyut, sha256, meta } → { id, parcaBoyutu, alinan[] }
 *     PUT    /api/dosya/:id/parca/:no         (Bearer) octet-stream, X-Parca-Sha256
 *     POST   /api/dosya/:id/bitir             (Bearer) tüm parçalar geldi mi + dosya SHA256
 *
 * Parça parça yükleme: istemci kopunca /api/dosya'yı yeniden çağırır, alınan
 * parçaları öğrenir, yalnız eksikleri gönderir. Parçalar dosyaya doğrudan kendi
 * konumuna yazılır (birleştirme adımı yok).
 */

import Fastify from "fastify"
import Database from "better-sqlite3"
import { fileURLToPath } from "url"
import { dirname, join, normalize } from "path"
import { mkdir, open, rm, stat, readdir, readFile, writeFile, rename } from "fs/promises"
import { createReadStream } from "fs"
import { randomBytes, createHash, timingSafeEqual } from "crypto"
import { spawn } from "child_process"

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
    durum        TEXT NOT NULL DEFAULT 'bekliyor',   -- bekliyor | bagli | yukleniyor | yuklendi | aktariliyor | tamamlandi | hata | iptal | suresi_doldu
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
  CREATE TABLE IF NOT EXISTS dosyalar (
    id           TEXT PRIMARY KEY,
    oturumId     TEXT NOT NULL REFERENCES oturumlar(id) ON DELETE CASCADE,
    tur          TEXT NOT NULL,          -- veritabani | resim | eski | program | ek
    yol          TEXT NOT NULL,          -- tur klasörüne göre göreli yol (ör. 4022_KOLN.bak)
    boyut        INTEGER NOT NULL,
    sha256       TEXT NOT NULL,
    parcaBoyutu  INTEGER NOT NULL,
    parcaSayisi  INTEGER NOT NULL,
    durum        TEXT NOT NULL DEFAULT 'yukleniyor',  -- yukleniyor | tamam | hata
    meta         TEXT,                   -- JSON (veritabanı adı, sıkıştırma…)
    olusturma    TEXT NOT NULL DEFAULT (datetime('now')),
    bitis        TEXT,
    UNIQUE (oturumId, tur, yol)
  );
  CREATE TABLE IF NOT EXISTS parcalar (
    dosyaId TEXT NOT NULL REFERENCES dosyalar(id) ON DELETE CASCADE,
    no      INTEGER NOT NULL,
    PRIMARY KEY (dosyaId, no)
  );
`)
db.pragma("foreign_keys = ON")
// Sonradan eklenen sütunlar (tablo zaten varsa)
for (const [ad, tip] of [["asama", "TEXT"], ["ilerleme", "INTEGER NOT NULL DEFAULT 0"], ["tamamlanma", "TEXT"]]) {
  if (!db.prepare("PRAGMA table_info(oturumlar)").all().some((c) => c.name === ad)) db.exec(`ALTER TABLE oturumlar ADD COLUMN ${ad} ${tip}`)
}

const sql = {
  ekle: db.prepare(`INSERT INTO oturumlar (id, kodOzet, firmaId, firmaAdi, hedefler, programlar, notlar, olusturan, bitis)
                    VALUES (@id, @kodOzet, @firmaId, @firmaAdi, @hedefler, @programlar, @notlar, @olusturan, @bitis)`),
  liste: db.prepare(`SELECT o.id, o.firmaId, o.firmaAdi, o.durum, o.notlar, o.olusturan, o.olusturma, o.bitis, o.sonGiris, o.makine,
                            o.istemciSurum, o.kesifZamani, o.hata, o.asama, o.ilerleme, o.tamamlanma,
                            (SELECT COUNT(*) FROM dosyalar d WHERE d.oturumId = o.id AND d.durum = 'tamam') AS dosyaSayisi,
                            (SELECT COALESCE(SUM(boyut), 0) FROM dosyalar d WHERE d.oturumId = o.id AND d.durum = 'tamam') AS dosyaBoyutu
                     FROM oturumlar o ORDER BY o.olusturma DESC LIMIT 500`),
  byId: db.prepare(`SELECT * FROM oturumlar WHERE id = ?`),
  byKod: db.prepare(`SELECT * FROM oturumlar WHERE kodOzet = ?`),
  byToken: db.prepare(`SELECT o.* FROM tokenlar t JOIN oturumlar o ON o.id = t.oturumId WHERE t.ozet = ?`),
  tokenEkle: db.prepare(`INSERT INTO tokenlar (ozet, oturumId) VALUES (?, ?)`),
  girisYaz: db.prepare(`UPDATE oturumlar SET sonGiris = datetime('now'), makine = ?, istemciSurum = ?,
                          durum = CASE WHEN durum = 'bekliyor' THEN 'bagli' ELSE durum END WHERE id = ?`),
  durum: db.prepare(`UPDATE oturumlar SET durum = ? WHERE id = ?`),
  kesifYaz: db.prepare(`UPDATE oturumlar SET kesif = ?, kesifZamani = datetime('now') WHERE id = ?`),
  sil: db.prepare(`DELETE FROM oturumlar WHERE id = ?`),
  aktarimDurumu: db.prepare(`UPDATE oturumlar SET durum = @durum, asama = @asama, ilerleme = @ilerleme, hata = @hata,
                               tamamlanma = CASE WHEN @durum = 'tamamlandi' THEN datetime('now') ELSE tamamlanma END
                             WHERE id = @id`),
  dosyaBul: db.prepare(`SELECT * FROM dosyalar WHERE oturumId = ? AND tur = ? AND yol = ?`),
  dosyaById: db.prepare(`SELECT * FROM dosyalar WHERE id = ? AND oturumId = ?`),
  dosyaEkle: db.prepare(`INSERT INTO dosyalar (id, oturumId, tur, yol, boyut, sha256, parcaBoyutu, parcaSayisi, meta)
                         VALUES (@id, @oturumId, @tur, @yol, @boyut, @sha256, @parcaBoyutu, @parcaSayisi, @meta)`),
  dosyaSil: db.prepare(`DELETE FROM dosyalar WHERE id = ?`),
  dosyaDurum: db.prepare(`UPDATE dosyalar SET durum = ?, bitis = CASE WHEN ? = 'tamam' THEN datetime('now') ELSE bitis END WHERE id = ?`),
  dosyalar: db.prepare(`SELECT d.id, d.tur, d.yol, d.boyut, d.durum, d.parcaSayisi, d.meta,
                               (SELECT COUNT(*) FROM parcalar p WHERE p.dosyaId = d.id) AS alinanSayi
                        FROM dosyalar d WHERE d.oturumId = ? ORDER BY d.olusturma`),
  parcaEkle: db.prepare(`INSERT OR IGNORE INTO parcalar (dosyaId, no) VALUES (?, ?)`),
  parcalar: db.prepare(`SELECT no FROM parcalar WHERE dosyaId = ? ORDER BY no`),
  parcaSay: db.prepare(`SELECT COUNT(*) AS n FROM parcalar WHERE dosyaId = ?`),
}

/** paket: çok sayıda küçük dosya (resim, ek klasör) tek dosyada — bitince açılır, bkz. paketiAc */
const TURLER = new Set(["veritabani", "resim", "eski", "program", "ek", "paket"])
const PAKET_HEDEFLERI = new Set(["resim", "ek"])
/** 8 MB — tarayıcı yerine .NET HttpClient; kopunca en fazla 8 MB tekrar gider. */
const PARCA_BOYUTU = 8 * 1024 * 1024

/** Oturumun staging klasöründe güvenli yol (dışarı çıkamaz). */
function stagingYolu(oturumId, tur, yol) {
  const temiz = String(yol ?? "").replace(/\\/g, "/").replace(/^\/+/, "")
  if (!temiz || temiz.length > 500 || temiz.split("/").some((p) => p === "" || p === "." || p === "..")) return null
  const n = normalize(temiz)
  if (n.startsWith("..") || n.startsWith("/") || /^[a-zA-Z]:/.test(n)) return null
  return join(STAGING_ROOT, oturumId, tur, n)
}

function dosyaSha256(yol) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256")
    createReadStream(yol).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject)
  })
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
    // Sunucuya taşıma (yuklendi → aktariliyor → tamamlandi | hata) — istemci ekranda gösterir
    asama: o.asama, ilerleme: o.ilerleme, hata: o.hata,
    // Hangi alanlar açık: hedef sunucu tanımlı değilse o tür dosya yüklenemez
    hedefler: hedefDurumu(o),
  }
}

function hedefleriOku(o) {
  try { return JSON.parse(o.hedefler || "{}") ?? {} } catch { return {} }
}
const hedefTamam = (h) => !!(h && h.ip && h.kullanici && h.sifre)
function hedefDurumu(o) {
  const h = hedefleriOku(o)
  return { sql: hedefTamam(h.sql), depo: hedefTamam(h.depo), rdp: hedefTamam(h.rdp) }
}

function kullanilabilir(o) {
  if (!o) return "Kod geçersiz."
  if (o.durum === "iptal") return "Bu aktarım iptal edilmiş."
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
  // Yüklenmiş dosyalar da gitsin (disk dolmasın — eski serviste yaşandı).
  if (/^[0-9a-f]{16}$/.test(req.params.id)) await rm(join(STAGING_ROOT, req.params.id), { recursive: true, force: true })
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
    return reply.code(426).send({ hata: "Uygulamanın yeni sürümü gerekli (en az " + MIN_SURUM + "). Güncel uygulamayı https://aktarim.pusulanet.net/v2/indir adresinden indirip tekrar açın.", minSurum: MIN_SURUM })
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

// ── Parça parça yükleme ──
// Parça gövdesi ham bayt; genel 10 MB sınırı yerine parça boyutu + pay.
fastify.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: PARCA_BOYUTU + 1024 },
  (req, govde, bitti) => bitti(null, govde))

/** Yükleme kabul edilir mi — aktarım başlamışsa dosya değişmesin. */
function yuklemeAcik(o, reply) {
  if (["yuklendi", "aktariliyor", "tamamlandi"].includes(o.durum)) {
    reply.code(409).send({ hata: "Aktarım başladı; yeni dosya yüklenemez." })
    return false
  }
  return true
}

fastify.get("/api/dosyalar", async (req, reply) => {
  const o = istemciOturumu(req, reply)
  if (!o) return
  return sql.dosyalar.all(o.id).map((d) => ({ ...d, meta: d.meta ? JSON.parse(d.meta) : null }))
})

fastify.post("/api/dosya", async (req, reply) => {
  const o = istemciOturumu(req, reply)
  if (!o || !yuklemeAcik(o, reply)) return
  const b = req.body ?? {}
  const tur = String(b.tur ?? "")
  const boyut = Number(b.boyut)
  const sha = String(b.sha256 ?? "").toLowerCase()
  if (!TURLER.has(tur)) return reply.code(400).send({ hata: "Geçersiz dosya türü" })
  if (!Number.isSafeInteger(boyut) || boyut < 0) return reply.code(400).send({ hata: "Geçersiz boyut" })
  if (!/^[0-9a-f]{64}$/.test(sha)) return reply.code(400).send({ hata: "Geçersiz SHA256" })
  const hedef = stagingYolu(o.id, tur, b.yol)
  if (!hedef) return reply.code(400).send({ hata: "Geçersiz dosya yolu" })
  const yol = String(b.yol).replace(/\\/g, "/")

  let d = sql.dosyaBul.get(o.id, tur, yol)
  // Aynı yolda farklı içerik (yedek yeniden alındı) → eskisini at, baştan.
  if (d && (d.boyut !== boyut || d.sha256 !== sha)) {
    sql.dosyaSil.run(d.id)
    d = null
  }
  if (!d) {
    const id = randomBytes(8).toString("hex")
    sql.dosyaEkle.run({
      id, oturumId: o.id, tur, yol, boyut, sha256: sha,
      parcaBoyutu: PARCA_BOYUTU, parcaSayisi: Math.max(1, Math.ceil(boyut / PARCA_BOYUTU)),
      meta: b.meta ? JSON.stringify(b.meta) : null,
    })
    await mkdir(dirname(hedef), { recursive: true })
    // Tam boyutta boş dosya — parçalar kendi konumlarına yazılır.
    const f = await open(hedef, "w")
    try { await f.truncate(boyut) } finally { await f.close() }
    d = sql.dosyaById.get(id, o.id)
    if (o.durum === "bagli" || o.durum === "bekliyor") sql.durum.run("yukleniyor", o.id)
  }
  return {
    id: d.id, durum: d.durum, parcaBoyutu: d.parcaBoyutu, parcaSayisi: d.parcaSayisi,
    alinan: d.durum === "tamam" ? [] : sql.parcalar.all(d.id).map((p) => p.no),
  }
})

fastify.put("/api/dosya/:id/parca/:no", async (req, reply) => {
  const o = istemciOturumu(req, reply)
  if (!o || !yuklemeAcik(o, reply)) return
  const d = sql.dosyaById.get(req.params.id, o.id)
  if (!d) return reply.code(404).send({ hata: "Dosya bulunamadı; yüklemeyi yeniden başlatın." })
  if (d.durum === "tamam") return { tamam: true }
  const no = Number(req.params.no)
  if (!Number.isInteger(no) || no < 0 || no >= d.parcaSayisi) return reply.code(400).send({ hata: "Geçersiz parça" })
  const govde = req.body
  if (!Buffer.isBuffer(govde)) return reply.code(400).send({ hata: "Parça boş (application/octet-stream bekleniyor)" })
  const beklenen = no === d.parcaSayisi - 1 ? d.boyut - no * d.parcaBoyutu : d.parcaBoyutu
  if (govde.length !== beklenen) return reply.code(400).send({ hata: `Parça boyutu yanlış (${govde.length} / ${beklenen})` })
  const sha = createHash("sha256").update(govde).digest("hex")
  if (sha !== String(req.headers["x-parca-sha256"] ?? "").toLowerCase()) {
    return reply.code(422).send({ hata: "Parça bozuk geldi (SHA256 tutmadı), yeniden gönderin." })
  }
  const hedef = stagingYolu(o.id, d.tur, d.yol)
  const f = await open(hedef, "r+")
  try { await f.write(govde, 0, govde.length, no * d.parcaBoyutu) } finally { await f.close() }
  sql.parcaEkle.run(d.id, no)
  return { tamam: true }
})

fastify.post("/api/dosya/:id/bitir", async (req, reply) => {
  const o = istemciOturumu(req, reply)
  if (!o) return
  const d = sql.dosyaById.get(req.params.id, o.id)
  if (!d) return reply.code(404).send({ hata: "Dosya bulunamadı" })
  if (d.durum === "tamam") return { tamam: true }
  const gelen = sql.parcaSay.get(d.id).n
  if (gelen !== d.parcaSayisi) return reply.code(409).send({ hata: `Eksik parça var (${gelen} / ${d.parcaSayisi})` })
  const sha = await dosyaSha256(stagingYolu(o.id, d.tur, d.yol))
  if (sha !== d.sha256) {
    // Parçalar tek tek doğruydu ama bütün tutmuyor → baştan (çok düşük olasılık).
    db.prepare("DELETE FROM parcalar WHERE dosyaId = ?").run(d.id)
    sql.dosyaDurum.run("hata", "hata", d.id)
    return reply.code(422).send({ hata: "Dosyanın bütünü doğrulanamadı; yeniden yüklenecek." })
  }
  if (d.tur === "paket") {
    try {
      const meta = d.meta ? JSON.parse(d.meta) : {}
      const sayi = await paketiAc(stagingYolu(o.id, d.tur, d.yol), o.id, meta)
      req.log.info({ oturum: o.id, paket: d.yol, dosya: sayi }, "paket acildi")
    } catch (err) {
      db.prepare("DELETE FROM parcalar WHERE dosyaId = ?").run(d.id)
      sql.dosyaDurum.run("hata", "hata", d.id)
      return reply.code(422).send({ hata: "Paket açılamadı, yeniden yüklenecek: " + (err?.message ?? err) })
    }
  }
  sql.dosyaDurum.run("tamam", "tamam", d.id)
  req.log.info({ oturum: o.id, firma: o.firmaId, dosya: d.yol, boyut: d.boyut }, "dosya tamam")
  return { tamam: true }
})

/**
 * Paket biçimi (istemci Paketleyici.cs): "PKT1" + uint32 LE başlık uzunluğu +
 * başlık JSON [{ y: göreli yol, b: bayt }] + dosyaların baytları art arda.
 * İçerik staging/{oturum}/{hedefTur}/{altKlasor}/{y} altına açılır, paket silinir.
 * Arşiv aracı (unzip) gerekmez; yol kaçışı her dosyada ayrıca denetlenir.
 */
async function paketiAc(paketYolu, oturumId, meta) {
  const hedefTur = String(meta?.hedefTur ?? "")
  if (!PAKET_HEDEFLERI.has(hedefTur)) throw new Error("Geçersiz paket hedefi")
  const alt = String(meta?.altKlasor ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
  const f = await open(paketYolu, "r")
  try {
    const bas = Buffer.alloc(8)
    await f.read(bas, 0, 8, 0)
    if (bas.toString("latin1", 0, 4) !== "PKT1") throw new Error("Paket imzası yok")
    const basUzunluk = bas.readUInt32LE(4)
    if (basUzunluk > 64 * 1024 * 1024) throw new Error("Paket başlığı çok büyük")
    const basJson = Buffer.alloc(basUzunluk)
    await f.read(basJson, 0, basUzunluk, 8)
    const liste = JSON.parse(basJson.toString("utf8"))
    let konum = 8 + basUzunluk
    const tampon = Buffer.alloc(1 << 20)
    for (const g of liste) {
      const rel = alt ? alt + "/" + g.y : g.y
      const hedef = stagingYolu(oturumId, hedefTur, rel)
      if (!hedef) throw new Error("Geçersiz yol: " + g.y)
      await mkdir(dirname(hedef), { recursive: true })
      const c = await open(hedef, "w")
      try {
        let kalan = Number(g.b)
        while (kalan > 0) {
          const n = Math.min(kalan, tampon.length)
          const { bytesRead } = await f.read(tampon, 0, n, konum)
          if (bytesRead !== n) throw new Error("Paket eksik")
          await c.write(tampon, 0, n)
          konum += n
          kalan -= n
        }
      } finally { await c.close() }
    }
    return liste.length
  } finally {
    await f.close()
    await rm(paketYolu, { force: true })
  }
}

/** İstemci tüm dosyaları yükledi. 3. aşamada burada geri yükleme (RESTORE) başlar. */
fastify.post("/api/tamamla", async (req, reply) => {
  const o = istemciOturumu(req, reply)
  if (!o) return
  const dosyalar = sql.dosyalar.all(o.id)
  if (dosyalar.length === 0) return reply.code(409).send({ hata: "Yüklenmiş dosya yok." })
  const eksik = dosyalar.filter((d) => d.durum !== "tamam").map((d) => d.yol)
  if (eksik.length) return reply.code(409).send({ hata: "Tamamlanmamış dosya var: " + eksik.join(", ") })
  if (!["aktariliyor", "tamamlandi"].includes(o.durum)) {
    sql.durum.run("yuklendi", o.id)
    aktarimiBaslat(o.id)
  }
  req.log.info({ oturum: o.id, firma: o.firmaId, dosya: dosyalar.length }, "yukleme tamamlandi")
  return { tamam: true }
})

/** Hub: taşıma hata verdiyse yeniden dene (yüklenen dosyalar staging'de duruyor). */
fastify.post("/admin/oturumlar/:id/yeniden", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const o = sql.byId.get(req.params.id)
  if (!o) return reply.code(404).send({ hata: "bulunamadi" })
  if (!["hata", "yuklendi"].includes(o.durum)) return reply.code(409).send({ hata: "Yalnız hata veren ya da bekleyen aktarım yeniden denenir." })
  aktarimiBaslat(o.id)
  return { tamam: true }
})

// ─────────────────────────────────────────────────
// SUNUCUYA TAŞIMA — geri yükleme YOK (sihirbazın işi). Dosyalar eski web
// aktarımıyla AYNI yerlere bırakılır ki sihirbaz aynı yerden bulsun:
//   veritabani → SQL   D$\SQLData\{firma}\aktarim
//   eski       → Depo  D$\Eski Datalar\{firma}   (aynı ad farklı boyut → "ad (2)")
//   resim      → Depo  Resimler\{firma}          (klasör ağacı korunur)
//   program    → RDP   C$\MUSTERI\{firma}\Aktarim\{Program}
//   ek         → RDP   C$\MUSTERI\{firma}\Aktarim\Ek Dosyalar
// ─────────────────────────────────────────────────

const suruyor = new Set()

function aktarimiBaslat(id) {
  if (suruyor.has(id)) return
  suruyor.add(id)
  aktar(id)
    .catch((err) => {
      fastify.log.error({ err: String(err?.message ?? err), oturum: id }, "tasima hatasi")
      sql.aktarimDurumu.run({ id, durum: "hata", asama: null, ilerleme: 0, hata: String(err?.message ?? err).slice(0, 500) })
    })
    .finally(() => suruyor.delete(id))
}

async function aktar(id) {
  const o = sql.byId.get(id)
  if (!o) return
  const h = hedefleriOku(o)
  const kok = join(STAGING_ROOT, id)
  const var_ = async (tur) => (await safeReadDir(join(kok, tur))).length > 0
  const adimlar = [
    { tur: "veritabani", hedef: h.sql,  pay: "D$",       yol: (m) => join(m, "SQLData", o.firmaId, "aktarim"), ad: "SQL sunucusu" },
    { tur: "eski",       hedef: h.depo, pay: "D$",       yol: (m) => join(m, "Eski Datalar", o.firmaId),        ad: "Depo sunucusu", eski: true },
    { tur: "resim",      hedef: h.depo, pay: "Resimler", yol: (m) => join(m, o.firmaId),                        ad: "Depo sunucusu" },
    { tur: "program",    hedef: h.rdp,  pay: "C$",       yol: (m) => join(m, "MUSTERI", o.firmaId, "Aktarim"),  ad: "terminal sunucusu" },
    { tur: "ek",         hedef: h.rdp,  pay: "C$",       yol: (m) => join(m, "MUSTERI", o.firmaId, "Aktarim", "Ek Dosyalar"), ad: "terminal sunucusu" },
  ]
  const yapilacak = []
  for (const a of adimlar) if (await var_(a.tur)) yapilacak.push(a)
  // Hedefi tanımsız tür varsa hiç başlamadan söyle — yarım taşıma olmasın.
  const eksik = yapilacak.filter((a) => !hedefTamam(a.hedef)).map((a) => a.ad)
  if (eksik.length) throw new Error("Hedef sunucu bilgisi eksik: " + [...new Set(eksik)].join(", ") + ". Hub'da oturumu yeniden oluşturun.")

  for (let i = 0; i < yapilacak.length; i++) {
    const a = yapilacak[i]
    sql.aktarimDurumu.run({ id, durum: "aktariliyor", asama: a.tur, ilerleme: Math.round((i / yapilacak.length) * 100), hata: null })
    const kaynak = join(kok, a.tur)
    if (a.tur === "program") await parametreleriGuncelle(o)
    await withCifsMount(a.hedef.ip, a.pay, a.hedef.kullanici, a.hedef.sifre, async (mnt) => {
      const dst = a.yol(mnt)
      await mkdir(dst, { recursive: true })
      if (a.eski) await cakisanlariYenidenAdlandir(kaynak, dst)
      await copyTreeRecursive(kaynak, dst)
    })
    if (a.eski) await desktopIniYaz(a.hedef.ip, a.hedef.kullanici, a.hedef.sifre, "Eski Datalar", o.firmaId, o.firmaAdi)
    fastify.log.info({ oturum: id, firma: o.firmaId, tur: a.tur }, "tasindi")
  }

  sql.aktarimDurumu.run({ id, durum: "tamamlandi", asama: null, ilerleme: 100, hata: null })
  // Dosyalar hedefte — staging boşalsın (disk dolmasın). Kayıtlar Hub'da görünmeye devam eder.
  try { await rm(kok, { recursive: true, force: true }) } catch (err) { fastify.log.warn({ err: String(err), oturum: id }, "staging silinemedi") }
}

/* Parametre dosyalarına DATA KODU = firma kodu (eski servis + sihirbazla aynı kural):
 *   Perakende (programCode 909): <DATAKODU> firmaId </DATAKODU> bloğu
 *   Diğerleri: [DATA KODU] firmaId satırı
 * [OPEN OFFICE] yazılmaz (2026-09-29). latin1 okuma/yazma: 1254 Türkçe baytlar
 * ve satır sonları korunur. İstemci param dosyalarını meta.param = true ile işaretler. */
function parametreMetni(metin, firmaId, perakende) {
  const nl = metin.includes("\r\n") ? "\r\n" : "\n"
  if (perakende) {
    const blok = "<DATAKODU>" + nl + firmaId + nl + "</DATAKODU>"
    const re = /<DATAKODU>[\s\S]*?<\/DATAKODU>/i
    return re.test(metin) ? metin.replace(re, blok) : metin.replace(/\s+$/, "") + nl + blok + nl
  }
  const sonNl = metin.endsWith(nl)
  let satirlar = metin.split(nl)
  if (sonNl) satirlar.pop()
  let var_ = false
  satirlar = satirlar.map((l) => (/^\[DATA KODU\]/.test(l) ? ((var_ = true), "[DATA KODU] " + firmaId) : l))
  if (!var_) satirlar.push("[DATA KODU] " + firmaId)
  return satirlar.join(nl) + nl
}

async function parametreleriGuncelle(o) {
  let programlar = []
  try { programlar = JSON.parse(o.programlar || "[]") } catch { /* yok */ }
  for (const d of sql.dosyalar.all(o.id).filter((x) => x.tur === "program")) {
    let meta = {}
    try { meta = d.meta ? JSON.parse(d.meta) : {} } catch { /* yok */ }
    if (!meta.param) continue
    const program = String(meta.program ?? d.yol.split("/")[0])
    const secenek = programlar.find((p) => p.name === program)
    const perakende = String(secenek?.programCode ?? "").trim() === "909" || program.toLocaleLowerCase("tr") === "perakende"
    const yol = stagingYolu(o.id, "program", d.yol)
    try {
      const eski = await readFile(yol, "latin1")
      await writeFile(yol, parametreMetni(eski, o.firmaId, perakende), "latin1")
    } catch (err) {
      fastify.log.warn({ err: String(err?.message ?? err), dosya: d.yol }, "parametre guncellenemedi (tasima surer)")
    }
  }
}

function execCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts })
    let stdout = "", stderr = ""
    p.stdout.on("data", (d) => (stdout += d.toString()))
    p.stderr.on("data", (d) => (stderr += d.toString()))
    p.on("error", reject)
    p.on("close", (code) => (code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`Exit ${code}: ${stderr || stdout || cmd}`))))
  })
}

async function safeReadDir(p) {
  try { return await readdir(p) } catch { return [] }
}

/** Eski servisteki copyTreeRecursive ile aynı: rsync (yalnız eksikler) + Windows'un geçici
 *  kilitlerine karşı 3 deneme (Defender taraması "Permission denied", 13.09.2026). */
async function copyTreeRecursive(srcDir, dstDir) {
  await mkdir(dstDir, { recursive: true })
  let rsyncVar = true
  try { await execCmd("sh", ["-c", "command -v rsync"]) } catch { rsyncVar = false }
  const dene = () => rsyncVar
    ? execCmd("rsync", ["-rt", "--no-perms", "--no-owner", "--no-group", srcDir + "/", dstDir + "/"])
    : execCmd("cp", ["-r", srcDir + "/.", dstDir])
  for (let i = 1; i <= 3; i++) {
    try { await dene(); return } catch (err) {
      if (i === 3) throw err
      fastify.log.warn({ err: String(err?.message ?? err), deneme: i }, "kopyalama hatasi - tekrar denenecek")
      await new Promise((r) => setTimeout(r, 5000 * i))
    }
  }
}

/** SMB bağlama. Parola komut satırına değil PASSWD ortam değişkenine (mount.cifs okur) —
 *  eski serviste -o password=… ile ps çıktısında kısa süre görünüyordu. */
async function withCifsMount(ip, share, username, password, fn) {
  const nokta = `/tmp/pusula-aktarim2-mnt-${randomBytes(6).toString("hex")}`
  await mkdir(nokta, { recursive: true })
  const env = { ...process.env, PASSWD: password }
  const secenek = (v) => `username=${username},vers=${v},uid=0,gid=0,file_mode=0664,dir_mode=0775`
  try {
    await execCmd("mount", ["-t", "cifs", `//${ip}/${share}`, nokta, "-o", secenek("3.0")], { env })
  } catch {
    try { await execCmd("mount", ["-t", "cifs", `//${ip}/${share}`, nokta, "-o", secenek("2.1")], { env }) }
    catch (err2) { await rm(nokta, { recursive: true, force: true }).catch(() => {}); throw new Error(`SMB bağlanamadı (//${ip}/${share}): ${err2.message}`) }
  }
  try { return await fn(nokta) } finally {
    try { await execCmd("umount", [nokta]) } catch { /* ignore */ }
    try { await rm(nokta, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

/** Eski yıl klasöründe aynı ad farklı boyut → gelen dosya "ad (2).uzantı" (eski servisle aynı kural). */
async function cakisanlariYenidenAdlandir(srcDir, dstDir) {
  for (const ad of await safeReadDir(srcDir)) {
    const kaynak = join(srcDir, ad)
    const boyut = (await stat(kaynak)).size
    let hedefBoyut = null
    try { hedefBoyut = (await stat(join(dstDir, ad))).size } catch { continue }
    if (hedefBoyut === boyut) continue
    const nokta = ad.lastIndexOf(".")
    const kokAd = nokta > 0 ? ad.slice(0, nokta) : ad
    const uzanti = nokta > 0 ? ad.slice(nokta) : ""
    for (let i = 2; i < 1000; i++) {
      const yeni = `${kokAd} (${i})${uzanti}`
      let v = null
      try { v = (await stat(join(dstDir, yeni))).size } catch { /* yok */ }
      if (v === null || v === boyut) { await rename(kaynak, join(srcDir, yeni)); break }
    }
  }
}

/** Klasörün üzerine gelince firma adı görünsün (eski servis + sihirbazla aynı). Hata taşımayı düşürmez. */
async function desktopIniYaz(ip, username, password, ustKlasor, klasorAdi, infoTip) {
  try { await execCmd("sh", ["-c", "command -v smbclient"]) } catch { return }
  const temiz = (x) => String(x).replace(/["\\/;]/g, "_")
  const tmp = join(STAGING_ROOT, `desktop-${randomBytes(6).toString("hex")}.ini`)
  const metin = "[.ShellClassInfo]\r\nInfoTip=" + String(infoTip ?? "").replace(/[\r\n]/g, " ") + "\r\n"
  await writeFile(tmp, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(metin, "utf16le")]))
  const klasor = `"${temiz(ustKlasor)}/${temiz(klasorAdi)}"`
  const smb = (komutlar) => execCmd("smbclient", [`//${ip}/D$`, "-U", username, "-c", komutlar.join("; ")],
    { env: { ...process.env, PASSWD: password } }).catch(() => null)
  try {
    await smb([`cd ${klasor}`, "setmode desktop.ini -rsh"])
    await smb([`cd ${klasor}`, `put "${tmp}" desktop.ini`, "setmode desktop.ini +sh", "cd ..", `setmode "${temiz(klasorAdi)}" +s`])
  } finally {
    await rm(tmp, { force: true }).catch(() => {})
  }
}

/** Müşteri uygulamasının indirilmesi — müşteri Hub kullanıcısı değil, bu adrese erişiyor.
 *  Yayınlamak: exe'yi ISTEMCI_EXE yoluna kopyala (varsayılan /opt/pusula-aktarim2/istemci/PusulaAktarim.exe). */
const ISTEMCI_EXE = process.env.ISTEMCI_EXE ?? join(__dirname, "istemci", "PusulaAktarim.exe")
fastify.get("/indir", async (req, reply) => {
  let st
  try { st = await stat(ISTEMCI_EXE) } catch { return reply.code(404).type("text/plain; charset=utf-8").send("Uygulama henüz yayınlanmadı.") }
  reply.header("Content-Type", "application/vnd.microsoft.portable-executable")
  reply.header("Content-Length", st.size)
  reply.header("Content-Disposition", "attachment; filename=\"PusulaAktarim.exe\"; filename*=UTF-8''" + encodeURIComponent("Pusula Aktarım.exe"))
  reply.header("Cache-Control", "no-store")
  return reply.send(createReadStream(ISTEMCI_EXE))
})

fastify.get("/saglik", async () => ({ tamam: true, surum: "aktarim2", minIstemci: MIN_SURUM }))

// Servis taşıma sürerken yeniden başladıysa o iş yarıda kaldı → Hub'dan "Yeniden dene".
db.prepare(`UPDATE oturumlar SET durum = 'hata', hata = 'Servis yeniden başladı, taşıma yarıda kaldı. Yeniden deneyin.'
            WHERE durum = 'aktariliyor'`).run()

await fastify.listen({ port: PORT, host: HOST })
fastify.log.info({ port: PORT, db: DB_PATH, staging: STAGING_ROOT }, "Pusula Aktarım 2 ayakta")
