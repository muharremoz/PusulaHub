# Terminal 3 — Giriş Kilitlenmesi (zombi RDP oturumu)

> **Durum (2026-09-18): askıda.** İki kez yaşandı, ikisinde de ESXi'den VM reset ile
> geçti. 17 Eylül'den sonra KB5129237 elle kuruldu; bunun çözüp çözmediği bilinmiyor.
> **Tekrar olursa** bu dosyaya yeni bir "Olay" bölümü eklenir ve güncellemenin
> etkisiz olduğu kabul edilip Thinstuff tarafına geçilir. Aksi halde konu kapalı.

Sunucu: PUSULARDP3 / 10.15.2.12, ESXi 10.15.2.10 moid 18, Windows Server 2022 Standard
(21H2), Thinstuff XP/VS 1.0.980.

## Belirti

Yeni RDP girişleri kabul edilmiyor; açık oturumlar çalışmaya devam ediyor.
`qwinsta`, `quser`, `WTSEnumerateSessions`, `Get-CimInstance Win32_Service`,
`tasklist /svc` asılı kalıyor; `shutdown /r` takılıyor. Tek çıkış ESXi'den reset.

## Kök zincir (14 Eylül kayıtlarından)

1. Kullanıcı (4626.mimra1, VPN 172.22.202.43) oturum açarken aynı istemci yeniden
   bağlanıyor ("reason code 5") — logon işlenirken gelen ikinci bağlantı.
2. LSM 48/52: "Remote Connection Manager has taken too long … session 41". Oturumun
   kullanıcı servisleri çöküyor; oturumda yalnız `csrss` kalıyor (**zombi**), logoff olayı yok.
3. Her yeni giriş LSM'nin önce eski oturuma bağlanma denemesiyle zombiye dokunuyor
   (60 sn takılma), sonra yeni oturum açılıyor. Zombi sayısı artıyor.
4. Belirli bir noktadan sonra SCM 7011 (PcaSvc, ThinRDPSrv, iphlpsvc, NlaSvc) ve
   termsrv tıkanıyor → giriş yok.

`fSingleSessionPerUser=1` çalışıyor; "çift oturum" görüntüsü bu zincirin yan etkisi.

## Olaylar

| Tarih | Ne oldu | Müdahale |
|---|---|---|
| 2026-09-14 ~17:23 | Son başarılı giriş 17:23:02, ardından kilit | 18:00 ESXi reset. Aynı gece GPO `Rdp_KopukOturum_1Saat` (MaxDisconnectionTime=1 saat, yalnız PUSULARDP/2/3) |
| 2026-09-17 ~15:30 | Yine kilit | 15:35 ESXi reset (Olay 41/6008 bu resettir, çökme değil). Ardından **KB5129237 elle kuruldu** (13:10 kurulum kaydı, build 20348.5631), 18.09 01:00 planlı yeniden başlatma |

## Yapılmaması gerekenler

- Zombi oturumda `logoff` / `rwinsta` deneme — ikisi de asılı kaldı, zinciri besliyor olabilir.
- Kilitliyken `qwinsta`/`quser` ile bakma; `Get-Process` ile oturum başına süreçlere bak
  (csrss var, winlogon yok = zombi).
- WTS listesi takılıysa Hub mesajı çalışmaz; kullanıcı uyarısı için
  `C:\ProgramData\Pusula\bakim-mesaj.ps1` (explorer tokeni ile PusulaNotify).

## Erken uyarı kontrolü (isteğe bağlı)

Agent exec ile, salt okuma:

```powershell
# yalniz csrss kalan oturumlar
Get-Process csrss,winlogon | Group-Object SessionId | Where-Object { ($_.Group.Name -contains 'winlogon') -eq $false -and $_.Name -ne '0' } | Select-Object Name
# LSM RCM uyarilari (son 24 saat)
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-TerminalServices-LocalSessionManager/Operational'; Id=48,52; StartTime=(Get-Date).AddHours(-24)} | Select-Object TimeCreated, Id
```

## Tekrar olursa sıradaki adaylar

- Thinstuff sürüm/tek oturum ayarı; ThinRDPSrv'nin RCM ile etkileşimi (T1 1.0.972'de
  yaşanmadı, T2/T3 1.0.980'de yaşandı — sürüm farkı ipucu olabilir).
- mimra1 istemcisinin "logon sırasında yeniden bağlanma" davranışı (VPN kopması?).
- Zombi oturum tespiti Hub'a alarm olarak eklenebilir.

İlgili: [terminal1-oturum-gecikmesi.md](terminal1-oturum-gecikmesi.md) (farklı sorun, T1).
