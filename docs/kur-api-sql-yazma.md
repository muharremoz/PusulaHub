# kur-api → SQL (PUSLICANCE) kur yazma

> Durum: **CANLIDA** — 12.10.2026 20:14'ten beri kur-api dakikada bir yazıyor (Harem + Ozan + AltınKaynak).
> Amaç: datshop (Harem) erişim izni 10.15.2.6'nın IP'sine verildi; kurlar bu
> sunucudaki `kur-api` üzerinden SQL sunucusundaki kur veritabanına yazılacak.
> Yazma yöntemi KurPanel'den alındı.

## 1. Keşif bulguları

### Kaynak sunucu — 10.15.2.6 (Ubuntu, "Fastify API" sunucusu)

| | |
|---|---|
| Uygulama | pm2 `kur-api` → `/root/api.pusulanet.net/app.js` (gözcü süreç) → `src/bootstrap.js` |
| Proje | `api.pusulanet.net` (Node 20, CommonJS, `socket.io-client`, `dotenv`); **git yok**, yerel kopyası da yok |
| Kaynaklar | datshop (Socket.IO), ozankur, altinkaynak, tcmb, pusula (`src/sources/*`) |
| datshop | `connected`, veri canlı geliyor (`/health` → `services.upstream.datshop`) |
| SQL erişimi | 10.15.2.6 → 10.15.2.2:1433 **açık** |
| Ayarlar | `.env` (DATSHOP_KEY vb.), `src/config/env.js` |

**Tuzak — sembol adları:** `datshopSource.js` gelen veriyi `normalizeInstrument`
ile kendi kataloğuna çevirip saklıyor (`ALTIN` → `XAUTRYHAS`, `XAUUSD` → `ONS`).
SQL'deki eşleme ise Harem'in **ham** sembollerini bekliyor (`ALTIN`, `USDTRY`,
`ATA_ESKI`…). Bu yüzden SQL yazıcısı `marketDataStore`'dan değil, datshop'un
**ham** `price_changed` verisinden beslenmeli.

Ham Harem kaydı (örnek):
```json
{"symbol":"ALTIN","bid":6576.9,"ask":6609.8,"timestamp":"2026-10-12T20:03:06+03:00", ...}
```
`timestamp` saat dilimli doğru zaman. `timestamp_utc` bazı kayıtlarda yanlış
(yerel saat "Z" ile yazılmış) → **kullanılmaz**.

### Hedef — SQL 10.15.2.2, veritabanı `PUSLICANCE`

`PUSLIC` adında veritabanı yok; kur tabloları `PUSLICANCE`'ta:
`Rate`, `RateList`, `RateLog`, `RateCompany`, `RateAuth`, yordam `dbo.SetRateList`.

`RateCompany`: 1 HAREM · 2 PUSULA · 3 ÖZBAĞ · 4 OZAN DÖVİZ · 5 ALTIN KAYNAK.

`SetRateList(@json)` ne yapar:
1. `RateLog`'a o günün JSON'unu yazar (gün başına tek satır, 15 günden eskiyi siler).
2. JSON'u `RateList` ile `RateId + Code` üzerinden eşler → `RatePSLCode` (`H_USDTRY`, `H_HASTRY`…).
3. `CounterCode` tanımlı satırlar için türetilmiş kur üretir (ör. `P_CYRKTRY` = `H_HASTRY` × marj).
4. Bu kodların `Rate` satırlarını silip yenilerini ekler (Buy ve Sale > 0 olanlar).
5. Hata olursa sessizce yutar (`BEGIN CATCH END CATCH`) — **yazma başarısını
   `Rate.CreateDate`'ten doğrulamak gerekir**.

Harem (RateId 1) için `RateList`'te 41 kod tanımlı; Harem 182 sembol gönderiyor,
eşlemesi olmayanlar yordam tarafından yok sayılır.

### Mevcut yazıcı

