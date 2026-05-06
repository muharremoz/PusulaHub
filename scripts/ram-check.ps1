# RAM kullanim raporu - sunucuda calistir
#
# Kullanim:
#   powershell -ExecutionPolicy Bypass -File ram-check.ps1
#
# "Used" rakamini cache'siz (gercek) olarak gosterir, ayrica:
#  - Standby cache (geri kazanilabilir RAM)
#  - En cok RAM tuketen 15 process
#  - Her RDP kullanicisinin toplam RAM tuketimi
#
# NOT: Karakterler ASCII tutuldu cunku Windows console codepage'i (1254)
# her zaman UTF-8'e gecirilemiyor, "i, c, s, u" gibi harfler bozuk gorunebilir.

$ErrorActionPreference = "Stop"

$os         = Get-CimInstance Win32_OperatingSystem
$totalKB    = [int64]$os.TotalVisibleMemorySize

# DOGRU MATEMATIK:
# WMI'nin FreePhysicalMemory'si bazi Windows surumlerinde Available (Free+Standby)
# donduruyor. Bu yuzden gercek bos icin perfcounter "Free & Zero Page List" okuyoruz.
# Standby tum kategorilerden (Normal+Reserve+Core) toplanir + Modified eklenir.
# realUsed = total - pureFree - cache  →  Task Manager "In use" rakamina denk gelir.
$standbyN_B = (Get-Counter '\Memory\Standby Cache Normal Priority Bytes').CounterSamples[0].CookedValue
$standbyR_B = (Get-Counter '\Memory\Standby Cache Reserve Bytes').CounterSamples[0].CookedValue
$standbyC_B = (Get-Counter '\Memory\Standby Cache Core Bytes').CounterSamples[0].CookedValue
$modifiedB  = (Get-Counter '\Memory\Modified Page List Bytes').CounterSamples[0].CookedValue
$pureFreeB  = (Get-Counter '\Memory\Free & Zero Page List Bytes').CounterSamples[0].CookedValue

$cacheKB    = [int64](($standbyN_B + $standbyR_B + $standbyC_B + $modifiedB) / 1024)
$freeKB     = [int64]($pureFreeB / 1024)
$realUsedKB = $totalKB - $freeKB - $cacheKB
if ($realUsedKB -lt 0) { $realUsedKB = 0 }

function FmtGB([int64]$kb) { "{0,7:N2} GB" -f ($kb / 1MB) }
function Pct([int64]$part, [int64]$whole) { "{0,5:N1}%" -f (($part / $whole) * 100) }

Write-Host ""
Write-Host "========== RAM KULLANIM RAPORU ==========" -ForegroundColor Cyan
Write-Host ("Sunucu:   {0}" -f $env:COMPUTERNAME)
Write-Host ("Tarih:    {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-Host ("Uptime:   {0:N1} saat" -f (((Get-Date) - $os.LastBootUpTime).TotalHours))
Write-Host ""
Write-Host ("Toplam RAM:               {0}" -f (FmtGB $totalKB))
Write-Host ("Gercek kullanim:          {0}  ({1})  <-- uygulamalar fiilen bu kadar" -f (FmtGB $realUsedKB), (Pct $realUsedKB $totalKB)) -ForegroundColor Green
Write-Host ("Cache (geri alinabilir):  {0}  ({1})" -f (FmtGB $cacheKB), (Pct $cacheKB $totalKB)) -ForegroundColor DarkGray
Write-Host ("Bos RAM:                  {0}  ({1})" -f (FmtGB $freeKB), (Pct $freeKB $totalKB))
Write-Host ""

# En cok RAM tuketen 15 process
Write-Host "========== EN COK RAM TUKETEN 15 PROCESS ==========" -ForegroundColor Cyan
Get-Process |
  Sort-Object WorkingSet -Descending |
  Select-Object -First 15 @{n="Process";e={$_.ProcessName}},
                          @{n="PID";e={$_.Id}},
                          @{n="RAM (MB)";e={[math]::Round($_.WorkingSet/1MB,1)}},
                          @{n="CPU (s)";e={if ($_.CPU) {[math]::Round($_.CPU,0)} else {0}}} |
  Format-Table -AutoSize

# RDP oturumu basina RAM - hizli yontem (per-process CIM call YOK)
Write-Host "========== KULLANICI BASINA RAM (RDP oturumlari) ==========" -ForegroundColor Cyan
$sessionUser = @{}
try {
  $quser = quser 2>$null
  if ($quser) {
    foreach ($line in ($quser | Select-Object -Skip 1)) {
      $parts = $line -split '\s+' | Where-Object { $_ -ne "" }
      if ($parts.Count -lt 3) { continue }
      $userName = ($parts[0] -replace '^>','').Trim()
      $sid = $null
      foreach ($p in $parts) { if ($p -match '^\d+$') { $sid = [int]$p; break } }
      if ($sid) { $sessionUser[$sid] = $userName }
    }
  }
} catch { }

$byUser = Get-Process |
  Where-Object { $_.SessionId -gt 0 } |
  Group-Object SessionId |
  ForEach-Object {
    $sid = [int]$_.Name
    $user = if ($sessionUser.ContainsKey($sid)) { $sessionUser[$sid] } else { "Session $sid" }
    [pscustomobject]@{
      User      = $user
      SessionId = $sid
      ProcCount = $_.Count
      RAM_MB    = [math]::Round(($_.Group | Measure-Object WorkingSet -Sum).Sum/1MB, 1)
    }
  } | Sort-Object RAM_MB -Descending
$byUser | Format-Table -AutoSize

# >100 MB svchost - hangi servisleri host ediyor
$bigSvc = Get-Process -Name svchost -ErrorAction SilentlyContinue |
          Where-Object { $_.WorkingSet -gt 100MB } |
          Sort-Object WorkingSet -Descending
if ($bigSvc) {
  Write-Host "========== >100 MB svchost (HANGI SERVIS?) ==========" -ForegroundColor Cyan
  foreach ($s in $bigSvc) {
    $svcLine = (tasklist /SVC /FI "PID eq $($s.Id)" /NH 2>$null) | Where-Object { $_ -match '\S' } | Select-Object -Last 1
    $svcs = if ($svcLine) { ($svcLine -replace 'svchost\.exe\s+\d+\s+','').Trim() } else { "?" }
    "{0,5}  {1,7:N0} MB   {2}" -f $s.Id, ($s.WorkingSet/1MB), $svcs
  }
  Write-Host ""
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Cikmak icin Enter'a basin..."
$null = Read-Host
