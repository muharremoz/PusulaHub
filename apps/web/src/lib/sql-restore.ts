/**
 * SQL Server'da .bak dosyasından RESTORE DATABASE çalıştıran yardımcı.
 *
 * Firma kurulum sihirbazının 4. adımında kullanılır:
 *   - Mode 0 (Yedekten Yükle): `backupFolderPath\{fileName}` yolundaki .bak'ları restore eder
 *   - Mode 1 (Demo DB):       `demoDb.locationPath` yolundaki .bak'ları restore eder
 *
 * Eski ServerManager (CompanySetupService.cs) RESTORE akışının birebir
 * karşılığı. FILELISTONLY ile logical file adlarını alır, hedef dizini
 * tespit eder (firmaId verilmişse `D:\SQLData\{firmaId}`, aksi halde
 * InstanceDefaultDataPath), ardından MOVE clause'u ile yeni hedef adına
 * restore atar. Var olan DB'yi REPLACE ile üzerine yazar.
 */

import sql from "mssql"

/** Firma bazlı MDF/LDF hedef klasörünün kökü — SQL sunucusunun yerel diski. */
const DEFAULT_FIRMA_DATA_ROOT = "D:\\SQLData"

interface FileListRow {
  LogicalName: string
  Type:        string // "D" = data, "L" = log
}

export interface RestoreOptions {
  /**
   * Varsa MDF/LDF dosyaları `D:\SQLData\{firmaId}\` altına yazılır.
   * Klasör yoksa xp_create_subdir ile otomatik oluşturulur.
   * Boş bırakılırsa SQL Server'ın InstanceDefaultDataPath'i kullanılır.
   */
  firmaId?: string
  /**
   * RESTORE ilerleme yüzdesi (STATS = 5) geri çağrısı. SQL Server'ın
   * "N percent processed" info mesajlarından parse edilir; UI'da adım
   * satırını canlı güncellemek için kullanılır. Aynı yüzde tekrar
   * gelirse çağrılmaz (monoton artan).
   */
  onProgress?: (percent: number) => void
}

/** SQL Server RESTORE STATS info mesajından yüzde çıkar (TR + EN locale). */
function parseRestorePercent(message: string): number | null {
  // "10 percent processed." / "10% processed" / TR: "yüzde 10 ... işlendi"
  let m = message.match(/(\d+)\s*(?:percent|%)/i)
  if (!m) m = message.match(/y[üu]zde\s*(\d+)/i)
  if (!m) return null
  const pct = parseInt(m[1], 10)
  return Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : null
}

/**
 * Verilen .bak dosyasını seçili SQL sunucusunda yeni bir DB adına restore eder.
 *
 * @param pool          mssql ConnectionPool — `master` DB'sine bağlanmış olmalı
 * @param bakPath       Kaynak .bak dosyasının tam yolu (SQL sunucusundaki yereli)
 * @param targetDbName  Oluşturulacak hedef DB adı
 * @param options       firmaId verilirse `D:\SQLData\{firmaId}` altına restore edilir
 */
