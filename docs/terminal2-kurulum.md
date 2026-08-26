# Terminal 2 — Kurulum Kontrol Listesi

> Bilkar için açılacak yeni terminal sunucusu. Hedef: **Terminal 1 (PUSULARDP)
> ile birebir aynı** yapı. Bu liste tahminle değil, 2026-08-26'da Terminal 1
> üzerinde yapılan ölçümlerle çıkarıldı.

## Referans: Terminal 1'in mevcut yapısı

| | |
|---|---|
| İşletim sistemi | Windows Server 2022 Standard (10.0.20348) |
| Donanım | 8 mantıksal CPU · 128 GB RAM · 250 GB disk (tek disk) |
| IP / Gateway | 10.15.2.5 / 10.15.2.1 |
| DNS | 10.15.2.4 (domain denetleyici) |
| Domain | `pusuladc.local` — DC: `PUSULAPC` (10.15.2.4) |
| AD konumu | `OU=Bilgisayarlar,DC=pusuladc,DC=local` |
| Uygulanan GPO | `Rdp_Camera`, `Default Domain Policy` |
| Roller | FileAndStorage-Services, Web-Server (IIS) |
| Çoklu oturum | **Thinstuff XP/VS Terminal Server 1.0.972** |

> **Microsoft RDS rolü KURULU DEĞİL.** Çoklu RDP oturumu Thinstuff ile
> sağlanıyor. Dolayısıyla RDS CAL / 120 günlük deneme süresi bu ortamda
> geçerli değildir; lisans Thinstuff tarafındadır.

---

## 1. VM (ESXi)

- [ ] **Disk: en az 500 GB.** Terminal 1'in 250 GB'ı dar geldi. Bilkar verisi
      küçültme sonrası ~100 GB; üstüne OS, ~128 kullanıcı profili, sayfa dosyası.
- [ ] CPU/RAM: Terminal 1 ile aynı (8 vCPU / 128 GB) başlangıç noktası.
      Kullanıcı sayısı Terminal 1'den fazla olacağı için ilk haftalarda
      izlenmeli — 8 oturumda RAM 20 GB kullanılıyordu.
