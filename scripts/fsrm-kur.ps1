# Terminal sunucusuna masaustu kotasi (FSRM) kurulumu - T3'teki kurulumun birebir aynisi.
#
# 1) FS-Resource-Manager rolu
# 2) Dosya grubu "Pusula Masaustu izin disi" (izinli uzantilar DISINDAKI her sey)
# 3) Kota sablonu "Pusula Masaustu 100MB" (YUMUSAK, %85 ve %100'de olay)
# 4) Dosya engeli sablonu "Pusula Masaustu tur izleme" (PASIF, yalniz olay)
# 5) Zamanlanmis gorev "PusulaMasaustuKota" (saatlik + acilis, SYSTEM) -> masaustu-kota.ps1
# 6) masaustu-kota.ps1 bir kez calistirilir (mevcut masaustlerine uygular)
#
# Kullanim: C:\ProgramData\Pusula\ altina bu dosya + masaustu-kota.ps1 kopyalanir, SYSTEM olarak calistirilir.
# Gunluk: C:\ProgramData\Pusula\fsrm-kur.log. Tekrar calistirilabilir (var olani atlar).
# 2026-10-09: T1/T2 icin gece yeniden baslatmasindan (01:00) once 00:30'da tek seferlik gorevle calisir.
#
# SAF ASCII (PowerShell 5.1 BOM'suz dosyayi ANSI okur).

$ErrorActionPreference = "Stop"
$klasor = "C:\ProgramData\Pusula"
$gunluk = Join-Path $klasor "fsrm-kur.log"
function Yaz($m) { Add-Content -Path $gunluk -Value ((Get-Date -Format "yyyy-MM-dd HH:mm:ss") + " " + $m) }

try {
    Yaz "basladi"
    $f = Install-WindowsFeature FS-Resource-Manager -IncludeManagementTools
    Yaz ("rol: basari=" + $f.Success + " yenidenBaslatma=" + $f.RestartNeeded)
    Import-Module FileServerResourceManager

    $GRUP = "Pusula Masaustu izin disi"
    $izinli = @("*.bmp","*.csv","*.doc","*.docm","*.docx","*.dot","*.dotx","*.gif","*.heic","*.ico","*.jpeg","*.jpg","*.lnk","*.log","*.odp","*.ods","*.odt","*.pdf","*.png","*.pps","*.ppsx","*.ppt","*.pptm","*.pptx","*.rtf","*.svg","*.tif","*.tiff","*.tmp","*.txt","*.url","*.webp","*.xls","*.xlsb","*.xlsm","*.xlsx","*.xlt","*.xltx","Thumbs.db","desktop.ini","~$*")
    if (-not (Get-FsrmFileGroup -Name $GRUP -ErrorAction SilentlyContinue)) {
        New-FsrmFileGroup -Name $GRUP -IncludePattern @("*") -ExcludePattern $izinli | Out-Null
        Yaz "dosya grubu olusturuldu"
    }

    $KOTA = "Pusula Masaustu 100MB"
    if (-not (Get-FsrmQuotaTemplate -Name $KOTA -ErrorAction SilentlyContinue)) {
        $a85  = New-FsrmAction -Type Event -EventType Warning -RunLimitInterval 1440 -Body "Masaustu kotasi yuzde 85 doldu: [Source Io Owner] - [Quota Path] - [Quota Used MB] MB / [Quota Limit MB] MB"
        $a100 = New-FsrmAction -Type Event -EventType Warning -RunLimitInterval 1440 -Body "Masaustu kotasi ASILDI: [Source Io Owner] - [Quota Path] - [Quota Used MB] MB / [Quota Limit MB] MB"
        $t85  = New-FsrmQuotaThreshold -Percentage 85 -Action $a85
        $t100 = New-FsrmQuotaThreshold -Percentage 100 -Action $a100
        New-FsrmQuotaTemplate -Name $KOTA -Size 100MB -SoftLimit -Threshold @($t85, $t100) | Out-Null
        Yaz "kota sablonu olusturuldu"
    }

    $EKRAN = "Pusula Masaustu tur izleme"
    if (-not (Get-FsrmFileScreenTemplate -Name $EKRAN -ErrorAction SilentlyContinue)) {
        $n = New-FsrmAction -Type Event -EventType Warning -Body "Masaustune izin disi dosya: [Source Io Owner] - [Source File Path]"
        New-FsrmFileScreenTemplate -Name $EKRAN -IncludeGroup @($GRUP) -Notification @($n) | Out-Null
        # Varsayilan AKTIF olusur - uygulanmadan once pasife cek
        Set-FsrmFileScreenTemplate -Name $EKRAN -Active:$false | Out-Null
        Yaz "dosya engeli sablonu olusturuldu (pasif)"
    }

    $GOREV = "PusulaMasaustuKota"
    if (-not (Get-ScheduledTask -TaskName $GOREV -ErrorAction SilentlyContinue)) {
        $act = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:/ProgramData/Pusula/masaustu-kota.ps1"
        $tr1 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Hours 1)
        $tr2 = New-ScheduledTaskTrigger -AtStartup
        $pr  = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
        Register-ScheduledTask -TaskName $GOREV -Action $act -Trigger @($tr1, $tr2) -Principal $pr | Out-Null
        Yaz "gorev olusturuldu"
    }

    $sonuc = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $klasor "masaustu-kota.ps1")
    Yaz ("masaustu-kota: " + ($sonuc -join " "))
    Yaz ("kota sayisi: " + @(Get-FsrmQuota).Count + " | engel aktif: " + (Get-FsrmFileScreenTemplate -Name $EKRAN).Active)
    Yaz "bitti"
} catch {
    Yaz ("HATA: " + $_.Exception.Message)
}
# Tek seferlik kurulum gorevini kaldir
Unregister-ScheduledTask -TaskName "PusulaFsrmKur" -Confirm:$false -ErrorAction SilentlyContinue
