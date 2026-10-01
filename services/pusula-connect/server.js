/**
 * Pusula Connect 2 — müşteri uygulamasının (apps/connect-istemci) servisi.
 * Konsept: docs/pusula-connect/KONSEPT.md
 *
 * Akış: Hub → admin API (X-Service-Key) kullanıcı için tek kullanımlık KURULUM KODU
 * üretir; profil (VPN, RDP hedefi, domain, FortiClient MSI adresi) kodla birlikte
 * burada saklanır. Müşteri uygulamayı açıp kodu girer → cihaz kaydolur, Bearer
 * token alır (uygulama DPAPI ile saklar). Profil sonradan Hub'dan değişirse
 * uygulama her açılışta güncelini çeker — yeni dosya göndermek gerekmez.
 *
 * Endpoint'ler
 *   Admin (X-Service-Key):
 *     POST   /admin/kodlar              { firmaId, firmaAdi, kullanici, profil, gunSayisi, olusturan } → { id, kod }
 *     GET    /admin/kodlar?firma=       kodlar + cihazlar
 *     POST   /admin/kodlar/:id/iptal    kod ve bağlı cihazlar iptal
 *     POST   /admin/cihazlar/:id/iptal  tek cihaz (kayıp PC)
 *   İstemci:
 *     POST   /api/kayit                 { kod, surum, makine } → { token, kayit }
 *     GET    /api/profil                (Bearer) güncel profil; sonGorulme yazılır
 *     GET    /api/surum                 { son, min } — kendini güncelleme
 *     GET    /indir                     uygulama exe
 */

import Fastify from "fastify"
import Database from "better-sqlite3"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { stat, readFile } from "fs/promises"
import { createReadStream } from "fs"
import { randomBytes, createHash, timingSafeEqual } from "crypto"

const __dirname = dirname(fileURLToPath(import.meta.url))

const SERVICE_KEY = process.env.TRANSFER_SERVICE_KEY ?? ""
const DB_PATH     = process.env.DB_PATH ?? join(__dirname, "connect.db")
const PORT        = parseInt(process.env.PORT ?? "5200", 10)
const HOST        = process.env.HOST ?? "127.0.0.1"
const MIN_SURUM   = process.env.MIN_ISTEMCI_SURUM ?? "0.1.0"
/** Yayındaki exe ve sürümü — istemci kendini buna göre günceller. */
const ISTEMCI_EXE = process.env.ISTEMCI_EXE ?? join(__dirname, "istemci", "PusulaConnect.exe")
const SON_SURUM_DOSYASI = process.env.SON_SURUM_DOSYASI ?? join(__dirname, "istemci", "surum.txt")

if (!SERVICE_KEY) {
  console.error("TRANSFER_SERVICE_KEY env değişkeni tanımlı değil")
  process.exit(1)
}

const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")
db.exec(`
  CREATE TABLE IF NOT EXISTS kodlar (
    id         TEXT PRIMARY KEY,
    kodOzet    TEXT NOT NULL UNIQUE,     -- sha256(kod); kodun kendisi saklanmaz
    firmaId    TEXT NOT NULL,
    firmaAdi   TEXT NOT NULL,
    kullanici  TEXT NOT NULL,
    profil     TEXT NOT NULL,            -- JSON { vpn, tunel, rdp, rdpPort, domain, msiurl, msiurlArm }
    durum      TEXT NOT NULL DEFAULT 'bekliyor',   -- bekliyor | kullanildi | iptal
    olusturan  TEXT,
    olusturma  TEXT NOT NULL DEFAULT (datetime('now')),
    bitis      TEXT NOT NULL             -- kodun kullanılabileceği son an
  );
  CREATE TABLE IF NOT EXISTS cihazlar (
    id          TEXT PRIMARY KEY,
    kodId       TEXT NOT NULL REFERENCES kodlar(id) ON DELETE CASCADE,
    tokenOzet   TEXT NOT NULL UNIQUE,
    makine      TEXT,
    surum       TEXT,
    ilkGiris    TEXT NOT NULL DEFAULT (datetime('now')),
    sonGorulme  TEXT,
    iptal       INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_kodlar_firma ON kodlar(firmaId);
  CREATE INDEX IF NOT EXISTS idx_cihazlar_kod ON cihazlar(kodId);
`)

