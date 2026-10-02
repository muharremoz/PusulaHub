# Terminal 4 — Kurulum Kontrol Listesi

> Hedef: **Terminal 3 (PUSULARDP3) ile aynı düzen.** Bu liste 2026-10-02'de T3
> üzerinde yapılan envanterden çıkarıldı. Genel adımlar için
> [terminal2-kurulum.md](terminal2-kurulum.md).

| | |
|---|---|
| VM | Makdos ESXi, moid 19, "Terminal 4 (10.15.2.13)" — 8 vCPU, 48 GB (sıcak ekleme açık), 250 GB |
| Ad / IP | **PUSULARDP4** / 10.15.2.13, gateway 10.15.2.1, DNS **10.15.2.4** |
| Domain | `pusuladc.local`, `OU=Bilgisayarlar,DC=pusuladc,DC=local` |
| Kaynak | T3'ün `\\10.15.2.12\c$` paylaşımı; hazırlık klasörü `C:\Kurulum\T4` (T3'te) |

---

## A. Elle — Windows tarafı (sende)

- [ ] Windows Server 2022 Standard (Desktop Experience)
- [ ] VMware Tools (CD 2)
- [ ] Ad PUSULARDP4 → yeniden başlat → IP/DNS → domain + `-OUPath` → yeniden başlat
- [ ] Yerel Administrator → **Alusup** olarak yeniden adlandır (T1-T3'te RID 500 = Alusup)
- [ ] `gpresult /r /scope:computer` → `Rdp_Camera`, `Office_AppLocker`, `Default Domain Policy`

## B. Betik — `t4-kur.ps1` (T4'te, Domain Admin, yönetici PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -File \\10.15.2.12\c$\Kurulum\T4\t4-kur.ps1
```

Kaynak kod: [scripts/terminal4/t4-kur.ps1](../scripts/terminal4/t4-kur.ps1). Tekrar
çalıştırmak zararsız. Günlük `C:\ProgramData\Pusula\t4-kur.log`, sonda TAMAM/HATA özeti.

| Adım | T3'teki karşılığı |
|---|---|
| Saat dilimi Turkey, sistem yereli + biçim tr-TR | T3 ile aynı |
| .NET 3.5 (kurulum diski CD'deyse `sources\sxs`'ten) | Pusula bağımlılığı |
| FSRM rolü | masaüstü kotası |
| AppIDSvc otomatik | AppLocker çalışsın diye |
| Fusion günlüğü kapalı | [[fusion-log-disk-tuzagi]] |
| Remote Desktop Users = `PUSULADC\Domain Users` | T3 ile aynı |
| Duvar: ping, `RDP` 3389, `Pusula Aktarim SMB (10.15.2.6)` 445 | T3 ile aynı |
| `Pusula Kurulum.msi` sessiz kurulum + `C:\Pusula`, `C:\Database`, `C:\Demo` | yamalar dahil T3'teki hâli; `C:\Demo` sihirbazın kaynak klasörü |
| `C:\Tools\BGInfo` + HKLM Run `PusulaBilgi`, `C:\Scripts` | |
| Bağlantı Testi aracı + rapor klasörü izinleri | |
| `C:\ProgramData\Pusula` betikleri (6 ps1 + DefaultAssociations.xml) | |
| `C:\Kurulum` (Picture Manager paketi) + resim varsayılanı politikası (Photo Viewer) | |
| FSRM şablonları — **uyarı modu** (yumuşak kota, pasif tür izleme) | |
| 8 zamanlanmış görev (T3'ten XML) | GeceRestart 01:00, OfficeTurkce, OfficeFTA, OpenOfficeMasaustu, SumatraAyar, BaglantiTestiKisayol, MasaustuKota, ThinstuffBekci* |
| Picture Manager (OIS) | |

\* **ThinstuffBekci** yalnız `-KumaToken <token>` verilirse kurulur — T4 için Kuma'da yeni
push izleyicisi açılmalı (T1-T3: id 45/46/47). Token verilmezse betik bu görevi atlar.

## C. Elle — yazılımlar (betik kurmaz)

T3'teki sürümler:

- [ ] **Thinstuff XP/VS Terminal Server 1.0.980** + lisans (yükleyici T3'te yok — lisanslı paket sende)
- [ ] **Office** — T3: Home and Business 2024 Retail en-us + tr-tr dil paketi.
      ⚠ Perakende Office RDS'de lisans sorunu çıkarıyor ([[office-lisans-terminal]]);
      `SharedComputerLicensing` **0** olmalı. Doğru ürün LTSC Standard 2024 (volume).
- [ ] Microsoft Visual C++ 2008 Redistributable **x86 + x64** (9.0.30729.6161)
- [ ] Microsoft Visual C++ 2015-2022 (v14) x86 + x64
- [ ] OpenOffice 4.1.16 (tr)
- [ ] SumatraPDF 3.6.1 (tüm kullanıcılar) — `.pdf` makine varsayılanı SumatraPDF
- [ ] 7-Zip (x64)
- ~~Microsoft Edge + WebView2 Runtime~~ — gerek yok (kullanıcı kararı 02.10)
- [ ] PusulaAgent → Hub'a "Terminal 4" kaydı (`__exec.mjs "Terminal 4"` ile doğrula)

## D. Kurulum sonrası

- [ ] Yeniden başlat (sistem yereli)
- [ ] `Get-AppLockerPolicy -Effective` — Exe **ve Appx** kuralları var mı ([[applocker-appx-baslat-menusu]])
- [ ] Bir firma kullanıcısıyla gir: Başlat menüsü, Excel (lisans sormamalı), Picture Manager, BGInfo duvar kağıdı
- [ ] Hub: sunucu kaydı, Kuma monitörü (`Terminal 4`), TV haritası
- [ ] Defender: Tamper Protection **elle** aç (uzaktan açılamaz — [[sunucu-guvenlik-durumu]])
- [ ] ASR/CFA denetim modu yalnız T3'te deneniyor — T4'e şimdilik uygulanmıyor ([[asr-cfa-denetim]])

## Bilerek dahil edilmeyenler

- `C:\MUSTERI` — firma program klasörleri; firmalar T4'e taşınırken sihirbaz/aktarım kurar.
- `C:\ProgramData\Pusula` içindeki teşhis betikleri (`bakim-mesaj`, `firma-hiz`, `kopma`,
  `resim-test*`, `kisayol-baslangic`) ve `teshis`, `yama`, `oo-mru-yedek` klasörleri.
- `C:\Scripts\YazıcıTemizle.ps1` kopyalanır ama görev olarak bağlı değil (T3'te de değil).
