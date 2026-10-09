# Sunucu Güvenlik Taraması — 09–10.10.2026

Eski sunuculardan taşınan veritabanı, Excel/metin ve resim dosyalarında zararlı bir şey
(arka kapı, gizli program, makro) var mı diye 8 sunucunun tamamı tarandı. **Yalnızca rapor;
hiçbir dosya silinmedi, değiştirilmedi, karantinaya alınmadı.** Taramalar salt okuma.

**Sonuç: zararlı yazılım, arka kapı ya da gizlenmiş program bulunmadı.** Aşağıda gözden
geçirilmesi gereken 7 madde var; hiçbiri acil değil.

## Kapsam

| Sunucu | Taranan |
|---|---|
| Terminal 1–4 | `C:\MUSTERI` (tüm firma programları, ~198 bin dosya), tüm kullanıcıların Masaüstü / Belgeler / İndirilenler, kalıcılık (Run, görevler, servisler, Startup, WMI) |
| Depo | `D:\Resimler` (1.989.330 dosya, 177 GB), `D:\Eski Datalar` (692 dosya, 128 GB), kalıcılık |
| Mobil | `C:\Pusula`, `C:\Demo`, `C:\inetpub` (IIS siteleri), kalıcılık |
| SQL | Sunucu ayarları, sysadmin/login'ler, Agent işleri, bağlı sunucular, 290 veritabanında CLR derlemeleri, veritabanı tetikleri, tehlikeli sistem yordamı bağımlılıkları (`xp_cmdshell`, `sp_OACreate`, `xp_regwrite`…), son 60 günde değişen kodda metin taraması, db_owner kullanıcıları, son 45 günde eklenen/değişen nesneler; kalıcılık |
| Active Directory | Kalıcılık |
| Tümü | Defender durumu ve tespit geçmişi |

Dosya kontrolleri: açılınca çalışan uzantılar, çift uzantı (`fatura.pdf.exe`), belge/resim uzantılı
ama içeriği Windows programı olan dosyalar (MZ başlığı), resim/PDF başlık uyuşmazlığı, Office
makrosu (VBA), Excel DDE/komut formülü, dış bağlantı ve gömülü nesne, IIS köklerinde web shell adayı
dosyalar, alternatif veri akışları (ADS).

## Temiz çıkanlar