const sql = {
  kodEkle: db.prepare(`INSERT INTO kodlar (id, kodOzet, firmaId, firmaAdi, kullanici, profil, olusturan, bitis)
                       VALUES (@id, @kodOzet, @firmaId, @firmaAdi, @kullanici, @profil, @olusturan, @bitis)`),
  kodByOzet: db.prepare(`SELECT * FROM kodlar WHERE kodOzet = ?`),
  kodDurum: db.prepare(`UPDATE kodlar SET durum = ? WHERE id = ?`),
  kodlar: db.prepare(`SELECT id, firmaId, firmaAdi, kullanici, durum, olusturan, olusturma, bitis FROM kodlar
                      WHERE (@firma IS NULL OR firmaId = @firma) ORDER BY olusturma DESC LIMIT 500`),
  cihazlarByKod: db.prepare(`SELECT id, makine, surum, ilkGiris, sonGorulme, iptal FROM cihazlar WHERE kodId = ? ORDER BY ilkGiris`),
  cihazEkle: db.prepare(`INSERT INTO cihazlar (id, kodId, tokenOzet, makine, surum) VALUES (?, ?, ?, ?, ?)`),
  cihazByToken: db.prepare(`SELECT c.id AS cihazId, c.iptal, k.* FROM cihazlar c JOIN kodlar k ON k.id = c.kodId WHERE c.tokenOzet = ?`),
  cihazGorundu: db.prepare(`UPDATE cihazlar SET sonGorulme = datetime('now'), surum = ? WHERE id = ?`),
  cihazIptal: db.prepare(`UPDATE cihazlar SET iptal = 1 WHERE id = ?`),
  kodCihazlariIptal: db.prepare(`UPDATE cihazlar SET iptal = 1 WHERE kodId = ?`),
}

// ── yardımcılar (Aktarım 2 servisiyle aynı kurallar) ──
const ozet = (s) => createHash("sha256").update(String(s)).digest("hex")
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
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}
function anahtarDogru(v) {
  const a = Buffer.from(String(v ?? "")), b = Buffer.from(SERVICE_KEY)
  return a.length === b.length && timingSafeEqual(a, b)
}
const simdiUtc = () => new Date().toISOString().replace("T", " ").slice(0, 19)

/** İstemciye giden görünüm — profil + kimlik, başka bir şey yok. */
function kayitGorunumu(k) {
  let profil = {}
  try { profil = JSON.parse(k.profil) } catch { /* bozuk */ }
  return { firmaId: k.firmaId, firmaAdi: k.firmaAdi, kullanici: k.kullanici, profil }
}

const fastify = Fastify({ logger: { level: "info" }, bodyLimit: 1024 * 1024 })

function yonetici(req, reply) {
  if (!anahtarDogru(req.headers["x-service-key"])) { reply.code(401).send({ hata: "yetkisiz" }); return false }
  return true
}

// ── Admin ──
fastify.post("/admin/kodlar", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const b = req.body ?? {}
  if (!b.firmaId || !b.firmaAdi || !b.kullanici || !b.profil?.rdp) {
    return reply.code(400).send({ hata: "firmaId, firmaAdi, kullanici ve profil.rdp gerekli" })
  }
  const gun = Math.max(1, Math.min(30, Number(b.gunSayisi) || 7))
  const id = randomBytes(8).toString("hex")
  for (let deneme = 0; deneme < 5; deneme++) {
    const kod = yeniKod()
    try {
      sql.kodEkle.run({
        id, kodOzet: ozet(kod), firmaId: String(b.firmaId), firmaAdi: String(b.firmaAdi),
        kullanici: String(b.kullanici), profil: JSON.stringify(b.profil), olusturan: b.olusturan ?? null,
        bitis: new Date(Date.now() + gun * 86400000).toISOString().replace("T", " ").slice(0, 19),
      })
      return { id, kod }
    } catch (e) {
      if (!/UNIQUE/.test(String(e?.message))) throw e
    }
  }
  return reply.code(500).send({ hata: "Kod üretilemedi" })
})

fastify.get("/admin/kodlar", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const firma = req.query?.firma ? String(req.query.firma) : null
  return sql.kodlar.all({ firma }).map((k) => ({ ...k, cihazlar: sql.cihazlarByKod.all(k.id) }))
})

fastify.post("/admin/kodlar/:id/iptal", async (req, reply) => {
  if (!yonetici(req, reply)) return
  sql.kodDurum.run("iptal", req.params.id)
  sql.kodCihazlariIptal.run(req.params.id)
  return { tamam: true }
})