`PUSLICANCE`'a bugün de yazılıyordu: `RateLog`'daki son JSON 410 kayıt,
RateId 1, 3, 4, 5 (Harem, Özbağ, Ozan, AltınKaynak — KurPanel'in dört kaynağı).
**Son yazma 12.10.2026 18:45 (TR); 20:02 itibarıyla yeni yazma yok.**
Yazan uygulamanın hangi makinede çalıştığı tespit edilemedi (veritabanına bağlı
oturumlar `sa` / SRVW136 94.199.202.136 ve SSMS; yazma anında yakalanmadı).

### Ozan ve AltınKaynak (RateId 4, 5)

`RateList`'te Ozan için 44, AltınKaynak için 36 kod tanımlı; KurPanel'in gönderdiği
kodlar bunlarla birebir (ham kod). kur-api bu iki kaynağı da kendi adlarına
çeviriyor → yazıcı burada da **ham yanıttan** beslenmeli:

| Kaynak | kur-api'de ham veri | KurPanel kuralı |
|---|---|---|
| Ozan (4) | `ozankurSource.js` → `response.body` (JSON, `data: { <kod>: { alis, satis } }`), 30 sn | `Code` = anahtar, `parseEnNumber` (`,` binlik ayıracı silinir), `RateDate` = şimdi |
| AltınKaynak (5) | `altinkaynakSource.js` → `goldResponse.body` + `currencyResponse.body` (dizi: `Kod, Alis, Satis, GuncellenmeZamani`), 30 sn | `Code` = `Kod`, `parseTrNumber` (`,` varsa `.` binlik), `RateDate` = `GuncellenmeZamani` |

Her iki kaynakta `isValidPrice`: sayı ve > 0 değilse kayıt atlanır.

### KurPanel'in yazma yöntemi (`C:\Projeler\KurPanel`)

- `lib/sql.ts` → `writeRateList`: `mssql` ile bağlan, `EXEC [dbo].[SetRateList] @json = @json`
  (`NVarChar(MAX)` parametre), bağlantıyı kapat.
- `lib/worker.ts` → `syncToSql`: bellekteki **tüm** kurları
  `[{ RateId, Code, Buy, Sale, RateDate }]` olarak tek seferde gönderir; döngü 60 sn.
- `lib/fetchers/harem.ts`: `Code = symbol`, `Buy = bid`, `Sale = ask`,
  `RateDate = new Date(timestamp ?? created_at).toISOString()`;
  sağlamlık kontrolü: `ALTIN` alış/satış ≤ 100 ise paket atlanır;
  kod boş ya da sayı olmayan kayıt atlanır.

## 2. Plan

### Kod (kur-api'ye ekleme — mevcut davranışa dokunmadan)

1. **Yeni** `src/services/rateSqlWriterService.js`
   - `ingestHarem(rawItems)`, `ingestOzan(body)`, `ingestAltinkaynak(goldBody, currencyBody)`:
     ham kayıtları KurPanel kurallarıyla `{ RateId, Code, Buy, Sale, RateDate }`'e çevirip
     kaynak + koda göre son değer olarak tutar (gelen kayıt eskisinin üstüne yazar).
   - Her `RATE_SQL_INTERVAL_MS` (varsayılan 60 000) bir kez üç kaynağın kayıtları
     tek JSON'da → `EXEC dbo.SetRateList`.
   - Harem: `ALTIN ≤ 100` paketi atlanır. Hepsi: sayı olmayan / ≤ 0 kayıt atlanır.
   - Bir kaynaktan son 5 dk'da veri gelmediyse o kaynağın kayıtları gönderilmez
     (bayat kur yazılmaz); hiçbir kaynak taze değilse yordam çağrılmaz.
   - Bağlantı havuzu tek, tekrar kullanılır; hata loglanır, süreç çökmez.
   - Yazmadan sonra doğrulama: `SELECT MAX(CreateDate) FROM Rate WHERE RateCode LIKE 'H[_]%'`
     (yordam hatayı yuttuğu için).
   - Durum `/health` → `services.downstream.sql` (son yazma, son hata, kayıt sayısı).
2. Kaynaklara tek satırlık ekler (mevcut akış aynen kalır):
   `datshopSource.js` `price_changed` → `ingestHarem(data)`;
   `ozankurSource.js` başarılı poll → `ingestOzan(response.body)`;
   `altinkaynakSource.js` başarılı poll → `ingestAltinkaynak(gold.body, currency.body)`.
3. `src/bootstrap.js`: servisi oluştur, `start/stop`'a ekle.
4. `src/config/env.js` + `.env`:
   ```
   RATE_SQL_ENABLED=true
   RATE_SQL_SERVER=10.15.2.2
   RATE_SQL_DATABASE=PUSLICANCE
   RATE_SQL_USER=kurapi
   RATE_SQL_PASSWORD=<rastgele, yalnız .env'de>
   RATE_SQL_INTERVAL_MS=60000
   ```
5. `npm install mssql` (sunucuda).

### SQL girişi (en az yetki)

`sa` yerine ayrı giriş: `kurapi` → `PUSLICANCE`'ta kullanıcı + yalnız
`GRANT EXECUTE ON dbo.SetRateList`. Yordam `dbo` sahipli olduğu için tablolara
sahiplik zinciriyle yazar; girişin tablolara doğrudan yetkisi olmaz.
Şifre rastgele üretilir, ekrana yazılmaz, yalnız sunucudaki `.env`'de durur.

### Yayın ve geri dönüş

1. `cp -a /root/api.pusulanet.net /root/api.pusulanet.net.yedek-<tarih>` (node_modules hariç değil — tam kopya).
2. Dosyaları yerleştir, `npm install mssql`, önce `RATE_SQL_ENABLED=false` ile `pm2 restart kur-api`
   → `/health` ve fiyat API'si eskisi gibi mi.
3. `RATE_SQL_ENABLED=true` → `pm2 restart kur-api` → 2 dk sonra `Rate`'te `H_` kodlarının
   `CreateDate`'i güncelleniyor mu.
4. Geri dönüş: `RATE_SQL_ENABLED=false` + restart (anında) ya da yedek klasörü geri koy.

**Kesinti:** `pm2 restart` birkaç saniye; kur-api'ye Socket.IO ile bağlı
istemciler (fiyat ekranları vb.) kopup yeniden bağlanır.

## 3. Kararlar (12.10.2026, kullanıcı)

1. Kaynaklar: **Harem (1) + Ozan (4) + AltınKaynak (5)**. Özbağ (3) kur-api'de yok, yazılmaz.
2. Veritabanı: **PUSLICANCE**.
3. SQL girişi: ayrı **`kurapi`** (yalnız `EXECUTE` on `SetRateList`).
4. 18:45'te duran mevcut yazıcıya (KurPanel'in dört kaynağı) **dokunulmaz**, kullanıcı bakacak.
   İkisi birlikte çalışırsa aynı kodlar iki kez yazılır; `Rate` son yazanı tutar,
   `RateLog` gün içinde son JSON'la üzerine yazılır. Özbağ (`O_`) kodlarını yalnız eski yazıcı günceller.

