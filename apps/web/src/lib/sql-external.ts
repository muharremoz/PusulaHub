import sql from "mssql"

/**
 * Harici (firma) SQL sunucularına bağlanmak için helper.
 * `db.ts` sadece PusulaHub'ın kendi DB'sine bağlanır;
 * burası ise ServerRoles='SQL' olan her sunucuya parametrize bağlanır.
 *
 * Credentials her sunucu için Servers tablosunda (SqlUsername/SqlPassword)
 * saklanır — çağıran bunları DB'den okuyup buraya geçirmekle yükümlüdür.
 */

export interface SqlExternalConfig {
  server:          string
  port?:           number
  user:            string
  password:        string
  database?:       string
  requestTimeout?: number   // ms cinsinden, varsayılan 10000
}

export async function withSqlConnection<T>(
  cfg: SqlExternalConfig,
  fn: (pool: sql.ConnectionPool) => Promise<T>,
): Promise<T> {
  const pool = new sql.ConnectionPool({
    server:   cfg.server,
    port:     cfg.port ?? 1433,
    user:     cfg.user,
    password: cfg.password,
    database: cfg.database ?? "master",
    options: {
      trustServerCertificate: true,
      encrypt: false,
    },
    connectionTimeout: 5000,
    requestTimeout:    cfg.requestTimeout ?? 10000,
    pool: {
      max: 2,
      min: 0,
      idleTimeoutMillis: 5000,
    },
  })

  try {
    await pool.connect()
    return await fn(pool)
  } finally {
    try { await pool.close() } catch { /* noop */ }
  }
}
