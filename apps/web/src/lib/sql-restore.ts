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

  // 3) MOVE clause — her logical file için hedef fiziksel yol üret
  //    Not: targetDbName + dbName parametre olarak gönderilemiyor çünkü
  //    T-SQL `RESTORE DATABASE [name]` identifier'ı değişken kabul etmiyor.
  //    Bu yüzden identifier'ı escape edip string olarak gömüyoruz; bak/dataDir
  //    ise parametre ile gidiyor.
  const escapedDbName = targetDbName.replace(/]/g, "]]")

  const moveClauses: string[] = []
  const req = pool.request()
  req.input("bak", sql.NVarChar, bakPath)

  // Data file sayacı — birden fazla .mdf varsa 2.'si .ndf olur
  let dataIdx = 0
  let logIdx  = 0

  files.forEach((f, i) => {
    const logicalKey  = `logical${i}`
    const physicalKey = `physical${i}`
    moveClauses.push(`MOVE @${logicalKey} TO @${physicalKey}`)

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

    req.input(logicalKey,  sql.NVarChar, f.LogicalName)
    req.input(physicalKey, sql.NVarChar, finalPath)
  })

  const restoreSql = `
    RESTORE DATABASE [${escapedDbName}]
    FROM DISK = @bak
    WITH ${moveClauses.join(", ")}, REPLACE, STATS = 10
  `

  // Restore uzun sürebilir — request timeout'u 10 dk
  ;(req as unknown as { timeout?: number }).timeout = 10 * 60 * 1000

  await req.query(restoreSql)
}