## 4. Uygulama (12.10.2026, onaylı)

**SQL:** giriş `kurapi` (CHECK_POLICY OFF, `DENY VIEW ANY DATABASE`), PUSLICANCE'ta kullanıcı;
yetki yalnız `EXECUTE ON dbo.SetRateList` + `SELECT ON dbo.Rate` (yazma doğrulaması için).
`RateList` vb. doğrudan okunamıyor (sınandı). Şifre yalnız sunucudaki `.env`'de (`chmod 600`).

**10.15.2.6 `/root/api.pusulanet.net`:**

| Dosya | Değişiklik |
|---|---|
| `src/services/rateSqlWriterService.js` | **yeni** — ham veri → `SetRateList`, 60 sn |
| `src/config/env.js` | `rateSql` bloğu (`RATE_SQL_*`, varsayılan KAPALI) |
| `src/bootstrap.js` | servis oluşturma, kaynaklara verme, start/stop |
| `src/sources/datshopSource.js` / `ozankurSource.js` / `altinkaynakSource.js` | birer satır `rateSqlWriterService?.ingest…(ham)` |
| `src/controllers/healthController.js` | `/health` → `services.sqlWriter` (genel durumu etkilemez) |
| `.env` | `RATE_SQL_ENABLED=true`, `SERVER=10.15.2.2`, `DATABASE=PUSLICANCE`, `USER=kurapi`, `PASSWORD`, `INTERVAL_MS=60000` |
| `node_modules` | `mssql@11` |

**Yedekler:** `/root/api.pusulanet.net.yedek-20261012-2012` (tam kopya, 5,1 GB — loglar dahil),
`.env.yedek-kurapi`. Kaynağın yerel kopyası yok ve git yok; değişen dosyalar yalnız sunucuda.

**Doğrulama (20:14:35):** `/health` → `sqlWriter.state=connected`, 285 kayıt
(Harem 182 + Ozan 38 + AltınKaynak 65); `Rate`: `H_` 41, `OZ` 38, `A_` 36, türetilmiş `P_CYRKTRY`
aynı anda güncellendi. `RateList` eşleşmesi: Harem 37–39/41 (eksikler başka Harem paketlerinde
gelir, birikir), Ozan 38/44, AltınKaynak 33/36 — KurPanel'in son gönderimiyle aynı.

### Güncelleme süreleri (`.env`, 12.10.2026)

