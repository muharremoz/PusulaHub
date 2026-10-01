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
 *   İki adımlı doğrulama (cihaz başına, isteğe bağlı — kullanıcı uygulamadan açar):
 *     POST   /api/2fa/baslat            (Bearer) yeni TOTP gizlisi → { gizli, uri } (henüz etkin değil)
 *     POST   /api/2fa/onayla  { kod }   gizli doğrulanır, etkinleşir → { kasaAnahtari }
 *     POST   /api/2fa/dogrula { kod }   her bağlanmada → { kasaAnahtari } (RDP şifresi bununla çözülür)
 *     POST   /api/2fa/kapat   { kod }   → { kasaAnahtari } (istemci şifreyi kasaya geri yazar), kapanır
 *     POST   /admin/cihazlar/:id/2fa-sifirla   Pusula sıfırlar (telefon kayboldu)
 *   Kasa anahtarı: istemci RDP şifresini bu anahtarla (DPAPI ek entropisi) saklar; kod olmadan çözülemez.
 *     GET    /api/surum                 { son, min, sha256, boyut, notlar } — kendini güncelleme
 *     GET    /indir                     uygulama exe
 */

import Fastify from "fastify"
import Database from "better-sqlite3"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { stat, readFile } from "fs/promises"
import { createReadStream } from "fs"
import { randomBytes, createHash, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from "crypto"

const __dirname = dirname(fileURLToPath(import.meta.url))

const SERVICE_KEY = process.env.TRANSFER_SERVICE_KEY ?? ""
const DB_PATH     = process.env.DB_PATH ?? join(__dirname, "connect.db")
const PORT        = parseInt(process.env.PORT ?? "5200", 10)
const HOST        = process.env.HOST ?? "127.0.0.1"
const MIN_SURUM   = process.env.MIN_ISTEMCI_SURUM ?? "0.1.0"
/** Yayındaki exe ve sürümü — istemci kendini buna göre günceller. */
const ISTEMCI_EXE = process.env.ISTEMCI_EXE ?? join(__dirname, "istemci", "PusulaConnect.exe")
const SON_SURUM_DOSYASI = process.env.SON_SURUM_DOSYASI ?? join(__dirname, "istemci", "surum.txt")
/** İsteğe bağlı: güncelleme penceresinde gösterilen "bu sürümde neler var" (düz metin, satır başına bir madde). */
const NOTLAR_DOSYASI = process.env.NOTLAR_DOSYASI ?? join(__dirname, "istemci", "notlar.txt")

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
for (const [ad, tip] of [
  ["totpGizli", "TEXT"],          // şifreli (AES-256-GCM, anahtar SERVICE_KEY'den)
  ["totpAktif", "INTEGER NOT NULL DEFAULT 0"],
  ["totpSonAdim", "INTEGER"],     // son kabul edilen 30 sn adımı — aynı kod ikinci kez geçmez
  ["totpHata", "INTEGER NOT NULL DEFAULT 0"],
  ["totpKilit", "TEXT"],          // bu ana kadar kod denenemez
  ["kasaAnahtari", "TEXT"],       // şifreli; RDP şifresini çözen anahtar
]) {
  try { db.exec(`ALTER TABLE cihazlar ADD COLUMN ${ad} ${tip}`) } catch { /* zaten var */ }
}

const sql = {
  kodEkle: db.prepare(`INSERT INTO kodlar (id, kodOzet, firmaId, firmaAdi, kullanici, profil, olusturan, bitis)
                       VALUES (@id, @kodOzet, @firmaId, @firmaAdi, @kullanici, @profil, @olusturan, @bitis)`),
  kodByOzet: db.prepare(`SELECT * FROM kodlar WHERE kodOzet = ?`),
  kodDurum: db.prepare(`UPDATE kodlar SET durum = ? WHERE id = ?`),
  kodlar: db.prepare(`SELECT id, firmaId, firmaAdi, kullanici, durum, olusturan, olusturma, bitis FROM kodlar
                      WHERE (@firma IS NULL OR firmaId = @firma) ORDER BY olusturma DESC LIMIT 500`),
  cihazlarByKod: db.prepare(`SELECT id, makine, surum, ilkGiris, sonGorulme, iptal, totpAktif FROM cihazlar WHERE kodId = ? ORDER BY ilkGiris`),
  cihazEkle: db.prepare(`INSERT INTO cihazlar (id, kodId, tokenOzet, makine, surum) VALUES (?, ?, ?, ?, ?)`),
  cihazByToken: db.prepare(`SELECT c.id AS cihazId, c.iptal, c.totpGizli, c.totpAktif, c.totpSonAdim, c.totpHata, c.totpKilit, c.kasaAnahtari, k.*
                            FROM cihazlar c JOIN kodlar k ON k.id = c.kodId WHERE c.tokenOzet = ?`),
  totpBaslat: db.prepare(`UPDATE cihazlar SET totpGizli = ?, totpAktif = 0, totpSonAdim = NULL, totpHata = 0, totpKilit = NULL, kasaAnahtari = NULL WHERE id = ?`),
  totpEtkin: db.prepare(`UPDATE cihazlar SET totpAktif = 1, kasaAnahtari = ?, totpSonAdim = ?, totpHata = 0, totpKilit = NULL WHERE id = ?`),
  totpBasari: db.prepare(`UPDATE cihazlar SET totpSonAdim = ?, totpHata = 0, totpKilit = NULL WHERE id = ?`),
  totpHata: db.prepare(`UPDATE cihazlar SET totpHata = ?, totpKilit = ? WHERE id = ?`),
  totpSifirla: db.prepare(`UPDATE cihazlar SET totpGizli = NULL, totpAktif = 0, totpSonAdim = NULL, totpHata = 0, totpKilit = NULL, kasaAnahtari = NULL WHERE id = ?`),
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

/** İstemciye giden görünüm — profil + kimlik (+ cihazın 2FA durumu), başka bir şey yok. */
function kayitGorunumu(k) {
  let profil = {}
  try { profil = JSON.parse(k.profil) } catch { /* bozuk */ }
  return { firmaId: k.firmaId, firmaAdi: k.firmaAdi, kullanici: k.kullanici, profil, ikiAdim: { aktif: !!k.totpAktif } }
}

// ── İki adımlı doğrulama (RFC 6238 TOTP, SHA-1, 6 hane, 30 sn) ──
const SIFRE_ANAHTARI = createHash("sha256").update("pusula-connect-2fa:" + SERVICE_KEY).digest()
function sifrele(metin) {
  const iv = randomBytes(12)
  const c = createCipheriv("aes-256-gcm", SIFRE_ANAHTARI, iv)
  const v = Buffer.concat([c.update(metin, "utf8"), c.final()])
  return [iv, c.getAuthTag(), v].map((x) => x.toString("base64")).join(".")
}
function coz(paket) {
  const [iv, tag, v] = String(paket).split(".").map((x) => Buffer.from(x, "base64"))
  const d = createDecipheriv("aes-256-gcm", SIFRE_ANAHTARI, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(v), d.final()]).toString("utf8")
}
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
function base32(buf) {
  let bit = 0, deger = 0, cikti = ""
  for (const b of buf) {
    deger = (deger << 8) | b; bit += 8
    while (bit >= 5) { cikti += B32[(deger >>> (bit - 5)) & 31]; bit -= 5 }
  }
  if (bit > 0) cikti += B32[(deger << (5 - bit)) & 31]
  return cikti
}
function base32Coz(metin) {
  let bit = 0, deger = 0
  const cikti = []
  for (const ch of metin.replace(/=+$/, "").toUpperCase()) {
    const i = B32.indexOf(ch)
    if (i < 0) continue
    deger = (deger << 5) | i; bit += 5
    if (bit >= 8) { cikti.push((deger >>> (bit - 8)) & 255); bit -= 8 }
  }
  return Buffer.from(cikti)
}
function totp(gizli, adim) {
  const sayac = Buffer.alloc(8)
  sayac.writeBigUInt64BE(BigInt(adim))
  const h = createHmac("sha1", gizli).update(sayac).digest()
  const o = h[h.length - 1] & 15
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0")
}
/** Kodu ±1 adım (±30 sn saat kayması) içinde arar; bulunan adımı döner, yoksa null. Daha önce kullanılan adım geçmez. */
function totpDogrula(gizliB32, kod, sonAdim) {
  const k = String(kod ?? "").replace(/\D/g, "")
  if (k.length !== 6) return null
  const gizli = base32Coz(gizliB32)
  const simdi = Math.floor(Date.now() / 30000)
  for (const d of [0, -1, 1]) {
    const adim = simdi + d
    if (sonAdim != null && adim <= sonAdim) continue
    const a = Buffer.from(totp(gizli, adim)), b = Buffer.from(k)
    if (timingSafeEqual(a, b)) return adim
  }
  return null
}
const TOTP_HATA_SINIRI = 5
const TOTP_KILIT_DK = 10

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

/** Telefon kayboldu vb.: 2FA kapanır, kayıtlı şifreli RDP şifresi de artık çözülemez (kullanıcı yeniden girer). */
fastify.post("/admin/cihazlar/:id/2fa-sifirla", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const r = sql.totpSifirla.run(req.params.id)
  if (!r.changes) return reply.code(404).send({ hata: "bulunamadi" })
  req.log.info({ cihaz: req.params.id }, "2fa sifirlandi (yonetici)")
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

/** Bearer token → cihaz satırı; yoksa yanıtı yazar ve null döner. */
function cihaz(req, reply) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")
  const c = m ? sql.cihazByToken.get(ozet(m[1].trim())) : null
  if (!c) { reply.code(401).send({ hata: "Cihaz kaydı bulunamadı. Kurulum koduyla yeniden kaydolun." }); return null }
  if (c.iptal || c.durum === "iptal") { reply.code(410).send({ hata: "Bu cihazın kaydı Pusula tarafından kapatılmış." }); return null }
  return c
}

/** Kod denetimi: kilit, ±1 adım, tekrar kullanım, hata sayacı. Başarıda kabul edilen adımı döner; değilse yanıtı yazar, null döner. */
function koduDenetle(c, kod, gizliB32, reply) {
  if (c.totpKilit && c.totpKilit > simdiUtc()) {
    reply.code(429).send({ hata: "Çok fazla hatalı kod. Birkaç dakika sonra tekrar deneyin." })
    return null
  }
  const adim = totpDogrula(gizliB32, kod, c.totpSonAdim)
  if (adim == null) {
    const hata = (c.totpHata ?? 0) + 1
    const kilit = hata >= TOTP_HATA_SINIRI
      ? new Date(Date.now() + TOTP_KILIT_DK * 60000).toISOString().replace("T", " ").slice(0, 19)
      : null
    sql.totpHata.run(kilit ? 0 : hata, kilit, c.cihazId)
    reply.code(400).send({ hata: kilit ? `Çok fazla hatalı kod. ${TOTP_KILIT_DK} dakika sonra tekrar deneyin.` : "Kod hatalı ya da süresi geçmiş." })
    return null
  }
  return adim
}

fastify.post("/api/2fa/baslat", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  if (c.totpAktif) return reply.code(409).send({ hata: "İki adımlı doğrulama zaten açık." })
  const gizli = base32(randomBytes(20))
  sql.totpBaslat.run(sifrele(gizli), c.cihazId)
  const etiket = encodeURIComponent("Pusula Connect:" + c.kullanici)
  const uri = `otpauth://totp/${etiket}?secret=${gizli}&issuer=${encodeURIComponent("Pusula Connect")}&algorithm=SHA1&digits=6&period=30`
  req.log.info({ firma: c.firmaId, kullanici: c.kullanici }, "2fa baslat")
  return { gizli, uri }
})

