# Firma aktarımı sonrası şube transferi ayarı (URN* + şube kodları)

Çok şubeli perakende firmalarda şubeler, satış/cari/stok bilgisini **tetiklerle**
merkezdeki bir "transfer datası"na yazar (`URNOZLEM`, `URNZUMRA`, `URNTRANSFER`…).
Firma başka sunucudan aktarıldığında bu zincir **sessizce** kopar: hata vermez,
kayıtlar ya yazılmaz ya da şube numarası boş yazılır.

**İlk yapıldığı yer:** 2026-09-30, SQL `10.15.2.2`, firma **4022 ALMANYA ÖZLEM**
(eski sunucu PusulaSQL02). Aşağıda 4. bölüm o işin tam kaydıdır.

İlgili: [sql-tetik-db-adi-duzeltme.md](sql-tetik-db-adi-duzeltme.md) (tetikteki
veritabanı **adı** yanlışsa).

---

## 1. Zincir nasıl çalışıyor

Şube datasındaki tetikler (`FirmaTrig`, `CARHRKtransfer`, `CARHRKtransfersil`,
`Harekettransfer`, `HarekettransferSil`, `AASTOKtransfer`, `ozelAyar`, `ozelgrup`,
`ozelmalzeme`, `ozelozeltipler`) önce **kendi şube numarasını** bulur:

```sql
select TOP 1 @MRKZ = isnull(sube_no,-1) from URNOZLEM.dbo.subeler
INNER join sirket.dbo.guvenlik on KOD = sube_no where DataYolu = DB_NAME()
if(@MRKZ=-1) return   -- DİKKAT: eşleşme yoksa @MRKZ NULL kalır, bu kontrol YAKALAMAZ
```

Karşı şubeyi ise firmanın kasasından bulur:

```sql
inner join firma on firmaKodu = Firkod
inner join Banko on Sube_ID = banko_ID
inner join URNOZLEM.dbo.subeler on sube_no = cast(banko_Tanim as int)
```

Yani **aynı numara dört yerde birebir tutmalı**:

| Yer | Anlamı |
|---|---|
| `sirket.dbo.guvenlik.KOD` (şube datası satırı) | Datanın şubesi. Aynı zamanda programın **DATA KODU** → giriş ekranı |
| `URN*.dbo.subeler.sube_no` | Transfer datasındaki şube listesi |
| Her şube datasında `dbo.Banko.banko_Tanim` | Diğer şubelerin kasası = o şubenin numarası |
| `URN*.dbo.T*` tablolarında `mrkz` (TAAStok, TAATas, TCarHrk, THareket) | Bekleyen/işlenmiş transfer kaydının şubesi |

Eski sunucuda her şubenin **kendi KOD'u** vardı (ör. ÖZLEM 3844-3847). Bizde aktarım
tüm datalara firma kodunu (4022) yazar → eşleşme biter.

## 2. Aktarım sonrası kontrol listesi (salt okunur)

1. **Transfer datası var mı, öneksiz mi?** Tetikler `URNxxx.dbo.` diye öneksiz ad
   kullanır. Transfer datası öneksiz bağlanmalı (bkz. 3.1). Eski yıl dataları arasında
   gelebilir (`Depo D:\Eski Datalar\{firma}`), ayrıca sorulmalı.
2. **Tetiklerin gittiği veritabanları** — hepsi sunucuda olmalı, başka firmanın
   transfer datası olmamalı:

```sql
-- her şube datası için
SELECT o.name, d.referenced_database_name, d.referenced_entity_name
FROM sys.sql_expression_dependencies d JOIN sys.objects o ON o.object_id = d.referencing_id
WHERE d.referenced_database_name NOT IN ('master','sirket');
```
   Metin taraması daha kesin (dinamik SQL'i de yakalar): `sys.sql_modules.definition`
   içinde `xxx.dbo.` / `[xxx].dbo.` desenleri.

3. **Şube eşleşmesi** — her şube datası kendi numarasını bulmalı, NULL dönmemeli:

```sql
-- şube datası içinde çalıştır
declare @m int;
select TOP 1 @m = isnull(sube_no,-1) from URNOZLEM.dbo.subeler
INNER join sirket.dbo.guvenlik on KOD = sube_no where DataYolu = DB_NAME();
select DB_NAME() data, @m bulunan_sube;
```

4. **Kasa numaraları** — `subeler` ile aynı numaralar mı:

```sql
SELECT banko_ID, banko_Tanim FROM dbo.Banko WHERE ISNUMERIC(banko_Tanim) = 1;
SELECT * FROM URNOZLEM.dbo.subeler;
```

5. **Eski transfer kayıtları** — `mrkz` değerleri ve bekleyenler (`durum = 0`):

```sql
SELECT mrkz, COUNT(*) adet, SUM(CASE WHEN durum = 1 THEN 1 ELSE 0 END) durum1,
       MIN(trntarih) ilk, MAX(trntarih) son FROM URNOZLEM.dbo.TAAStok GROUP BY mrkz;
-- TAATas (trntarih), TCarHrk (CariTrh), THareket (Fistrh, durum yok) aynı şekilde
```

6. **Eski kodlar bizde başka firmaya ait mi?** Eski sunucunun KOD'larını aynen
   **kullanma** — bizde firma numarasıdır:

```sql
SELECT srkadi, DataYolu, KOD, PusulaFirmaId FROM sirket.dbo.guvenlik WHERE KOD IN (<eski kodlar>);
```

## 3. Düzeltme

### 3.1 Transfer datasını öneksiz bağla, giriş ekranında gizle

- Dosyaları `D:\SQLData\{firma}\` altına koy (aktarım klasöründe bırakma).
- **SQL servis hesabına dosya izni ver**, yoksa veritabanı salt-okunur açılır:
  `icacls <dosya> /grant "NT SERVICE\MSSQLSERVER:(F)"`
- `CREATE DATABASE [URNxxx] ON (FILENAME=...mdf),(FILENAME=...ldf) FOR ATTACH;`
- Sahip = firmanın SQL kullanıcısı: `ALTER AUTHORIZATION ON DATABASE::[URNxxx] TO [{firma}.xxx1];`
- `guvenlik`'e satır (bir şube satırının kopyası): `srkadi = DataYolu = 'URNxxx'`,
  **`KOD = 99999`** (giriş ekranında görünmez; URNMIMRA, SEMIH_TRANSFER de böyle),
  `PusulaFirmaId = {firma}` (Hub firma sayfasında görünür), `YedekAl = 1`.
- Backup Master'ı eşitle: `node apps/web/__bm-esitle.mjs --uygula`
  (yedek işi çalışıyorsa değişiklik yapmaz, sonra tekrar dene).

### 3.2 Yeni şube kodları

`{firma}` + sıra: merkez `{firma}`, toptan `{firma}1`, şubeler `{firma}2`, `{firma}3`…
Hepsi **tek transaction**, önce yedek:

```sql
SET XACT_ABORT ON; BEGIN TRAN;
SELECT srkkod, srkadi, DataYolu, KOD INTO sirket.dbo.guvenlik_yedek_{firma}_YYYYMMDD
  FROM sirket.dbo.guvenlik WHERE PusulaFirmaId = {firma};
SELECT * INTO URNxxx.dbo.subeler_yedek_YYYYMMDD FROM URNxxx.dbo.subeler;

UPDATE sirket.dbo.guvenlik SET KOD = {yeni} WHERE PusulaFirmaId = {firma} AND DataYolu LIKE '{firma}[_]<sube>%';
-- ... her şube için
UPDATE URNxxx.dbo.subeler SET sube_no = CASE sube_no WHEN <eski> THEN <yeni> ... END
  WHERE sube_no IN (<eski kodlar>);
COMMIT;
```

### 3.3 Kasa numaraları (her şube datasında, toptan hariç)

```sql
-- her şube datasında
SET XACT_ABORT ON; BEGIN TRAN;
IF OBJECT_ID('dbo.Banko_yedek_YYYYMMDD') IS NULL SELECT * INTO dbo.Banko_yedek_YYYYMMDD FROM dbo.Banko;
UPDATE dbo.Banko SET banko_Tanim = CASE LTRIM(RTRIM(CAST(banko_Tanim AS nvarchar(50))))
    WHEN '<eski1>' THEN '<yeni1>' WHEN '<eski2>' THEN '<yeni2>' ... END
  WHERE LTRIM(RTRIM(CAST(banko_Tanim AS nvarchar(50)))) IN ('<eski1>','<eski2>',...);
COMMIT;
```

`subeler`'de karşılığı olmayan kasalara (başka firma, kapanmış şube) dokunma.

### 3.4 Eski transfer kayıtları

```sql
USE URNxxx; SET XACT_ABORT ON; BEGIN TRAN;
SELECT * INTO dbo.TAAStok_yedek_YYYYMMDD  FROM dbo.TAAStok;   -- TAATas, TCarHrk, THareket de
UPDATE dbo.TAAStok SET mrkz = CASE mrkz WHEN <eski> THEN <yeni> ... END WHERE mrkz IN (...);
-- TAATas, TCarHrk, THareket aynı
COMMIT;
```

Önce URN* datasında bu tablolarda tetik olmadığını kontrol et (`sys.triggers`).

### 3.5 Tetik başka firmanın transfer datasına gidiyorsa

Tek tetikte ad değişikliği — [sql-tetik-db-adi-duzeltme.md](sql-tetik-db-adi-duzeltme.md)
yöntemi. Eski tanımı datada kalıcı tabloya yedekle (`dbo.tetik_yedek_YYYYMMDD`),
`REPLACE(def, 'YANLIS', 'DOGRU')`, `CREATE`→`ALTER`, çalıştır. Sonra tetiğin
kullandığı sütunların hedefte var olduğunu doğrula:

```sql
SELECT referenced_entity_name, referenced_minor_name
FROM sys.dm_sql_referenced_entities('dbo.AASTOKtransfer','OBJECT')
WHERE referenced_database_name = 'URNxxx' AND referenced_minor_name IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM URNxxx.sys.columns c
                  WHERE c.object_id = OBJECT_ID('URNxxx.dbo.' + referenced_entity_name)
                    AND c.name = referenced_minor_name);   -- boş dönmeli
