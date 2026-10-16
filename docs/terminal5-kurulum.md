# Terminal 5 — Kurulum Kontrol Listesi

> Hedef: **Terminal 3/4 ile aynı düzen.** [terminal4-kurulum.md](terminal4-kurulum.md)
> esas alındı; T4 kurulumunda sonradan çıkan adımlar (GPO filtresi, AD nesnesi,
> BGInfo, duvar kağıdı, yeni popup, Kuma) eklendi. Genel adımlar için
> [terminal2-kurulum.md](terminal2-kurulum.md).

| | |
|---|---|
| VM | Makdos ESXi (10.15.2.10), moid **20**, "Terminal 5 (10.15.2.14)" — 8 vCPU tek soket, **64 GB** (sıcak ekleme açık), 250 GB thin PVSCSI, vmxnet3 VM Network (MAC `00:0c:29:48:88:73`), EFI, secure boot kapalı, vmx-21 — **16.10.2026 oluşturuldu**, T4 ile birebir |
| Ad / IP | **PUSULARDP5** / 10.15.2.14, gateway 10.15.2.1, DNS **10.15.2.4** (16.10'da .14 boş: ping yok, DNS kaydı yok) |
| Domain | `pusuladc.local`, `OU=Bilgisayarlar,DC=pusuladc,DC=local` |
| Kaynak | T3 `\\10.15.2.12\c$` (Pusula, Demo, görevler) + T4 `\\10.15.2.13\c$` (BGInfo) |
| Betik | [scripts/terminal5/t5-kur.ps1](../scripts/terminal5/t5-kur.ps1) → T3'te `C:\Kurulum\T5\t5-kur.ps1` olarak durur |

> Kapasite: 8/64 ile ~70 eşzamanlı oturum. RAM sıcak eklemeyle kapatmadan artırılabilir
> (`apps/web/__t4-ram.mjs` deseni); vCPU artırmak kapatma ister.

---

## A. Elle — Windows tarafı (sende)

- [ ] ESXi konsolu → **"Press any key to boot from CD"** için tuşa bas (uzaktan basılamıyor; 10 sn'de bir yeniden dener)
- [ ] Windows Server 2022 Standard (Desktop Experience) — disk görünmezse CD 2'den `pvscsi` sürücüsü
- [ ] VMware Tools (CD 2)
- [ ] Ad **PUSULARDP5** → yeniden başlat → IP 10.15.2.14 / DNS 10.15.2.4 → domain + `-OUPath 'OU=Bilgisayarlar,DC=pusuladc,DC=local'` → yeniden başlat
- [ ] Yerel Administrator → **Alusup** olarak yeniden adlandır (T1–T4'te RID 500 = Alusup)
- [ ] Windows etkinleştirme
- [ ] PusulaAgent → Hub'a **"Terminal 5"** kaydı (`node apps/web/__exec.mjs "Terminal 5" "hostname"` ile doğrula)

## A2. Domain tarafı (agent gelince Claude yapabilir — onayınla)

- [ ] AD nesnesi `CN=Computers`'a düşerse → `OU=Bilgisayarlar`'a taşı (T4'te düştü)
- [ ] GPO **`Rdp_KopukOturum_1Saat`** güvenlik filtresine **`PUSULARDP5$`** ekle — filtre bilgisayar
      bazlı (PUSULARDP$/2$/3$/4$); eklenmezse kopuk oturumlar 1 saatte kapanmaz
- [ ] `gpresult /r /scope:computer` → `Rdp_Camera`, `Office_AppLocker`, `Default Domain Policy`,
      `Rdp_KopukOturum_1Saat`, `Pusula_DuvarKagidi`

## B. Betik — `t5-kur.ps1` (T5'te, Domain Admin, yönetici PowerShell)

```powershell
net use \\10.15.2.12\c$
net use \\10.15.2.13\c$
powershell -ExecutionPolicy Bypass -File \\10.15.2.12\c$\Kurulum\T5\t5-kur.ps1 -KumaToken <token>
```

Agent'tan (SYSTEM) **çalışmaz** — T3/T4 c$ erişimi yok; Domain Admin elle çalıştırır.
Tekrar çalıştırmak zararsız. Günlük `C:\ProgramData\Pusula\t5-kur.log`, sonda TAMAM/HATA özeti.

| Adım | Not |
|---|---|
| Saat dilimi Turkey, sistem yereli + biçim tr-TR | yeniden başlatmada geçerli |
| .NET 3.5 (CD'deyse `sources\sxs`'ten), FSRM rolü | |
| AppIDSvc otomatik, Fusion günlüğü kapalı | [[fusion-log-disk-tuzagi]] |
| Remote Desktop Users = `PUSULADC\Domain Users` | |
| Duvar: ping, `RDP` 3389, `Pusula Aktarim SMB (10.15.2.6)` 445 | |
| `Pusula Kurulum.msi` + `C:\Pusula`, `C:\Database`, `C:\Demo` | T3'ten, yamalar dahil |
| `C:\Tools` **T4'ten** + HKLM Run `PusulaBilgi` = `C:\Tools\BGInfo\PusulaBilgi.exe` | T3'ün `pusula.bgi`'si "BILKAR" yazılı; T4'ünkü iki yamalı (duvar kağıdı ofset 244, çıktı `%APPDATA%\BGI.bmp` ofset 156) |
| Varsayılan profil duvar kağıdı (`C:\Users\Default\NTUSER.DAT`) | 08.10 ilk giriş gecikmesi düzeltmesi; yedek `C:\Tools\BGInfo\Default-NTUSER.DAT.yedek-t5kur` |
| `C:\Scripts`, Bağlantı Testi aracı + rapor klasörü izinleri | |
| `C:\ProgramData\Pusula` betikleri (6 ps1 + DefaultAssociations.xml) | |
| `C:\Kurulum` (Picture Manager) + resim varsayılanı (Photo Viewer) | |
| FSRM şablonları — **uyarı modu** | [[masaustu-kota-fsrm]] |
| 8 zamanlanmış görev (T3 XML) | GeceRestart 01:00, OfficeTurkce, OfficeFTA, OpenOfficeMasaustu, SumatraAyar, BaglantiTestiKisayol, MasaustuKota, ThinstuffBekci* |
| Picture Manager (OIS) | |

\* **ThinstuffBekci** yalnız `-KumaToken` verilirse kurulur. Önce Kuma'da yeni push
izleyicisi: "T5 Thinstuff (RDP oturum servisi)" — 48'in kopyası (add'de `forceInactive`
alanı silinmeli). T1–T4: id 45/46/47/48.

## C. Elle — yazılımlar (betik kurmaz)

- [ ] **Thinstuff XP/VS Terminal Server 1.0.980** + lisans (lisanslı paket sende)
- [ ] **Office LTSC Professional Plus 2024** (ProPlus2024Volume, PerpetualVL2024, tr-tr) — T4'teki
      `C:\Kurulum\Office2024\` (ODT + `config.xml`, Groove/OneDrive hariç, SCL=0). **MAK'ı sen girersin**:
      `cscript "C:\Program Files\Microsoft Office\Office16\OSPP.VBS" /inpkey:<anahtar>` + `/act`.
      Perakende (Home & Business) KURMA — RDS'de lisans sorunu ([[office-ltsc-gecisi]])
- [ ] Visual C++ 2008 **x86 + x64** (9.0.30729.6161) ve 2015-2022 (v14) x86 + x64
- [ ] OpenOffice 4.1.16 (tr), SumatraPDF 3.6.1 (**tüm kullanıcılar**, `.pdf` varsayılanı), 7-Zip (x64)
- ~~Edge~~ — gerek yok; ama **WebView2 Runtime** yeni mesaj popup'ı için gerekli (aşağıda)

## D. Kurulum sonrası

- [ ] Yeniden başlat (sistem yereli)
- [ ] **PusulaNotify yeni popup** (WebView2, 943 KB) — `KUR.bat` eski 14 KB popup'ı derler, anket görünmez.
      `apps/web/__dosya-gonder.mjs "Terminal 5" <exe> C:/PusulaAgent/PusulaNotify.exe.new` → yerine koy ([[pusulanotify-webview2]])
- [ ] `Get-AppLockerPolicy -Effective` — Exe **ve Appx** kuralları var mı ([[applocker-appx-baslat-menusu]])
- [ ] Bir firma kullanıcısıyla gir: Başlat menüsü, Excel (lisans sormamalı), Picture Manager,
      BGInfo'lu duvar kağıdı (ilk girişte boş gelmemeli, döşenmemeli)
- [ ] Hub: sunucu kaydı; Kuma ping monitörü "Terminal 5" (41'in kopyası, `apps/web/__kuma-kopya.mjs`); TV haritası
- [ ] Defender: Tamper Protection **elle** aç (uzaktan açılamaz — [[sunucu-guvenlik-durumu]]); imza güncel mi
- [ ] ASR/CFA denetim modu yalnız T3'te — T5'e şimdilik uygulanmıyor ([[asr-cfa-denetim]])
- [ ] Sihirbazda Terminal 5 bağlantı sunucusu olarak seçilebiliyor mu (firma taşımadan önce)

## Bilerek dahil edilmeyenler

- `C:\MUSTERI` — firma program klasörleri; firmalar T5'e taşınırken sihirbaz/aktarım kurar.
  Taşımadan sonra OpenOffice parametresi taraması gerekmez (aktarım 16.10'dan beri kendisi siliyor).
- `C:\ProgramData\Pusula` teşhis betikleri ve `teshis`, `yama`, `oo-mru-yedek` klasörleri.
- `PusulaYaziciTemizleGece` — tek seferlik bakım göreviydi (04.10), kalıcı değil.

## Kayıt

- **16.10.2026** — VM oluşturuldu (moid 20) ve açıldı; Windows kurulumunu bekliyor.
  Oluşturma betiği: `apps/web/__t5-olustur.mjs` (+ `__esxi-soap.mjs`, T4 donanımı; ConfigSpec'te
  `tools` içinde `toolsUpgradePolicy` saat eşitleme alanlarından ÖNCE gelmeli).
