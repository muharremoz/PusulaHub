import "server-only"
import { withSqlConnection } from "@/lib/sql-external"
import { r2GunDosyalari, r2Tanimli } from "@/lib/firma-yedekleri"
import { computeBackupCycle, esxiConfigured, fetchEsxiBackups } from "@/lib/esxi"

/**
 * Yedek özeti — CRM mobil "Sunucular → Yedek" sekmesi (29.10.2026).
 *
 * /tv'deki yedek testinin hafif hali: msdb (SQL'in kendi kaydı) + R2 teslimi
 * (ikinci bulut kopyası) + ESXi imaj yedeği turları. Spare Cloud (SFTP) bilerek
 * YOK — listesi SQL sunucusunda agent üzerinden çekiliyor, ~1 dk sürüyor; mobil
 * açılışı için ağır. Tam doğrulama TV düğmesinde kalıyor.
 *
 * 10 dk önbellek: R2 günde ~20 bin dosya (20+ sayfalı listeleme), her ekran
 * açılışında tekrarlamaya değmez. Eşikler yedek-testi.ts ile aynı.
 */

const TAM_SAAT = 26
const DIFF_DK = 45
const YUKLEME_PAYI = 30
const TAM_TUR_PAYI = 60
const BULUT_SAAT = 26
const TTL_MS = 10 * 60_000

export interface SqlHedef { ip: string; username: string; password: string }

export interface YedekOzeti {
  sql: {
    /** Yedeklenmesi gereken (guvenlik.YedekAl=1 ve ONLINE) veritabanı sayısı */
    kapsam: number
    /** Son tam yedeği TAM_SAAT saatten eski ya da hiç olmayan */
    tamEski: string[]
    /** Son fark yedeği DIFF_DK dakikadan eski (tam yedeği yeni olanlar hariç) */
    farkEski: string[]
    /** SQL saatiyle "YYYY-MM-DD HH:mm:ss" — tedious UTC kaymasına girmesin diye metin */
    sonTam: string | null
    sonFark: string | null
    /** Son tam turu: ilk başlangıç → son bitiş (bugün) */
    tamTuru: { basla: string; bitis: string; adet: number } | null
  } | null
  r2: { tamam: number; eksik: number; bekleyen: number; bos: number; eksikler: string[] } | null
  imaj: {
    son: { at: string; durum: string; makine: number; gec: string[] } | null
    beklenen: number
    sonraki: string | null
  } | null
  hatalar: string[]
  zaman: string
}

let onbellek: { at: number; veri: YedekOzeti } | null = null

/** Spare Cloud / R2 gün klasörü: yedeğin BAŞLADIĞI gün */
const bulutGunu = (basla: string) => { const [y, a, g] = basla.slice(0, 10).split("-"); return `${g}-${a}-${y}` }

