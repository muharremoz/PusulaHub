# Terminal explorer.exe %100 — Windows TIP deposu döngüsü

**Tarih:** 28.10.2026 · **Sunucu:** Terminal 5 (10.15.2.14, 20348.5761) · **Durum:** kök neden ölçüldü, depo temizlendi, kalıcı çözüm kararı bekliyor.

## Belirti
Birkaç kullanıcının `explorer.exe`'si birer çekirdeği aralıksız kullanıyor (8 çekirdekte 4–6 kullanıcı → sunucu %80–110). Kullanıcılar yavaşlık hissediyor; ESXi host'u %60–83'e çıkıyor (SQL değil).
T4'te 13.10'da aynı belirti görülmüştü; o gün Windows güncellemesiyle "düzelmiş" görünmüştü (muhtemelen tesadüf: güncelleme depoyu sıfırlamış olabilir).

## Kök neden (ölçüldü)
Windows'un **TIP** (Test-In-Production) deneme mekanizması. Ekim 2026 güncellemesi (KB5127687 16.10 / KB5126654-5 19.10) dokunmatik klavye için yeni bir test getiriyor: `TouchKeyboardExperienceTip::_tip_DesktopTouchKeyboardShowOnTryShowV2`.
Her "dokunmatik klavyeyi göster" (TryShow) isteğinde explorer:
1. `HKLM\SYSTEM\Software\Microsoft\TIP\TestResults\27641370` altına yeni bir GUID alt anahtarı yazıyor (`data` = küçük JSON test sonucu).
2. "En son kaydı" bulmak için (`FindLatestStoreTestId`) **deponun tamamını dolaşıyor**.

Depo hiç temizlenmiyor → maliyet depo boyutuyla orantılı, depo sınırsız büyüyor → kendini ağırlaştıran döngü.
- Döküm: dönen iş parçacığı `twinui_pcshell!KeyboardHosting::TabTipAdapter::OnInputPaneTryShowRequested → tip::open<…ShowOnTryShowV2> → KERNELBASE!tip::details::TipRegistryStorage::Enumerate → Reg*`; 10 dk kullanıcı / 61 dk çekirdek modu.
- ETW (Kernel-Registry, 2 sn): dönen explorer **~21.000 kayıt defteri işlemi/sn**; `Enumerate Index=16461` görüldü.
- Depo: 27641370 = 46.052 anahtar, 30 sn'de +44; 27641008 = 57.115. SYSTEM kovanı 83 MB.
- Yazanlar = dönen explorer'lar; hepsi **PusulaX (WPF .NET 4.8)** açık oturumlar. PusulaX'in kendisi boşta (döküm): WPF her alan odağında Windows'a "klavye gerekebilir" diyor, Windows bunu yeni testle çok pahalı işliyor.

| | T5 | T1 | T4 | T2 |
|---|---|---|---|---|
| Windows | .5761 (Ekim) | .4893 (Mart) | .4893 (Mart) | .5499 (Eylül) |
| 27641370 (yeni test) | 46.052 | yok | yok | yok |
| 27641008 (eski test) | 57.115 | 7.493 (+11/dk) | 1.659 (+8/dk) | 697 |
| Dönen explorer | 3–6 | 0 | 0 | 0 |

T6/T7 de `.5761` ile kuruldu → açılınca aynı sorun beklenir.

## Temizlik (28.10 18:47, uygulandı)
`reg export` yedeği `C:\Scripts\TipYedek\TIP-TestResults-20261028-184740.reg` (64 MB) → iki deponun alt anahtarları silindi (104.139, 21 sn).

| | Önce | +15 sn | +60 sn |
|---|---|---|---|
| Explorer toplam | 2,11 çekirdek (2 dönen) | 0,05 | 0 |
| Sistem CPU | %55 | %58 | %22 |
| 27641370 | 46.920 | 28 | 28 |

**+8 dk (18:55):** 27641370 = 29 (+1), 27641008 = 45 (+45); explorer 0,02 çekirdek, dönen 0, sistem CPU %8 (16 oturum, 6 PusulaX). Büyüme ~90/dk → ~6/dk: fırtına kendini besliyordu (yavaş tarama → istekler birikiyor → daha çok yazma). Küçük depoda tarama ucuz, yazma seyrek.