| Kaynak | Ayar | Değer |
|---|---|---|
| Harem (datshop) | Socket.IO | canlı (fiyat değiştikçe) |
| Ozan | `OZANKUR_POLL_INTERVAL_MS` | 300 000 (5 dk) |
| AltınKaynak | `ALTINKAYNAK_POLL_INTERVAL_MS` | 300 000 (5 dk) |
| Pusula | `PUSULA_POLL_INTERVAL_MS` | 60 000 (1 dk) |
| TCMB | `TCMB_POLL_INTERVAL_MS` | 1 800 000 (30 dk) |
| **SQL'e yazma** | `RATE_SQL_INTERVAL_MS` | 60 000 (1 dk) |
| Bayat sınırı | `RATE_SQL_STALE_MS` (tanımsız → varsayılan) | 300 000 (5 dk) |

SQL'deki gecikme: Harem ≤ 1 dk; Ozan ve AltınKaynak ≤ ~6 dk (kaynak 5 dk'da bir okunuyor).
KurPanel bu iki kaynağı dakikada bir okuyordu.

⚠ Bayat sınırı (5 dk) Ozan/AltınKaynak okuma aralığıyla (5 dk) aynı → bazı turlarda bu iki
kaynak sınırı birkaç saniye aşıp **o tur atlanabilir** (zararsız: `Rate`'teki satır kalır, yalnız
o dakika yeniden yazılmaz). Öneri: `RATE_SQL_STALE_MS=900000` (15 dk). Henüz uygulanmadı.

### İzleme