- [ ] Ağ kartı: **vmxnet3** (Terminal 1'de de o var, ~10 Gbps)
- [ ] Windows Server 2022 Standard

## 2. Ağ

Boş IP'ler (2026-08-26 taraması): **10.15.2.12 – 10.15.2.20**
(`.9` de boş ama `.8/.10/.11` dolu olduğundan aralığın ortası tercih edilmeli.)

```powershell
New-NetIPAddress -InterfaceAlias 'Ethernet0' -IPAddress 10.15.2.15 `
  -PrefixLength 24 -DefaultGateway 10.15.2.1
Set-DnsClientServerAddress -InterfaceAlias 'Ethernet0' -ServerAddresses 10.15.2.4
```

- [ ] **DNS mutlaka 10.15.2.4 olmalı.** Domain katılım hatalarının birinci
      sebebi budur; 8.8.8.8 gibi bir DNS yazılırsa makine domaini bulamaz.
      İnternet erişimi gateway üzerinden zaten çalışır.
- [ ] Doğrula — `PUSULAPC` ve `10.15.2.4` dönmeli:
      ```powershell
      Resolve-DnsName pusuladc.local
      nltest /dsgetdc:pusuladc.local
      ```
- [ ] Saat kontrolü: `w32tm /resync`
      (DC ile 5 dakikadan fazla fark varsa Kerberos katılımı reddeder.)

## 3. Domaine katılma

Adı ayrı, katılımı ayrı yeniden başlatmakta yapmak daha az sorun çıkarır:

```powershell
Rename-Computer -NewName PUSULARDP2 -Restart
```

```powershell
Add-Computer -DomainName pusuladc.local `
  -OUPath 'OU=Bilgisayarlar,DC=pusuladc,DC=local' `
  -Credential (Get-Credential) -Restart
```

- [ ] **`-OUPath` şart.** Verilmezse bilgisayar `CN=Computers` kabına düşer;
      orası OU olmadığı için `Rdp_Camera` politikası **uygulanmaz** ve sunucu
      Terminal 1 ile aynı davranmaz.
- [ ] Doğrula — çıktıda `Rdp_Camera` **ve** `Default Domain Policy` görünmeli:
      ```powershell
      gpupdate /force
      gpresult /r /scope:computer
      ```

## 4. Roller

```powershell
Install-WindowsFeature FileAndStorage-Services, Web-Server -IncludeManagementTools
```

- [ ] Microsoft RDS rolü **kurulmayacak** (Terminal 1'de de yok).

## 5. Yazılımlar

Terminal 1'de kurulu olanlar — aynısı kurulmalı:

- [ ] **Thinstuff XP/VS Terminal Server** (çoklu oturum — lisans gerekli)
- [ ] **Pusula Kurulum** + **Pusula Yenileme (Yama)**
- [ ] Microsoft Office LTSC Professional Plus 2024 — **tr-tr**
- [ ] Microsoft Visual C++ 2008 Redistributable — **x64 ve x86** (Pusula bağımlılığı)
- [ ] FortiClient VPN
- [ ] 7-Zip
- [ ] OpenOffice 4.1.16
- [ ] Microsoft Edge + WebView2 Runtime
- [ ] WizTree (disk analizi — teşhiste işe yarıyor)

## 6. Lisans

- [ ] **Thinstuff lisansı**: mevcut kapasite ~128 ek kullanıcıya yetiyor mu?
      Yetmiyorsa taşımadan ÖNCE alınmalı — sonradan fark edilirse kullanıcılar
      bağlanamaz.
- [ ] Office LTSC lisans/aktivasyon
- [ ] Pusula uygulama lisansı

## 7. Kurulum sonrası kontroller

- [ ] **Fusion günlüğü kapalı olmalı** — Terminal 1'de bu ayar açık kalıp
      diskin %57'sini yemişti (23 milyon dosya). Ayrıntı:
      [[fusion-log-disk-tuzagi]]
      ```powershell
      Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Fusion' -EA SilentlyContinue |
        Select EnableLog, ForceLog, LogFailures
      ```
      Boş dönerse sorun yok. `1` görürsen `0` yap.
- [ ] `Remote Desktop Users` grubuna Bilkar kullanıcılarının eklenmesi
- [ ] Yazıcı sürücüleri / yönlendirme (kuyumculukta etiket-barkod yazıcısı sık)
- [ ] Zamanlanmış görevler (Terminal 1'dekiler gözden geçirilip taşınmalı)
- [ ] Windows Update politikası

## 8. Son doğrulama

```powershell
(Get-WmiObject Win32_ComputerSystem).Domain          # pusuladc.local
gpresult /r /scope:computer                          # Rdp_Camera + Default Domain Policy
Get-WindowsFeature | Where-Object Installed          # roller
Test-Connection 10.15.2.2 -Count 5                   # SQL sunucusuna erisim
Test-NetConnection 10.15.2.2 -Port 1433              # SQL portu
```

---

## Notlar

**Klonlama neden tercih edilmedi:** Terminal 1'in VM'ini klonlamak "birebir
aynı" için en kestirme yol olurdu, ama diskteki **22 GB'lık MFT şişkinliği**
klona miras kalırdı — NTFS MFT'yi asla küçültmez. Sıfırdan kurulum bu kalıcı
kaybı yeni sunucuya taşımaz.

**Terminal 1 ↔ SQL ağ performansı** (2026-08-26 ölçümü): gecikme 0 ms, paket
kaybı yok, TCP 1433 bağlanma 0,8 ms. İkisi aynı ESXi host'unda. Terminal 2 için
de aynı host tercih edilmeli; kullanıcıların bildirdiği yavaşlık ağdan değil,
uygulamanın sorgu deseninden kaynaklanıyor.
