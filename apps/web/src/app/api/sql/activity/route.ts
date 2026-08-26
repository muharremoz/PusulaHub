import { NextRequest, NextResponse } from "next/server"
import { sqlServerById } from "@/lib/hub-servers"
import { decrypt } from "@/lib/crypto"
import { withSqlConnection } from "@/lib/sql-external"
import { requirePermission } from "@/lib/require-permission"

/**
 * GET /api/sql/activity?serverId=…
 *
 * SQL sunucusunun ANLIK durumu: kim bağlı, kim çalışıyor, kim kimi bekletiyor.
 *
 * Neden bu kırılım: uygulama SQL'e tek bir ortak kimlikle (sa) ve tek makineden
 * (terminal sunucusu) bağlanıyor. Yani "hangi kullanıcı" ayrımı SQL tarafında
 * YAPILAMIYOR — ayırt edilebilir en ince birim veritabanı, o da firma demek.
 * Bu yüzden yoğunluk firma (veritabanı) kırılımında gösteriliyor.
 *
 * Bağlantı sayısı yükle karıştırılmamalı: uygulama havuz (pool) kullandığı için
 * yüzlerce oturum açık ama boşta olabilir. Yükün ölçüsü `aktif`, `toplam` değil.
 *
 * Tüm sorgular salt-okunur DMV'dir; sunucuya yazma yapılmaz.
 */

export interface SqlAktifIstek {
  spid:       number
  db:         string | null
  durum:      string
  saniye:     number
  cpuMs:      number
  bekleme:    string | null
  bloklayan:  number | null
  makine:     string | null
  sorgu:      string
}

export interface SqlDbYuk {
  db:      string | null
  oturum:  number
  aktif:   number
  cpuSn:   number
  io:      number
}

export interface SqlActivityResponse {
  ozet: {
    toplamOturum: number
    aktif:        number
    bloklanan:    number
    makine:       number
    veritabani:   number
    cpuYuzde:     number | null
    bellekMB:     number | null
    ple:          number | null
  }
  dbYuk:    SqlDbYuk[]
  istekler: SqlAktifIstek[]
  alindi:   string
}

/* Salt-okunur DMV'ler. READ UNCOMMITTED: canlı sunucuda kilit almayalım. */
const SORGU = `
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

-- (1) Özet
SELECT
  (SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1) AS toplamOturum,
  (SELECT COUNT(*) FROM sys.dm_exec_requests r
     JOIN sys.dm_exec_sessions s ON s.session_id = r.session_id
    WHERE s.is_user_process = 1
      AND r.session_id <> @@SPID          -- bu izleme sorgusunun kendisi
      AND (r.wait_type IS NULL OR r.wait_type NOT IN
           ('BROKER_RECEIVE_WAITFOR', 'BROKER_TASK_STOP', 'WAITFOR', 'BROKER_TO_FLUSH'))) AS aktif,
  (SELECT COUNT(*) FROM sys.dm_exec_requests WHERE blocking_session_id <> 0) AS bloklanan,
  (SELECT COUNT(DISTINCT host_name) FROM sys.dm_exec_sessions WHERE is_user_process = 1) AS makine,
  (SELECT COUNT(DISTINCT database_id) FROM sys.dm_exec_sessions WHERE is_user_process = 1) AS veritabani,
  (SELECT CAST(cntr_value / 1024 AS INT) FROM sys.dm_os_performance_counters
    WHERE counter_name = 'Total Server Memory (KB)') AS bellekMB,
  (SELECT cntr_value FROM sys.dm_os_performance_counters
    WHERE counter_name = 'Page life expectancy' AND object_name LIKE '%Buffer Manager%') AS ple;

-- (2) CPU — ring buffer'daki en son dakikalık örnek
SELECT TOP 1 kayit.value('(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]', 'int') AS cpuYuzde
FROM (SELECT CONVERT(xml, record) AS kayit, timestamp
      FROM sys.dm_os_ring_buffers
      WHERE ring_buffer_type = 'RING_BUFFER_SCHEDULER_MONITOR'
        AND record LIKE '%SystemHealth%') x
ORDER BY timestamp DESC;

-- (3) Veritabanı (firma) kırılımı
SELECT TOP 40
  DB_NAME(s.database_id) AS db,
  COUNT(*) AS oturum,
  SUM(CASE WHEN r.session_id IS NOT NULL THEN 1 ELSE 0 END) AS aktif,
  SUM(s.cpu_time) / 1000 AS cpuSn,
  SUM(s.reads + s.writes) AS io
FROM sys.dm_exec_sessions s
-- JOIN kosuluna filtre: Service Broker'in bekleme dongusu 'calisan' sayilmasin,
-- yoksa bosta duran bir veritabani surekli 1 aktif istek gosterir (yasandi).
LEFT JOIN sys.dm_exec_requests r
       ON r.session_id = s.session_id
      AND r.session_id <> @@SPID
      AND (r.wait_type IS NULL OR r.wait_type NOT IN
           ('BROKER_RECEIVE_WAITFOR', 'BROKER_TASK_STOP', 'WAITFOR', 'BROKER_TO_FLUSH'))
WHERE s.is_user_process = 1
GROUP BY s.database_id
ORDER BY SUM(CASE WHEN r.session_id IS NOT NULL THEN 1 ELSE 0 END) DESC, COUNT(*) DESC;

-- (4) Şu an çalışan istekler
SELECT TOP 30
  r.session_id AS spid,
  DB_NAME(r.database_id) AS db,
  r.status AS durum,
  r.total_elapsed_time / 1000 AS saniye,
  r.cpu_time AS cpuMs,
  r.wait_type AS bekleme,
  NULLIF(r.blocking_session_id, 0) AS bloklayan,
  s.host_name AS makine,
  SUBSTRING(REPLACE(REPLACE(t.text, CHAR(13), ' '), CHAR(10), ' '), 1, 300) AS sorgu
FROM sys.dm_exec_requests r
JOIN sys.dm_exec_sessions s ON s.session_id = r.session_id
OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE s.is_user_process = 1
  -- Panel kendini listelemesin: bu sorgu her yenilemede calisir ve bos bir
  -- sunucuda bile 'surekli bir sey calisiyor' izlenimi verirdi.
  AND r.session_id <> @@SPID
  -- Service Broker'in bekleme dongusu surekli 'suspended' gorunur ve
  -- saatlerdir calisan bir sorgu gibi listeyi kirletir; gercek is degil.
  AND (r.wait_type IS NULL OR r.wait_type NOT IN
       ('BROKER_RECEIVE_WAITFOR', 'BROKER_TASK_STOP', 'WAITFOR', 'BROKER_TO_FLUSH'))
ORDER BY r.total_elapsed_time DESC;
`

