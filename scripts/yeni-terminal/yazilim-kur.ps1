# Yeni terminal — yazılımlar (T5'teki kurulumların aynısı). __ps-paylasim.mjs ile çalışır:
#   node __ps-paylasim.mjs "Terminal N" scripts/yeni-terminal/yazilim-kur.ps1 300 "Terminal 5"
# 1) Dosyaları T5'ten kopyalar (SHA doğrulamalı) — hemen.
# 2) Kurulumları C:\Kurulum\yazilim-kur-calistir.ps1 olarak yazıp ARKA PLANDA başlatır (Office ~5-10 dk; Node isteği 5 dk'da
#    kesildiği için). Günlük: C:\ProgramData\Pusula\yazilim-kur.log (son satır "BITTI").
# Tekrar çalıştırmak zararsız (kurulu olan atlanır). Office LTSC ProPlus 2024 internetten iner, ETKİNLEŞTİRİLMEZ (MAK kullanıcıda).
$ErrorActionPreference = 'Stop'
$kay = $P['Terminal 5'] + '\Kurulum'
if (-not (Test-Path $kay)) { throw 'T5 Kurulum klasorune erisilemedi' }
$hed = 'C:\Kurulum'
New-Item -ItemType Directory -Force "$hed\Yazilim", "$hed\Office2024\log", "$hed\WebView2", 'C:\ProgramData\Pusula' | Out-Null
function Kopya($a, $b) {
  Copy-Item $a $b -Force
  if ((Get-FileHash $a).Hash -ne (Get-FileHash $b).Hash) { throw "SHA tutmadi: $a" }
}
foreach ($f in Get-ChildItem "$kay\Yazilim" -File) { Kopya $f.FullName "$hed\Yazilim\$($f.Name)" }
Kopya "$kay\WebView2\MicrosoftEdgeWebview2Setup.exe" "$hed\WebView2\MicrosoftEdgeWebview2Setup.exe"
Kopya "$kay\Office2024\setup.exe" "$hed\Office2024\setup.exe"
Kopya "$kay\Office2024\config.xml" "$hed\Office2024\config.xml"
'dosyalar kopyalandi (SHA dogrulandi)'

$calistir = @'
$log = 'C:\ProgramData\Pusula\yazilim-kur.log'
function Yaz($m) { $s = (Get-Date -Format 'HH:mm:ss') + ' ' + $m; Add-Content -Path $log -Value $s -Encoding UTF8 }
$kayit = { param($desen) [bool](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like $desen }) }
function Kur($ad, [scriptblock]$kurulu, $exe, $arg) {
  try {
    if (& $kurulu) { Yaz "ATLANDI $ad (kurulu)"; return }
    Yaz "BASLADI $ad"
    $p = Start-Process -FilePath $exe -ArgumentList $arg -Wait -PassThru -WindowStyle Hidden
    $d = if (& $kurulu) { 'TAMAM' } else { 'HATA' }
    Yaz "$d $ad (cikis $($p.ExitCode))"
  } catch { Yaz "HATA $ad : $($_.Exception.Message)" }
}
$h = 'C:\Kurulum'
Kur 'VC++ 2008 x86' { & $kayit 'Microsoft Visual C++ 2008 Redistributable - x86*' } "$h\Yazilim\vcredist_x86.exe" '/q'
Kur 'VC++ 2008 x64' { & $kayit 'Microsoft Visual C++ 2008 Redistributable - x64*' } "$h\Yazilim\vcredist2008_x64.exe" '/q'
Kur '7-Zip' { Test-Path 'C:\Program Files\7-Zip\7z.exe' } (Get-ChildItem "$h\Yazilim\7z*-x64.exe" | Select-Object -First 1).FullName '/S'
Kur 'SumatraPDF' { Test-Path 'C:\Program Files\SumatraPDF\SumatraPDF.exe' } (Get-ChildItem "$h\Yazilim\SumatraPDF-*-install.exe" | Select-Object -First 1).FullName '-install -all-users -silent'
Kur 'WebView2 Runtime' { Test-Path 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' } "$h\WebView2\MicrosoftEdgeWebview2Setup.exe" '/silent /install'
Kur 'Office LTSC ProPlus 2024' { Test-Path 'C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE' } "$h\Office2024\setup.exe" "/configure $h\Office2024\config.xml"
Yaz 'BITTI'
'@
[IO.File]::WriteAllText("$hed\yazilim-kur-calistir.ps1", $calistir, (New-Object Text.UTF8Encoding($true)))
Start-Process -FilePath powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "$hed\yazilim-kur-calistir.ps1" -WindowStyle Hidden
'kurulumlar arka planda basladi — gunluk C:\ProgramData\Pusula\yazilim-kur.log'
