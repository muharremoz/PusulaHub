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