export async function GET(req: NextRequest) {
  const gate = await requirePermission("sql", "read")
  if (gate) return gate

  const serverId = (req.nextUrl.searchParams.get("serverId") ?? "").trim()
  if (!serverId) return NextResponse.json({ error: "serverId zorunlu" }, { status: 400 })

  try {
    const server = await sqlServerById(serverId)
    if (!server) return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })
    if (!server.sql_username || !server.sql_password) {
      return NextResponse.json(
        { error: "Bu sunucu için SA kimlik bilgisi tanımlı değil." },
        { status: 400 },
      )
    }
    const sifre = decrypt(server.sql_password)
    if (!sifre) {
      return NextResponse.json({ error: "SA şifresi çözülemedi." }, { status: 500 })
    }

    const setler = await withSqlConnection(
      {
        server: server.ip, port: 1433,
        user: server.sql_username, password: sifre,
        database: "master",
        requestTimeout: 15_000,   // canlı ekran; takılırsa beklemesin
      },
      async (pool) => {
        const res = await pool.request().query(SORGU)
        return res.recordsets as unknown as Record<string, unknown>[][]
      },
    )

    const [ozetSet = [], cpuSet = [], dbSet = [], istekSet = []] = setler
    const o = (ozetSet[0] ?? {}) as Record<string, number | null>
    /* mssql sürücüsü BIGINT'i (io, ple) string döndürüyor — sayıya çevir,
       yoksa sessizce 0 görünürler. */
    const sayi = (v: unknown): number => {
      if (typeof v === "number") return v
      if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : 0 }
      return 0
    }

    return NextResponse.json({
      ozet: {
        toplamOturum: sayi(o.toplamOturum),
        aktif:        sayi(o.aktif),
        bloklanan:    sayi(o.bloklanan),
        makine:       sayi(o.makine),
        veritabani:   sayi(o.veritabani),
        cpuYuzde:     cpuSet[0]?.cpuYuzde == null ? null : sayi(cpuSet[0].cpuYuzde),
        bellekMB:     o.bellekMB == null ? null : sayi(o.bellekMB),
        ple:          o.ple == null ? null : sayi(o.ple),
      },
      dbYuk: dbSet.map((r) => ({
        db:     (r.db as string | null) ?? null,
        oturum: sayi(r.oturum),
        aktif:  sayi(r.aktif),
        cpuSn:  sayi(r.cpuSn),
        io:     sayi(r.io),
      })),
      istekler: istekSet.map((r) => ({
        spid:      sayi(r.spid),
        db:        (r.db as string | null) ?? null,
        durum:     (r.durum as string) ?? "",
        saniye:    sayi(r.saniye),
        cpuMs:     sayi(r.cpuMs),
        bekleme:   (r.bekleme as string | null) ?? null,
        bloklayan: (r.bloklayan as number | null) ?? null,
        makine:    (r.makine as string | null) ?? null,
        sorgu:     ((r.sorgu as string | null) ?? "").trim(),
      })),
      alindi: new Date().toISOString(),
    } satisfies SqlActivityResponse)

  } catch (err) {
    console.error("[GET /api/sql/activity]", err)
    const msg = err instanceof Error ? err.message : "Aktivite alınamadı"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
