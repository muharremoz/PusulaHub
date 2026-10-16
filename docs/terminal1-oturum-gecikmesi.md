# Terminal 1 — Oturum Açma Gecikmesi (araştırma kaydı)

> Durum: **ÇÖZÜLDÜ (2026-10-16).** Çözüm: `DontDisplayLastUserName = 1` (DWORD) iki anahtara —
> `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System` ve
> `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon`. T1–T5'te açık (14:51–14:54).
> Yeniden başlatma gerekmedi; GPO yönetmiyor (RSoP boş), yenilemede geri dönmez.
> Kaynak: RSA KB — "Each iteration that is happening in LogonUI makes a call out to perform
> the UserLookup" (Server 2012 sonrası). Bizim ölçtüğümüz ~64 tur × oturum SID→ad fırtınası bu.
>
> | T2, aynı hesap (alusup), ~39 oturum | Ayar | 1149→41 |
> |---|---|---|
> | 14:50:44, oturum 44 (taze: 41/42/21/22) | kapalı | **9,7 sn** |
> | 14:52:49, oturum 45 (taze: 41/42/21/22) | açık | **0,6 sn** |
>
> O gün T2 taban: 17 taze giriş, ort. 8,3 sn (09:10'da 2,5 → öğleden sonra 9–10 sn).
> Yan etki: giriş ekranında son kullanıcı adı dolu gelmez (Connect/RDP adı zaten gönderiyor).
> Geri alma: Policies\System → 0, Winlogon değerini sil. Yeni terminaller: `scripts/terminal5/t5-kur.ps1`.
> Ölçüm betiği (1149→41 eşleştirme, `$ARG` saat): [scripts/giris-suresi-olc.ps1](../scripts/giris-suresi-olc.ps1) (`__oo-ex.mjs "<sunucu>" <ps1> <saat>`).
>
> Aşağısı 2026-09-11 araştırma kaydı (askıdaydı); "Denenen ve etkisiz" bölümündeki üç ilke bu değildi.

## Belirti

Terminal 1'de (PUSULARDP, 10.15.2.5) **yeni** RDP oturumu açılırken kullanıcı kilit
ekranında ~12–15 sn bekliyor. Kopuk oturuma yeniden bağlanma 0,3 sn. Terminal 2'de
(PUSULARDP2, 10.15.2.9) sorun görünmüyor — çünkü orada oturum sayısı az (1–6).

Hedef her terminalde ~80 kullanıcı. Aşağıdaki modelle **80 oturumda ~20 sn** bekleme
öngörülüyor; Terminal 2 dolduğunda aynı sorun orada da çıkacak.

## Ölçüm yöntemi

Bekleme = RCM olay **1149** (kimlik doğrulama, `RemoteConnectionManager/Operational`) →
LSM olay **41** (oturum tahkimi, `LocalSessionManager/Operational`) arası. Kullanıcı adı
domain öneki atılarak eşleştirilir. Eşzamanlı oturum sayısı açılıştan beri 21/23
olaylarından çıkarılır.

| Eşzamanlı oturum | Bekleme |
|---|---|
| 0–9 | 2,8 sn |
| 20–29 | 8,3 sn |
| 30–39 | 11,1 sn |
| 40+ | 12,4 sn (bugün 10:00–13:10 ort. 15,2, max 34,8) |

## Bulgular

1. Boşluk, winlogon hazır (+0,6 sn) ile Winlogon "Authentication started" (+11,7 sn)
   arasında. Kimlik doğrulamanın kendisi 0,04 sn. Grup ilkesi, profil, ağ, DC bu aralıkta
   devrede değil.
2. Bu aralıkta yeni oturumun **`LogonUI.exe`**'si (süreç örnekleyiciyle adıyla
   doğrulandı; girişte kapanıyor) saniyede ~2.000 (izli) / ~5.600 (çağrı toplamı) RPC
   çağrısı yapıyor. 14,95 sn'lik bir girişte **83.208 çağrı**:

   | Hedef | Arabirim / opnum | Çağrı |
   |---|---|---|
   | LSM | TermSrvSession `484809d6` op12 | 23.328 |
   | TermService | RCMPublic `bde95fdf` op9 `RpcGetSessionProtocolLastInputTime` | 23.328 |
   | lsass | `4f32adc8` op0/1/3 | ~15.500 |
   | lsass | LSARPC `12345778…ab` op130 OpenPolicy3 / op68 LookupNames3 / op0 Close | ~12.000 |
   | TermService | RCMPublic op0 `RpcGetClientData` | 3.870 |
   | TermService | RCMPublic op8 `RpcGetAllListeners` | 64 |
   | TermService | RCMListener `497d95a6` op0/1/4 | 63 |

   TermService de her çağrıyı LSM'ye iletiyor (`1a8a5d71` op13 ~24.700, `a1b7de7a`,
   `959c5a99`). 13 sn'lik boşlukta CPU: TermService 7,4 sn · LogonUI 2,3 · LSM 1,9 · lsass 1,5.
