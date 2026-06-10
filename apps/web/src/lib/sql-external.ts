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
  const buildPool = () => new sql.ConnectionPool({
    server:   cfg.server,
    port:     cfg.port ?? 1433,
    user:     cfg.user,
    password: cfg.password,
    database: cfg.database ?? "master",
    options: {
      trustServerCertificate: true,
      encrypt: false,
    },
    // 5000 dar geliyordu: tek bir SYN kaybı/retransmit veya SQL login
    // gecikmesi 5 sn'i aşınca "Failed to connect ... in 5000ms" ile kurulum
    // adımı patlıyordu (örn. sihirbaz restore adımı). 15 sn + retry ile
    // geçici ağ takılmaları emilir.
    connectionTimeout: 15000,
    requestTimeout:    cfg.requestTimeout ?? 10000,
    pool: {
      max: 2,
      min: 0,
      // 5000 → 30000: uzun süren adımlar (RESTORE vb.) arasında bağlantı
      // boşta kapanıp bir SONRAKİ iş isteğinin ortasında yeniden TCP
      // bağlantısı kurulmasını (ve oradaki connect hatasını) engeller.
      idleTimeoutMillis: 30000,
    },
  })

  // Bağlantıyı warm-up sorgusuyla doğrula — ilk gerçek TCP bağlantısı
  // burada kurulsun ki connect hatası iş adımına değil bağlantı fazına
  // düşsün. Geçici hata için 1 kez yeniden dene (2 sn bekleyerek).
  let pool = buildPool()
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.connect()
      await pool.request().query("SELECT 1")
      break
    } catch (err) {
      try { await pool.close() } catch { /* noop */ }
      if (attempt >= 2) throw err
      await new Promise((r) => setTimeout(r, 2000))
      pool = buildPool()
    }
  }

  try {
    return await fn(pool)
  } finally {
    try { await pool.close() } catch { /* noop */ }
  }
}