## Araştırma (28.10, web)
- `.5761`'i getiren OS güncellemesi **KB5126655** (13.10.2026; KB5126654 = SSU). KB5127687 .NET Framework güncellemesi. 26.10 OOB KB5134140 ilgisiz.
- TIP = Microsoft'un belgelenmiş "Test In Production" iç API'si (kernelbase, Server 2022+): [learn.microsoft.com/…/test-in-production-api](https://learn.microsoft.com/en-us/windows/win32/devnotes/test-in-production-api). Kayıt = GUID + JSON `data`; TestOpen "en son" kaydı bulmak için depoyu tarıyor. **Kapatan resmî anahtar yok.** Microsoft bilinen sorunlar / KB notlarında bu konu yok; 2026 raporu yok.
- Aynı desen (aynı 27641008/27641370 depoları, RDS, explorer CPU, donan görev çubuğu) **2022'den beri** topluluk raporlarında: [MS Q&A 752491](https://learn.microsoft.com/en-us/answers/questions/752491/server-2022-and-teams-bloats-hkey-local-machinesys), [909494](https://learn.microsoft.com/en-us/answers/questions/909494/windows-2022-server-rds-laggy-slow-taskbar), [1106787](https://learn.microsoft.com/en-us/answers/questions/1106787/high-cpu-usage-in-rds-2022-explorer-exe). Çözümler: (1) zamanlanmış silme — MS moderatörü "makul geçici çözüm", yıl boyu silenlerde yan etki yok; (2) `TestResults` üzerinde SYSTEM **ve Users** için yazma iznini kaldırmak — yeniden oluşmuyor; (3) TabletInputService kapatma/TabTip yeniden adlandırma — tuzaklı ("kritik servis", geri geliyor), önerilmez.
- WPF `DisableImplicitTouchKeyboardInvocation`: .NET 4.7.1+ ([sürüm notu](https://github.com/Microsoft/dotnet/blob/main/releases/net471/dotnet471-changes.md) — örnekteki `=false` hatalı, doğrusu `true`); kaynak kodda `TipTsfHelper.Show()` guard'ı → `true` iken WPF `InputPane.TryShow` hiç çağırmıyor ([TipTsfHelper.cs](https://github.com/dotnet/wpf/blob/main/src/Microsoft.DotNet.Wpf/src/PresentationCore/MS/internal/Interop/TipTsfHelper.cs)). Sınır: isteği WPF dışı bir kaynak üretiyorsa etkisiz — deneyle görülür.

## Uygulanan (28.10 19:15, T5, kullanıcı onayı "üçünü uygula")
1. **Gece temizlik görevi** `PusulaTipTemizle` — her gün 00:45 SYSTEM (gece yeniden başlatma 01:00'dan önce), `C:\Scripts\TipTemizle.ps1` → `C:\Scripts\TipTemizle.log`. İlk çalışma 19:15: `27641008=111 27641370=29` silindi.
2. **ACL** — `TestResults` üzerinde `BUILTIN\Users` Allow kuralı `SetValue,CreateSubKey,Delete,ReadKey` → **`ReadKey`** (ContainerInherit); SYSTEM/Administrators/TrustedInstaller dokunulmadı. Yedek SDDL: `C:\Scripts\TipYedek\TestResults-acl-20261028-191502.sddl` (geri alma: `Set-Acl` ile SDDL'yi yükle).
3. **2246 PusulaX config** — `C:\MUSTERI\2246\Pusula X\PusulaX.exe.config` `<runtime>` içine `AppContextSwitchOverrides … DisableImplicitTouchKeyboardInvocation=true` eklendi, XML doğrulandı; yedek `PusulaX.exe.config.yedek-20261028-191502`. 2246'nın 10 açık PusulaX'i 19:15'ten önce açılmış → switch onlarda **henüz etkin değil**; yeniden açınca geçerli.

**Sonuç (19:17):** depo `27641370` anahtarı artık yok (boşalınca kaldırılmış), `27641008=0`. 5 sn ETW: explorer (tek oturum, pid 42328) 12 deneme → `STATUS_OBJECT_NAME_NOT_FOUND` ×8, `STATUS_ACCESS_DENIED` ×4 — yani yazamıyor, ucuz başarısızlık. Explorer toplam 0,02 çekirdek, dönen 0, sistem CPU %12 (12 oturum). Application günlüğünde hata yok.

**Yarın kontrol:** TipTemizle.log 00:45 kaydı (0 bekleniyor), depo anahtarı yeniden oluşmuş mu, ExplorerIzle.log'da yeni kayıt var mı, 2246 kullanıcılarından şikâyet/dokunmatik klavye yan etkisi, 5 sn ETW'de 2246 oturumlarının deneme sayısı (switch etkisi: 0 bekleniyor). Sorunsuzsa: T1–T4 + T6/T7'ye görev + ACL (`yeni-terminal-kurulum.md`'ye ekle), config'i diğer firmalara yay; T5'te `PusulaExplorerIzle` görevi, `C:\Tools\Procdump`, `C:\Scripts\ExplorerDump\` (256 MB zip dahil) sil.

## Kalıcı çözüm seçenekleri
1. **Gece temizlik görevi** (her terminal, SYSTEM, 03:00): `TIP\TestResults\*` alt anahtarlarını sil. Ucuz, geri alınabilir; yeni terminal kurulumuna (`yeni-terminal-kurulum.md`) eklenir.
2. **PusulaX config** — aşağıdaki plan.
3. **Ekim KB'sini kaldırmak** — önerilmez: SSU+LCU birleşik, `wusa` ile kalkmaz (`DISM /Remove-Package`), yeniden başlatma + güvenlik yamaları geri gider; Kasım aynı testi yine getirebilir.
4. Testi kapatan Windows anahtarı: araştırılıyor.

## Plan — PusulaX `DisableImplicitTouchKeyboardInvocation`
Amaç: WPF'in odak değişiminde örtük TryShow üretmesini kapatmak → istek kaynağında kesilir, depo yazılmaz, güncellemeden bağımsız.

**Nerede:** her firmanın `C:\MUSTERI\<firma>\...\PusulaX.exe.config` dosyası, `<runtime>` bölümü:
```xml
<runtime>
  <AppContextSwitchOverrides value="Switch.System.Windows.Input.Stylus.DisableImplicitTouchKeyboardInvocation=true" />
</runtime>
```
Mevcut `AppContextSwitchOverrides` varsa `;` ile eklenir. PusulaX yeniden açılınca geçerli.

**Adımlar**
1. Pilot: T5'te `2246` (bugün en çok dönen firma). Önce `.config` yedeği (`.config.yedek-YYYYMMDD`), sonra ekleme; kullanıcılar PusulaX'i yeniden açınca ETW ile 5 sn'de yazma sayısı ve explorer CPU'su karşılaştırılır (temizlik sonrası depo küçük olduğu için etki doğrudan yazma sayısında görülür: hedef 0).
2. Yan etki kontrolü: terminalde dokunmatik ekran yok (HID 0), kullanıcılar fiziksel klavyeyle giriyor → işlevsel kayıp beklenmiyor; yine de 1 gün pilot.
3. Olumluysa: T5'teki tüm PusulaX kopyalarına (8 klasör), sonra T1–T4'e betikle (`__oo-ex`), her dosyada yedek + XML doğrulama.
4. Kalıcılık: PusulaX güncellemesi `.config`'i ezebilir → sihirbaz/kurulum şablonuna (`yeni-terminal-kurulum.md`, hizmet şablonu) eklenir; Pusula X geliştiricisine de iletilir (uygulamanın kendi config'ine koyması en temizi).
5. Geri alma: yedek `.config`'i geri koy, PusulaX yeniden aç.

**Riskler:** `.config` bozuk XML olursa PusulaX açılmaz (yazma sonrası `[xml]` ile doğrula); switch yalnız WPF'in örtük çağrısını kapatır, uygulama kendi `InputPane.TryShow` çağırıyorsa etkisiz (PusulaX dökümünde böyle bir çağrı görülmedi).

## Araçlar
- İzleme: T5 `C:\Scripts\ExplorerIzle.ps1` + görev `PusulaExplorerIzle` (2 dk) → `ExplorerIzle.log`, döküm `C:\Scripts\ExplorerDump\` (iş bitince görev + ProcDump + dökümler silinir; `pusulax_30904.dmp.zip` 256 MB de orada).
- Ölçüm betikleri (oturum scratchpad'i): `t5-regtrace2.ps1` (ETW kayıt izi), `t-tipstore.ps1` (depo sayımı), `t5-temizle.ps1` (yedek + temizlik + önce/sonra).

## Yayma (28.10 19:26–19:50, 7 terminal)
`PusulaTipTemizle` + ACL T1–T7'nin hepsinde (T1/T4'te Users yazma kuralı üst anahtardan kalıtımlıydı → kalıtım kapatılıp kaldırıldı). İlk temizlik: T1 27641008=80 (18:39'da 7.493'tü — depo kendi kendine küçülmüş), T2 769, T4 1.683, T3/T6/T7 boş. Config switch yalnız 2246'da (pilot).
Aynı turda görev seti eşitlendi: YaziciTemizleGece → T1,T2,T3,T5,T6,T7; SumatraAyar → T1,T2; OfficeFTA conhost → T6,T7 (T7'de son çalışma hata 0xFFFD0000 idi); ThinstuffBekci → T6 (Kuma 54), T7 (Kuma 55); silinen bitmiş tek seferlikler: T1 PusulaAgentSelfUpdate (Mayıs), T5 PusulaT5WindowsUpdate (16.10). 19:58: OfficeTurkce T1/T2'ye de kuruldu (kullanıcı onayı; ilk çalışma log boş = oturumlar zaten tr-tr). Kalan farklar: PusulaWindowsUpdate yalnız T6/T7 (tetiksiz, elle), ExplorerIzle T5 (geçici).
