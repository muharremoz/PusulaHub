import "server-only"

/**
 * Spare Cloud (SFTP) dosya listesini SQL sunucusundan alan uzak betiğin kaynağı.
 *
 * ── Neden burada, bir .js dosyasında değil? ───────────────────────────
 * Betik SQL sunucusuna agent üzerinden gönderiliyor; Hub'ın kendi
 * paketinin içinde durması gerekiyor. Ayrı bir dosya olsaydı derlenmiş
 * uygulamada bulunamayabilirdi (cwd kaba bir bahis). Tek kaynak burası;
 * yerel yardımcı betikler de (`__teslim.mjs`) bunu okuyor.
 *
 * Uzakta SpareBackup'ın KENDİ node'u ve modülleriyle çalışıyor
 * (`better-sqlite3`, `ssh2-sftp-client`) — sunucuya hiçbir şey kurmuyoruz.
 * Bağlantı bilgisini de SpareBackup gibi alıyor: yerel veritabanındaki API
 * anahtarıyla SpareFlow'dan soruyor. Parola/anahtar hiçbir yere yazılmıyor,
 * çıktıya da geçmiyor.
 *
 * Çıktı tek satır, gzip+base64 (agent exec çıktısı uzun listede kesilmesin):
 *   SCLISTE:<base64>  →  { basePath, klasorler: { "22-09-2026": [["ad.zip", boyut], …] } }
 *   SCHATA:<mesaj>
 */
export const SC_LISTE_KAYNAK = String.raw`
const path = require("path")
const zlib = require("zlib")
const W = "C:/Program Files/SpareBackup/webapp"
const Database = require(path.join(W, "node_modules/better-sqlite3"))
const SftpClient = require(path.join(W, "node_modules/ssh2-sftp-client"))

;(async () => {
  const [gorev, ...gunler] = process.argv.slice(2)
  if (!gorev || gunler.length === 0) throw new Error("kullanim: sc-liste.js <gorevAdi> <GG-AA-YYYY>...")

  const db = new Database(path.join(W, "data/spare-backup.db"), { readonly: true })
  const key = db.prepare("SELECT value FROM settings WHERE key = ?").get("spareflow_api_key")?.value
  db.close()
  if (!key) throw new Error("spareflow_api_key yok")

  const r = await fetch("http://api.pusulanet.net:3000/setup/cloud", {
    headers: { "X-API-Key": key }, signal: AbortSignal.timeout(15000),
  })
  const c = await r.json()
  if (!c.ok) throw new Error("setup/cloud yanit vermedi")

  const sftp = new SftpClient()
  await sftp.connect({
    host: c.host, port: c.port, username: c.username,
    ...(c.privateKey ? { privateKey: c.privateKey } : { password: c.password }),
    readyTimeout: 20000,
  })
  const out = { basePath: c.basePath, klasorler: {} }
  try {
    for (const g of gunler) {
      const dir = c.basePath + "/" + gorev + "/" + g
      try {
        out.klasorler[g] = (await sftp.list(dir)).filter((x) => x.type === "-").map((x) => [x.name, x.size])
      } catch {
        out.klasorler[g] = []
      }
    }
  } finally {
    await sftp.end()
  }
  process.stdout.write("SCLISTE:" + zlib.gzipSync(JSON.stringify(out)).toString("base64") + "\n")
})().catch((e) => { process.stdout.write("SCHATA:" + e.message + "\n"); process.exitCode = 1 })
`

/** SpareBackup'ın Spare Cloud'daki görev (klasör) adı */
export const SC_GOREV = "Makdos_SQL_Server"