fastify.post("/api/2fa/onayla", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  if (c.totpAktif) return reply.code(409).send({ hata: "İki adımlı doğrulama zaten açık." })
  if (!c.totpGizli) return reply.code(400).send({ hata: "Önce kurulumu başlatın." })
  const adim = koduDenetle(c, req.body?.kod, coz(c.totpGizli), reply); if (adim == null) return
  const kasa = randomBytes(32).toString("base64")
  sql.totpEtkin.run(sifrele(kasa), adim, c.cihazId)
  req.log.info({ firma: c.firmaId, kullanici: c.kullanici }, "2fa etkin")
  return { kasaAnahtari: kasa }
})

fastify.post("/api/2fa/dogrula", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  if (!c.totpAktif || !c.totpGizli || !c.kasaAnahtari) return reply.code(409).send({ hata: "İki adımlı doğrulama kapalı." })
  const adim = koduDenetle(c, req.body?.kod, coz(c.totpGizli), reply); if (adim == null) return
  sql.totpBasari.run(adim, c.cihazId)
  return { kasaAnahtari: coz(c.kasaAnahtari) }
})

fastify.post("/api/2fa/kapat", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  if (!c.totpAktif || !c.totpGizli) return reply.code(409).send({ hata: "İki adımlı doğrulama zaten kapalı." })
  const adim = koduDenetle(c, req.body?.kod, coz(c.totpGizli), reply); if (adim == null) return
  const kasa = c.kasaAnahtari ? coz(c.kasaAnahtari) : null
  sql.totpSifirla.run(c.cihazId)
  req.log.info({ firma: c.firmaId, kullanici: c.kullanici }, "2fa kapatildi")
  return { kasaAnahtari: kasa }
})