3. **Model:** LogonUI bir koşulu yoklamıyor; **sabit ~64 tur** atıyor (tur başı bir
   `RpcGetAllListeners`), her turda tüm oturumları dolaşıyor, oturum başına ~22 çağrı.
   Çağrı hızı düz → bekleme ≈ 64 × oturum × 22 ÷ hız ≈ **oturum başına ~0,25 sn**.
   Ölçümle tutuyor. Fırtına 1149'la başlıyor, 41'le bitiyor; yeniden bağlanmada yok.

## Denenen ve etkisiz olanlar (üçü de geri alındı)

| Ayar (`HKLM\SOFTWARE\Policies\Microsoft\Windows\System`) | Oturum | Bekleme |
|---|---|---|
| `DontEnumerateConnectedUsers=1` | 45 | 13,1 sn |
| `HideFastUserSwitching=1` | 47 | 13,8 sn |
| `ExcludedCredentialProviders` (17 sağlayıcıdan 12'si dışlandı; RDP, Password, Generic, NP, CngCredUI kaldı) | 50 | 12,3 sn |

Son deneme "64 tur = sağlayıcı sayısı × ~3,8" hipotezini çürüttü. Giriş sorunsuzdu.

## Elenenler

Grup ilkesi, profil yükleme, ağ/DC/DNS, yazıcı yönlendirme, RD lisans, UDP, kamera
yönlendirmesi (kameralı/kamerasız aynı süre; `RDCAMERA_BUS` aygıtları 36/36 yaşayan
oturuma ait, sızıntı yok), akıllı kart (SCardSvr durdurulmuş), AppLocker, kopuk oturum
şişmesi, TermService handle sızıntısı, RDS ilke farkı (T1 = T2), hayalet PnP cihazları,
`TIP\TestResults` şişmesi. TermService/LSM/lsass/winlogon'da Microsoft dışı modül yok;
termsrv.dll, lsm.dll, winlogon.exe, LogonUI.exe, winsta.dll, rdpcorets.dll, wtsapi32.dll
imzaları geçerli — Thinstuff XP/VS sistem bileşenlerine kanca atmıyor.

## Yan bulgular (ayrı iş)

- Thinstuff XP/VS 1.0.972.1 + TSX-USB Redirector (TSXUsbSrv) iki terminalde de var;
  `tsxrdr` sanal kanalı saniyede ~20 kez 0x80070032 ile açılıp kapanıyor.
- FortiClient `FA_Scheduler` (yalnız T1) her 5 sn'de 46 oturumu `bde95fdf` ile yokluyor.
- T1'de 9.287 AppIso güvenlik duvarı kuralı (`DeleteUserAppContainersOnLogoff` yok).

## Sonraki adım (dönüldüğünde)

LogonUI'nin çağrı yığınını görmek: giriş sırasında **WPR** (Windows Performance
Recorder, yerleşik) ile CPU örneklemesi + yığın kaydı, Microsoft sembolleriyle çözüp
64 turu hangi modülün/fonksiyonun attığını bulmak. Kullanıcının bir kez çıkış/giriş
yapması gerekir. Olası sonuçlar: bir ilke/kayıt anahtarıyla kapatılabilen bir
numaralandırma, ya da Microsoft tasarımı (o zaman oturum sayısını sınırlamak / RDS
Session Broker ile dağıtmak).

## Teşhis teknikleri (tekrar gerekirse)

- ETW: `logman start <ad> -p Microsoft-Windows-RPC 0xffffffffffffffff 0x4 -o iz.etl -mode Circular -max 256 -ets`,
  sonra `tracerpt iz.etl -o iz.evtx -of EVTX -y` (yavaş: ~10 MB ETL/dk, EVTX ~13× büyük)
  ve `Get-WinEvent -Path iz.evtx -Oldest -FilterXPath …` ile zaman penceresi sorgusu.
  ETL'yi doğrudan EventLogReader ile okumak belleği şişirip çöküyor.
- Kısa ömürlü süreci yakalamak: ~0,4 sn arayla tüm süreçlerin CPU süresini CSV'ye yazan
  örnekleyici, hedef kullanıcının 41 olayından 4 sn sonra durur.
- Ajan `/api/exec` tuzakları: bkz. CLAUDE.md; ek olarak süreç filtresinde `$PID`'i hariç
  tut (exec'in kendi komut satırı filtre metnini içerir, kendini öldürür).
- Betikler ve 171 MB iz + 2,1 GB EVTX T1'de `C:\Windows\Temp\logon-teshis` altındaydı;
  2026-09-11'de silindi (C: 138 GB boş).
