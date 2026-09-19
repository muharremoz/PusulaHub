/*
  Müşteri PC — SQL Server'daki TÜM kullanıcı veritabanlarını C:\Aktarim\ altına .bak olarak alır.
  Aktarım sayfasına (Veri Dosyası kartı) bu klasördeki .bak dosyaları yüklenir.

  Kullanım: SSMS'te sysadmin yetkili kullanıcıyla (sa veya Windows yöneticisi) aç, F5.

  - COPY_ONLY: müşterinin kendi yedek zincirini bozmaz.
  - Klasörü SQL Server kendisi açar (xp_create_subdir) → servis hesabının yazma
    yetkisi olur; elle açılan klasörde "Operating system error 5 (Access is denied)" çıkıyordu.
  - Sıkıştırma: sürüme göre baştan belirlenir (Express ve 2005'te yok, 2008'de yalnız
    Enterprise, 2008 R2+'da Standard da). Yine de sıkıştırmalı yedek hata verirse o veritabanı
    bir kez sıkıştırmasız denenir. SQL Server 2005'te de çalışır (+= kullanılmadı).
  - Bir veritabanı hata verirse atlanır, diğerleri devam eder; sonda özet yazılır.
  - Aynı adlı eski .bak'ın üzerine yazar (INIT).
*/
SET NOCOUNT ON;

DECLARE @klasor nvarchar(260);
SET @klasor = N'C:\Aktarim\';
EXEC master.dbo.xp_create_subdir @klasor;

-- Sıkıştırma desteği. ERROR_NUMBER() ile yakalanamıyor: BACKUP hatası 1844 + 3013 atar,
-- CATCH yalnız sonuncuyu (3013) görür. Bu yüzden sürümden hesaplanıyor.
DECLARE @surum nvarchar(128), @ana int, @ara int, @edition int, @sikistir bit;
SET @surum   = CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128));
SET @ana     = CAST(PARSENAME(@surum, 4) AS int);
SET @ara     = CAST(PARSENAME(@surum, 3) AS int);
SET @edition = CAST(SERVERPROPERTY('EngineEdition') AS int);   -- 2 Standard, 3 Enterprise/Developer, 4 Express
SET @sikistir = CASE
  WHEN @edition = 4 THEN 0                                   -- Express: yok
  WHEN @ana < 10 THEN 0                                      -- 2005: yok
  WHEN @ana = 10 AND @ara < 50 AND @edition <> 3 THEN 0      -- 2008: yalnız Enterprise
  ELSE 1 END;
DECLARE @sikistirInt int;   -- RAISERROR bit kabul etmiyor
SET @sikistirInt = @sikistir;
RAISERROR(N'SQL Server %s, sikistirma: %d', 0, 1, @surum, @sikistirInt) WITH NOWAIT;

DECLARE @ad sysname, @dosya nvarchar(400), @sql nvarchar(max), @m nvarchar(2048);
DECLARE @tamam int, @hata int;
SET @tamam = 0; SET @hata = 0;

DECLARE c CURSOR LOCAL FAST_FORWARD FOR
  SELECT name FROM sys.databases
  WHERE database_id > 4                -- master, tempdb, model, msdb hariç
    AND state_desc = 'ONLINE'
    AND source_database_id IS NULL     -- snapshot'lar hariç
  ORDER BY name;

OPEN c;
FETCH NEXT FROM c INTO @ad;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @dosya = @klasor + REPLACE(REPLACE(@ad, N'\', N'_'), N'/', N'_') + N'.bak';
  RAISERROR(N'>> %s yedekleniyor...', 0, 1, @ad) WITH NOWAIT;

  BEGIN TRY
    SET @sql = N'BACKUP DATABASE ' + QUOTENAME(@ad) + N' TO DISK = @d WITH COPY_ONLY, INIT, CHECKSUM'
             + CASE WHEN @sikistir = 1 THEN N', COMPRESSION' ELSE N'' END;
    EXEC sp_executesql @sql, N'@d nvarchar(400)', @d = @dosya;
    SET @tamam = @tamam + 1;
  END TRY
  BEGIN CATCH
    IF @sikistir = 1                             -- sıkıştırmasız bir kez daha dene
    BEGIN
      BEGIN TRY
        SET @sql = N'BACKUP DATABASE ' + QUOTENAME(@ad) + N' TO DISK = @d WITH COPY_ONLY, INIT, CHECKSUM';
        EXEC sp_executesql @sql, N'@d nvarchar(400)', @d = @dosya;
        SET @tamam = @tamam + 1;
      END TRY
      BEGIN CATCH
        SET @hata = @hata + 1; SET @m = ERROR_MESSAGE();
        RAISERROR(N'!! %s ATLANDI: %s', 0, 1, @ad, @m) WITH NOWAIT;
      END CATCH
    END
    ELSE
    BEGIN
      SET @hata = @hata + 1; SET @m = ERROR_MESSAGE();
      RAISERROR(N'!! %s ATLANDI: %s', 0, 1, @ad, @m) WITH NOWAIT;
    END
  END CATCH

  FETCH NEXT FROM c INTO @ad;
END
CLOSE c; DEALLOCATE c;

RAISERROR(N'=== Bitti: %d veritabani yedeklendi, %d hata. Klasor: %s', 0, 1, @tamam, @hata, @klasor) WITH NOWAIT;