fastify.get("/api/profil", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  sql.cihazGorundu.run(String(req.headers["x-surum"] ?? "").slice(0, 20) || null, c.cihazId)
  return kayitGorunumu(c)
})

/**
 * Yayındaki exe'nin SHA-256'sı: istemci indirdiğini bununla doğrular (yarım/bozuk/değiştirilmiş dosya
 * kurulmaz). Exe değişince (boyut/zaman) yeniden hesaplanır.
 */
let exeOzeti = null // { anahtar, sha256, boyut }
async function yayinOzeti() {
  const st = await stat(ISTEMCI_EXE)
  const anahtar = st.size + ":" + st.mtimeMs
  if (exeOzeti?.anahtar === anahtar) return exeOzeti
  const h = createHash("sha256")
  await new Promise((tamam, hata) => createReadStream(ISTEMCI_EXE).on("data", (p) => h.update(p)).on("end", tamam).on("error", hata))
  exeOzeti = { anahtar, sha256: h.digest("hex"), boyut: st.size }
  return exeOzeti
}

/** Yayındaki sürüm: exe ile birlikte istemci/surum.txt'ye yazılır (yayınlama adımı). */
fastify.get("/api/surum", async () => {
  let son = null, notlar = null, ozet = null
  try { son = (await readFile(SON_SURUM_DOSYASI, "utf8")).trim() || null } catch { /* yayın yok */ }
  try { notlar = (await readFile(NOTLAR_DOSYASI, "utf8")).trim() || null } catch { /* not yok */ }
  if (son) { try { ozet = await yayinOzeti() } catch { son = null /* exe yoksa yayın da yok */ } }
  return { son, min: MIN_SURUM, sha256: ozet?.sha256 ?? null, boyut: ozet?.boyut ?? null, notlar }
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