export async function restoreBackupOnServer(
  pool:         sql.ConnectionPool,
  bakPath:      string,
  targetDbName: string,
  options:      RestoreOptions = {},
): Promise<void> {
  // 1) FILELISTONLY — mantıksal dosya adları
  const fileListResult = await pool
    .request()
    .input("bak", sql.NVarChar, bakPath)
    .query<FileListRow>(`RESTORE FILELISTONLY FROM DISK = @bak`)

  const files = fileListResult.recordset
  if (!files || files.length === 0) {
    throw new Error("RESTORE FILELISTONLY boş döndü (dosya okunamadı)")
  }

  // 2) Hedef DATA klasörü
  //    firmaId verilmişse `D:\SQLData\{firmaId}` — klasör yoksa xp_create_subdir
  //    ile oluşturulur. Aksi halde eski davranış (SQL Server default path).
  let dataDir: string
  if (options.firmaId && options.firmaId.trim()) {
    const safeFirma = options.firmaId.trim().replace(/[\\/:*?"<>|]/g, "_")
    dataDir = `${DEFAULT_FIRMA_DATA_ROOT}\\${safeFirma}`
    // xp_create_subdir idempotent — klasör varsa sorun çıkarmaz.
    // `master..xp_create_subdir` sysadmin yetkisi ister (SA OK).
    // Hata atarsa restore'a hiç girmeden çıksın ki path problemi net görünsün.
    await pool
      .request()
      .input("dir", sql.NVarChar, dataDir)
      .query(`EXEC master.dbo.xp_create_subdir @dir`)
  } else {
    dataDir = "C:\\Program Files\\Microsoft SQL Server\\MSSQL16.MSSQLSERVER\\MSSQL\\DATA"
    try {
      const pathRes = await pool.request().query<{ Path: string | null }>(`
        SELECT CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS NVARCHAR(512)) AS Path
      `)
      const reported = pathRes.recordset?.[0]?.Path
      if (reported && reported.trim()) {
        dataDir = reported.replace(/\\+$/g, "")
      }
    } catch {
      // Bazı eski SQL Server sürümlerinde InstanceDefaultDataPath yok — default'u kullan
    }
  }

  // 3) MOVE clause — her logical file için hedef fiziksel yol üret.
  //
  //    KRİTİK: RESTORE, parametreli `query()` (sp_executesql/RPC) ile
  //    çalıştırıldığında, STATS info akışının final DONE token'ı ile araya
  //    girmesi tedious'ta nadiren promise'i çözmeden takılmaya yol açıyor
  //    (DB ONLINE olur ama `await` hiç dönmez → sihirbaz %100'de asılı kalır).
  //    Çözüm: BACKUP/RESTORE için yerleşik desen olan `batch()` (parametresiz,
  //    ham T-SQL batch). Tüm değerler tek tırnak escape edilip N'...' olarak
  //    gömülür — DB adı zaten bu dosyada böyle gömülüyordu.
  const escSql = (s: string) => s.replace(/'/g, "''")
  const escapedDbName = targetDbName.replace(/]/g, "]]")

  const moveClauses: string[] = []

  // Data file sayacı — birden fazla .mdf varsa 2.'si .ndf olur
  let dataIdx = 0
  let logIdx  = 0

  files.forEach((f) => {
    let finalPath: string
    if (f.Type === "L") {
      // Log file
      finalPath =
        logIdx === 0
          ? `${dataDir}\\${targetDbName}.ldf`
          : `${dataDir}\\${targetDbName}_${logIdx}.ldf`
      logIdx++
    } else {
      // Data file
      finalPath =
        dataIdx === 0
          ? `${dataDir}\\${targetDbName}.mdf`
          : `${dataDir}\\${targetDbName}_${dataIdx}.ndf`
      dataIdx++
    }
    moveClauses.push(`MOVE N'${escSql(f.LogicalName)}' TO N'${escSql(finalPath)}'`)
  })

  const req = pool.request()

  const restoreSql = `
    RESTORE DATABASE [${escapedDbName}]
    FROM DISK = N'${escSql(bakPath)}'
    WITH ${moveClauses.join(", ")}, REPLACE, STATS = 5
  `

  // Restore uzun sürebilir — request timeout'u 10 dk
  ;(req as unknown as { timeout?: number }).timeout = 10 * 60 * 1000

  // STATS = 5 → SQL Server her %5'te "N percent processed" info mesajı yollar.
  // mssql Request 'info' event'i ile yakalanır; UI'da canlı yüzde gösterilir.
  if (options.onProgress) {
    let lastPct = -1
    const reqWithEvents = req as unknown as {
      on: (ev: string, cb: (info: { message?: string }) => void) => void
    }
    try {
      reqWithEvents.on("info", (info) => {
        const pct = info?.message ? parseRestorePercent(info.message) : null
        if (pct !== null && pct > lastPct) {
          lastPct = pct
          options.onProgress!(pct)
        }
      })
    } catch {
      // 'info' event desteklenmiyorsa sessizce geç — restore yine çalışır.
    }
  }

  // batch() → ham SQL batch; parametre yok, RESTORE DONE token'ı temiz işlenir.
  await req.batch(restoreSql)
}

/**
 * Firma bazlı MDF/LDF hedef klasörünü (`D:\SQLData\{firmaId}`) döndürür.
 * restoreBackupOnServer ile aynı kuralı kullanır; attach akışında dosyaları
 * agent'la kopyalarken hedef klasörü belirlemek için dışarıdan da çağrılır.
 */
export function firmaDataDir(firmaId: string): string {
  const safeFirma = (firmaId ?? "").trim().replace(/[\\/:*?"<>|]/g, "_")
  return `${DEFAULT_FIRMA_DATA_ROOT}\\${safeFirma}`
}

/**
 * `D:\SQLData\{firmaId}` altına önceden kopyalanmış .mdf (+ varsa .ldf)
 * dosyalarından bir DB'yi `CREATE DATABASE ... FOR ATTACH` ile bağlar.
 *
 * Dosyaların fiziksel kopyalanması bu fonksiyondan ÖNCE agent ile yapılır
 * (sql-backup-powershell.buildCopyAttachFiles). Burada yalnızca SQL tarafı:
 *   - LDF varsa:  FOR ATTACH
 *   - LDF yoksa:  FOR ATTACH_REBUILD_LOG (log otomatik üretilir)
 *
 * Hedef adda DB zaten varsa önce DROP edilir (REPLACE semantiği — restore ile
 * tutarlı, sihirbaz tekrar çalıştığında idempotent).
 *
 * @param pool          master'a bağlı mssql ConnectionPool
 * @param firmaId       D:\SQLData\{firmaId} klasörünü belirler
 * @param targetDbName  oluşturulacak DB adı (kopyalanan dosyalar bu adla durur)
 * @param hasLdf        eşleşen .ldf kopyalandı mı
 */
export async function attachDatabaseOnServer(
  pool:         sql.ConnectionPool,
  firmaId:      string,
  targetDbName: string,
  hasLdf:       boolean,
): Promise<void> {
  const dataDir   = firmaDataDir(firmaId)
  const mdfPath   = `${dataDir}\\${targetDbName}.mdf`
  const ldfPath   = `${dataDir}\\${targetDbName}.ldf`
  const escapedDb = targetDbName.replace(/]/g, "]]")

  const fileClause = hasLdf
    ? `(FILENAME = @mdf), (FILENAME = @ldf) FOR ATTACH`
    : `(FILENAME = @mdf) FOR ATTACH_REBUILD_LOG`

  const req = pool.request()
  req.input("mdf", sql.NVarChar, mdfPath)
  if (hasLdf) req.input("ldf", sql.NVarChar, ldfPath)
  ;(req as unknown as { timeout?: number }).timeout = 10 * 60 * 1000

  // Aynı adda DB varsa düşür (idempotent — restore REPLACE ile aynı davranış).
  await req.batch(`
    IF DB_ID(N'${targetDbName.replace(/'/g, "''")}') IS NOT NULL
    BEGIN
      ALTER DATABASE [${escapedDb}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
      DROP DATABASE [${escapedDb}];
    END
  `)

  await req.query(`CREATE DATABASE [${escapedDb}] ON ${fileClause}`)
}
