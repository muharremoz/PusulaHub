# Tetiklerdeki veritabanı adını düzeltme (ör. URNMIMRA → 4626_URNMIMRA)

**Sorun.** Firma datasındaki tetikler (trigger) başka bir veritabanına düz adıyla
atıf yapıyor — `URNMIMRA.dbo.TAAUretim` gibi. Sunucudaki gerçek ad ise firma kodu
önekli: `4626_URNMIMRA`. Bu haliyle tetiğin çalıştığı her INSERT/DELETE
"Invalid object name" ile patlar. Genelde data başka bir sunucudan taşındığında
(aktarım) ortaya çıkar: eski sunucuda veritabanı öneksizdi.

**İlk yaşandığı yer:** 2026-09-14, SQL `10.15.2.2`, `4626_MIMRA26` → `4626_URNMIMRA`.
10 tetikten 4'ü elle düzeltilmişti, kalan 6'sı bu script'le çevrildi.

**Kullanım:** her script'in başındaki iki değişkeni (`@duzAd`, `@dogruAd`) ve `USE`
satırındaki hedef datayı değiştirmen yeterli; gerisi aynen çalışır.

---

## 1. Önce bak (salt okunur)

`gecis` = düz ad kaç kez geçiyor, `zaten_dogru` = kaçı zaten köşeli parantezli doğru ad.
İkisi eşitse o tetik düzgün demektir.

```sql
USE [4626_MIMRA26];          -- hedef data
DECLARE @duzAd   sysname = N'URNMIMRA';          -- tetiklerde gecen yanlis/duz ad
DECLARE @dogruAd sysname = N'4626_URNMIMRA';     -- sunucudaki gercek ad

DECLARE @dogruTam nvarchar(300) = N'[' + @dogruAd + N']';

SELECT t.name AS tetik, OBJECT_NAME(t.parent_id) AS tablo, t.is_disabled AS kapali,
       (LEN(m.definition) - LEN(REPLACE(m.definition, @duzAd,    N''))) / LEN(@duzAd)    AS gecis,
       (LEN(m.definition) - LEN(REPLACE(m.definition, @dogruTam, N''))) / LEN(@dogruTam) AS zaten_dogru
FROM sys.triggers t JOIN sys.sql_modules m ON m.object_id = t.object_id
WHERE m.definition LIKE N'%' + @duzAd + N'%'
ORDER BY tablo, tetik;

-- sunucudaki gercek ad ne?
SELECT name FROM sys.databases WHERE name LIKE N'%' + @duzAd + N'%';
```

## 2. Düzelt

Zaten doğru olan `[4626_URNMIMRA].dbo.` geçişleri geçici bir imle korunur, yalnız düz
`URNMIMRA.dbo.` çevrilir — iki kez öneklenmesi böyle engellenir. Tetik tanımı
`CREATE` → `ALTER` yapılıp yeniden çalıştırılır.

```sql
USE [4626_MIMRA26];          -- hedef data
SET NOCOUNT ON;

DECLARE @duzAd   sysname = N'URNMIMRA';
DECLARE @dogruAd sysname = N'4626_URNMIMRA';

DECLARE @duzRef   nvarchar(300) = @duzAd + N'.dbo.';               -- URNMIMRA.dbo.
DECLARE @dogruRef nvarchar(300) = N'[' + @dogruAd + N'].dbo.';     -- [4626_URNMIMRA].dbo.
DECLARE @im       nvarchar(10)  = N'#@@#';                         -- gecici im

IF OBJECT_ID('tempdb..#tetik_yedek') IS NOT NULL DROP TABLE #tetik_yedek;
SELECT t.name AS tetik, m.definition AS eski
INTO #tetik_yedek
FROM sys.triggers t
JOIN sys.sql_modules m ON m.object_id = t.object_id
WHERE m.definition LIKE N'%' + @duzRef + N'%'
  AND REPLACE(m.definition, @dogruRef, N'') LIKE N'%' + @duzRef + N'%';

SELECT tetik FROM #tetik_yedek;   -- degisecekler

DECLARE @ad sysname, @d nvarchar(max), @p int;
DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT tetik, eski FROM #tetik_yedek;
OPEN c; FETCH NEXT FROM c INTO @ad, @d;
WHILE @@FETCH_STATUS = 0
BEGIN
  -- dogru olanlari koru, duzleri cevir
  SET @d = REPLACE(@d, @dogruRef, @im);
  SET @d = REPLACE(@d, @duzRef,   @dogruRef);
  SET @d = REPLACE(@d, @im,       @dogruRef);
  -- CREATE TRIGGER -> ALTER TRIGGER
  SET @p = PATINDEX(N'%CREATE%TRIGGER%', @d);
  SET @d = STUFF(@d, @p, 6, N'ALTER');
  BEGIN TRY
    EXEC sp_executesql @d;
    PRINT 'OK    ' + @ad;
  END TRY
  BEGIN CATCH
    PRINT 'HATA  ' + @ad + ' : ' + ERROR_MESSAGE();
  END CATCH
  FETCH NEXT FROM c INTO @ad, @d;
END
CLOSE c; DEALLOCATE c;

-- kontrol: duz ad kalan tetik olmamali (bos donmeli)
SELECT t.name AS kalan
FROM sys.triggers t
JOIN sys.sql_modules m ON m.object_id = t.object_id
WHERE REPLACE(m.definition, @dogruRef, N'') LIKE N'%' + @duzRef + N'%';
```

