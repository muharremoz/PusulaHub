# Aktarım 2 — müşteri PC'sinde çalışan aktarım uygulaması

**Karar (2026-09-30):** Mevcut web aktarımına (`services/pusula-aktarim`) **dokunulmaz**.
Yanına ikinci bir aktarım yolu kurulur; memnun kalınırsa eskisi emekliye ayrılır.
Kod PusulaHub deposunda, sunucu 10.15.2.6'da ayrı servis. İlk teslim 1-4. aşama.

## Neden

Web aktarımı iyi çalışıyor ama SQL tarafı elle:
- `.mdf/.ldf` SQL Server açıkken kilitli → müşteriden detach istemek gerekiyor.
- 5 GB'lık yükleme tarayıcıda kopunca baştan ("The operation was aborted", 4022).
- Transfer datası (URN*) eski yıllar arasında geliyor, ayrıca fark edilmesi gerekiyor.
- Şube kodu / `subeler` / `Banko` eşlemesi sonradan elle çıkarılıyor
  ([transfer-sube-kod-duzeltme.md](../transfer-sube-kod-duzeltme.md)).

## Parçalar

```
apps/aktarim-istemci/            müşteri PC'si (kök klasörde package.json YOK → pnpm workspace'e girmez)
  src/PusulaAktarim/             C# net48 WinExe + WebView2 + Costura (SQL Konsol web iskeleti)
  web/                           React + Vite + shadcn (derlenip exe'ye gömülür)
services/pusula-aktarim2/        Node (fastify + better-sqlite3), 10.15.2.6, ayrı port + pm2 adı
Hub (apps/web)                   "Aktarım 2" oturum oluşturma/izleme — mevcut aktarım ekranına dokunmadan
```

**Akış:** Hub → servis (X-Service-Key, admin API) oturum + tek kullanımlık **kod** üretir.
Müşteri exe'yi açar, kodu girer → servis Bearer token verir. İstemci yalnız servisle
konuşur (Hub'la değil). Hedef sunucu bilgileri (SQL/Depo/terminal) yalnız serviste durur.

### İstemci (SQL Konsol'dan alınanlar)
- `YerelSunucu` (127.0.0.1, rastgele port, `X-Aktarim-Anahtar`), `KonsolPenceresi`
  (WebView2, gömülü loader, kapatma onayı), tepsi simgesi, tek kopya, tarayıcı yedeği.
- Web dist + WebView2Loader exe'ye gömülü, Costura ile tek dosya.
- Dağıtım: Supabase storage (bucket `aktarim-istemci`), servis `min_app_version` → 426.

### Aşamalar

| # | İçerik |
|---|---|
| 1 | İskelet; kodla giriş; SQL bağlantısı (Windows oturumu → `C:\Pusula\ps.dat` → elle); keşif: `sirket.guvenlik` + tüm DB'ler (boyut, durum, PrgTur, KOD, URN*/transfer işareti, guvenlik'te olmayan DB'ler), resim yolları, program klasörleri; keşif raporu servise |
| 2 | `BACKUP DATABASE … WITH COPY_ONLY, COMPRESSION, CHECKSUM` (Express'te sıkıştırma yok → düz), parça parça (8 MB, SHA256) devam edebilen yükleme, yarım iş diskte (exe kapansa da sürer) |
| 3 | Sunuculara taşıma — **geri yükleme YOK** (kullanıcı kararı 30.09: geri yükleme sihirbazın işi). Eski web aktarımıyla aynı yerler: `.bak` → SQL `D:\SQLData\{firma}\aktarim`, eski yıl → Depo `D:\Eski Datalar\{firma}`, resim → Depo `Resimler\{firma}`, program/ek → terminal `C:\MUSTERI\{firma}\Aktarim`. Yükleme bitince otomatik başlar; hata → Hub'da "Yeniden dene" |
| 4 | Resim (Depo `D:\Resimler\{firma}`), eski yıl (`D:\Eski Datalar\{firma}`), program + ek dosyalar (terminal `C:\MUSTERI\{firma}\Aktarim`) |
| 5 | (sonra) Ön rapor → Hub'da şube kodu / subeler / Banko eşleme önerisi |

### Yayınlama (istemci exe)

Müşteri Hub kullanıcısı değil → exe aktarım servisinden iner: `https://aktarim.pusulanet.net/v2/indir`
(servis `/opt/pusula-aktarim2/istemci/PusulaAktarim.exe` dosyasını verir). Yeni sürüm:
1. `PusulaAktarim.csproj` içinde `<Version>` artır.
2. `apps/aktarim-istemci/web`: `npm run build`; `src/PusulaAktarim`: `dotnet build -c Release`.
3. `bin/Release/net48/PusulaAktarim.exe` → sunucuya `istemci/PusulaAktarim.exe` (önce `.yeni` adıyla, sonra `mv`).
4. Eski sürümü kapatmak için `/opt/pusula-aktarim2/.env` → `MIN_ISTEMCI_SURUM`, `pm2 restart aktarim2`.

Exe imzalı değil: indirirken Windows SmartScreen "tanınmayan uygulama" uyarısı verebilir
("Ek bilgi → Yine de çalıştır").

### Güvenlik
- İstemci ↔ servis HTTPS (nginx), Bearer token (kod tek kullanımlık, token oturum ömrü).
- SQL şifresi (ps.dat / elle) yalnız istemci belleğinde, servise gitmez.
- Servis hedef credential'ları Hub'dan alır, istemciye asla vermez.
