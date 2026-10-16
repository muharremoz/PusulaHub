# Taze RDP girislerinde 1149 (kimlik dogrulandi, RemoteConnectionManager) -> 41 (oturum tahkimi,
# LocalSessionManager) farki. $ARG = kac saat geriye (varsayilan 8). Yeniden baglanmalar (41 gelmeyen) atlanir.
$ProgressPreference = 'SilentlyContinue'
$saat = 8; if ($ARG) { $saat = [int]$ARG }
$bas = (Get-Date).AddHours(-$saat)
$a = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational'; Id = 1149; StartTime = $bas } -ErrorAction SilentlyContinue
$b = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational'; Id = 41; StartTime = $bas } -ErrorAction SilentlyContinue
$b41 = foreach ($e in $b) { $x = [xml]$e.ToXml(); [pscustomobject]@{ T = $e.TimeCreated; U = ($x.Event.UserData.EventXML.User -replace '^.*\\', '').ToLower(); S = $x.Event.UserData.EventXML.SessionID } }
$sonuc = foreach ($e in $a | Sort-Object TimeCreated) {
  $x = [xml]$e.ToXml()
  $u = ([string]$x.Event.UserData.EventXML.Param1).ToLower()
  $m = $b41 | Where-Object { $_.U -eq $u -and $_.T -ge $e.TimeCreated -and $_.T -le $e.TimeCreated.AddSeconds(90) } | Sort-Object T | Select-Object -First 1
  if ($m) {
    $oturum = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational'; Id = 21, 23; StartTime = $bas; EndTime = $e.TimeCreated } -ErrorAction SilentlyContinue).Count
    [pscustomobject]@{ Zaman = $e.TimeCreated.ToString('HH:mm:ss'); Kullanici = $u; Sn = [math]::Round(($m.T - $e.TimeCreated).TotalSeconds, 1) }
  }
}
foreach ($s in $sonuc) { 'GIRIS ' + $s.Zaman + ' ' + $s.Sn + ' sn ' + $s.Kullanici }
if ($sonuc) {
  $o = ($sonuc | Measure-Object Sn -Average -Maximum -Minimum)
  'OZET adet=' + $o.Count + ' ort=' + [math]::Round($o.Average, 1) + ' min=' + $o.Minimum + ' max=' + $o.Maximum + ' su_an_oturum=' + @(Get-Process explorer -ErrorAction SilentlyContinue).Count
} else { 'OZET eslesen giris yok' }