## 3. Doğrula

Her satırda `gecis = dogru` olmalı ve `gecersiz_modul` **0** dönmeli.

```sql
USE [4626_MIMRA26];          -- hedef data
DECLARE @duzAd   sysname = N'URNMIMRA';
DECLARE @dogruAd sysname = N'4626_URNMIMRA';

DECLARE @dogruTam nvarchar(300) = N'[' + @dogruAd + N']';

SELECT t.name AS tetik, OBJECT_NAME(t.parent_id) AS tablo, t.is_disabled AS kapali,
       CONVERT(varchar(19), o.modify_date, 120) AS degisti,
       (LEN(m.definition) - LEN(REPLACE(m.definition, @duzAd,    N''))) / LEN(@duzAd)    AS gecis,
       (LEN(m.definition) - LEN(REPLACE(m.definition, @dogruTam, N''))) / LEN(@dogruTam) AS dogru
FROM sys.triggers t JOIN sys.sql_modules m ON m.object_id = t.object_id
JOIN sys.objects o ON o.object_id = t.object_id
WHERE m.definition LIKE N'%' + @duzAd + N'%'
ORDER BY tablo, tetik;

SELECT COUNT(*) AS gecersiz_modul FROM sys.sql_expression_dependencies d
WHERE d.referenced_database_name = @duzAd;
```

---

## Dikkat

- **Geri dönüş:** eski tanımlar `#tetik_yedek`'te durur ama **yalnız o oturum boyunca**.
  Bağlantıyı kapatırsan gider; işin bitmeden SSMS sekmesini kapatma. Kalıcı isteniyorsa
  `SELECT * INTO dbo.tetik_yedek_20260914 FROM #tetik_yedek;` ile kaydet.
- **Kesinti:** `ALTER TRIGGER` tabloyu çok kısa kilitler; firma çalışırken uygulanabilir.
- **Düz ad doğru adın parçasıysa dikkat:** `URNMIMRA` metni `4626_URNMIMRA` içinde de
  geçtiği için sayım sorgusundaki `gecis` sütunu ikisini birden sayar — bu yüzden
  `gecis = dogru` eşitliği "hepsi düzeldi" anlamına gelir. Düzeltme script'i bu tuzağa
  düşmez, çünkü `.dbo.` ekiyle eşleşir ve doğru olanları önce ime alır.
- **Hangi geçiş nerede** diye bakmak istersen (45 karakterlik bağlam):

```sql
USE [4626_MIMRA26];          -- hedef data
SET NOCOUNT ON;
DECLARE @duzAd sysname = N'URNMIMRA';

DECLARE @r TABLE (tetik sysname, baglam nvarchar(200));
DECLARE @ad sysname, @d nvarchar(max), @p int;
DECLARE c CURSOR LOCAL FAST_FORWARD FOR
  SELECT t.name, m.definition FROM sys.triggers t
  JOIN sys.sql_modules m ON m.object_id = t.object_id
  WHERE m.definition LIKE N'%' + @duzAd + N'%';
OPEN c; FETCH NEXT FROM c INTO @ad, @d;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @p = CHARINDEX(@duzAd, @d);
  WHILE @p > 0
  BEGIN
    INSERT @r VALUES (@ad, REPLACE(REPLACE(SUBSTRING(@d, CASE WHEN @p > 20 THEN @p - 20 ELSE 1 END, 45), CHAR(13), ' '), CHAR(10), ' '));
    SET @p = CHARINDEX(@duzAd, @d, @p + LEN(@duzAd));
  END
  FETCH NEXT FROM c INTO @ad, @d;
END
CLOSE c; DEALLOCATE c;
SELECT * FROM @r ORDER BY tetik;
```

- Aynı sorun **view / stored procedure / fonksiyon**'da da olabilir. Onları taramak için
  `sys.sql_modules`'ü `sys.objects` ile birleştirip `o.type IN ('V','P','FN','IF','TF')`
  ile bak; düzeltme mantığı aynıdır (`CREATE` → `ALTER`).
