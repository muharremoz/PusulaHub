# Office gecisi: perakende H&B 2024 -> LTSC Pro Plus 2024 (C:\Kurulum\Office2024\config.xml).
# Tek seferlik gorev "PusulaOfficeGecis" ile gece (gece yeniden baslatmasindan once) SYSTEM olarak calisir.
# Gunluk: C:\Kurulum\Office2024\gecis.log  — ODT ayrintili gunlugu: C:\Kurulum\Office2024\log
# Lisans (MAK) BU BETIKTE GIRILMEZ; kurulumdan sonra elle: OSPP.VBS /inpkey + /act.
# SAF ASCII.
$k = "C:\Kurulum\Office2024"
$g = Join-Path $k "gecis.log"
function Yaz($m) { Add-Content -Path $g -Value ((Get-Date -Format "yyyy-MM-dd HH:mm:ss") + " " + $m) }
try {
    Yaz ("basladi | once: " + (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration" -ErrorAction SilentlyContinue).ProductReleaseIds)
    $p = Start-Process -FilePath (Join-Path $k "setup.exe") -ArgumentList "/configure", (Join-Path $k "config.xml") -WorkingDirectory $k -Wait -PassThru
    $c = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration" -ErrorAction SilentlyContinue
    Yaz ("setup cikis " + $p.ExitCode + " | sonra: " + $c.ProductReleaseIds + " " + $c.VersionToReport + " kanal " + $c.CDNBaseUrl)
} catch {
    Yaz ("HATA: " + $_.Exception.Message)
}
Unregister-ScheduledTask -TaskName "PusulaOfficeGecis" -Confirm:$false -ErrorAction SilentlyContinue
Yaz "bitti"
