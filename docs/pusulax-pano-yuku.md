# Pusula X panosu (dashboard) — SQL yükü

> 2026-10-02'de 6030 ROYA'nın "sorgular yavaş" şikâyeti üzerine yapılan teşhisin kaydı.
> Sonuç: yavaşlığın ve gündüz SQL CPU sıkışıklığının ana kaynağı Pusula X'in panosu.

## Pano nasıl çalışıyor

- **Yetki:** `Users.DashboardId` → `Report.Id` (`Report.IsDashboard = 1`). `0` = kullanıcıda pano yok.
- **Tanım:** `Report.Report` kolonunda DevExpress Dashboard XML'i; 7 veri kaynağı sorgusu içerir.
- **Yenileme:** `Report.IsRefresh = 1`, `Report.RefreshTime = 30000` (ms) → program açık kaldıkça
  **30 saniyede bir** tüm sorgular yeniden çalışır.
- Menü yetkileri ayrı tabloda: `UserMenuAuth` (`MenuMain` 30 = Dashboard).

## Panonun çalıştırdığı sorgular

| Veri kaynağı | Ne çağırıyor | İç çağrılar | Tablolar |
|---|---|---|---|
| Query_3 | `EXEC Report_Position @PersonalId=@USER, @Date=NULL, @ParaBr='HAS'` (prosedür) | `FindBalance`, `FindStockT` → `Split`, `KurCevir`, `Split` | DovizB, CarHrk, DovizD, AAStok, Grup, Hareket, Firma, Sabitler |
| Query_1 | `FindBalance(@USER, GETDATE(), KasaHesapTipi, 0)` — kasa bakiyeleri | — | DovizB, CarHrk, UserAccountAuth, firmabakTemp, Users, Kapama, Firma, FirmaTipi |
| Query_5 | `FindBalance(@USER, GETDATE(), BankaHesabi, 0)` + UNION ALL diğer hesap tipleri — hesap bakiyeleri | — | aynı |
| Query_2 | `FindStock(@User, GETDATE(), 0, 0, 0)` — stok/maliyet listesi | — | DovizB, BakiyeTemp, Grup, Kapama, Hareket, Malzeme, Sabitler |
| Query | doğrudan tablo: CarHrk + AAStok + Grup + Firma (üretici firma / grup) | — | |
| Query_4, Query_6 | doğrudan tablo: AAStok + Grup (altın / pırlanta ayar bazında stok) | — | |

DevExpress her pano bileşeni (pivot kırılımı) için veri kaynağı sorgusunu **ayrı ayrı sarmalayıp**
yeniden çalıştırır: `select "TBL0"."Hesap", sum("TBL0"."Bakiye") from (<Query_5>) ...`. Bu yüzden
`FindBalance` tek yenilemede 5–7 kez baştan hesaplanır.

## Ölçümler

**6796_ALTINSEV_X (küçük data, 8 bin cari hareket), tek açık pano, tek yenileme (19:02:44):**

| Bileşen | Sorgu | Süre | Okuma |
|---|---|---|---|
| Hesap bakiyeleri (FindBalance) | 5 | 1.007 ms | 276.720 sayfa |
| Stok / maliyet (FindStock) | 2 | 281 ms | 65.934 sayfa |
| Pozisyon raporu (Report_Position) | 1 | 197 ms | 33.766 sayfa |
| Kasa bakiyeleri (FindBalance) | 2 | 128 ms | 34.590 sayfa |
| Üretici firma / grup | 6 | 23 ms | 1.693 sayfa |
| Ayar bazında stok | 4 | 3 ms | 202 sayfa |
| **Toplam** | **20** | **1.639 ms (CPU 735 ms)** | **412.905 sayfa ≈ 3,2 GB** |

**6030 ROYA (canlı, 18:24–18:28):** 4 dakikada 898 sorgu, 110 sn SQL süresi, 59 sn CPU; pano ULAS
datasında 12, ROYA datasında 6 kez yenilendi. Süre ile CPU farkı CPU sırası beklemesi.

**İndeksler çözüm değil:** `TEST_6030_ROYAULAS` kopyasına 73 standart indeks uygulanıp yakalanan 9
pano sorgusu canlı ve test üzerinde yan yana ölçüldü — süre ve okuma aynı (ör. 452 → 427 ms,
273.658 → 274.058 sayfa). Fonksiyonlar tablo değişkenli çok adımlı TVF; indeks kullanmıyor.

## Yapılanlar (02.10.2026)

- 778 hariç tüm Pusula X firma datalarında pano yetkisi kaldırıldı: 39 data, 58 kullanıcı,
  `DashboardId → 0`. Eski değerler: [scripts/sql/dashboard-yetki-geri-al-20261002.sql](../scripts/sql/dashboard-yetki-geri-al-20261002.sql).
- Dokunulmayan: `778_FATIH_SEMIH` (B.HASHAS), `PUSULAXDEMO` (şablon — "Kullanıcı" hesabında 49),
  `TEST_6030_ROYAULAS`.
- Kullanıcı test için `6796_ALTINSEV_X` Admin'e panoyu yeniden atadı (DashboardId 11); ölçüm bununla yapıldı.

## Açık kalanlar

- Pusula X geliştiricisine iletilecek: pano bileşenleri tek hesaptan beslenmeli ya da sonuç
  önbelleklenmeli; örnek sorgular [scripts/sql/6030-pano-sorgulari-ornek.sql](../scripts/sql/6030-pano-sorgulari-ornek.sql).