```

### 3.6 Program klasörleri (terminal)

Giriş ekranı `guvenlik.KOD = DATA KODU` satırlarını listeler. Şubelere ayrı KOD
verilince her şubeye `C:\MUSTERI\{firma}\` altında **kendi DATA KODU'lu** ayrı
program klasörü gerekir; yoksa o şubeler giriş ekranında görünmez.

## 4. Deneme — geri alınabilir (ROLLBACK)

Tetiklerde transaction dışına taşan iş olmadığını önce kontrol et (`xp_`, `sp_send`,
`OPENROWSET`, `OPENQUERY`, `sp_OA`, `COMMIT` geçmemeli). Sonra programın SQL
kullanıcısı adına, her deneme kendi transaction'ında, sonucu okuyup **ROLLBACK**:

```sql
USE [<sube datasi>];
EXECUTE AS LOGIN = '<firma>.xxx1';
BEGIN TRAN;
  -- a) Firma ekle -> URNxxx.dbo.Firmalar (Ozel = şube no)
  DECLARE @kod numeric(18,0) = (SELECT MAX(firmaKodu) + 1 FROM dbo.Firma);
  SELECT TOP 1 * INTO #f FROM dbo.Firma WHERE firmaTipi = 'TOPTANCI';
  UPDATE #f SET firmaKodu = @kod, firmaTanimi = 'ZZ TRANSFER TEST';
  INSERT INTO dbo.Firma SELECT * FROM #f;
  SELECT * FROM URNxxx.dbo.Firmalar WHERE FirmaNo = @kod;       -- Ozel = kendi şube no
  -- b) Stok kartı güncelle (hata vermemeli; tek başına transfer satırı üretmez)
  -- c) Karşı şube kasasına giden bir cari hareketin kopyası (CSatnum = -987654)
  --    -> URNxxx.dbo.TCarHrk'te mrkz = kendi şube, kod = karşı şube
