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
import { mkdir, open, rm } from "fs/promises"
import { createReadStream } from "fs"
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

const TURLER = new Set(["veritabani", "resim", "eski", "program", "ek"])
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

// ── Parça parça yükleme ──
// Parça gövdesi ham bayt; genel 10 MB sınırı yerine parça boyutu + pay.
fastify.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: PARCA_BOYUTU + 1024 },
  (req, govde, bitti) => bitti(null, govde))

/** Yükleme kabul edilir mi — aktarım başlamışsa dosya değişmesin. */
function yuklemeAcik(o, reply) {
  if (["aktariliyor", "tamamlandi"].includes(o.durum)) {
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
  sql.dosyaDurum.run("tamam", "tamam", d.id)
  req.log.info({ oturum: o.id, firma: o.firmaId, dosya: d.yol, boyut: d.boyut }, "dosya tamam")
  return { tamam: true }
})

/** İstemci tüm dosyaları yükledi. 3. aşamada burada geri yükleme (RESTORE) başlar. */
fastify.post("/api/tamamla", async (req, reply) => {
  const o = istemciOturumu(req, reply)
  if (!o) return
  const dosyalar = sql.dosyalar.all(o.id)
  if (dosyalar.length === 0) return reply.code(409).send({ hata: "Yüklenmiş dosya yok." })
  const eksik = dosyalar.filter((d) => d.durum !== "tamam").map((d) => d.yol)
  if (eksik.length) return reply.code(409).send({ hata: "Tamamlanmamış dosya var: " + eksik.join(", ") })
  if (!["aktariliyor", "tamamlandi"].includes(o.durum)) sql.durum.run("yuklendi", o.id)
  req.log.info({ oturum: o.id, firma: o.firmaId, dosya: dosyalar.length }, "yukleme tamamlandi")
  return { tamam: true }
})

fastify.get("/saglik", async () => ({ tamam: true, surum: "aktarim2", minIstemci: MIN_SURUM }))

await fastify.listen({ port: PORT, host: HOST })
fastify.log.info({ port: PORT, db: DB_PATH, staging: STAGING_ROOT }, "Pusula Aktarım 2 ayakta")
