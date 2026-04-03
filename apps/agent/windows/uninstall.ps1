#Requires -RunAsAdministrator
$ServiceName = "PusulaAgent"
$NotifierTask = "PusulaNotifier"

Write-Host "PusulaAgent kaldırılıyor..." -ForegroundColor Yellow

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    if ($svc.Status -eq "Running") { Stop-Service -Name $ServiceName -Force }
    & sc.exe delete $ServiceName | Out-Null
    Write-Host "  ✓ Servis kaldırıldı" -ForegroundColor Green
}

if (Get-ScheduledTask -TaskName $NotifierTask -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $NotifierTask -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $NotifierTask -Confirm:$false
    Write-Host "  ✓ Notifier task kaldırıldı" -ForegroundColor Green
}

netsh advfirewall firewall delete rule name="PusulaAgent" | Out-Null 2>&1
netsh advfirewall firewall delete rule name="PusulaNotifier" | Out-Null 2>&1
Write-Host "  ✓ Firewall kuralları kaldırıldı" -ForegroundColor Green

Write-Host "Kaldırma tamamlandı." -ForegroundColor Green
