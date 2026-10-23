# Yeni terminal kurulumu — uygulama sırası (T6'dan sonra)

> T5 ayrıntılı kontrol listesi: [terminal5-kurulum.md](terminal5-kurulum.md). Bu belge **T6 (23.10.2026)
> kurulumunda öğrenilenlerle** kullanıcıyı yormadan uçtan uca nasıl yapılacağını anlatır. Kullanıcı yalnız
> **Windows + ad + IP + agent + domain** yapar; gerisini Claude agent üzerinden yapar.

## 0. VM (Claude)

- Betik: `apps/web/__t6-olustur.mjs` kopyala → `__tN-olustur.mjs` (ad + IP). `--kuru` → `--ac`. MAC açıldıktan sonra ayrı okunur.
- **IP boş mu:** buradan (VPN) `ping` yanıtı **"Destination host unreachable"** olur ve Windows bunu "Received" sayar →
  dolu sanılır. Boşluk kontrolü **aynı ağdaki bir terminalden**: `node __exec.mjs "Terminal 5" "Test-Connection 10.15.2.N -Count 2 -Quiet; arp -a 10.15.2.N"`.

## 1. Kullanıcı (konsol)

1. ESXi konsolunda "Press any key to boot from CD" → tuş
2. Windows Server 2022 Standard (Desktop) + VMware Tools (CD 2)
3. Ad **PUSULARDPn**, IP **10.15.2.x** / GW 10.15.2.1 / DNS 10.15.2.4, domain `pusuladc.local`
4. Yerel Administrator → **Alusup**
5. PusulaAgent kur + Hub'a **"Terminal N"** olarak ekle
6. **`KUR.bat`'ı ikinci kez ÇALIŞTIRMA** — agent'ı ve popup'ı Claude standartlaştırır (aşağıda 3). KUR.bat
   yeniden çalışırsa `PusulaNotify.cs`'i derleyip **yeni 943 KB popup'ın üstüne eski 14 KB sürümü** yazar (T6'da oldu).

## 2. AD (Claude, DC agent'ı)

- Bilgisayar nesnesi **`CN=Computers`'a düşer** → `OU=Bilgisayarlar,DC=pusuladc,DC=local`'a taşı.
- GPO güvenlik filtresi: yalnız **`Rdp_KopukOturum_30Dk`** bilgisayar bazlı → `PUSULARDPn$` GpoApply ekle
  (T5'in eklendiği GPO'ları `Get-GPPermission -TargetName 'PUSULARDP5$'` ile listele, aynısını yap).

## 3. Agent standart sürüm + yeni popup (Claude)

Kullanıcının kurduğu agent standart değil (T6: exe A31BFC91, popup 14 KB). Standart: **exe 88F5D127**, cs DD908867,
popup **27E01418 (943 KB)**, klasör `C:\pusula-agent-windows`.

1. T5'ten kopyala (SHA doğrulamalı) — `__ps-paylasim.mjs "Terminal N" <betik> 180 "Terminal 5"`: `PusulaAgent.exe`→`.exe.new`,
   `PusulaAgent.cs`, `PusulaNotify.cs`, `PusulaNotify.exe`, `KUR.bat`, `__guncelle.ps1`, `__rollback.ps1`.
2. 8 dk sonrasına `PusulaAgentRollback` görevi (SYSTEM), sonra `__guncelle.ps1`'i `Start-Process` ile **ayrı süreç** olarak başlat.
3. `update.log` "servis basladi" + exe SHA → rollback görevini sil.
   (T6'da güncelleme 06:09'da başarılı oldu ama yoklama birkaç dakika yanıt alamadı; panik yok, update.log'a bak.)

## 4. `tN-kur.ps1` (Claude, agent'tan — Domain Admin gerekmez)

- `scripts/terminal6/t6-kur.ps1` kopyala → `scripts/terminalN/tN-kur.ps1` (ad/günlük/klasör).
- Hedefe gönder: `__dosya-gonder-hizli.mjs "Terminal N" scripts/terminalN/tN-kur.ps1 C:/Kurulum/TN/tN-kur.ps1`
  (önce `C:\Kurulum\TN` klasörünü oluştur; betiği komut satırına gömmek "filename too long" verir).
- Başlat: `KALSIN=1 node __ps-paylasim.mjs "Terminal N" <başlat.ps1> 90 "Terminal 3 - Bilkar" "Terminal 4"` —
  T3/T4 `c$` paylaşımlarını Hub'daki yönetici bilgisiyle SYSTEM oturumunda bağlar, `KALSIN=1` iş bitene kadar açık bırakır;
  betik `Start-Process … -WindowStyle Hidden` ile arka planda, günlük `C:\ProgramData\Pusula\tN-kur.log`.
  (Node'un HTTP isteği 5 dk'da kesilir; uzun iş mutlaka arka planda.) Bitince paylaşımları **betikle** kaldır
  (`__ps.mjs` ile `net use \10.15.2.12c$ /delete /y` — `__exec.mjs` tek satırında ters bölü/`# Yeni terminal kurulumu — uygulama sırası (T6'dan sonra)

> T5 ayrıntılı kontrol listesi: [terminal5-kurulum.md](terminal5-kurulum.md). Bu belge **T6 (23.10.2026)
> kurulumunda öğrenilenlerle** kullanıcıyı yormadan uçtan uca nasıl yapılacağını anlatır. Kullanıcı yalnız
> **Windows + ad + IP + agent + domain** yapar; gerisini Claude agent üzerinden yapar.

## 0. VM (Claude)

- Betik: `apps/web/__t6-olustur.mjs` kopyala → `__tN-olustur.mjs` (ad + IP). `--kuru` → `--ac`. MAC açıldıktan sonra ayrı okunur.
- **IP boş mu:** buradan (VPN) `ping` yanıtı **"Destination host unreachable"** olur ve Windows bunu "Received" sayar →
  dolu sanılır. Boşluk kontrolü **aynı ağdaki bir terminalden**: `node __exec.mjs "Terminal 5" "Test-Connection 10.15.2.N -Count 2 -Quiet; arp -a 10.15.2.N"`.

## 1. Kullanıcı (konsol)

1. ESXi konsolunda "Press any key to boot from CD" → tuş
2. Windows Server 2022 Standard (Desktop) + VMware Tools (CD 2)
3. Ad **PUSULARDPn**, IP **10.15.2.x** / GW 10.15.2.1 / DNS 10.15.2.4, domain `pusuladc.local`
4. Yerel Administrator → **Alusup**
5. PusulaAgent kur + Hub'a **"Terminal N"** olarak ekle
6. **`KUR.bat`'ı ikinci kez ÇALIŞTIRMA** — agent'ı ve popup'ı Claude standartlaştırır (aşağıda 3). KUR.bat
   yeniden çalışırsa `PusulaNotify.cs`'i derleyip **yeni 943 KB popup'ın üstüne eski 14 KB sürümü** yazar (T6'da oldu).

## 2. AD (Claude, DC agent'ı)

- Bilgisayar nesnesi **`CN=Computers`'a düşer** → `OU=Bilgisayarlar,DC=pusuladc,DC=local`'a taşı.
- GPO güvenlik filtresi: yalnız **`Rdp_KopukOturum_30Dk`** bilgisayar bazlı → `PUSULARDPn$` GpoApply ekle
  (T5'in eklendiği GPO'ları `Get-GPPermission -TargetName 'PUSULARDP5$'` ile listele, aynısını yap).

## 3. Agent standart sürüm + yeni popup (Claude)

Kullanıcının kurduğu agent standart değil (T6: exe A31BFC91, popup 14 KB). Standart: **exe 88F5D127**, cs DD908867,
popup **27E01418 (943 KB)**, klasör `C:\pusula-agent-windows`.

1. T5'ten kopyala (SHA doğrulamalı) — `__ps-paylasim.mjs "Terminal N" <betik> 180 "Terminal 5"`: `PusulaAgent.exe`→`.exe.new`,
   `PusulaAgent.cs`, `PusulaNotify.cs`, `PusulaNotify.exe`, `KUR.bat`, `__guncelle.ps1`, `__rollback.ps1`.
2. 8 dk sonrasına `PusulaAgentRollback` görevi (SYSTEM), sonra `__guncelle.ps1`'i `Start-Process` ile **ayrı süreç** olarak başlat.
3. `update.log` "servis basladi" + exe SHA → rollback görevini sil.
   (T6'da güncelleme 06:09'da başarılı oldu ama yoklama birkaç dakika yanıt alamadı; panik yok, update.log'a bak.)

## 4. `tN-kur.ps1` (Claude, agent'tan — Domain Admin gerekmez)

- `scripts/terminal6/t6-kur.ps1` kopyala → `scripts/terminalN/tN-kur.ps1` (ad/günlük/klasör).
- Hedefe gönder: `__dosya-gonder-hizli.mjs "Terminal N" scripts/terminalN/tN-kur.ps1 C:/Kurulum/TN/tN-kur.ps1`
  (önce `C:\Kurulum\TN` klasörünü oluştur; betiği komut satırına gömmek "filename too long" verir).
- Başlat: `KALSIN=1 node __ps-paylasim.mjs "Terminal N" <başlat.ps1> 90 "Terminal 3 - Bilkar" "Terminal 4"` —
  T3/T4 `c$` paylaşımlarını Hub'daki yönetici bilgisiyle SYSTEM oturumunda bağlar, `KALSIN=1` iş bitene kadar açık bırakır;
  betik `Start-Process … -WindowStyle Hidden` ile arka planda, günlük `C:\ProgramData\Pusula\tN-kur.log`.
   kaçışı bozuluyor, T6'da kapanmadı).
- **T6 sonucu (23.10, 16:15–16:23, 8 dk):** 20/20 TAMAM, ThinstuffBekci bilerek atlandı; FSRM tuzakları (T5) betikte
  olduğu için sorun çıkmadı. Sonda "sistem yereli için yeniden başlatma" — yazılım + WU bitince tek seferde.
- Saat dilimi Pasifik gelir → betik Turkey yapar.

## 5. Yazılımlar (Claude, agent; dosyalar T5 `C:\Kurulum`'dan)

`node __ps-paylasim.mjs "Terminal N" scripts/yeni-terminal/yazilim-kur.ps1 280 "Terminal 5"` — dosyaları T5'ten kopyalar
(SHA), kurulumları arka planda yapar: VC++ 2008 x86+x64, 7-Zip, SumatraPDF, WebView2, Office LTSC ProPlus 2024. Günlük
`C:\ProgramData\Pusula\yazilim-kur.log` (son satır BITTI). Ardından Windows Update:
`node __ps.mjs "Terminal N" scripts/yeni-terminal/wu-kur.ps1` (görev `PusulaWindowsUpdate`, günlük `wu.log`),
bitince yeniden başlat + ikinci tur.
Etkinleştirme (Windows + Office MAK) ve Thinstuff lisansı **kullanıcı**.

## Yardımcılar (`apps/web`, untracked)

| Betik | İş |
|---|---|
| `__exec.mjs "<sunucu>" "<komut>"` | tek satır komut (çift tırnak YOK) |
| `__ps.mjs "<sunucu>" <betik.ps1> [sn]` | PowerShell betiği, `-EncodedCommand` (tırnak/çok satır serbest) |
| `__ps-paylasim.mjs "<hedef>" <betik> <sn> "<kaynak>"…` | + kaynak sunucuların `c$`'ı `$P['Terminal 5']` olarak; `KALSIN=1` |
| `__dosya-gonder-hizli.mjs "<sunucu>" <yerel> <hedef>` | dosya gönderimi (SHA doğrulamalı) |