export async function yedekOzeti(hedef: SqlHedef | null): Promise<YedekOzeti> {
  if (onbellek && Date.now() - onbellek.at < TTL_MS) return onbellek.veri
  const hatalar: string[] = []
  const cfg = hedef ? { server: hedef.ip, user: hedef.username, password: hedef.password, database: "msdb", requestTimeout: 60_000 } : null

  const sqlSoz = cfg
    ? withSqlConnection(cfg, async (pool) => {
        const durum = (await pool.request().query<{ db: string; tam: string | null; tamDk: number | null; fark: string | null; farkDk: number | null }>(`
          WITH k AS (
            SELECT DISTINCT LTRIM(RTRIM(g.DataYolu)) COLLATE DATABASE_DEFAULT AS db
            FROM sirket.dbo.guvenlik g
            JOIN sys.databases d ON d.name COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(g.DataYolu)) COLLATE DATABASE_DEFAULT
            WHERE g.YedekAl = 1 AND d.state_desc = 'ONLINE'
          ), b AS (
            SELECT bs.database_name COLLATE DATABASE_DEFAULT AS db, bs.type, MAX(bs.backup_finish_date) AS son
            FROM msdb.dbo.backupset bs
            WHERE bs.backup_finish_date > DATEADD(day, -3, GETDATE()) AND bs.is_copy_only = 0 AND bs.type IN ('D', 'I')
            GROUP BY bs.database_name, bs.type
          )
          SELECT k.db,
                 CONVERT(varchar(19), t.son, 120) AS tam, DATEDIFF(minute, t.son, GETDATE()) AS tamDk,
                 CONVERT(varchar(19), f.son, 120) AS fark, DATEDIFF(minute, f.son, GETDATE()) AS farkDk
          FROM k
          LEFT JOIN b t ON t.db = k.db AND t.type = 'D'
          LEFT JOIN b f ON f.db = k.db AND f.type = 'I'`)).recordset
        const tur = (await pool.request().query<{ basla: string | null; bitis: string | null; adet: number }>(`
          SELECT CONVERT(varchar(19), MIN(b.backup_start_date), 120) AS basla,
                 CONVERT(varchar(19), MAX(b.backup_finish_date), 120) AS bitis, COUNT(*) AS adet
          FROM msdb.dbo.backupset b
          JOIN msdb.dbo.backupmediafamily mf ON mf.media_set_id = b.media_set_id
          WHERE b.type = 'D' AND mf.physical_device_name LIKE 'C:\\ProgramData\\SpareBackup\\%'
            AND b.backup_start_date >= CAST(GETDATE() AS date)`)).recordset[0]
        const teslim = (await pool.request().query<{ db: string; tur: string; basla: string; yol: string; dkOnce: number }>(`
          SELECT b.database_name AS db, b.type AS tur, CONVERT(varchar(19), b.backup_start_date, 120) AS basla,
                 mf.physical_device_name AS yol, DATEDIFF(minute, b.backup_finish_date, GETDATE()) AS dkOnce
          FROM msdb.dbo.backupset b
          JOIN msdb.dbo.backupmediafamily mf ON mf.media_set_id = b.media_set_id
          WHERE mf.physical_device_name LIKE 'C:\\ProgramData\\SpareBackup\\%'
            AND b.backup_finish_date > DATEADD(hour, -${BULUT_SAAT}, GETDATE())`)).recordset
        return { durum, tur, teslim }
      })
    : Promise.reject(new Error("SQL sunucusu tanımlı değil"))

  const imajSoz = esxiConfigured() ? fetchEsxiBackups() : Promise.resolve(null)
  const [s, im] = await Promise.allSettled([sqlSoz, imajSoz])

  let sqlOzet: YedekOzeti["sql"] = null
  let r2: YedekOzeti["r2"] = null
  if (s.status === "fulfilled") {
    const { durum, tur, teslim } = s.value
    const enYeni = (k: "tam" | "fark") => durum.map((d) => d[k]).filter((x): x is string => !!x).sort().at(-1) ?? null
    sqlOzet = {
      kapsam: durum.length,
      tamEski: durum.filter((d) => d.tamDk == null || d.tamDk > TAM_SAAT * 60).map((d) => d.db),
      // Tam yedeği fark turundan yeniyse fark henüz alınmamış olabilir — eski sayma.
      farkEski: durum.filter((d) => (d.tamDk ?? Infinity) > DIFF_DK && (d.farkDk == null || d.farkDk > DIFF_DK)).map((d) => d.db),
      sonTam: enYeni("tam"),
      sonFark: enYeni("fark"),
      tamTuru: tur?.basla && tur.bitis ? { basla: tur.basla, bitis: tur.bitis, adet: tur.adet } : null,
    }

    if (r2Tanimli()) {
      try {
        const dosyalar = new Map<string, number>()
        for (const gun of [...new Set(teslim.map((y) => bulutGunu(y.basla)))]) {
          for (const [ad, boyut] of await r2GunDosyalari(gun)) dosyalar.set(`${gun}/${ad}`, boyut)
        }
        // Süren sabah tam turu henüz yüklenmemiş olabilir: eksik değil "bekliyor".
        const tamlar = teslim.filter((y) => y.tur === "D")
        const enYeniTam = tamlar.reduce<(typeof teslim)[number] | null>((a, y) => (!a || y.dkOnce < a.dkOnce ? y : a), null)
        const turGunu = enYeniTam && enYeniTam.dkOnce < TAM_TUR_PAYI ? bulutGunu(enYeniTam.basla) : null
        let tamam = 0, bekleyen = 0, bos = 0
        const eksikler: string[] = []
        for (const y of teslim) {
          const ad = (y.yol.split("\\").pop() ?? "").replace(/\.bak$/i, ".zip")
          const boyut = dosyalar.get(`${bulutGunu(y.basla)}/${ad}`)
          if (boyut === undefined) {
            if (y.dkOnce < YUKLEME_PAYI || (turGunu && y.tur === "D" && bulutGunu(y.basla) === turGunu)) bekleyen++
            else eksikler.push(y.db)
          } else if (boyut === 0) bos++
          else tamam++
        }
        r2 = { tamam, eksik: eksikler.length, bekleyen, bos, eksikler: [...new Set(eksikler)].slice(0, 10) }
      } catch (e) {
        hatalar.push(`R2: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } else {
    hatalar.push(`SQL: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`)
  }

  let imaj: YedekOzeti["imaj"] = null
  if (im.status === "fulfilled" && im.value) {
    const c = computeBackupCycle(im.value)
    // Saati gelmemiş tur "pending" — son SONUÇLANMIŞ tur gösterilir.
    const son = [...c.slots].reverse().find((x) => x.status !== "pending") ?? null
    imaj = {
      son: son ? { at: son.at, durum: son.status, makine: son.vmCount, gec: son.gec } : null,
      beklenen: c.vmsInJob,
      sonraki: c.nextAt,
    }
  } else if (im.status === "rejected") {
    hatalar.push(`ESXi: ${im.reason instanceof Error ? im.reason.message : String(im.reason)}`)
  }

  const veri: YedekOzeti = { sql: sqlOzet, r2, imaj, hatalar, zaman: new Date().toISOString() }
  // Hata varsa önbelleğe alma: bir sonraki açılış yeniden denesin.
  if (!hatalar.length) onbellek = { at: Date.now(), veri }
  return veri
}
