# Terminal 6 (PUSULARDP6) - Terminal 3/4'teki duzeni kurar.
#
# NE ZAMAN: Windows kuruldu, ad PUSULARDP6, IP 10.15.2.15, domaine katildi
# (OU=Bilgisayarlar), yeniden baslatildi. Thinstuff ve Office bu betikten
# ONCE ya da SONRA elle kurulabilir; betik onlara dokunmaz.
#
# NASIL: T6'da Domain Admin hesabiyla, YONETICI PowerShell'de:
#   net use \\10.15.2.12\c$   (ve \\10.15.2.13\c$)  - gerekirse kimlik ister
#   powershell -ExecutionPolicy Bypass -File \\10.15.2.12\c$\Kurulum\T6\t6-kur.ps1
#   (Thinstuff bekcisi icin Kuma push token'i varsa: ... -KumaToken <token>)
#
# Kaynaklar:
#   T3 (\\10.15.2.12\c$) - Pusula, Database, Demo, Scripts, ProgramData betikleri,
#                          Kurulum, gorev XML'leri (Kurulum\T4\gorevler)
#   T4 (\\10.15.2.13\c$) - C:\Tools\BGInfo: 07.10 yamali pusula.bgi (duvar kagidi +
#                          %APPDATA% cikti yolu) ve 09.10 PusulaBilgi.exe. T3'unki
#                          "BILKAR" yazili ve terminale ozel - KOPYALANMAZ.
# Iki kez calistirmak zarar vermez (her adim "varsa atla" ya da uzerine yazar).
#
# SAF ASCII (PowerShell 5.1 BOM'suz dosyayi ANSI okur).
# Kaynak: scripts/terminal6/t6-kur.ps1 (t5-kur.ps1 kopyası; yalnız ad/günlük/klasör T6).

param(
  [string]$Kaynak    = '\\10.15.2.12\c$',
  [string]$AracKaynak = '\\10.15.2.13\c$',
  [string]$KumaToken = ''
)

$ErrorActionPreference = 'Stop'
$gunluk = 'C:\ProgramData\Pusula\t6-kur.log'
New-Item -ItemType Directory -Force -Path 'C:\ProgramData\Pusula' | Out-Null
$sonuc = New-Object System.Collections.Generic.List[string]

function Yaz([string]$m) {
  $s = (Get-Date -Format 'HH:mm:ss') + ' ' + $m
  Write-Host $s
  Add-Content -LiteralPath $gunluk -Value $s
}
function Adim([string]$ad, [scriptblock]$is) {
  try { & $is; Yaz ('TAMAM  ' + $ad); $sonuc.Add('TAMAM  ' + $ad) }
  catch { Yaz ('HATA   ' + $ad + ' : ' + $_.Exception.Message); $sonuc.Add('HATA   ' + $ad + ' : ' + $_.Exception.Message) }
}
function Kopyala([string]$kay, [string]$hed, [string[]]$ek = @()) {
  $a = @($kay, $hed, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NP') + $ek
  & robocopy @a | Out-Null
  if ($LASTEXITCODE -ge 8) { throw ('robocopy cikis kodu ' + $LASTEXITCODE + ' : ' + $kay) }
}

# ---- 0) On kosullar ----
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Yonetici PowerShell gerekli.'
}
if ((Get-CimInstance Win32_ComputerSystem).Domain -ne 'pusuladc.local') { throw 'Once domaine katilin (pusuladc.local).' }
if (-not (Test-Path -LiteralPath (Join-Path $Kaynak 'Kurulum\T4\gorevler'))) { throw ('Kaynak okunamiyor: ' + $Kaynak + ' (Domain Admin ile mi calisiyor? net use yapildi mi?)') }
if (-not (Test-Path -LiteralPath (Join-Path $AracKaynak 'Tools\BGInfo\pusula.bgi'))) { throw ('Arac kaynagi okunamiyor: ' + $AracKaynak + ' (net use \\10.15.2.13\c$)') }
Yaz ('Basladi. Bilgisayar ' + $env:COMPUTERNAME + ', kaynak ' + $Kaynak + ', araclar ' + $AracKaynak)

# ---- 1) Saat dilimi + yerel ayar (sistem yereli yeniden baslatmada gecerli) ----
Adim 'Saat dilimi Turkey + yerel ayar tr-TR' {
  Set-TimeZone -Id 'Turkey Standard Time'
  Set-WinSystemLocale -SystemLocale tr-TR
  Set-Culture tr-TR
  Set-WinHomeLocation -GeoId 235
}

