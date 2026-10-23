# Yeni terminal kurulumu — uygulama sırası (T6/T7, 23.10.2026)

> T5 ayrıntılı kontrol listesi: [terminal5-kurulum.md](terminal5-kurulum.md). Bu belge **T6 ve T7 kurulumunda
> öğrenilenlerle** kullanıcıyı yormadan uçtan uca nasıl yapılacağını anlatır. Kullanıcı yalnız
> **Windows + ad + IP + agent + domain** yapar; gerisini Claude agent üzerinden yapar.

## 0. VM (Claude)

- Betik: `apps/web/__t6-olustur.mjs` kopyala → `__tN-olustur.mjs` (ad + IP). `--kuru` → `--ac`. MAC açıldıktan sonra ayrı okunur.
- **IP boş mu:** buradan (VPN) `ping` yanıtı **"Destination host unreachable"** olur ve Windows bunu "Received" sayar →
  dolu sanılır. Boşluk kontrolü **aynı ağdaki bir terminalden**:
  `node __exec.mjs "Terminal 5" "Test-Connection 10.15.2.N -Count 2 -Quiet; arp -a 10.15.2.N"`.

## 1. Kullanıcı (konsol)

1. ESXi konsolunda "Press any key to boot from CD" → tuş
2. Windows Server 2022 Standard (Desktop) + VMware Tools (CD 2)
3. Ad **PUSULARDPn**, IP **10.15.2.x** / GW 10.15.2.1 / DNS 10.15.2.4, domain `pusuladc.local`
4. Yerel Administrator → **Alusup**
5. PusulaAgent kur + Hub'a **"Terminal N"** olarak ekle
6. **`KUR.bat`'ı ikinci kez ÇALIŞTIRMA** — agent'ı ve popup'ı Claude standartlaştırır (3. adım). KUR.bat yeniden çalışırsa
   `PusulaNotify.cs`'i derleyip **yeni 943 KB popup'ın üstüne eski 14 KB sürümü** yazar (T6'da oldu).

## 2. AD (Claude, DC agent'ı)

- Bilgisayar nesnesi **`CN=Computers`'a düşer** → `OU=Bilgisayarlar,DC=pusuladc,DC=local`'a taşı.
- GPO güvenlik filtresi: yalnız **`Rdp_KopukOturum_30Dk`** bilgisayar bazlı → `PUSULARDPn$` GpoApply ekle
  (T5'in eklendiği GPO'ları `Get-GPPermission -TargetName 'PUSULARDP5$'` ile listele, aynısını yap).
- **Taşıdıktan sonra hedefte `gpupdate /target:computer /force`** — yapılmazsa yalnız Default Domain Policy uygulanır;
  `Pusula_DuvarKagidi` (duvar.jpg + kilit.jpg), `Rdp_KopukOturum_30Dk`, `Office_AppLocker`, `Rdp_Camera` gelmez (T6'da oldu).
  Doğrula: `gpresult /r /scope:computer` → 5 GPO, `C:\Windows\web\wallpaper\Pusula\duvar.jpg` var, MaxDisconnectionTime 1800000.
- BGInfo (`pusula.bgi` ofset 244/156 yamalı, `PusulaBilgi.exe` Run) `tN-kur.ps1` T4'ten kopyaladığı için hazır gelir.

## 3. Agent standart sürüm + yeni popup (Claude)

Kullanıcının kurduğu agent standart değil (T6: A31BFC91, T7: 1D9121C8; popup 14 KB). Standart: **exe 88F5D127**,
cs DD908867, popup **27E01418 (943 KB)**, klasör `C:\pusula-agent-windows`.

1. T5'ten kopyala (SHA doğrulamalı) — `__ps-paylasim.mjs "Terminal N" <betik> 180 "Terminal 5"`: `PusulaAgent.exe` → `.exe.new`,
   `PusulaAgent.cs`, `PusulaNotify.cs`, `PusulaNotify.exe`, `KUR.bat`, `__guncelle.ps1`, `__rollback.ps1`.
2. 8 dk sonrasına `PusulaAgentRollback` görevi (SYSTEM), sonra `__guncelle.ps1`'i `Start-Process` ile **ayrı süreç** olarak başlat.
3. `update.log` "servis basladi" + exe SHA → rollback görevini sil. Agent birkaç dakika yanıtsız kalabilir (T6, T7);
   panik yok, `update.log`'a bak. Rollback görevi servis çalışıyorsa hiçbir şey yapmaz.

## 4. `tN-kur.ps1` (Claude, agent'tan — Domain Admin gerekmez)

- `scripts/terminal7/t7-kur.ps1` kopyala → `scripts/terminalN/tN-kur.ps1` (ad/günlük/klasör).
- Hedefe gönder: önce `C:\Kurulum\TN` klasörünü oluştur, sonra
  `__dosya-gonder-hizli.mjs "Terminal N" scripts/terminalN/tN-kur.ps1 C:/Kurulum/TN/tN-kur.ps1`
  (betiği komut satırına gömmek "filename too long" verir).
- Başlat: `KALSIN=1 node __ps-paylasim.mjs "Terminal N" <başlat.ps1> 90 "Terminal 3 - Bilkar" "Terminal 4"` —
  T3/T4 `c$` paylaşımlarını Hub'daki yönetici bilgisiyle SYSTEM oturumunda bağlar, `KALSIN=1` iş bitene kadar açık bırakır;
  betik `Start-Process … -WindowStyle Hidden` ile arka planda, günlük `C:\ProgramData\Pusula\tN-kur.log`.
  **Başlatma betiğindeki yolu `TN\tN-kur.ps1` yap** (T7'de T6 yolu kalmıştı, boşa başladı).
- Başlatma komutu çoğu zaman 2 dk'da yanıtsız kalır ama betik başlar — günlüğe bak; ikinci kez başlatma (iki kopya çalışır).
- Node'un HTTP isteği 5 dk'da kesilir; uzun iş mutlaka arka planda.
- Bitince paylaşımları **`__ps.mjs` betiğiyle** kaldır (`net use \\10.15.2.12\c$ /delete /y`); `__exec.mjs` tek satırında
  ters bölü ve `$` kaçışı bozuluyor (T6'da kapanmadı).
- **FSRM:** rol ilk kurulumda *InstallPending* → "FSRM şablonları" HATA verir (T5, T7; T6'da çıkmadı). İlk yeniden
  başlatmadan sonra `tN-kur.ps1`'i **bir kez daha** çalıştır (zararsız).
- Sonuçlar: T6 20/20 (8 dk), T7 19/20 (FSRM). Saat dilimi Pasifik gelir → betik Turkey yapar.
- **Ardından `node __ps.mjs "Terminal N" scripts/yeni-terminal/bolge-tr.ps1`** — betikteki `Set-Culture tr-TR` yalnız
  SYSTEM'e uygulanır. Windows kurulumunda "Türkçe (Kıbrıs)" **tr-CY** seçilirse saat **12 saatlik (ÖS/ÖÖ)** gelir ve varsayılan
  profil üzerinden HER YENİ KULLANICIYA geçer (T6'da oldu). Betik tr-TR'yi varsayılan profile + yüklü kullanıcı kovanlarına kopyalar.

## 5. Yazılımlar (Claude; dosyalar T5 `C:\Kurulum`'dan)

`node __ps-paylasim.mjs "Terminal N" scripts/yeni-terminal/yazilim-kur.ps1 280 "Terminal 5"` — dosyaları T5'ten kopyalar
(SHA), kurulumları arka planda yapar: VC++ 2008 x86+x64, 7-Zip, SumatraPDF, WebView2, Office LTSC ProPlus 2024 (~5 dk).
Günlük `C:\ProgramData\Pusula\yazilim-kur.log` (son satır BITTI).

Etkinleştirme (Windows + Office MAK) ve Thinstuff lisansı **kullanıcı**.

## 6. Windows Update + yeniden başlatma sırası

`node __ps.mjs "Terminal N" scripts/yeni-terminal/wu-kur.ps1` — görev `PusulaWindowsUpdate`, günlük `wu.log`
(son satır `--- bitti`). Server 2022 ISO'su **20348.169** (2021) gelir:

1. WU 1. tur → servis yığını (SSU, ör. KB5122881), .NET, Defender kurulur; toplu güncelleme (LCU, ör. KB5122882)
   "başarılı" GÖRÜNÜR ama uygulanmaz (CBS ExecuteStateFailed, sürüm 169'da kalır).
2. Yeniden başlat → WU 2. tur: LCU yine kurulamayabilir (sonuç 4).
3. Yeniden başlat → WU 3. tur → LCU kurulur → yeniden başlat. Hedef T5 sürümü (23.10: 20348.5761).
   Sürüm: `(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').UBR`.
4. Ardından tekrar `schtasks /Run /TN PusulaWindowsUpdate` → "guncelleme yok" görülene kadar.

- Yeniden başlatma sırasında buradan VPN anlık koparsa ESXi dahil hepsi "ulaşılamıyor" görünür; önce `Test-Connection 10.15.2.14`.

## 7. İzleme

- Kuma ping: `KU=… KP=… node __kuma-kopya.mjs 41 "Terminal N" 10.15.2.x` (41 = Terminal 3 ping). T6 = id 50, T7 = id 51.
- Thinstuff bekçisi (push): Thinstuff kurulunca Kuma'da push izleyicisi (48'in kopyası) + `tN-kur.ps1 -KumaToken <token>`.

## Yardımcılar (`apps/web`, untracked)

| Betik | İş |
|---|---|
| `__exec.mjs "<sunucu>" "<komut>"` | tek satır komut (çift tırnak YOK) |
| `__ps.mjs "<sunucu>" <betik.ps1> [sn]` | PowerShell betiği, `-EncodedCommand` (tırnak/çok satır serbest) |
| `__ps-paylasim.mjs "<hedef>" <betik> <sn> "<kaynak>"…` | + kaynak sunucuların `c$`'ı `$P['Terminal 5']` olarak; `KALSIN=1` |
| `__dosya-gonder-hizli.mjs "<sunucu>" <yerel> <hedef>` | dosya gönderimi (SHA doğrulamalı) |
| `__vm-durum.mjs <moid>…` | ESXi'den VM güç/konuk/araç durumu |

> Not: belgeyi `node -e` ile `String.replace` kullanarak düzenleme — `$'` / `` $` `` yer değiştirme kalıbı olarak
> yorumlanıp metni çoğaltır (bu belge 23.10'da böyle bozuldu). Edit/Write aracını kullan.
