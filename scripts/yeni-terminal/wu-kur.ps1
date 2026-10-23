# Yeni terminal — Windows Update gorevi (T5'teki t5-wu.ps1'in aynisi). __ps.mjs ile calisir:
#   node __ps.mjs "Terminal N" scripts/yeni-terminal/wu-kur.ps1
# C:\ProgramData\Pusula\wu.ps1 yazar ve SYSTEM gorevi 'PusulaWindowsUpdate' olarak hemen baslatir.
# Arar -> indirir -> kurar, YENIDEN BASLATMAZ. Gunluk C:\ProgramData\Pusula\wu.log (son satir '--- bitti').
# Ikinci tur icin yeniden baslatip gorevi tekrar calistirin: schtasks /Run /TN PusulaWindowsUpdate
New-Item -ItemType Directory -Force 'C:\ProgramData\Pusula' | Out-Null
$wu = @'
$log = 'C:\ProgramData\Pusula\wu.log'
function L([string]$m) { Add-Content -LiteralPath $log -Value ((Get-Date -Format 'dd.MM HH:mm:ss') + ' ' + $m) }
try {
  L '--- basladi'
  $ses = New-Object -ComObject Microsoft.Update.Session
  $ses.ClientApplicationID = 'Pusula terminal kurulum'
  $sonuc = $ses.CreateUpdateSearcher().Search("IsInstalled=0 and IsHidden=0 and Type='Software'")
  L ('bulunan: ' + $sonuc.Updates.Count)
  if ($sonuc.Updates.Count -eq 0) { L 'guncelleme yok'; L '--- bitti'; exit 0 }
  $liste = New-Object -ComObject Microsoft.Update.UpdateColl
  foreach ($u in $sonuc.Updates) { if (-not $u.EulaAccepted) { $u.AcceptEula() }; [void]$liste.Add($u); L ('  + ' + $u.Title + ' (' + [math]::Round($u.MaxDownloadSize / 1MB) + ' MB)') }
  $ind = $ses.CreateUpdateDownloader(); $ind.Updates = $liste; $r = $ind.Download()
  L ('indirme sonucu: ' + $r.ResultCode + ' (2=basarili, 3=kismen, 4=hata)')
  $kur = $ses.CreateUpdateInstaller(); $kur.Updates = $liste; $k = $kur.Install()
  L ('kurulum sonucu: ' + $k.ResultCode + ' | yeniden baslatma gerekli: ' + $k.RebootRequired)
  for ($i = 0; $i -lt $liste.Count; $i++) { L ('  ' + $k.GetUpdateResult($i).ResultCode + ' ' + $liste.Item($i).Title) }
} catch { L ('HATA: ' + $_.Exception.Message) }
L '--- bitti'
'@
[IO.File]::WriteAllText('C:\ProgramData\Pusula\wu.ps1', $wu, (New-Object Text.UTF8Encoding($false)))
$eylem = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\ProgramData\Pusula\wu.ps1'
Register-ScheduledTask -TaskName 'PusulaWindowsUpdate' -Action $eylem -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName 'PusulaWindowsUpdate'
'PusulaWindowsUpdate gorevi kuruldu ve baslatildi — gunluk C:\ProgramData\Pusula\wu.log'
