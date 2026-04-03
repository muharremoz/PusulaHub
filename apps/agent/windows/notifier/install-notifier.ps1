#Requires -RunAsAdministrator
<#
.SYNOPSIS
    PusulaNotifier kurulum scripti
.DESCRIPTION
    PusulaNotifier.exe'yi oturum açan kullanıcılar için
    Scheduled Task (oturum açıldığında) olarak kurar.
.NOTES
    install.ps1 tarafından otomatik çağrılır veya bağımsız çalıştırılabilir.
#>

$NotifierDir  = $PSScriptRoot
$NotifierExe  = Join-Path $NotifierDir "PusulaNotifier.exe"
$TaskName     = "PusulaNotifier"

Write-Host "  PusulaNotifier kurulum kontrol ediliyor..." -ForegroundColor Yellow

# Derlenmemiş exe varsa dotnet build dene
if (-not (Test-Path $NotifierExe)) {
    $csproj = Join-Path $NotifierDir "PusulaNotifier.csproj"
    if (Test-Path $csproj) {
        Write-Host "  Derleniyor (dotnet build)..." -ForegroundColor Yellow
        & dotnet publish $csproj -c Release -o $NotifierDir --nologo -v quiet 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  UYARI: PusulaNotifier.exe bulunamadı ve derlenemedi." -ForegroundColor Yellow
            Write-Host "         Manuel olarak derleyip '$NotifierExe' yoluna koyun." -ForegroundColor Gray
            return
        }
    } else {
        Write-Host "  UYARI: PusulaNotifier.exe bulunamadı, atlandı." -ForegroundColor Yellow
        return
    }
}

# Mevcut task kaldır
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Kullanıcı oturum açtığında otomatik başlat (INTERACTIVE_TOKEN — masaüstünde gösterim için)
$action   = New-ScheduledTaskAction -Execute $NotifierExe -WorkingDirectory $NotifierDir
$trigger  = New-ScheduledTaskTrigger -AtLogon
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -GroupId "Users" -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action `
    -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

# Hemen başlat (mevcut oturum için)
Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

Write-Host "  ✓ PusulaNotifier Task oluşturuldu (oturum açıldığında başlar)" -ForegroundColor Green
