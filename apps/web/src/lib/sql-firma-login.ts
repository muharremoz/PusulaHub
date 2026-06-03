/**
 * Firma kurulum sihirbazında 1. kullanıcı için SQL Authentication login
 * oluşturma + sunucu seviyesinde DENY VIEW ANY DATABASE + restore edilen
 * her DB'nin owner'ını bu login'e devretme yardımcısı.
 *
 * Akış (run/route.ts içinden çağrılır):
 *  - ensureSqlLogin         → master DB'de CREATE/ALTER LOGIN
 *  - denyViewAnyDatabase    → master'da DENY VIEW ANY DATABASE
 *                             (kullanıcı sadece kendi DB'lerini görür)
 *  - setDbOwner             → her restore edilen DB'de ALTER AUTHORIZATION
 *                             (login bu DB'nin dbo'su olur — tam yetki,
 *                              ayrıca rol verilmesi gerekmez)
 *
 * Login adı formatı: `{firmaId}_{username}` (örn. "3844_AsyaBurma23")
 *
 * Not: Eski `ensureDbUserMapping` (CREATE USER + 3 rol) yerine bu pattern'e
 * geçildi. Owner zaten dbo yetkilerine sahip olduğu için ek rol gerekmez ve
 * DENY VIEW ANY DATABASE ile diğer firma DB'leri görünmez kalır.
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

/**
 * Login'e sunucu seviyesinde `DENY VIEW ANY DATABASE` verir.
 *
 * Bu izin sayesinde kullanıcı SSMS / sqlcmd ile bağlandığında **sadece**
 * owner'ı olduğu (veya kendine erişim verilmiş olan) DB'leri görür —
 * diğer firmaların DB'leri "Databases" listesinde görünmez.
 *
 * DENY tekrar çalıştırıldığında hata vermez (idempotent).
 *
 * @param masterPool  master DB'sine bağlı mssql ConnectionPool
 * @param loginName   "{firmaId}_{username}" formatında
 */
export async function denyViewAnyDatabase(
  masterPool: sql.ConnectionPool,
  loginName:  string,
): Promise<void> {
  const ident = escapeIdent(loginName)
  await masterPool.request().batch(`
    USE [master];
    DENY VIEW ANY DATABASE TO [${ident}];
  `)
}

/**
 * Verilen DB'nin owner'ını (authorization) login'e devreder.
 *
 *  - Eğer DB'de aynı isimde bir user zaten varsa (örn. eski sihirbazın
 *    CREATE USER FOR LOGIN ile bıraktığı kalıntı), ALTER AUTHORIZATION
 *    *"The proposed new database owner is already a user or aliased in
 *    the database"* hatası verir → önce DROP USER ile temizliyoruz.
 *  - Sonra ALTER AUTHORIZATION ON DATABASE::[X] TO [login] ile owner set.
 *
 * Owner olan login otomatik olarak DB'nin `dbo`'su olur → tam yetki,
 * ayrıca db_owner / db_datareader / db_datawriter eklemek gerekmez.
 *
 * @param masterPool  master DB'sine bağlı mssql ConnectionPool
 * @param dbName      hedef veritabanı adı
 * @param loginName   yeni owner login adı
 */
export async function setDbOwner(
  masterPool: sql.ConnectionPool,
  dbName:     string,
  loginName:  string,
): Promise<void> {
  const dbIdent    = escapeIdent(dbName)
  const loginIdent = escapeIdent(loginName)
  const loginLit   = escapeString(loginName)

  await masterPool.request().batch(`
    USE [${dbIdent}];

    -- Eski kurulumdan kalma user varsa düşür (yoksa owner ataması patlar).
    IF EXISTS (
      SELECT 1 FROM sys.database_principals
      WHERE name = N'${loginLit}' AND type IN ('S','U','G')
    )
    BEGIN
      DROP USER [${loginIdent}];
    END

    ALTER AUTHORIZATION ON DATABASE::[${dbIdent}] TO [${loginIdent}];
  `)
}

/**
 * Paylaşımlı `sirket` DB'sine firma login'i için okuma+yazma erişimi verir.
 *
 * Pusula programı açılırken `sirket.dbo.guvenlik` (ve diğer sirket tabloları)
 * üzerinden hangi data DB'sine/yetkiye bağlanacağını okur. Firma kullanıcısı
 * `DENY VIEW ANY DATABASE` ile diğer firma DB'lerini göremez ama `sirket`'te
 * bir USER + db_datareader/db_datawriter üyeliği olduğu için bu paylaşımlı
 * DB'yi görür ve içine okuyup yazabilir.
 *
 *  - CREATE USER (idempotent)
 *  - db_datareader + db_datawriter rolleri (owner DEĞİL — şema değiştiremez,
 *    başka firma DB'sine geçemez)
 *
 * `sirket` DB'si o sunucuda yoksa sessizce atlar (guvenlik insert'i hiç
 * yapılmamış olabilir).
 *
 * @param masterPool  master DB'sine bağlı mssql ConnectionPool
 * @param loginName   "{firmaId}_{username}" formatında
 * @param sirketDb    sirket DB adı (varsayılan "sirket")
 */
export async function grantSirketAccess(
  masterPool: sql.ConnectionPool,
  loginName:  string,
  sirketDb:   string = "sirket",
): Promise<void> {
  const dbIdent    = escapeIdent(sirketDb)
  const loginIdent = escapeIdent(loginName)
  const loginLit   = escapeString(loginName)

  await masterPool.request().batch(`
    IF DB_ID(N'${escapeString(sirketDb)}') IS NULL
    BEGIN
      RETURN;
    END

    USE [${dbIdent}];

    IF NOT EXISTS (
      SELECT 1 FROM sys.database_principals
      WHERE name = N'${loginLit}'
    )
    BEGIN
      CREATE USER [${loginIdent}] FOR LOGIN [${loginIdent}];
    END

    ALTER ROLE db_datareader ADD MEMBER [${loginIdent}];
    ALTER ROLE db_datawriter ADD MEMBER [${loginIdent}];
  `)
}