# ---- 2) Roller: .NET 3.5 (kurulum diski gerekebilir) + FSRM ----
Adim '.NET Framework 3.5' {
  if (-not (Get-WindowsFeature NET-Framework-Core).Installed) {
    $sxs = Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Root + 'sources\sxs' } | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($sxs) { Install-WindowsFeature NET-Framework-Core -Source $sxs | Out-Null }
    else { Install-WindowsFeature NET-Framework-Core | Out-Null }
  }
}
Adim 'FSRM rolu (FS-Resource-Manager)' {
  if (-not (Get-WindowsFeature FS-Resource-Manager).Installed) { Install-WindowsFeature FS-Resource-Manager -IncludeManagementTools | Out-Null }
}

# ---- 3) Servis ve sistem ayarlari ----
Adim 'AppIDSvc otomatik (AppLocker)' {
  & sc.exe config appidsvc start= auto | Out-Null
  Start-Service AppIDSvc -ErrorAction SilentlyContinue
}
Adim 'Fusion gunlugu kapali' {
  $f = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Fusion' -ErrorAction SilentlyContinue
  if ($f -and $f.EnableLog -eq 1) { Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Fusion' -Name EnableLog -Value 0 }
}
# GIRIS GECIKMESININ COZUMU (16.10.2026): LogonUI her turda acik oturumlarin kullanici adini
# arar (SID->ad, ~64 tur x oturum sayisi) -> 40 oturumda 10-12 sn bekleme. Bu ayarla T2'de
# ayni yukte 9,7 sn -> 0,6 sn. Yan etki: giris ekraninda son kullanici adi dolu gelmez.
# Kaynak: RSA KB "Please wait for Local Session Manager". docs/terminal1-oturum-gecikmesi.md
Adim 'Giris gecikmesi: DontDisplayLastUserName=1 (iki anahtar)' {
  New-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'DontDisplayLastUserName' -PropertyType DWord -Value 1 -Force | Out-Null
  New-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name 'DontDisplayLastUserName' -PropertyType DWord -Value 1 -Force | Out-Null
}
# Her giriste eklenen UWP/AppContainer duvar kurallari cikista silinmez, profil basi ~95 birikir
# (16.10: T1'de 9.485) -> yavas giris. Bu deger cikista siler (T1-T5'e 16.10'da acildi).
Adim 'Duvar kurali birikmesi (DeleteUserAppContainersOnLogoff=1)' {
  New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy' -Name 'DeleteUserAppContainersOnLogoff' -PropertyType DWord -Value 1 -Force | Out-Null
}
Adim 'Remote Desktop Users = PUSULADC\Domain Users' {
  $u = (Get-LocalGroupMember 'Remote Desktop Users' -ErrorAction SilentlyContinue).Name
  if ($u -notcontains 'PUSULADC\Domain Users') { Add-LocalGroupMember -Group 'Remote Desktop Users' -Member 'PUSULADC\Domain Users' }
}
Adim 'Guvenlik duvari: ping, RDP, Aktarim SMB' {
  Enable-NetFirewallRule -Name 'FPS-ICMP4-ERQ-In' -ErrorAction SilentlyContinue
  if (-not (Get-NetFirewallRule -DisplayName 'RDP' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'RDP' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3389 | Out-Null
  }
  if (-not (Get-NetFirewallRule -DisplayName 'Pusula Aktarim SMB (10.15.2.6)' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'Pusula Aktarim SMB (10.15.2.6)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 445 -RemoteAddress 10.15.2.6 | Out-Null
  }
}

# ---- 4) Pusula programi: MSI + T3'teki guncel klasor (yamalar dahil) ----
Adim 'Pusula Kurulum.msi' {
  $kur = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'Pusula Kurulum' }
  if (-not $kur) {
    New-Item -ItemType Directory -Force -Path 'C:\Pusula\Kurulum' | Out-Null
    Copy-Item -LiteralPath (Join-Path $Kaynak 'Pusula\Kurulum\Pusula Kurulum.msi') -Destination 'C:\Pusula\Kurulum\' -Force
    $p = Start-Process msiexec.exe -ArgumentList '/i "C:\Pusula\Kurulum\Pusula Kurulum.msi" /qn /norestart /l*v C:\ProgramData\Pusula\pusula-kurulum.log' -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw ('msiexec ' + $p.ExitCode + ' (gunluk C:\ProgramData\Pusula\pusula-kurulum.log)') }
  }
}
Adim 'C:\Pusula (T3 ile ayni)'   { Kopyala (Join-Path $Kaynak 'Pusula')   'C:\Pusula' }
Adim 'C:\Database'               { Kopyala (Join-Path $Kaynak 'Database') 'C:\Database' }
Adim 'C:\Demo (sihirbaz kaynagi)' { Kopyala (Join-Path $Kaynak 'Demo')     'C:\Demo' }

# ---- 5) Araclar ----
# BGInfo T4'ten: yamali pusula.bgi + PusulaBilgi.exe (dosemeyi duzelten sarmalayici).
# Yedek dosyalari (*.yedek-*, run-kaydi-*) kopyalanmaz.
Adim 'C:\Tools (BGInfo, T4) + C:\Scripts (T3)' {
  Kopyala (Join-Path $AracKaynak 'Tools') 'C:\Tools' @('/XF', '*.yedek-*', 'run-kaydi-*')
  Kopyala (Join-Path $Kaynak 'Scripts') 'C:\Scripts'
  if (-not (Test-Path 'C:\Tools\BGInfo\PusulaBilgi.exe')) { throw 'PusulaBilgi.exe kopyalanmadi' }
  Set-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -Name 'PusulaBilgi' -Value 'C:\Tools\BGInfo\PusulaBilgi.exe'
}
# Yeni profil ilk giriste bos duvar kagidi gormesin (08.10): varsayilan profile duvar.jpg.
# Resmin kendisi GPO Pusula_DuvarKagidi ile gelir (C:\Windows\web\wallpaper\Pusula\duvar.jpg).
Adim 'Varsayilan profil duvar kagidi' {
  $nt = 'C:\Users\Default\NTUSER.DAT'
  $yedek = 'C:\Tools\BGInfo\Default-NTUSER.DAT.yedek-t6kur'
  if (-not (Test-Path $yedek)) { Copy-Item -LiteralPath $nt -Destination $yedek -Force }
  & reg.exe load 'HKU\PusulaVarsayilan' $nt | Out-Null
  try {
    & reg.exe add 'HKU\PusulaVarsayilan\Control Panel\Desktop' /v Wallpaper /t REG_SZ /d 'C:\Windows\web\wallpaper\Pusula\duvar.jpg' /f | Out-Null
  } finally {
    [GC]::Collect(); Start-Sleep -Seconds 1
    & reg.exe unload 'HKU\PusulaVarsayilan' | Out-Null
  }
}
Adim 'Baglanti Testi araci' {
  Kopyala (Join-Path $Kaynak 'Program Files\Pusula') 'C:\Program Files\Pusula'
  $r = 'C:\ProgramData\Pusula\BaglantiTesti'
  New-Item -ItemType Directory -Force -Path $r | Out-Null
  # Kullanicilar yalniz dosya olusturur, kendi raporunu tam yonetir.
  & icacls.exe $r /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' 'Users:(CI)(WD,AD,RA,REA,RD,X)' 'CREATOR OWNER:(OI)(CI)(IO)F' | Out-Null
}
Adim 'Pusula betikleri (ProgramData\Pusula)' {
  $b = 'baglanti-testi-kisayol.ps1', 'masaustu-kota.ps1', 'office-tr.ps1', 'oo-masaustu.ps1', 'sumatra-ayar.ps1', 'thinstuff-bekci.ps1', 'DefaultAssociations.xml'
  foreach ($x in $b) { Copy-Item -LiteralPath (Join-Path $Kaynak ('ProgramData\Pusula\' + $x)) -Destination 'C:\ProgramData\Pusula\' -Force }
}
Adim 'Kurulum klasoru (Picture Manager paketi, resim varsayilani)' {
  Kopyala (Join-Path $Kaynak 'Kurulum') 'C:\Kurulum' @('/XD', 'T4', 'T5', 'T6')
  # Resimler Windows Photo Viewer ile acilsin (makine geneli, sonraki oturumda)
  $k = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System'
  if (-not (Test-Path $k)) { New-Item -Path $k | Out-Null }
  Set-ItemProperty -Path $k -Name 'DefaultAssociationsConfiguration' -Value 'C:\Kurulum\ResimVarsayilan.xml'
}

# ---- 6) Masaustu kotasi (FSRM) - T3/T4 ile ayni: UYARI modu ----
Adim 'FSRM sablonlari (Pusula Masaustu)' {
  # FSRM rolu ilk kurulumda InstallPending kalir; modul ve SrmSvc yeniden baslatmadan sonra gelir
  # (16.10 T5'te boyle oldu). O durumda acik mesajla durur - yeniden baslatip betigi tekrar calistir.
  if ((Get-WindowsFeature FS-Resource-Manager).InstallState -ne 'Installed') { throw 'FSRM rolu yeniden baslatma bekliyor - yeniden baslatip t6-kur.ps1 i tekrar calistirin' }
  Import-Module FileServerResourceManager -ErrorAction Stop
  $izin = '*.bmp', '*.csv', '*.doc', '*.docm', '*.docx', '*.dot', '*.dotx', '*.gif', '*.heic', '*.ico', '*.jpeg', '*.jpg', '*.lnk', '*.log', '*.odp', '*.ods', '*.odt', '*.pdf', '*.png', '*.pps', '*.ppsx', '*.ppt', '*.pptm', '*.pptx', '*.rtf', '*.svg', '*.tif', '*.tiff', '*.tmp', '*.txt', '*.url', '*.webp', '*.xls', '*.xlsb', '*.xlsm', '*.xlsx', '*.xlt', '*.xltx', 'Thumbs.db', 'desktop.ini', '~$*'
  # Yoksa CIM 'Not found' firlatir; -ErrorAction SilentlyContinue bunu Stop altinda yutmaz (16.10 T5)
  function Fsrm([scriptblock]$s) { try { & $s } catch { $null } }
  # Ilk acilista FSRM deposu bos kalabiliyor (varsayilan gruplar yok, New-* 'Not found' verir;
  # SRMSVC olay 8194). Servisi yeniden baslatmak depoyu hazirliyor (16.10 T5).
  if (@(Fsrm { Get-FsrmFileGroup }).Count -eq 0) { Restart-Service SrmSvc -Force; Start-Sleep -Seconds 10 }
  $ref = Fsrm { Get-FsrmFileGroup -Name 'Pusula Masaustu izin disi' }
  if (-not $ref) { New-FsrmFileGroup -Name 'Pusula Masaustu izin disi' -IncludePattern @('*') -ExcludePattern $izin | Out-Null }
  if (-not (Fsrm { Get-FsrmQuotaTemplate -Name 'Pusula Masaustu 100MB' })) {
    $c = New-FsrmAction -Type Event -EventType Warning -Body 'Masaustu kotasi: [Quota Path] [Quota Used Percent]% dolu ([Source Io Owner]).'
    $t1 = New-FsrmQuotaThreshold -Percentage 85 -Action $c
    $t2 = New-FsrmQuotaThreshold -Percentage 100 -Action $c
    New-FsrmQuotaTemplate -Name 'Pusula Masaustu 100MB' -Size 100MB -SoftLimit -Threshold $t1, $t2 | Out-Null
  }
  if (-not (Fsrm { Get-FsrmFileScreenTemplate -Name 'Pusula Masaustu tur izleme' })) {
    $e = New-FsrmAction -Type Event -EventType Warning -Body 'Masaustu dosya turu: [Source File Path] ([Source Io Owner]).'
    New-FsrmFileScreenTemplate -Name 'Pusula Masaustu tur izleme' -IncludeGroup 'Pusula Masaustu izin disi' -Notification $e | Out-Null
    Set-FsrmFileScreenTemplate -Name 'Pusula Masaustu tur izleme' -Active:$false | Out-Null
  }
}

# ---- 7) Zamanlanmis gorevler (T3'ten disa aktarilan XML; T4 de bunlarla kuruldu) ----
Adim 'Zamanlanmis gorevler' {
  $d = Join-Path $Kaynak 'Kurulum\T4\gorevler'
  foreach ($f in Get-ChildItem -LiteralPath $d -Filter '*.xml') {
    $ad = $f.BaseName
    $xml = Get-Content -LiteralPath $f.FullName -Raw
    if ($ad -eq 'PusulaThinstuffBekci') {
      if (-not $KumaToken) { Yaz 'ATLANDI PusulaThinstuffBekci (KumaToken verilmedi - T6 icin yeni Kuma push izleyicisi gerekli)'; continue }
      $xml = $xml -replace '-Token [0-9a-zA-Z]+', ('-Token ' + $KumaToken)
    }
    Register-ScheduledTask -TaskName $ad -TaskPath '\' -Xml $xml -Force | Out-Null
  }
}

# ---- 8) Picture Manager (Office'ten bagimsiz) ----
Adim 'Picture Manager (SPD2010 OIS)' {
  if (-not (Test-Path 'C:\Program Files\Microsoft Office\Office14\OIS.EXE')) {
    if (Test-Path 'C:\Kurulum\SPD2010\pm-kur.ps1') { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Kurulum\SPD2010\pm-kur.ps1' | Out-Null }
    if (-not (Test-Path 'C:\Program Files\Microsoft Office\Office14\OIS.EXE')) { throw 'OIS.EXE olusmadi (C:\Kurulum\SPD2010 gunluklerine bak)' }
  }
}

Yaz '================ OZET ================'
$sonuc | ForEach-Object { Yaz $_ }
Yaz 'Sistem yereli (tr-TR) icin YENIDEN BASLATMA gerekli.'

# t4-kur.ps1'den farklar:
#  - Ad/gunluk T5; Kurulum kopyasinda T5 klasoru de haric.
#  - C:\Tools T4'ten ($AracKaynak): T3'un pusula.bgi'si terminale ozel ("BILKAR").
#  - HKLM Run PusulaBilgi = C:\Tools\BGInfo\PusulaBilgi.exe (09.10 doseme duzeltmesi).
#  - Yeni adim: varsayilan profil duvar kagidi (08.10 ilk giris gecikmesi).
