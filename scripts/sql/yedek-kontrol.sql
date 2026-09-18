SET NOCOUNT ON;
DECLARE @now datetime = GETDATE();
IF OBJECT_ID('tempdb..#k') IS NOT NULL DROP TABLE #k;
SELECT DISTINCT LTRIM(RTRIM(g.DataYolu)) COLLATE DATABASE_DEFAULT AS db INTO #k FROM sirket.dbo.guvenlik g WHERE g.YedekAl = 1;

IF OBJECT_ID('tempdb..#b') IS NOT NULL DROP TABLE #b;
SELECT bs.database_name COLLATE DATABASE_DEFAULT AS db, bs.type, bs.is_copy_only, bs.backup_finish_date, bs.backup_set_uuid, bs.differential_base_guid,
       mf.physical_device_name AS dev,
       ROW_NUMBER() OVER (PARTITION BY bs.database_name, bs.type, bs.is_copy_only ORDER BY bs.backup_finish_date DESC) AS rn
INTO #b FROM msdb.dbo.backupset bs JOIN msdb.dbo.backupmediafamily mf ON mf.media_set_id = bs.media_set_id
WHERE bs.backup_finish_date > DATEADD(day, -3, @now);

IF OBJECT_ID('tempdb..#o') IS NOT NULL DROP TABLE #o;
SELECT k.db,
  CASE WHEN d.name IS NULL THEN 1 ELSE 0 END AS db_yok,
  d.state_desc,
  f.backup_finish_date AS son_tam, f.backup_set_uuid AS tam_uuid,
  c.backup_finish_date AS son_copyonly,
  i.backup_finish_date AS son_diff, i.differential_base_guid AS diff_taban
INTO #o FROM #k k
LEFT JOIN sys.databases d ON d.name COLLATE DATABASE_DEFAULT = k.db
LEFT JOIN #b f ON f.db = k.db AND f.type = 'D' AND f.is_copy_only = 0 AND f.rn = 1
LEFT JOIN #b c ON c.db = k.db AND c.type = 'D' AND c.is_copy_only = 1 AND c.rn = 1
LEFT JOIN #b i ON i.db = k.db AND i.type = 'I' AND i.rn = 1;

PRINT '=== OZET';
SELECT COUNT(*) AS kapsam,
  SUM(db_yok) AS sunucuda_yok,
  SUM(CASE WHEN db_yok=0 AND (son_tam IS NULL OR son_tam < DATEADD(hour,-26,@now)) THEN 1 ELSE 0 END) AS tam_26s_eski,
  SUM(CASE WHEN db_yok=0 AND (son_diff IS NULL OR son_diff < DATEADD(minute,-45,@now)) THEN 1 ELSE 0 END) AS diff_45dk_eski,
  SUM(CASE WHEN db_yok=0 AND son_diff IS NOT NULL AND (tam_uuid IS NULL OR diff_taban <> tam_uuid) THEN 1 ELSE 0 END) AS taban_uyumsuz,
  SUM(CASE WHEN db_yok=0 AND (son_copyonly IS NULL OR son_copyonly < DATEADD(hour,-26,@now)) THEN 1 ELSE 0 END) AS copyonly_26s_eski
FROM #o;

PRINT '=== ZAMAN ARALIKLARI (en eski / en yeni)';
SELECT CONVERT(varchar(16),MIN(son_tam),120) AS tam_min, CONVERT(varchar(16),MAX(son_tam),120) AS tam_max,
       CONVERT(varchar(16),MIN(son_diff),120) AS diff_min, CONVERT(varchar(16),MAX(son_diff),120) AS diff_max,
       CONVERT(varchar(16),MIN(son_copyonly),120) AS co_min, CONVERT(varchar(16),MAX(son_copyonly),120) AS co_max,
       CONVERT(varchar(16),@now,120) AS simdi FROM #o WHERE db_yok=0;

PRINT '=== SORUNLU KAYITLAR';
SELECT LEFT(db,32) AS db, db_yok, LEFT(ISNULL(state_desc,'-'),8) AS durum,
  ISNULL(CONVERT(varchar(16),son_tam,120),'-') AS son_tam,
  ISNULL(CONVERT(varchar(16),son_diff,120),'-') AS son_diff,
  ISNULL(CONVERT(varchar(16),son_copyonly,120),'-') AS son_copyonly,
  CASE WHEN son_diff IS NOT NULL AND (tam_uuid IS NULL OR diff_taban <> tam_uuid) THEN 'UYUMSUZ' ELSE '' END AS taban
FROM #o WHERE db_yok=1
   OR son_tam IS NULL OR son_tam < DATEADD(hour,-26,@now)
   OR son_diff IS NULL OR son_diff < DATEADD(minute,-45,@now)
   OR (son_diff IS NOT NULL AND (tam_uuid IS NULL OR diff_taban <> tam_uuid))
   OR son_copyonly IS NULL OR son_copyonly < DATEADD(hour,-26,@now)
ORDER BY db;

PRINT '=== KAPSAM DISI KULLANICI VERITABANLARI (guvenlik YedekAl=1 degil)';
SELECT LEFT(d.name,40) AS db, d.state_desc, CONVERT(varchar(10),d.create_date,120) AS olusturma
FROM sys.databases d WHERE d.database_id > 4 AND d.name COLLATE DATABASE_DEFAULT NOT IN (SELECT db FROM #k) ORDER BY d.name;

PRINT '=== UYUMSUZ TABANI KIM ALDI (son tam yedegin hedefi)';
SELECT LEFT(o.db,32) AS db, CONVERT(varchar(16),b.backup_finish_date,120) AS tarih, b.is_copy_only AS co, LEFT(b.dev,70) AS hedef
FROM #o o JOIN #b b ON b.db=o.db AND b.type='D' AND b.backup_set_uuid = o.diff_taban
WHERE o.son_diff IS NOT NULL AND (o.tam_uuid IS NULL OR o.diff_taban <> o.tam_uuid);