fastify.post("/admin/cihazlar/:id/iptal", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const r = sql.cihazIptal.run(req.params.id)
  if (!r.changes) return reply.code(404).send({ hata: "bulunamadi" })
  return { tamam: true }
})

// ── İstemci ──
const hatali = new Map()
const engelli = (ip) => {
  const k = hatali.get(ip)
  if (!k) return false
  if (Date.now() - k.ilk > 15 * 60000) { hatali.delete(ip); return false }
  return k.adet >= 10
}
const hataSay = (ip) => {
  const k = hatali.get(ip)
  if (!k || Date.now() - k.ilk > 15 * 60000) hatali.set(ip, { ilk: Date.now(), adet: 1 })
  else k.adet++
}

fastify.post("/api/kayit", async (req, reply) => {
  const ip = String(req.headers["x-real-ip"] ?? req.ip)
  if (engelli(ip)) return reply.code(429).send({ hata: "Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin." })
  const b = req.body ?? {}
  const surum = String(b.surum ?? "0.0.0")
  if (surumKarsilastir(surum, MIN_SURUM) < 0) {
    return reply.code(426).send({ hata: "Uygulamanın yeni sürümü gerekli. https://aktarim.pusulanet.net/connect/indir adresinden indirin.", minSurum: MIN_SURUM })
  }
  const k = sql.kodByOzet.get(ozet(kodNormal(b.kod)))
  if (!k) { hataSay(ip); return reply.code(401).send({ hata: "Kod geçersiz." }) }
  if (k.durum === "iptal") return reply.code(410).send({ hata: "Bu kod iptal edilmiş. Pusula'dan yeni kod isteyin." })
  if (k.durum === "kullanildi") return reply.code(410).send({ hata: "Bu kod daha önce kullanılmış. Her kurulum için yeni kod gerekir." })
  if (k.bitis < simdiUtc()) return reply.code(410).send({ hata: "Kodun süresi dolmuş. Pusula'dan yeni kod isteyin." })
  hatali.delete(ip)

  const token = randomBytes(32).toString("base64url")
  const tx = db.transaction(() => {
    sql.cihazEkle.run(randomBytes(8).toString("hex"), k.id, ozet(token), String(b.makine ?? "").slice(0, 100), surum.slice(0, 20))
    sql.kodDurum.run("kullanildi", k.id)   // tek kullanımlık
  })
  tx()
  req.log.info({ firma: k.firmaId, kullanici: k.kullanici, makine: b.makine, surum }, "connect kayit")
  return { token, kayit: kayitGorunumu(k) }
})

fastify.get("/api/profil", async (req, reply) => {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")
  const c = m ? sql.cihazByToken.get(ozet(m[1].trim())) : null
  if (!c) return reply.code(401).send({ hata: "Cihaz kaydı bulunamadı. Kurulum koduyla yeniden kaydolun." })
  if (c.iptal || c.durum === "iptal") return reply.code(410).send({ hata: "Bu cihazın kaydı Pusula tarafından kapatılmış." })
  sql.cihazGorundu.run(String(req.headers["x-surum"] ?? "").slice(0, 20) || null, c.cihazId)
  return kayitGorunumu(c)
})

/** Yayındaki sürüm: exe ile birlikte istemci/surum.txt'ye yazılır (yayınlama adımı). */
fastify.get("/api/surum", async () => {
  let son = null
  try { son = (await readFile(SON_SURUM_DOSYASI, "utf8")).trim() || null } catch { /* yayın yok */ }
  return { son, min: MIN_SURUM }
})

fastify.get("/indir", async (req, reply) => {
  let st
  try { st = await stat(ISTEMCI_EXE) } catch { return reply.code(404).type("text/plain; charset=utf-8").send("Uygulama henüz yayınlanmadı.") }
  reply.header("Content-Type", "application/vnd.microsoft.portable-executable")
  reply.header("Content-Length", st.size)
  reply.header("Content-Disposition", "attachment; filename=\"PusulaConnect.exe\"; filename*=UTF-8''" + encodeURIComponent("Pusula Connect.exe"))
  reply.header("Cache-Control", "no-store")
  return reply.send(createReadStream(ISTEMCI_EXE))
})

fastify.get("/saglik", async () => ({ tamam: true, servis: "pusula-connect", minIstemci: MIN_SURUM }))

await fastify.listen({ port: PORT, host: HOST })
