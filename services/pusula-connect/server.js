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
 *     POST   /admin/cihazlar/:id/kilit-kaldir  çok hatalı kod kilidini kaldır
 *     POST   /admin/cihazlar/:id/etkinlestir   iptal edilen cihazı geri aç
 *     GET    /admin/cihazlar?firma=     tüm cihazlar + canlı durum (nabız) — Hub izleme merkezi
 *     GET    /admin/olaylar?firma=&cihaz=&limit=&once=   olay kaydı (yeniden eskiye)
 *   İstemci (Bearer token):
 *     POST   /api/nabiz                 { oturum, terminal, ayarlar, ... } — ~60 sn'de bir canlı durum
 *                                        (yanıt: duyuru imzası + profilImza → istemci değişince profili tazeler)
 *     POST   /api/sifre  { kod? }       kullanıcının Hub'daki güncel şifresi (2FA açıksa kod şart); saklanmaz
 *   Profil Hub'dan (HUB_URL /api/hub/connect/profil) güncel alınır: firmanın sunucusu değişince yansır.
 *     POST   /api/olay                  { tur, ayrinti } — oturum açıldı/bitti, güncellendi…
 *     GET    /api/duyurular             bu cihaza yayındaki duyurular (+ okundu zamanı)
 *     POST   /api/duyurular/:id/okundu  kullanıcı okudu
 *     (nabız yanıtı { duyuru: { imza, okunmamis } } — imza değişince istemci listeyi yeniden çeker)
 *   Duyurular (Hub → müşteri; X-Service-Key):
 *     POST   /admin/duyurular           { baslik, metin, onem, firmaId?, firmaAdi?, kullanici?, gunSayisi?, olusturan }
 *     GET    /admin/duyurular           hedef cihaz + okuyan sayısıyla
 *     GET    /admin/duyurular/:id/okuyanlar   hedefteki cihazlar, okuduysa zamanı
 *     POST   /admin/duyurular/:id/iptal       yayından kaldır { yapan }
 *   Kasa anahtarı: istemci RDP şifresini bu anahtarla (DPAPI ek entropisi) saklar; kod olmadan çözülemez.
 *     GET    /api/surum                 { son, min, sha256, boyut, imza, notlar } — kendini güncelleme (imza: exe'nin RSA imzası)
 *     GET    /indir                     uygulama exe
 *     GET    /api/yedekler              (Bearer) firmanın veritabanları + son tam/fark yedek zamanı (Hub'dan, 5 dk önbellek)
 */

import Fastify from "fastify"
import Database from "better-sqlite3"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { stat, readFile } from "fs/promises"
import { createReadStream } from "fs"
import { randomBytes, createHash, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from "crypto"

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * CONNECT_SERVICE_KEY: Hub ile bu servis arasındaki anahtar (Hub'ın /admin/* çağrıları ve bizim Hub'a
 * sorduğumuz /api/hub/connect/*). Aktarım servisiyle ORTAK OLMASIN diye ayrı (03.10.2026 güvenlik
 * gözden geçirmesi): Aktarım'ın anahtarı sızsa Connect üzerinden şifre çekilemesin. Boşsa eski ortak
 * anahtara (TRANSFER_SERVICE_KEY) düşer — geçiş için.
 * CONNECT_KASA_ANAHTARI: DB'deki TOTP gizlisi ve kasa anahtarlarının şifreleme tuzu. DEĞİŞTİRİLEMEZ —
 * değişirse mevcut 2FA kayıtları çözülemez. Boşsa TRANSFER_SERVICE_KEY (ilk sürümdeki davranış).
 */
const SERVICE_KEY = process.env.CONNECT_SERVICE_KEY || process.env.TRANSFER_SERVICE_KEY || ""
const KASA_TUZU   = process.env.CONNECT_KASA_ANAHTARI || process.env.TRANSFER_SERVICE_KEY || SERVICE_KEY
const DB_PATH     = process.env.DB_PATH ?? join(__dirname, "connect.db")
const PORT        = parseInt(process.env.PORT ?? "5200", 10)
const HOST        = process.env.HOST ?? "127.0.0.1"
const MIN_SURUM   = process.env.MIN_ISTEMCI_SURUM ?? "0.1.0"
/** Hub: güncel profil (sunucu değişince) + kullanıcı şifresi (Hub'dan sıfırlanınca) buradan alınır. */
const HUB_URL     = (process.env.HUB_URL ?? "https://hub.pusulanet.net").replace(/\/+$/, "")
/** Yayındaki exe ve sürümü — istemci kendini buna göre günceller. */
const ISTEMCI_EXE = process.env.ISTEMCI_EXE ?? join(__dirname, "istemci", "PusulaConnect.exe")
const SON_SURUM_DOSYASI = process.env.SON_SURUM_DOSYASI ?? join(__dirname, "istemci", "surum.txt")
/** İsteğe bağlı: güncelleme penceresinde gösterilen "bu sürümde neler var" (düz metin, satır başına bir madde). */
const NOTLAR_DOSYASI = process.env.NOTLAR_DOSYASI ?? join(__dirname, "istemci", "notlar.txt")
/** Exe'nin imzası (RSA-3072 / SHA-256, base64) — yayınlama betiği çevrimdışı anahtarla üretir; istemci gömülü açık anahtarla doğrular. */
const IMZA_DOSYASI = process.env.IMZA_DOSYASI ?? join(__dirname, "istemci", "PusulaConnect.exe.sig")
/**
 * Pusula X sayım paketi: PusulaX klasörünün kopyası + boş RFID.xml (sayım modu). İstemci Ayarlar > Sayım'dan
 * indirir, C:\Pusula\PusulaXSayım'a açar, server.xml/lic.xml'i Hub'dan gelen bilgiyle yazar.
 * Yanında .sha256 (hex) ve .surum.txt (Pusula X sürümü) durur — yayınlama: scripts/connect-sayim-paketi.sh
 */
const SAYIM_PAKET = process.env.SAYIM_PAKET ?? join(__dirname, "istemci", "PusulaXSayim.zip")
/** Eski program (Pusula.exe) sayım paketi — aynı düzen: .zip + .zip.sha256 + .surum.txt */
const SAYIM_ESKI_PAKET = process.env.SAYIM_ESKI_PAKET ?? join(__dirname, "istemci", "PusulaEskiSayim.zip")
const sayimPaketYolu = (tur) => (tur === "eski" ? SAYIM_ESKI_PAKET : SAYIM_PAKET)

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
  // canlı durum (istemcinin nabzı)
  ["sonNabiz", "TEXT"],
  ["oturumAcik", "INTEGER NOT NULL DEFAULT 0"],
  ["oturumBaslangic", "TEXT"],
  ["terminalErisim", "INTEGER"],
  ["terminalMs", "INTEGER"],
  ["ip", "TEXT"],
  ["durumJson", "TEXT"],          // { os, forti, vpnProfil, sifreKayitli, ayarlar, dnsYok, sayim, sayimEski } — yalnız gösterim
  // token döndürme: nabızda TOKEN_OMRU_GUN'den eski token yenilenir; eskisi TOKEN_GECIS_DK boyunca da geçer
  ["tokenZaman", "TEXT"],
  ["eskiTokenOzet", "TEXT"],
  ["eskiTokenZaman", "TEXT"],
]) {
  try { db.exec(`ALTER TABLE cihazlar ADD COLUMN ${ad} ${tip}`) } catch { /* zaten var */ }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS olaylar (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    zaman     TEXT NOT NULL DEFAULT (datetime('now')),
    cihazId   TEXT,
    firmaId   TEXT,
    kullanici TEXT,
    makine    TEXT,
    tur       TEXT NOT NULL,
    ayrinti   TEXT,
    kaynak    TEXT NOT NULL DEFAULT 'servis',   -- servis | istemci | yonetici
    ip        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_olaylar_zaman ON olaylar(zaman);
  CREATE INDEX IF NOT EXISTS idx_olaylar_firma ON olaylar(firmaId, zaman);
  CREATE INDEX IF NOT EXISTS idx_olaylar_cihaz ON olaylar(cihazId, zaman);
`)
// Duyurular: Hub'dan müşterilere mesaj. firmaId NULL = herkes, kullanici NULL = firmanın tümü.
db.exec(`
  CREATE TABLE IF NOT EXISTS duyurular (
    id         TEXT PRIMARY KEY,
    baslik     TEXT NOT NULL,
    metin      TEXT NOT NULL,
    onem       TEXT NOT NULL DEFAULT 'bilgi',   -- bilgi | uyari | kritik
    firmaId    TEXT,
    firmaAdi   TEXT,
    kullanici  TEXT,
    olusturan  TEXT,
    olusturma  TEXT NOT NULL DEFAULT (datetime('now')),
    bitis      TEXT,                            -- NULL = süresiz
    iptal      INTEGER NOT NULL DEFAULT 0,
    iptalEden  TEXT,
    iptalZaman TEXT
  );
  CREATE TABLE IF NOT EXISTS duyuru_okuma (
    duyuruId TEXT NOT NULL REFERENCES duyurular(id) ON DELETE CASCADE,
    cihazId  TEXT NOT NULL,
    zaman    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (duyuruId, cihazId)
  );
`)
const DUYURU_ONEM = new Set(["bilgi", "uyari", "kritik"])
/** Duyurunun hedefi bu cihaz mı (SQL'de aynı koşul: DUYURU_HEDEF). */
const DUYURU_HEDEF = `(d.firmaId IS NULL OR d.firmaId = k.firmaId) AND (d.kullanici IS NULL OR d.kullanici = k.kullanici)`
const DUYURU_YAYINDA = `d.iptal = 0 AND (d.bitis IS NULL OR d.bitis > datetime('now'))`

/** Olay kaydı 180 gün tutulur. */
const OLAY_GUN = 180
const olayTemizle = () => db.prepare(`DELETE FROM olaylar WHERE zaman < datetime('now', ?)`).run(`-${OLAY_GUN} days`)
olayTemizle()
setInterval(olayTemizle, 24 * 3600 * 1000).unref()

const sql = {
  kodEkle: db.prepare(`INSERT INTO kodlar (id, kodOzet, firmaId, firmaAdi, kullanici, profil, olusturan, bitis)
                       VALUES (@id, @kodOzet, @firmaId, @firmaAdi, @kullanici, @profil, @olusturan, @bitis)`),
  kodByOzet: db.prepare(`SELECT * FROM kodlar WHERE kodOzet = ?`),
  kodDurum: db.prepare(`UPDATE kodlar SET durum = ? WHERE id = ?`),
  kodlar: db.prepare(`SELECT id, firmaId, firmaAdi, kullanici, durum, olusturan, olusturma, bitis FROM kodlar
                      WHERE (@firma IS NULL OR firmaId = @firma) ORDER BY olusturma DESC LIMIT 500`),
  cihazlarByKod: db.prepare(`SELECT id, makine, surum, ilkGiris, sonGorulme, iptal, totpAktif FROM cihazlar WHERE kodId = ? ORDER BY ilkGiris`),
  cihazEkle: db.prepare(`INSERT INTO cihazlar (id, kodId, tokenOzet, makine, surum, tokenZaman) VALUES (?, ?, ?, ?, ?, datetime('now'))`),
  tokenYenile: db.prepare(`UPDATE cihazlar SET eskiTokenOzet = tokenOzet, eskiTokenZaman = datetime('now'), tokenOzet = ?, tokenZaman = datetime('now') WHERE id = ?`),
  cihazByToken: db.prepare(`SELECT c.id AS cihazId, c.makine, c.oturumAcik, c.iptal, c.totpGizli, c.totpAktif, c.totpSonAdim, c.totpHata, c.totpKilit, c.kasaAnahtari,
                                   c.tokenZaman, (c.tokenOzet = @ozet) AS guncelToken, k.*
                            FROM cihazlar c JOIN kodlar k ON k.id = c.kodId
                            WHERE c.tokenOzet = @ozet OR (c.eskiTokenOzet = @ozet AND c.eskiTokenZaman > @esik)`),
  totpBaslat: db.prepare(`UPDATE cihazlar SET totpGizli = ?, totpAktif = 0, totpSonAdim = NULL, totpHata = 0, totpKilit = NULL, kasaAnahtari = NULL WHERE id = ?`),
  totpEtkin: db.prepare(`UPDATE cihazlar SET totpAktif = 1, kasaAnahtari = ?, totpSonAdim = ?, totpHata = 0, totpKilit = NULL WHERE id = ?`),
  totpBasari: db.prepare(`UPDATE cihazlar SET totpSonAdim = ?, totpHata = 0, totpKilit = NULL WHERE id = ?`),
  totpHata: db.prepare(`UPDATE cihazlar SET totpHata = ?, totpKilit = ? WHERE id = ?`),
  totpSifirla: db.prepare(`UPDATE cihazlar SET totpGizli = NULL, totpAktif = 0, totpSonAdim = NULL, totpHata = 0, totpKilit = NULL, kasaAnahtari = NULL WHERE id = ?`),
  cihazGorundu: db.prepare(`UPDATE cihazlar SET sonGorulme = datetime('now'), surum = ? WHERE id = ?`),
  cihazIptal: db.prepare(`UPDATE cihazlar SET iptal = 1 WHERE id = ?`),
  kodCihazlariIptal: db.prepare(`UPDATE cihazlar SET iptal = 1 WHERE kodId = ?`),
  cihazEtkin: db.prepare(`UPDATE cihazlar SET iptal = 0 WHERE id = ?`),
  kilitKaldir: db.prepare(`UPDATE cihazlar SET totpHata = 0, totpKilit = NULL WHERE id = ?`),
  nabiz: db.prepare(`UPDATE cihazlar SET sonNabiz = datetime('now'), sonGorulme = datetime('now'), surum = @surum,
                      oturumAcik = @oturumAcik,
                      oturumBaslangic = CASE WHEN @oturumAcik = 1 THEN COALESCE(oturumBaslangic, datetime('now')) ELSE NULL END,
                      terminalErisim = @terminalErisim, terminalMs = @terminalMs, ip = @ip, durumJson = @durumJson
                    WHERE id = @id`),
  tumCihazlar: db.prepare(`SELECT c.id, c.kodId, c.makine, c.surum, c.ilkGiris, c.sonGorulme, c.iptal, c.totpAktif, c.totpHata, c.totpKilit,
                             c.sonNabiz, c.oturumAcik, c.oturumBaslangic, c.terminalErisim, c.terminalMs, c.ip, c.durumJson,
                             k.firmaId, k.firmaAdi, k.kullanici, k.durum AS kodDurum, k.olusturan, k.profil
                           FROM cihazlar c JOIN kodlar k ON k.id = c.kodId
                           WHERE (@firma IS NULL OR k.firmaId = @firma)
                           ORDER BY COALESCE(c.sonGorulme, c.ilkGiris) DESC LIMIT 2000`),
  cihazBilgi: db.prepare(`SELECT c.id, c.makine, k.firmaId, k.kullanici FROM cihazlar c JOIN kodlar k ON k.id = c.kodId WHERE c.id = ?`),
  kodBilgi: db.prepare(`SELECT id, firmaId, kullanici FROM kodlar WHERE id = ?`),
  olayEkle: db.prepare(`INSERT INTO olaylar (cihazId, firmaId, kullanici, makine, tur, ayrinti, kaynak, ip)
                        VALUES (@cihazId, @firmaId, @kullanici, @makine, @tur, @ayrinti, @kaynak, @ip)`),
  olaylar: db.prepare(`SELECT id, zaman, cihazId, firmaId, kullanici, makine, tur, ayrinti, kaynak, ip FROM olaylar
                       WHERE (@firma IS NULL OR firmaId = @firma) AND (@cihaz IS NULL OR cihazId = @cihaz)
                         AND (@once IS NULL OR id < @once)
                       ORDER BY id DESC LIMIT @limit`),
  duyuruEkle: db.prepare(`INSERT INTO duyurular (id, baslik, metin, onem, firmaId, firmaAdi, kullanici, olusturan, bitis)
                          VALUES (@id, @baslik, @metin, @onem, @firmaId, @firmaAdi, @kullanici, @olusturan, @bitis)`),
  duyuruIptal: db.prepare(`UPDATE duyurular SET iptal = 1, iptalEden = ?, iptalZaman = datetime('now') WHERE id = ? AND iptal = 0`),
  duyuruBul: db.prepare(`SELECT * FROM duyurular WHERE id = ?`),
  // Hub listesi: hedefteki etkin cihaz sayısı ve okuyan cihaz sayısıyla
  duyurularAdmin: db.prepare(`SELECT d.*,
      (SELECT COUNT(*) FROM cihazlar c JOIN kodlar k ON k.id = c.kodId
        WHERE c.iptal = 0 AND k.durum <> 'iptal' AND ${DUYURU_HEDEF}) AS hedefCihaz,
      (SELECT COUNT(*) FROM duyuru_okuma o WHERE o.duyuruId = d.id) AS okuyan
    FROM duyurular d ORDER BY d.olusturma DESC LIMIT 500`),
  duyuruOkuyanlar: db.prepare(`SELECT c.id AS cihazId, c.makine, k.firmaId, k.firmaAdi, k.kullanici, o.zaman AS okundu
    FROM duyurular d
    JOIN cihazlar c ON c.iptal = 0
    JOIN kodlar k ON k.id = c.kodId AND k.durum <> 'iptal' AND ${DUYURU_HEDEF}
    LEFT JOIN duyuru_okuma o ON o.duyuruId = d.id AND o.cihazId = c.id
    WHERE d.id = ? ORDER BY o.zaman IS NULL, o.zaman DESC, k.firmaId, k.kullanici`),
  // İstemci: bu cihaza yayındaki duyurular (son 30 gün içinde yayınlananlar ya da süresi sürenler)
  duyurularCihaz: db.prepare(`SELECT d.id, d.baslik, d.metin, d.onem, d.olusturma, d.bitis, o.zaman AS okundu
    FROM duyurular d JOIN kodlar k ON k.id = @kodId
    LEFT JOIN duyuru_okuma o ON o.duyuruId = d.id AND o.cihazId = @cihazId
    WHERE ${DUYURU_YAYINDA} AND ${DUYURU_HEDEF} AND (d.bitis IS NOT NULL OR d.olusturma > datetime('now', '-30 days'))
    ORDER BY d.olusturma DESC LIMIT 50`),
  kodProfil: db.prepare(`UPDATE kodlar SET profil = ? WHERE id = ?`),
  duyuruOku: db.prepare(`INSERT OR IGNORE INTO duyuru_okuma (duyuruId, cihazId) VALUES (?, ?)`),
}

/** Nabız yanıtındaki imza: yayındaki duyuru kümesi ya da okunma durumu değişince değişir → istemci listeyi yeniden çeker. */
function duyuruImzasi(c) {
  const l = sql.duyurularCihaz.all({ kodId: c.id, cihazId: c.cihazId })
  return { imza: ozet(l.map((d) => d.id + (d.okundu ? "+" : "")).join(",")).slice(0, 16), okunmamis: l.filter((d) => !d.okundu).length }
}

/** Olay kaydı — hata yutulur (kayıt yazılamadı diye asıl iş bozulmasın). */
function olay(tur, { cihaz = null, firmaId = null, kullanici = null, makine = null, ayrinti = null, kaynak = "servis", ip = null } = {}) {
  try {
    sql.olayEkle.run({
      cihazId: cihaz?.cihazId ?? cihaz?.id ?? null,
      firmaId: cihaz?.firmaId ?? firmaId,
      kullanici: cihaz?.kullanici ?? kullanici,
      makine: cihaz?.makine ?? makine,
      tur,
      ayrinti: ayrinti == null ? null : (typeof ayrinti === "string" ? ayrinti : JSON.stringify(ayrinti)).slice(0, 1000),
      kaynak,
      ip,
    })
  } catch (e) { fastify?.log?.warn?.({ err: e.message, tur }, "olay yazilamadi") }
}
/** nginx arkasında gerçek istemci adresi */
const istemciIp = (req) => String(req.headers["x-real-ip"] ?? req.headers["x-forwarded-for"] ?? req.ip ?? "").split(",")[0].trim().slice(0, 64) || null

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

/**
 * İstemciye giden görünüm — profil + kimlik (+ cihazın 2FA durumu), başka bir şey yok.
 * hub: Hub'dan gelen güncel profil (varsa saklı profilin yerine geçer) + şifre sürümü.
 * profilImza: profil ya da şifre sürümü değişince değişir — nabız yanıtında da gider, istemci farkı görüp tazeler.
 */
function kayitGorunumu(k, hub = null) {
  let profil = {}
  try { profil = JSON.parse(k.profil) } catch { /* bozuk */ }
  if (hub?.profil) profil = { ...profil, ...hub.profil }
  const sifreSurumu = hub?.sifreSurumu ?? null
  return {
    firmaId: k.firmaId, firmaAdi: k.firmaAdi, kullanici: k.kullanici, profil, ikiAdim: { aktif: !!k.totpAktif },
    sifreSurumu, profilImza: ozet(JSON.stringify(profil) + "|" + (sifreSurumu ?? "")).slice(0, 16),
    // Sayım modu: SQL bilgisi değişince istemci server.xml'i yeniler (profilImza'ya KATILMAZ — VPN ayarı yeniden yazılmasın)
    sayimImza: hub?.sayimImza ?? null,
  }
}

// ── Hub'dan güncel profil + şifre ──
// Hub'da firmanın sunucusu değişince ya da kullanıcının şifresi sıfırlanınca uygulama bunu nabızla fark eder.
// Önbellek kullanıcı başına 2 dk (nabız ~60 sn'de bir gelir; Hub'ı her nabızda sormayalım).
// Hub'a ulaşılamazsa saklı profille devam (null).
const HUB_ONBELLEK_MS = 2 * 60_000
const hubOnbellek = new Map() // "firma|kullanici" → { t, veri }
async function hubProfil(k) {
  const anahtar = k.firmaId + "|" + k.kullanici.toLowerCase()
  const o = hubOnbellek.get(anahtar)
  if (o && Date.now() - o.t < HUB_ONBELLEK_MS) return o.veri
  try {
    const r = await fetch(`${HUB_URL}/api/hub/connect/profil?firma=${encodeURIComponent(k.firmaId)}&kullanici=${encodeURIComponent(k.kullanici)}`,
      { headers: { "X-Service-Key": SERVICE_KEY }, signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error("Hub HTTP " + r.status)
    const veri = await r.json()
    hubOnbellek.set(anahtar, { t: Date.now(), veri })
    // Saklı profil de güncellensin: Hub'a sonradan ulaşılamazsa son bilinen doğru olsun
    if (veri?.profil) {
      let eski = {}
      try { eski = JSON.parse(k.profil) } catch { /* bozuk */ }
      const yeni = JSON.stringify({ ...eski, ...veri.profil })
      if (yeni !== k.profil) {
        sql.kodProfil.run(yeni, k.id)
        olay("profil_guncellendi", { firmaId: k.firmaId, kullanici: k.kullanici, kaynak: "servis", ayrinti: { onceki: eski.rdp ?? null, yeni: veri.profil.rdp ?? null } })
      }
    }
    return veri
  } catch (e) {
    fastify.log.warn({ err: e.message, firma: k.firmaId }, "hub profil alinamadi")
    if (o) return o.veri
    hubOnbellek.set(anahtar, { t: Date.now() - HUB_ONBELLEK_MS + 30_000, veri: null }) // 30 sn sonra tekrar dene
    return null
  }
}
async function hubSifre(k) {
  const r = await fetch(`${HUB_URL}/api/hub/connect/sifre`, {
    method: "POST", headers: { "X-Service-Key": SERVICE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ firma: k.firmaId, kullanici: k.kullanici }), signal: AbortSignal.timeout(8000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.sifre) throw Object.assign(new Error(j.error ?? `Hub HTTP ${r.status}`), { durum: r.status === 404 ? 404 : 502 })
  return j
}

/** Sayım modu için server.xml bilgisi (SQL dış adresi, firmanın SQL login'i, resim adresi) — Hub'dan, saklanmaz. */
async function hubSayim(k) {
  const r = await fetch(`${HUB_URL}/api/hub/connect/sayim`, {
    method: "POST", headers: { "X-Service-Key": SERVICE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ firma: k.firmaId, kullanici: k.kullanici }), signal: AbortSignal.timeout(10000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.sunucu) throw Object.assign(new Error(j.error ?? `Hub HTTP ${r.status}`), { durum: r.status >= 400 && r.status < 500 ? r.status : 502 })
  return j
}

// ── İki adımlı doğrulama (RFC 6238 TOTP, SHA-1, 6 hane, 30 sn) ──
const SIFRE_ANAHTARI = createHash("sha256").update("pusula-connect-2fa:" + KASA_TUZU).digest()
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
/** Token döndürme: çalınan bir tokenın ömrü en çok bu kadar (+ geçiş süresi). */
const TOKEN_OMRU_GUN = 7
const TOKEN_GECIS_DK = 15

var fastify = Fastify({ logger: { level: "info" }, bodyLimit: 1024 * 1024 })

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
      olay("kod_olusturuldu", { firmaId: String(b.firmaId), kullanici: String(b.kullanici), kaynak: "yonetici", ayrinti: (b.olusturan ? b.olusturan + " · " : "") + gun + " gün geçerli" })
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
  const k = sql.kodBilgi.get(req.params.id)
  olay("kod_iptal", { firmaId: k?.firmaId, kullanici: k?.kullanici, kaynak: "yonetici", ayrinti: req.body?.yapan ?? null })
  return { tamam: true }
})

/** Telefon kayboldu vb.: 2FA kapanır, kayıtlı şifreli RDP şifresi de artık çözülemez (kullanıcı yeniden girer). */
fastify.post("/admin/cihazlar/:id/2fa-sifirla", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const r = sql.totpSifirla.run(req.params.id)
  if (!r.changes) return reply.code(404).send({ hata: "bulunamadi" })
  req.log.info({ cihaz: req.params.id }, "2fa sifirlandi (yonetici)")
  olay("2fa_sifirlandi", { cihaz: sql.cihazBilgi.get(req.params.id), kaynak: "yonetici", ayrinti: req.body?.yapan ?? null })
  return { tamam: true }
})

fastify.post("/admin/cihazlar/:id/kilit-kaldir", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const r = sql.kilitKaldir.run(req.params.id)
  if (!r.changes) return reply.code(404).send({ hata: "bulunamadi" })
  olay("2fa_kilit_kaldirildi", { cihaz: sql.cihazBilgi.get(req.params.id), kaynak: "yonetici", ayrinti: req.body?.yapan ?? null })
  return { tamam: true }
})

fastify.post("/admin/cihazlar/:id/etkinlestir", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const r = sql.cihazEtkin.run(req.params.id)
  if (!r.changes) return reply.code(404).send({ hata: "bulunamadi" })
  olay("cihaz_etkinlestirildi", { cihaz: sql.cihazBilgi.get(req.params.id), kaynak: "yonetici", ayrinti: req.body?.yapan ?? null })
  return { tamam: true }
})

fastify.get("/admin/cihazlar", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const firma = req.query?.firma ? String(req.query.firma) : null
  return sql.tumCihazlar.all({ firma }).map(({ profil, durumJson, ...c }) => {
    let p = {}, d = null
    try { p = JSON.parse(profil) } catch { /* bozuk */ }
    try { d = durumJson ? JSON.parse(durumJson) : null } catch { /* bozuk */ }
    return { ...c, iptal: !!c.iptal, totpAktif: !!c.totpAktif, oturumAcik: !!c.oturumAcik, terminalErisim: c.terminalErisim == null ? null : !!c.terminalErisim,
      rdp: p.rdp ?? null, tunel: p.tunel ?? null, durum: d }
  })
})

fastify.get("/admin/olaylar", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const q = req.query ?? {}
  const limit = Math.min(Math.max(parseInt(q.limit ?? "200", 10) || 200, 1), 1000)
  return sql.olaylar.all({ firma: q.firma ? String(q.firma) : null, cihaz: q.cihaz ? String(q.cihaz) : null, once: q.once ? parseInt(q.once, 10) : null, limit })
})

// ── Duyurular (Hub → müşteri uygulaması) ──
fastify.post("/admin/duyurular", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const b = req.body ?? {}
  const baslik = String(b.baslik ?? "").trim().slice(0, 120)
  const metin = String(b.metin ?? "").trim().slice(0, 4000)
  if (!baslik || !metin) return reply.code(400).send({ hata: "Başlık ve metin gerekli" })
  const onem = DUYURU_ONEM.has(b.onem) ? b.onem : "bilgi"
  const firmaId = b.firmaId ? String(b.firmaId) : null
  const kullanici = firmaId && b.kullanici ? String(b.kullanici) : null
  const gun = Number(b.gunSayisi)
  const bitis = Number.isFinite(gun) && gun > 0 ? new Date(Date.now() + Math.min(gun, 365) * 86400000).toISOString().replace("T", " ").slice(0, 19) : null
  const id = randomBytes(8).toString("hex")
  sql.duyuruEkle.run({ id, baslik, metin, onem, firmaId, firmaAdi: firmaId ? String(b.firmaAdi ?? "") || null : null, kullanici, olusturan: b.olusturan ?? null, bitis })
  olay("duyuru_yayinlandi", { firmaId, kullanici, kaynak: "yonetici", ayrinti: (b.olusturan ? b.olusturan + " · " : "") + baslik })
  return { id }
})

fastify.get("/admin/duyurular", async (req, reply) => {
  if (!yonetici(req, reply)) return
  return sql.duyurularAdmin.all().map((d) => ({ ...d, iptal: !!d.iptal }))
})

fastify.get("/admin/duyurular/:id/okuyanlar", async (req, reply) => {
  if (!yonetici(req, reply)) return
  if (!sql.duyuruBul.get(req.params.id)) return reply.code(404).send({ hata: "bulunamadi" })
  return sql.duyuruOkuyanlar.all(req.params.id)
})

fastify.post("/admin/duyurular/:id/iptal", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const d = sql.duyuruBul.get(req.params.id)
  if (!d) return reply.code(404).send({ hata: "bulunamadi" })
  sql.duyuruIptal.run(req.body?.yapan ?? null, req.params.id)
  olay("duyuru_kaldirildi", { firmaId: d.firmaId, kullanici: d.kullanici, kaynak: "yonetici", ayrinti: (req.body?.yapan ? req.body.yapan + " · " : "") + d.baslik })
  return { tamam: true }
})

fastify.post("/admin/cihazlar/:id/iptal", async (req, reply) => {
  if (!yonetici(req, reply)) return
  const r = sql.cihazIptal.run(req.params.id)
  if (!r.changes) return reply.code(404).send({ hata: "bulunamadi" })
  olay("cihaz_iptal", { cihaz: sql.cihazBilgi.get(req.params.id), kaynak: "yonetici", ayrinti: req.body?.yapan ?? null })
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
  olay("kayit", { firmaId: k.firmaId, kullanici: k.kullanici, makine: String(b.makine ?? "").slice(0, 100), ayrinti: "sürüm " + surum, ip: istemciIp(req) })
  return { token, kayit: kayitGorunumu(k) }
})

/** Bearer token → cihaz satırı; yoksa yanıtı yazar ve null döner. */
function cihaz(req, reply) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")
  const esik = new Date(Date.now() - TOKEN_GECIS_DK * 60000).toISOString().replace("T", " ").slice(0, 19)
  const c = m ? sql.cihazByToken.get({ ozet: ozet(m[1].trim()), esik }) : null
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
    olay(kilit ? "2fa_kilitlendi" : "2fa_hatali_kod", { cihaz: c, kaynak: "istemci", ayrinti: kilit ? `${TOTP_HATA_SINIRI} hatalı kod, ${TOTP_KILIT_DK} dk kilit` : `${hata}. hatalı deneme` })
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
  olay("2fa_acildi", { cihaz: c, kaynak: "istemci", ip: istemciIp(req) })
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
  olay("2fa_kapatildi", { cihaz: c, kaynak: "istemci", ip: istemciIp(req) })
  return { kasaAnahtari: kasa }
})

fastify.get("/api/profil", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  sql.cihazGorundu.run(String(req.headers["x-surum"] ?? "").slice(0, 20) || null, c.cihazId)
  return kayitGorunumu(c, await hubProfil(c))
})

/**
 * Kullanıcının Hub'daki güncel şifresi — Hub'dan şifre sıfırlanınca uygulama kendisi alır.
 * 2FA açıksa kod şart (kasa anahtarı da döner, istemci şifreyi kasaya yazar); kapalıysa cihaz token'ı yeter.
 * Şifre burada SAKLANMAZ, yalnız Hub'dan alınıp iletilir.
 */
fastify.post("/api/sifre", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  let kasa = null
  if (c.totpAktif) {
    if (!c.totpGizli || !c.kasaAnahtari) return reply.code(409).send({ hata: "İki adımlı doğrulama bozuk; Pusula'dan sıfırlatın." })
    const adim = koduDenetle(c, req.body?.kod, coz(c.totpGizli), reply); if (adim == null) return
    sql.totpBasari.run(adim, c.cihazId)
    kasa = coz(c.kasaAnahtari)
  }
  try {
    const j = await hubSifre(c)
    olay("sifre_iletildi", { cihaz: c, kaynak: "servis", ip: istemciIp(req), ayrinti: c.totpAktif ? "2FA ile" : null })
    return { sifre: j.sifre, sifreSurumu: j.sifreSurumu ?? null, kasaAnahtari: kasa }
  } catch (e) {
    return reply.code(e.durum ?? 502).send({ hata: e.durum === 404 ? "Şifreniz Pusula'da kayıtlı değil; elle girin." : "Şifre Pusula'dan alınamadı: " + e.message })
  }
})

/** Canlı durum: istemci ~60 sn'de bir (ve oturum açılıp kapanınca hemen) gönderir. */
fastify.post("/api/nabiz", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  const b = req.body ?? {}
  const t = b.terminal ?? {}
  const durum = { os: b.os ?? null, forti: b.forti ?? null, vpnProfil: b.vpnProfil ?? null, sifreKayitli: b.sifreKayitli ?? null, ayarlar: b.ayarlar ?? null, dnsYok: b.dnsYok ?? null, sayim: b.sayim ?? null, sayimEski: b.sayimEski ?? null }
  sql.nabiz.run({
    id: c.cihazId,
    surum: String(req.headers["x-surum"] ?? "").slice(0, 20) || null,
    oturumAcik: b.oturum ? 1 : 0,
    terminalErisim: typeof t.erisim === "boolean" ? (t.erisim ? 1 : 0) : null,
    terminalMs: Number.isFinite(t.ms) ? Math.round(t.ms) : null,
    ip: istemciIp(req),
    durumJson: JSON.stringify(durum).slice(0, 4000),
  })
  const g = kayitGorunumu(c, await hubProfil(c))
  const yanit = { tamam: true, duyuru: duyuruImzasi(c), profilImza: g.profilImza, sayimImza: g.sayimImza }
  // Token döndürme: güncel tokenla gelen ve süresi dolmuş cihaza yeni token. Eski token TOKEN_GECIS_DK daha geçer
  // (istemci kaydedene kadar). Eski tokenla gelen isteğe (geçiş süresinde) yeniden üretilmez — tek sefer.
  const sinir = new Date(Date.now() - TOKEN_OMRU_GUN * 86400000).toISOString().replace("T", " ").slice(0, 19)
  // Yalnız yeniToken'ı tanıyan istemciler (0.3.7+): eski istemci yanıtı yok sayar, 15 dk sonra kaydı düşerdi.
  const istemciSurum = String(req.headers["x-surum"] ?? "0.0.0")
  if (c.guncelToken && surumKarsilastir(istemciSurum, "0.3.7") >= 0 && (!c.tokenZaman || c.tokenZaman < sinir)) {
    const yeni = randomBytes(32).toString("base64url")
    sql.tokenYenile.run(ozet(yeni), c.cihazId)
    olay("token_yenilendi", { cihaz: c, kaynak: "servis", ayrinti: c.tokenZaman ? "önceki " + c.tokenZaman : "ilk döndürme" })
    yanit.yeniToken = yeni
  }
  return yanit
})

fastify.get("/api/duyurular", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  return sql.duyurularCihaz.all({ kodId: c.id, cihazId: c.cihazId })
})

fastify.post("/api/duyurular/:id/okundu", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  // Yalnız bu cihaza yayınlanmış bir duyuru okunabilir
  const d = sql.duyurularCihaz.all({ kodId: c.id, cihazId: c.cihazId }).find((x) => x.id === req.params.id)
  if (!d) return reply.code(404).send({ hata: "Duyuru bulunamadı" })
  sql.duyuruOku.run(d.id, c.cihazId)
  return { tamam: true }
})

/** İstemcinin bildirdiği olaylar (yalnız bilinen türler). */
const ISTEMCI_OLAYLARI = new Set(["sayim_kurulum_baslatildi", "sayim_bilgisi_guncellendi", "vpn_baglan_tetiklendi", "dns_cozulemedi", "oturum_acildi", "oturum_bitti", "oturum_hatasi", "guncellendi", "vpn_kuruldu", "vpn_kurulum_hatasi",
  "sifre_kaydedildi", "sifre_silindi", "sifre_gecersiz", "sifre_guncellendi", "sifre_gosterildi", "kayit_kaldirildi", "ayar_degisti", "uygulama_acildi"])
fastify.post("/api/olay", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  const tur = String(req.body?.tur ?? "")
  if (!ISTEMCI_OLAYLARI.has(tur)) return reply.code(400).send({ hata: "bilinmeyen olay" })
  olay(tur, { cihaz: c, kaynak: "istemci", ayrinti: req.body?.ayrinti ?? null, ip: istemciIp(req) })
  return { tamam: true }
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
  let imza = null
  try { imza = (await readFile(IMZA_DOSYASI, "utf8")).trim() || null } catch { /* imzasız yayın: 0.3.7+ istemci yok sayar */ }
  return { son, min: MIN_SURUM, sha256: ozet?.sha256 ?? null, boyut: ozet?.boyut ?? null, imza, notlar }
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

// ── Veritabanı yedekleri (salt gösterim) ──
// Hub hub.sql_databases'ten son yedek zamanlarını verir; firma başına 5 dk önbellek (istemci 30 dk'da bir sorar,
// birden çok cihaz aynı firmada olabilir).
const YEDEK_ONBELLEK_MS = 5 * 60_000
const yedekOnbellek = new Map() // firmaId → { t, veri }
fastify.get("/api/yedekler", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  const o = yedekOnbellek.get(c.firmaId)
  if (o && Date.now() - o.t < YEDEK_ONBELLEK_MS) return o.veri
  try {
    const r = await fetch(`${HUB_URL}/api/hub/connect/yedekler?firma=${encodeURIComponent(c.firmaId)}`,
      { headers: { "X-Service-Key": SERVICE_KEY }, signal: AbortSignal.timeout(8000) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error ?? `Hub HTTP ${r.status}`)
    yedekOnbellek.set(c.firmaId, { t: Date.now(), veri: j })
    return j
  } catch (e) {
    if (o) return o.veri   // Hub'a ulaşılamadı: eski bilgiyle devam
    return reply.code(502).send({ hata: "Yedek bilgisi Pusula'dan alınamadı: " + e.message })
  }
})

// ── Pusula X sayım modu ──

/** Paketin SHA-256'sı ve sürümü; dosya değişince (boyut/zaman) yeniden hesaplanır. tur başına önbellek. */
const paketOzetleri = new Map()
async function sayimPaketOzeti(tur) {
  const yol = sayimPaketYolu(tur)
  const st = await stat(yol)
  const anahtar = st.size + ":" + st.mtimeMs
  const o = paketOzetleri.get(yol)
  if (o?.anahtar === anahtar) return o
  let sha256 = null
  try { sha256 = (await readFile(yol + ".sha256", "utf8")).trim().toLowerCase() || null } catch { /* yoksa hesapla */ }
  if (!sha256) {
    const h = createHash("sha256")
    await new Promise((tamam, hata) => createReadStream(yol).on("data", (p) => h.update(p)).on("end", tamam).on("error", hata))
    sha256 = h.digest("hex")
  }
  let surum = null
  try { surum = (await readFile(yol.replace(/\.zip$/, "") + ".surum.txt", "utf8")).trim() || null } catch { /* sürüm yazılmamış */ }
  const yeni = { anahtar, sha256, boyut: st.size, surum }
  paketOzetleri.set(yol, yeni)
  return yeni
}

/**
 * Sayım kurulumu için her şey tek yanıtta: Hub'dan server.xml bilgisi + paketin adresi/özeti.
 * 2FA açıksa kod şart (şifre ucuyla aynı kural). SQL şifresi burada SAKLANMAZ.
 */
fastify.post("/api/sayim", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  if (c.totpAktif) {
    if (!c.totpGizli) return reply.code(409).send({ hata: "İki adımlı doğrulama bozuk; Pusula'dan sıfırlatın." })
    const adim = koduDenetle(c, req.body?.kod, coz(c.totpGizli), reply); if (adim == null) return
    sql.totpBasari.run(adim, c.cihazId)
  }
  const tur = req.body?.tur === "eski" ? "eski" : "pusulax"
  let paket = null
  try { const o = await sayimPaketOzeti(tur); paket = { url: tur === "eski" ? "sayim-paket?tur=eski" : "sayim-paket", sha256: o.sha256, boyut: o.boyut, surum: o.surum } }
  catch { return reply.code(503).send({ hata: "Sayım paketi henüz yayınlanmadı." }) }
  try {
    const j = await hubSayim(c)
    olay("sayim_bilgisi_iletildi", { cihaz: c, kaynak: "servis", ip: istemciIp(req), ayrinti: tur + (c.totpAktif ? " · 2FA ile" : "") })
    return { bilgi: j, paket }
  } catch (e) {
    return reply.code(e.durum ?? 502).send({ hata: e.durum === 409 || e.durum === 404 ? e.message : "Sayım bilgisi Pusula'dan alınamadı: " + e.message })
  }
})

fastify.get("/sayim-paket", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  const yol = sayimPaketYolu(req.query?.tur === "eski" ? "eski" : "pusulax")
  let st
  try { st = await stat(yol) } catch { return reply.code(404).type("text/plain; charset=utf-8").send("Sayım paketi henüz yayınlanmadı.") }
  reply.header("Content-Type", "application/zip")
  reply.header("Content-Length", st.size)
  reply.header("Cache-Control", "no-store")
  return reply.send(createReadStream(yol))
})

/** Eski program sayımı: firmanın veritabanları (Hub, sirket.guvenlik) — şifre içermez, kod istemez. */
fastify.get("/api/sayim/veritabanlari", async (req, reply) => {
  const c = cihaz(req, reply); if (!c) return
  try {
    const r = await fetch(`${HUB_URL}/api/hub/connect/sayim-veritabanlari?firma=${encodeURIComponent(c.firmaId)}`,
      { headers: { "X-Service-Key": SERVICE_KEY }, signal: AbortSignal.timeout(20000) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return reply.code(r.status >= 400 && r.status < 500 ? r.status : 502).send({ hata: j.error ?? `Hub HTTP ${r.status}` })
    return j
  } catch (e) {
    return reply.code(502).send({ hata: "Veritabanı listesi Pusula'dan alınamadı: " + e.message })
  }
})

fastify.get("/saglik", async () => ({ tamam: true, servis: "pusula-connect", minIstemci: MIN_SURUM }))

await fastify.listen({ port: PORT, host: HOST })