- **Defender (8 sunucu):** gerçek zamanlı koruma açık, tespit geçmişi boş.
- **Gizli program:** belge/resim uzantılı program dosyası **yok** (2,2 milyon dosyada).
- **Çift uzantı:** yalnız `*.txt.lnk` / `*.JPG.lnk` kısayolları (hedefleri doğrulandı, gerçek dosyaya gidiyor).
- **Makro:** terminallerde ve Mobil'de makrolu Office dosyası yok; `.xlsx/.docx` içine gizlenmiş VBA hiçbir yerde yok.
- **DDE / komut formülü:** yok.
- **Web shell:** IIS köklerinde Pusula'ya ait olmayan `.aspx/.ashx/.asp/.php` yok.
- **ADS:** yalnız tarayıcı indirme işaretleri (SmartScreen); gizli akış yok.
- **Kalıcılık (8 sunucu):** tüm Run kayıtları, zamanlanmış görevler, servisler, Startup klasörleri ve WMI aboneleri Pusula / Microsoft / Google / OneDrive / VMware. Tek istisna aşağıda (ServerManager.Agent).
- **SQL sunucu düzeyi:** `xp_cmdshell` kapalı, OLE Automation kapalı, CLR kapalı, sunucu tetiği yok, bağlı sunucu yok, son 45 günde yeni login yok (firma login'leri hariç), startup prosedürü yok, Agent'ta yalnız Microsoft'un `syspolicy_purge_history` işi, sysadmin yalnız `sa`.
- **SQL veritabanı düzeyi (290 db):** CLR derlemesi yok, veritabanı tetiği yok, son 60 günde değişen kodda tehlikeli çağrı yok. `xp_fileexist` bağımlılığı 264 db'de Pusula'nın standart `dbo.FileExists` fonksiyonu (2 db'de `WebImages`, 1'de `fn_FileExists`). Son 45 günde eklenen 2.091 nesne Pusula güncellemeleri (aynı adlar 51–108 db'de tekrar ediyor: `Report_*`, `SetRateSave`, `Api_*`, transfer tetikleri, BruteForceAttackMonitor).
- **Tehlikeli uzantılar:** terminallerdeki `cikis.bat` dosyaları (`taskkill`, 27–34 bayt), `PusulaX.application` ClickOnce tanımları, WebView2'nin `adblock_snippet.js`'i, Mobil'de Pusula Gorev `Restart/Update.bat`, IIS Express kurulum `.js`'leri ve `adsutil.vbs` — hepsi bilinen ve beklenen.

## Gözden geçirilecekler

1. **`ServerManager.Agent` servisi** — SQL (`C:\dist`), AD (`C:\Agent`) ve Depo'da çalışıyor, Terminal 1'de kurulu ama devre dışı. Mart 2026 kurulumu, imzasız 100 MB .NET uygulaması, açıklaması "Sunucu izleme ve yönetim servisi", 5100 portunda dinliyor, dış bağlantısı yok. PusulaAgent'tan önceki ajan gibi görünüyor; yerel projelerde kaynağı bulunamadı. **Tanınıyorsa not düşülmeli, tanınmıyorsa kaldırılmalı** (gereksiz açık port).
2. **Depo `D:\Resimler` içinde program dosyaları (25):** `651\RESIM\PERAKENDE\Güncel\Aurum_SQL.exe` ve `TOPTAN2_SQL.exe` (2019 Pusula sürümleri, imzasız), `1970\Kamera\Resim.exe` + DevExpress DLL'leri (Pusula "Kamera" aracı, 2024), `2642\ESKI DOSYALAR\ONLINE2\YaziciTest.exe` (Pusula, 2018), `3299\ESKI SUNUCU DOSYALARI\Firefox.exe` (Mozilla imzalı), `651\POCKEY\BELGELER\BELLEK\MDBPlus.exe` (2008, imzasız, üretici bilgisi yok), `651\RESIM\TOPTAN\UTK\Silinmiyor\*\SetupResources.dll` (Microsoft imzalı). Defender temiz diyor; yine de resim paylaşımında çalıştırılabilir dosya durmamalı. `MDBPlus.exe` tek bilinmeyen.
3. **234 makrolu Office dosyası** — tamamı `D:\Resimler\651\POCKEY` (REGOLD belge arşivi): 232 `.xls` + 2 `.doc`, 2011–2022 tarihli maaş/banka/vize formları, 2024 sonrası değiştirilmiş yok. İşletmenin kendi arşivi; makrolar Office'in uyarısıyla açılır. 8 dosyada dış bağlantı/gömülü nesne (banka ve fatura şablonları).
4. **SQL `Ad Hoc Distributed Queries` açık** (`OPENROWSET`/`OPENDATASOURCE` ile dış kaynağa sorgu). Kullanan bir şey yoksa kapatılabilir (sıkılaştırma, saldırı izi değil).
5. **db_owner yetkili SQL kullanıcıları (33 kullanıcı, 64 db):** firma uygulama hesapları (`rai`, `kasapweb`, `CNKDDIA`, `roya`, `ege1`…). Dikkat çekenler: `2849_KUTSI` üzerinde **`S2\fatih.findik`** (eski sunucunun etki alanından kalan Windows kullanıcısı, yetim), 4 db'de genel adlı **`Pusula`** kullanıcısı. Gerekmeyenler kaldırılabilir.
6. **`D:\834` fazladan kopya** — Depo'da `D:\Resimler\834` (92.152 dosya, 2,6 GB) yanında `D:\834` (99.504 dosya, 2,8 GB; 08.10 20:41–20:48). 08.10'daki 834 aktarımının yanlış yere düşmüş kopyası gibi görünüyor; güvenlik sorunu değil, gereksiz 2,8 GB.
7. **Resim gibi görünen ama resim olmayan dosyalar:** 184 adet `.gif` aslında IIS "404 Not Found" HTML sayfası (eski resim sunucusundan indirilmiş hata sayfaları; `Resimler\Genel\216_1.gif` gibi, 2311, 2737, 3426, 3438, 4903, 5544, 877, 2847, 3268, 3310, 1970). Zararsız; programda boş resim görünür. Ayrıca Depo'da 300 `.jpg` geçerli JPEG değil (2847 ve 3313'te aynı dosyaların kopyası; bozuk ya da farklı biçim), 16.000'e yakın dosya yanlış uzantılı gerçek resim (`.bmp` adlı JPEG vb.).

Küçük notlar: Defender imzaları 7 sunucuda 07.10 tarihli (2 gün eski; güncelleme kanalını kontrol etmeye değer). Terminal 1'de `Administrator\Downloads` altında `KurulumSec.rar` ve `yenileme.rar` arşivlerinin içine bakılmadı (Defender temiz). Tarama çıktıları sunucularda `C:\ProgramData\Pusula\tarama*.txt` olarak duruyor; tarama görevleri kendilerini sildi.

## Kullanılan araç
`scripts/guvenlik-tara.ps1` (salt okuma; kategoriler dosyanın başında). SQL kontrolleri `apps/web/__sqlkontrol-parca.mjs`.
