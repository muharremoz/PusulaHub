/**
 * Spare Cloud (SFTP) dosya listesi — SQL sunucusunda SpareBackup'ın kendi node'u ile çalışır:
 *   "C:\Program Files\SpareBackup\node\node.exe" sc-liste.js <gorevAdi> <GG-AA-YYYY> [<GG-AA-YYYY> ...]
 *
 * Bağlantı bilgisini SpareBackup gibi alır: data/spare-backup.db → spareflow_api_key →
 * SpareFlow /setup/cloud. Parola / anahtar hiçbir yere yazdırılmaz.
 *
 * Çıktı (gzip + base64, tek satır — agent exec çıktısı büyük listede kesilmesin):
 *   JSON { basePath, klasorler: { "19-09-2026": [["ad.zip", boyut], ...] } }
 * Klasör yoksa boş dizi döner.
 */
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
      const dir = `${c.basePath}/${gorev}/${g}`
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