ROLLBACK;
REVERT;
```

Sonra test kayıtlarının hiçbir yerde kalmadığını ve `@@TRANCOUNT = 0` olduğunu kontrol et.
Stok transferi yalnız **başka şubeye satışta** oluşur (`satilanAdet <> 0`,
`SatisKime` = kasalı firma).

---

## 5. Kayıt — 4022 ALMANYA ÖZLEM (2026-09-30)

**Aktarım.** Güncel datalar ilk oturumda yarıda kesildi ("The operation was aborted"),
müşteri yeniden yükledi, 13 data `4022_` önekiyle bağlandı. Eski yıl dataları (30 dosya,
6,95 GB) ve 77.669 resim Depo'ya gitti. **URNOZLEM eski yıl dataları arasında geldi**
— aslında transfer datası.

**URNOZLEM.** Depo `D:\Eski Datalar\4022` → SQL `D:\SQLData\4022\URNOZLEM.mdf` /
`URNOZLEM_log.ldf`; öneksiz bağlandı, sahip `4022.ozlem1`, 13 tablo. `guvenlik`
srkkod **605**, `KOD 99999`, `PusulaFirmaId 4022`, `YedekAl 1`. Backup Master'a
eklenemedi (yedek işi çalışıyordu) — **açık**.

**Eski sunucu (PusulaSQL02) kodları → yeni kodlar.** 3844-3847 bizde başka firmalar
(3844 ASYA BURMA, 3845 POLATLI GÖKHAN ARSLAN, 3846 ARIZAN, 3847 ALMANYA KRAL) —
kullanılmadı.

| Şube | Eski KOD | Yeni KOD | Datalar |
|---|---|---|---|
| Merkez / PRK | 3844 | 4022 | güncel data yok (eski yıllar Depo'da) |
| Toptan | 3844 (PrgTur 011) | 40221 (değişmedi) | OZLEMTPT20, OZLEMTPTAG, OZLEMTPTAG25 |
| GUMMER | 3845 (GUMMER25: 38455) | 40222 | GUMMER, 24, 25, 225 |
| REMS | 3846 (REMS24 PrgTur 9099) | 40223 | REMS, 24, 25 |
| KOLN | 3847 | 40224 | KOLN, 24, 25 |

Eski sunucuda gizli olan GUMMER25 (38455) ve REMS24 (9099) artık kendi grubunda, görünür.

**Yapılanlar**

| Adım | Nerede | Yedek |
|---|---|---|
| `guvenlik.KOD` → 40222/40223/40224 | `sirket` | `sirket.dbo.guvenlik_yedek_4022_20260930` |
| `subeler.sube_no` → 4022/40222/40223/40224 | `URNOZLEM` | `URNOZLEM.dbo.subeler_yedek_20260930` |
| Eski transfer kayıtları `mrkz` (4.702 kayıt, 227 bekleyen) | `URNOZLEM` TAAStok/TAATas/TCarHrk/THareket | `URNOZLEM.dbo.<tablo>_yedek_20260930` |
| `Banko.banko_Tanim` (37 kasa; 3848 ve 3378'e dokunulmadı) | 10 şube datası | her datada `dbo.Banko_yedek_20260930` |
| `AASTOKtransfer` `URNTRANSFER` (2642 MERS!) → `URNOZLEM` | `4022_OZLEMKOLN25` | `dbo.tetik_yedek_20260930` |

KOLN25 tetiği `try/catch`'siz, `AAStok` her güncellemede çalışıyordu ve
`4022.ozlem1`'in URNTRANSFER'da hesabı yok → o datada stok kartı güncellemesi hata
verip geri alınacaktı. KOLN25 sürümü KOLN24'tekinden uzun (22179 karakter, ZUMRA'daki
sürümle aynı); yalnız ad değişti, 118 sütun URNOZLEM'de doğrulandı.

**Deneme (ROLLBACK, `4022.ozlem1`)**

| Test | Sonuç |
|---|---|
| Firma ekle — KOLN / KOLN25 / GUMMER / REMS | Firmalar'a şube 40224 / 40224 / 40222 / 40223 ✔ |
| Stok kartı güncelle — aynı 4 data | hata yok ✔ |
| Cari hareket KOLN → REMS kasası | TCarHrk mrkz 40224, kod 40223 ✔ |
| Cari hareket GUMMER → KOLN kasası | mrkz 40222, kod 40224 ✔ |
| Cari hareket REMS → KOLN kasası | mrkz 40223, kod 40224 ✔ |

Test kayıtlarından hiçbiri kalmadı, açık transaction yok.

**Açık kalanlar**
- URNOZLEM'i Backup Master'a ekle (`__bm-esitle.mjs --uygula`).
- Terminal 2 `C:\MUSTERI\4022\Perakende` DATA KODU 4022 — artık bu kodda güncel data
  yok. GUMMER 40222, REMS 40223, KOLN 40224 için ayrı program klasörleri (kullanıcı).
- 3377 ZUMRA: `URNZUMRA.subeler` 3377 ZUMRA / 33771 ZUMRABLUE, ama ZUMRABLUE
  datalarının `guvenlik.KOD`'u da 3377 → BLUE transferleri ZUMRA numarasıyla yazılır.
  Kasa numaraları ve bekleyen kayıtlar kontrol edilmedi.
