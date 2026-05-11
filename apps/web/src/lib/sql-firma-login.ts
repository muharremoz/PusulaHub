/**
 * Firma kurulum sihirbazında 1. kullanıcı için SQL Authentication login
 * oluşturma ve restore edilen veritabanlarına user mapping verme yardımcısı.
 *
 * Akış (run/route.ts içinden çağrılır):
 *  - ensureSqlLogin     → master DB'de CREATE/ALTER LOGIN
 *  - ensureDbUserMapping → her restore edilen DB'de CREATE USER + ALTER ROLE
 *
 * Login adı formatı: `{firmaId}_{username}` (örn. "3844_AsyaBurma23")
 * Roller: db_owner, db_datareader, db_datawriter (public default'tur)
 */

import sql from "mssql"

/** SQL Server identifier (login/user/db/role) için ] karakterini escape eder. */
function escapeIdent(s: string): string {
  return s.replace(/]/g, "]]")
}

/** SQL Server string literal için ' karakterini escape eder. CREATE LOGIN'in
 *  PASSWORD clause'u parametrize edilemez — literal olmak zorunda. */
function escapeString(s: string): string {
  return s.replace(/'/g, "''")
}

/**
 * master DB'de SQL Authentication login'i oluşturur veya günceller.
 *
 *  - Login yoksa: CREATE LOGIN ... WITH PASSWORD, CHECK_POLICY=OFF, CHECK_EXPIRATION=OFF
 *  - Varsa:       ALTER LOGIN ... WITH PASSWORD (idempotent — sihirbaz tekrar
 *                 çalıştığında en güncel şifreyle senkron kalır)
 *
 * CHECK_POLICY OFF: firma kullanıcısının SQL şifresi Windows password policy'ye
 * tabi olmasın — AD complexity ile çakışırsa kurulum patlamasın.
 *
 * @param masterPool  master DB'sine bağlı mssql ConnectionPool
 * @param loginName   "{firmaId}_{username}" formatında
 * @param password    AD kullanıcısının şifresi (1. kullanıcıyla aynı)
 * @returns           true = oluşturuldu, false = mevcuttu (şifre güncellendi)
 */
export async function ensureSqlLogin(
  masterPool: sql.ConnectionPool,
  loginName:  string,
  password:   string,
): Promise<{ created: boolean }> {
  const ident = escapeIdent(loginName)
  const pw    = escapeString(password)

  // Mevcut mu?
  const existsResult = await masterPool.request()
    .input("name", sql.NVarChar(128), loginName)
    .query<{ cnt: number }>(`
      SELECT COUNT(*) AS cnt
      FROM sys.sql_logins
      WHERE name = @name
    `)
  const exists = (existsResult.recordset[0]?.cnt ?? 0) > 0

  if (exists) {
    await masterPool.request().batch(`
      ALTER LOGIN [${ident}] WITH PASSWORD = N'${pw}', CHECK_POLICY = OFF
    `)
    return { created: false }
  }

  await masterPool.request().batch(`
    CREATE LOGIN [${ident}]
      WITH PASSWORD            = N'${pw}',
           CHECK_POLICY        = OFF,
           CHECK_EXPIRATION    = OFF,
           DEFAULT_DATABASE    = [master],
           DEFAULT_LANGUAGE    = [us_english]
  `)
  return { created: true }
}

/** Verilen DB'de login için user oluşturup db_owner/datareader/datawriter rolleri verir. */
export async function ensureDbUserMapping(
  masterPool: sql.ConnectionPool,
  dbName:     string,
  loginName:  string,
): Promise<void> {
  const dbIdent    = escapeIdent(dbName)
  const loginIdent = escapeIdent(loginName)

  // USE + CREATE USER (idempotent) + 3 rol — tek batch
  // Login adıyla aynı isimde user oluşturulur (SQL Server standart pratik).
  await masterPool.request().batch(`
    USE [${dbIdent}];

    IF NOT EXISTS (
      SELECT 1 FROM sys.database_principals
      WHERE name = N'${escapeString(loginName)}'
    )
    BEGIN
      CREATE USER [${loginIdent}] FOR LOGIN [${loginIdent}];
    END

    ALTER ROLE db_owner      ADD MEMBER [${loginIdent}];
    ALTER ROLE db_datareader ADD MEMBER [${loginIdent}];
    ALTER ROLE db_datawriter ADD MEMBER [${loginIdent}];
  `)
}
