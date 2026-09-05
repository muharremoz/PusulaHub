/**
 * Yedek deposu (SFTP sunucusu) — disk doluluğu.
 *
 * Müşterilerin SpareBackup yedekleri bu sunucuya SFTP ile yazılıyor
 * (`/root/Backup/<firkod>/...`). Disk dolarsa yedek alınamaz ve bu
 * sessizce olur; o yüzden /tv'de göz önünde duruyor.
 *
 * ── Neden SSH? ─────────────────────────────────────────────────────────
 * SFTP protokolü disk doluluğu vermiyor (dosya listesinden hesaplamak
 * 5 TB'lık ağaçta dakikalar sürer). Aynı bağlantı üzerinden `df`
 * çalıştırmak tek satırda kesin sonuç veriyor.
 *
 * ── LAN mı WAN mı? ─────────────────────────────────────────────────────
 * Önce LAN denenir (aynı ağdaysa hızlı), olmazsa WAN'a düşülür. Hub
 * konteynerinden ikisi de açık, ama sıra bilinçli: LAN yolu dış hatta
 * yük bindirmiyor.
 *
 * Env (Coolify → PusulaHub) — değerler SpareFlow ile aynı:
 *   SFTP_HOST_LAN  192.168.169.203
 *   SFTP_HOST_WAN  185.130.59.123
 *   SFTP_PORT      6598
 *   SFTP_USER      root
 *   SFTP_PASS      <parola>
 *
 * Kimlik yoksa `null` döner; kart satırı hiç çizilmez.
 */

import { Client } from "ssh2"

export interface BackupStorage {
  /** Bağlanılan adres — LAN mı WAN mı olduğu görünsün */
  host:       string
  /** İzlenen yol */
  path:       string
  totalGB:    number
  usedGB:     number
  freeGB:     number
  percent:    number
}

const BACKUP_PATH = "/root/Backup"

let cache: { at: number; data: BackupStorage } | null = null
const TTL_MS = 5 * 60_000

export function backupStorageConfigured(): boolean {
  return Boolean(
    (process.env.SFTP_HOST_LAN || process.env.SFTP_HOST_WAN) &&
    process.env.SFTP_USER && process.env.SFTP_PASS,
  )
}

/** Tek komut çalıştır, çıktıyı döndür. Bağlantı her çağrıda kapanır. */
function exec(host: string, cmd: string): Promise<string> {
  const port = Number(process.env.SFTP_PORT ?? 22) || 22
  const username = process.env.SFTP_USER!
  const password = process.env.SFTP_PASS!

  return new Promise((resolve, reject) => {
    const conn = new Client()
    /*  ssh2'nin kendi zaman aşımı yalnız el sıkışmayı kapsıyor; komut
     *  asılı kalırsa bağlantı açık kalırdı. Dışarıdan da sınırlıyoruz. */
    const guard = setTimeout(() => {
      conn.end()
      reject(new Error("zaman aşımı"))
    }, 20_000)

    conn
      .on("ready", () => {
        conn.exec(cmd, (err, stream) => {
          if (err) { clearTimeout(guard); conn.end(); return reject(err) }
          let out = ""
          stream
            .on("close", () => { clearTimeout(guard); conn.end(); resolve(out) })
            .on("data", (d: Buffer) => { out += d.toString("utf8") })
            .stderr.on("data", () => { /* df uyarıları önemsiz */ })
        })
      })
      .on("error", (e) => { clearTimeout(guard); reject(e) })
      .connect({
        host, port, username, password,
        readyTimeout: 15_000,
        /*  Sunucu eski anahtar algoritmaları sunabiliyor; ssh2'nin
         *  varsayılan listesi yetmezse burada genişletilir. Şu an
         *  varsayılan yetiyor, elle liste vermek ileride sunucu
         *  güncellenince sessizce kırılmaya yol açardı.                */
      })
  })
}

/**
 * `df -B1 <yol>` çıktısını okur.
 *
 * Bayt cinsinden isteniyor: `-h` çıktısı ("5.2T") yuvarlanmış ve ayrıştırması
 * yerel ayara duyarlı. Bayt tek ve kesin.
 */
function parseDf(out: string): { total: number; used: number; free: number } | null {
  const lines = out.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return null
  /*  Son satır: filesystem 1B-blocks used available use% mounted.
   *  Uzun aygıt adları satırı ikiye bölebildiği için SON satırdaki
   *  sayılar alınıyor.                                                 */
  const nums = lines[lines.length - 1].trim().split(/\s+/).filter((x) => /^\d+$/.test(x))
  if (nums.length < 3) return null
  const [total, used, free] = nums.map(Number)
  if (!total) return null
  return { total, used, free }
}

export async function fetchBackupStorage(force = false): Promise<BackupStorage | null> {
  if (!backupStorageConfigured()) return null
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data

  const hosts = [process.env.SFTP_HOST_LAN, process.env.SFTP_HOST_WAN].filter(Boolean) as string[]
  let lastErr: unknown = null

  for (const host of hosts) {
    try {
      const out = await exec(host, `df -B1 ${BACKUP_PATH}`)
      const df = parseDf(out)
      if (!df) throw new Error("df çıktısı okunamadı")

      const gb = (b: number) => Math.round((b / 1024 ** 3) * 10) / 10
      const data: BackupStorage = {
        host,
        path:    BACKUP_PATH,
        totalGB: gb(df.total),
        usedGB:  gb(df.used),
        freeGB:  gb(df.free),
        percent: Math.round((df.used / df.total) * 100),
      }
      cache = { at: Date.now(), data }
      return data
    } catch (err) {
      lastErr = err
      /* sıradaki adresi dene */
    }
  }

  console.error("[backup-storage] ulaşılamadı:", lastErr instanceof Error ? lastErr.message : lastErr)
  /*  Eski değeri KORU: geçici bir kesintide kart boşalmasın. Süresi
   *  dolmuş olsa bile son bilinen doluluk, hiç yoktan iyidir.          */
  return cache?.data ?? null
}

export function invalidateBackupStorageCache(): void {
  cache = null
}
