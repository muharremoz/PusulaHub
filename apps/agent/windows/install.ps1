#Requires -RunAsAdministrator
<#
.SYNOPSIS
    PusulaAgent Windows kurulum scripti
.DESCRIPTION
    PusulaAgent'ı Windows Scheduled Task olarak kurar (başlangıçta otomatik çalışır)
.NOTES
    Yönetici olarak çalıştırın: powershell -ExecutionPolicy Bypass -File install.ps1
#>

$AgentScript = Join-Path $PSScriptRoot "PusulaAgent.ps1"
$TaskName    = "PusulaAgent"
$LogFile     = Join-Path $PSScriptRoot "agent.log"

Write-Host "PusulaAgent Kurulum" -ForegroundColor Cyan
Write-Host "══════════════════" -ForegroundColor Cyan

# Config kontrolü
$ConfigFile = Join-Path $PSScriptRoot "config.json"
if (-not (Test-Path $ConfigFile)) {
    $hubUrl = Read-Host "PusulaHub adresi (örn: http://192.168.1.100:3000)"
    $secret = Read-Host "Agent secret"
    @{
        hub_url    = $hubUrl
        secret     = $secret
        interval   = 30
        local_port = 8585
        agent_id   = $null
        token      = $null
    } | ConvertTo-Json | Set-Content $ConfigFile -Encoding UTF8
    Write-Host "✓ Config oluşturuldu" -ForegroundColor Green
}

# Mevcut task varsa kaldır
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "✓ Eski task kaldırıldı" -ForegroundColor Yellow
}

# Firewall — yerel port aç
$port = (Get-Content $ConfigFile | ConvertFrom-Json).local_port
netsh advfirewall firewall delete rule name="PusulaAgent" | Out-Null
netsh advfirewall firewall add rule name="PusulaAgent" dir=in action=allow protocol=TCP localport=$port | Out-Null
Write-Host "✓ Firewall kuralı eklendi (port $port)" -ForegroundColor Green

# Scheduled Task oluştur
$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AgentScript`"" `
    -WorkingDirectory $PSScriptRoot

$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action `
    -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

Write-Host "✓ Scheduled Task oluşturuldu (SYSTEM, başlangıçta)" -ForegroundColor Green

# Hemen başlat
Start-ScheduledTask -TaskName $TaskName
Write-Host "✓ Agent başlatıldı" -ForegroundColor Green

Write-Host ""
Write-Host "Kurulum tamamlandı!" -ForegroundColor Green
Write-Host "Yerel arayüz: http://localhost:$port" -ForegroundColor Yellow
Write-Host "Durumu kontrol: Get-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