- Ara çözüm seçenekleri: `Report.RefreshTime` 30000 → 300000, ya da `Report.IsRefresh = 0`.
- `PUSULAXDEMO` şablonundan kurulan yeni firmalar panolu gelebilir — şablon düzeltilmedi.
- Yetki kaldırmanın gerçek etkisi mesai saatinde ölçülmedi (Hub → Sunucu Raporu'ndan SQL CPU'su).

## Araçlar

SQL'de iki Extended Events oturumu tanımlı ama **durdurulmuş**: `Pusula6030Izleme`, `Pusula6796Izleme`
(dosyalar `D:\SQLData\6030\test\*.xel`). Yeniden başlatma: `ALTER EVENT SESSION <ad> ON SERVER STATE = START`.
Yerel betikler (git dışı, `apps/web/`): `__xe-izle.mjs` (canlı okuma; `XE_AD`, `XE_PANO=1`),
`__ab-6030.mjs` (canlı/test karşılaştırma), `__olc-6030.mjs`, `__pano-prosedur.mjs`.

## Kök neden ve düzeltme denemesi (02.10 akşam, `TEST_6796_ALTINSEV_X`)

"412.905 sayfa (3,2 GB)" diskten okunan veri değildir: `logical reads` bir 8 KB'lık sayfaya her
dokunuşu sayar; 85 MB'lık (≈10 bin sayfa) datada aynı sayfalar ~40 kez dolaşılıyor, maliyet CPU.

Tablo bazında ölçüm (STATISTICS IO): okumaların neredeyse tamamı **tek satırlık `Sabitler`** tablosundan.

| Sorgu | Toplam okuma | Sabitler okuma | Sabitler tarama |
|---|---|---|---|
| Query_1 kasa bakiyeleri | 34.601 | 34.020 | 17.010 |
| Query_5 hesap bakiyeleri | 69.202 | 68.040 | 34.020 |

Sebep: pano sorgusu hesap tipini `FindBalance`'a skaler alt sorgu olarak veriyor —
`FindBalance(@USER, GETDATE(), (SELECT KasaHesapTipi FROM Sabitler), 0)`. `FindBalance` **inline TVF**;
alt sorgu gövdeye gömülüyor ve `(@Hestip = 0 OR f.Hestip = @Hestip)` koşulunda her CarHrk satırı için
iki kez yeniden çalışıyor (8.310 satır × 2 ≈ 17 bin tarama).

Düzeltme (yalnız pano SQL'i değişir, fonksiyon aynı): değeri bir kez oku, `CROSS APPLY` ile ver.

```sql
-- önce
FROM dbo.FindBalance(@USER, GETDATE(), (SELECT KasaHesapTipi FROM Sabitler), 0) ff
-- sonra
FROM (SELECT TOP 1 KasaHesapTipi AS h FROM Sabitler) sb
CROSS APPLY dbo.FindBalance(@USER, GETDATE(), sb.h, 0) ff
```

| Sorgu | Okuma önce → sonra | Süre önce → sonra | Sonuç |
|---|---|---|---|
| Query_1 | 34.602 → 861 | 76 → 24 ms | aynı |
| Query_5 (iki FindBalance, UNION ALL) | 69.204 → 1.692 | 117 → 32 ms | aynı |

Pano sarmalıyla (`select sum("TBL0"."Bakiye") from (…) "TBL0"`) da aynı kazanç. Tahmini yenileme başı
etki: FindBalance kaynaklı ~311 bin okuma → ~10 bin; toplam 413 bin → ~110 bin. Kalan yük
`FindStock` (2 × 33 bin) ve `Report_Position` (34 bin) — incelenmedi.
Betik: `apps/web/__pano-duzelt-test.mjs`. Canlıya/pano tanımına (Report.Report XML) UYGULANMADI.

## TEST'te uygulanan düzeltme (02.10 akşam, `TEST_6796_ALTINSEV_X`)

Pano tanımında (Report.Id 11) 3 `FindBalance` çağrısı `CROSS APPLY` biçimine çevrildi; özgün tanım
`TEST_6796_ALTINSEV_X.dbo.Report_yedek_pano` tablosunda. Betik: `apps/web/__pano-yama.mjs` (yalnız TEST_ veritabanı kabul eder,
sonuç birebir aynı değilse yazmaz). Pano veri kaynaklarının toplamı:

| | Süre | CPU | Okuma |
|---|---|---|---|
| Önce | 315 ms | 311 ms | 171.324 |
| Sonra | 196 ms | 194 ms | 70.012 |

Kalan okumanın neredeyse tamamı `FindStock` (Query_2, 33 bin) ve `Report_Position` (Query_3, 34 bin). `FindStock`/`FindStockT`
içinde tablo değişkeni (`@listStock`) satır tahmini yüzünden `DovizB` her satırda yeniden taranıyor; `OPTION (RECOMPILE)` denendi:
okuma yarıya indi ama süre 2 katına çıktı (derleme maliyeti) → geri alındı, fonksiyonlar özgün.

Programda denemek için `Sirket.dbo.guvenlik`'e satır eklendi: srkkod **644**, "TEST ALTINSEV", DataYolu `TEST_6796_ALTINSEV_X`,
KOD 6796 (kullanıcı kararı — firmanın kullanıcıları da görür), YedekAl 0. Giriş sırası srkkod DESC olduğu için listede EN ÜSTTE.