- `curl -s localhost:8080/health` (10.15.2.6) → `services.sqlWriter`:
  `state`, `lastWriteAt`, `rateTableLatestLocal` (Rate'teki en yeni CreateDate, SQL yerel saati), `lastError`.
- SQL: `SELECT LEFT(RateCode,2), MAX(CreateDate) FROM PUSLICANCE.dbo.Rate GROUP BY LEFT(RateCode,2)`.
- Günlük: `logs/system/*.ndjson` → `rate_sql_written` / `rate_sql_error`.

### Geri alma

1. Anında: `.env` → `RATE_SQL_ENABLED=false`, `pm2 restart kur-api --update-env`.
2. Tam: dosyaları yedek klasörden geri kopyala + restart.
3. SQL: `DROP USER kurapi` (PUSLICANCE), `DROP LOGIN kurapi`.

### Notlar / tuzaklar

- **AltınKaynak tarihi** `GuncellenmeZamani` = `12.10.2026 20:10:39` (gün.ay.yıl, TR saati).
  `new Date()` bunu ay.gün okuyor (→ 10 Aralık). KurPanel'de bu hata VAR; yordamın
  "gelecek tarihi şimdiye çek" kuralı yüzünden görünmüyordu (gün > 12 olunca geçersiz tarih → "şimdi").
  kur-api'de `trTarih` ile doğru çözülüyor.
- **AltınKaynak altın fiyatları** `Alis: "6.566"` gibi gelir; KurPanel de (`parseTrNumber`) 6,566
  olarak yazıyordu, bugünkü `A_ALTIN` da öyle. Davranış **bilerek aynı bırakıldı** (Pusula tarafı
  bu ölçeğe göre çalışıyor olabilir). Değiştirilecekse önce tüketicilere bakılmalı.
- `SetRateList` hataları yutar → başarı `Rate.CreateDate`'ten okunur (yazıcı her turda bakar).
- `RateLog` günde tek satır: iki yazıcı varsa son yazanın JSON'u kalır.
- Özbağ (`O_`, RateId 3) kur-api'de yok; yalnız eski yazıcı (KurPanel) günceller — 18:45'ten beri duruyor.

## 5. Kayıt

- 12.10.2026: keşif, doküman, kararlar; aynı gün onayla uygulandı, 20:14'ten beri canlı.

## 6. FTP'ye pusula.txt (14.10.2026, canlı)

KurPanel'in FTP gönderimi kur-api'ye taşındı: Harem (datshop) kurları dakikada bir
`ftp.pusulayazilim.net` → `/Kurlar/pusula.txt` (web: `https://www.pusulayazilim.net/kurlar/pusula.txt`).
Dosya 12.10 20:19'dan beri güncellenmiyordu (KurPanel durunca); kur-api'nin kendi `pusula` kaynağı da bu dosyayı okur.

- `src/services/rateFtpWriterService.js` (**yeni**) — biçim KurPanel `lib/harem-format.ts` ile birebir:
  `{ meta: { time, time_formatted, fiyat_yayini, fiyat_guncelleme }, data: { kod: { code, alis, satis, tarih } } }`,
  kod çevirisi `GUMTRY→GUMUSTRY`, `GUMUSD→GUMUSUSD`, `XAUUSD→ONS`, tarih `dd-MM-yyyy HH:mm:ss` TR saati, ASCII `\uXXXX`.
  Harem 5 dk'dır veri göndermediyse yüklenmez (bayat kur yazılmaz). `basic-ftp@5`.
- Kurlar `data/rate-ftp-kurlar.json`'da saklanır: bazı kodlar (`DS_*`, `OMRUSD`…) günde birkaç yüz kez
  gelir, yeniden başlatmada dosyadan düşmesin diye. Eski dosyada 254 kod vardı; yeni dosya bu seyrek kodlar geldikçe tamamlanır.
- Bağlantı: `env.js` `rateFtp`, `bootstrap.js`, `datshopSource.js` (`ingestHarem`), `/health` → `services.ftpWriter`.
- `.env`: `RATE_FTP_ENABLED/HOST/USER/PASSWORD/PATH/INTERVAL_MS` (şifre yalnız sunucuda).
- Yedek: `/root/kurapi-ftp-yedek-20261014-1802` (değişen dosyalar + `.env` + FTP'deki önceki `pusula.txt`).
- Kapatma: `RATE_FTP_ENABLED=false` + `pm2 restart kur-api --update-env`.

## 7. Hub "Kur API" sayfası + yönetim ucu (20.10.2026, canlı)

Hub `/kur-api` (Servisler → Kur API, yetki modülü `kur-api`): kaynak durumları, SQL/FTP yazıcıları,
uyarı/hata günlüğü ve ayar düzenleme. Okuma `read`, kaydetme/yeniden başlatma `write` ister.

**kur-api tarafı** (10.15.2.6 `/root/api.pusulanet.net`, yedek `src.yedek-20261020-2141` + `.env.yedek-20261020-2141`):

| Dosya | Ne yapar |
|---|---|
| `src/controllers/adminController.js` | `GET/PUT /admin/config`, `POST /admin/restart`, `GET /admin/logs?seviye=warn&limit=200` |
| `src/services/envFileService.js` | `.env` okur/yazar: izinli 32 anahtar (kaynak aç/kapa, adresler, süreler, SQL/FTP bağlantısı); şifreler yanıtta yok; BOM + satır sonu korunur; her yazmada `env-yedekleri/.env.<zaman>` (son 30) |
| `src/routes/index.js` | `/admin*` istekleri fiyat API anahtarından önce yönetim ucuna gider |

- Koruma: `.env` `ADMIN_API_KEY` (64 hex) → `X-Admin-Key` başlığı **ve** kaynak IP `10.15.2.x` / `127.0.0.1`.
  8080 internete açık (ufw "Anywhere") — dışarıdan `/admin` → 403. `ADMIN_API_KEY` yoksa uçlar 404 (kapalı).
- Yeniden başlatma: yönetim ucu kendine SIGTERM gönderir → `app.js` denetleyicisi ~2 sn sonra alt süreci açar,
  alt süreç `.env`'i baştan okur. pm2 restart sayacı artmaz. Ölçülen kesinti ~4 sn.
- Değişiklikler sistem günlüğüne `admin_config_changed` (anahtar adları + yedek + Hub kullanıcısı) ve
  `admin_restart` olarak düşer; değerler yazılmaz.
- Doğrulama: her alan tipine göre (süre 5 sn–24 sa, bayat 60 sn–24 sa, port, http(s) adresi); bir alan hatalıysa hiçbiri yazılmaz.

**Hub tarafı:** `lib/kur-api.ts`, `api/kur-api` (GET), `api/kur-api/config` (PUT), `api/kur-api/restart` (POST).
Env: `KUR_API_URL=http://10.15.2.6:8080` (LAN adresi şart — `api.pusulanet.net` dış IP'ye çıkar, 403 alır),
`KUR_API_ADMIN_KEY` (= sunucudaki `ADMIN_API_KEY`).

**Yerel geliştirme:** PC LAN dışında (10.10.10.x) → tünel:
`ssh -i ~/.ssh/claude_ops -N -L 18080:127.0.0.1:8080 root@10.15.2.6` ve `.env.local`'de `KUR_API_URL=http://127.0.0.1:18080`.

**Açık bulgular (20.10):**
- `apiKeyService.isValid`: `key === apiFormat` → karakter listesi metni (`0123…XYZ`) her zaman geçerli fiyat API anahtarı. Kapatılmadı, karar bekliyor.
- `H_RUBTRY` 12.10'dan beri güncellenmiyor: Harem `RUBTRY` göndermiyor (yalnız `USDRUB`); KurPanel durunca bayat kaldı.
- `logs/payloads` 5,5 GB — `LOG_RETENTION_DAYS=1`'e rağmen birikiyor gibi; disk 85 GB boş, acil değil.
