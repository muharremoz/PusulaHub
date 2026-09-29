# Kısayol bulucu — verilen exe'nin kısayolu hangi kullanıcı profilinde?
#
# Kullanım (yönetici PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\kisayol-bul.ps1 -Hedef 'C:\Pusula\ALM_KARASU\ALMANYA\TOPTAN2_SQL.exe'
#
# Yalnız HEDEF EXE'YLE İLGİLİ kısayolları listeler. Bir kısayol şu durumlarda sayılır:
#   - hedefi bu exe (büyük/küçük harf, %ortam değişkeni% ve 8.3 kısa yol farkı gözetmeden)
#   - ya da exe'yi parametre / çalışma klasörü üzerinden çağırıyor (ör. cmd, başlatıcı)
#
# Profilin TAMAMI taranır (masaüstü, belgeler, OneDrive, Başlat menüsü, görev çubuğu...).
# Atlananlar: AppData\Local (önbellekler, çok büyük) ve Son Kullanılanlar (Recent —
# oradaki .lnk'ler Windows'un tuttuğu geçmiştir, kullanıcının koyduğu kısayol değil).
#
# Hiçbir şeyi değiştirmez; yalnız okur.

param(
  [string]$Hedef = 'C:\Pusula\ALM_KARASU\ALMANYA\TOPTAN2_SQL.exe',
  # Test için değiştirilebilir; normalde C:\Users
  [string]$Kok   = 'C:\Users'
)

$sh  = New-Object -ComObject WScript.Shell
$fso = New-Object -ComObject Scripting.FileSystemObject

# Hedefin karşılaştırılacak biçimleri: uzun yol + (varsa) 8.3 kısa yol
$bicimler = @($Hedef)
if (Test-Path -LiteralPath $Hedef) {
  try { $bicimler += $fso.GetFile($Hedef).ShortPath } catch {}
}
$bicimler = $bicimler | Where-Object { $_ } | Select-Object -Unique

function Eslesiyor([string]$metin) {
  if (-not $metin) { return $false }
  $m = [Environment]::ExpandEnvironmentVariables($metin)
  foreach ($b in $bicimler) {
    if ($m.IndexOf($b, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
  }
  return $false
}

# Taranacak kökler: her profil + tüm kullanıcılar için ortak Başlat menüsü
$kokler = @()
foreach ($p in Get-ChildItem -LiteralPath $Kok -Directory -Force -ErrorAction SilentlyContinue) {
  $kokler += [pscustomobject]@{ Profil = $p.Name; Yol = $p.FullName }
}
if ($Kok -eq 'C:\Users') {
  $kokler += [pscustomobject]@{ Profil = '(TUM KULLANICILAR)'; Yol = 'C:\ProgramData\Microsoft\Windows\Start Menu' }
}

$atla = '\\AppData\\Local\\|\\AppData\\LocalLow\\|\\Microsoft\\Windows\\Recent\\'

$sonuc = @()
$taranan = 0
foreach ($k in $kokler) {
  Write-Progress -Activity 'Kisayollar taraniyor' -Status $k.Profil
  foreach ($lnk in Get-ChildItem -LiteralPath $k.Yol -Filter *.lnk -Recurse -Force -ErrorAction SilentlyContinue) {
    # Atlama kuralı profilin İÇİNDEKİ yola uygulanır (kökün kendi yoluna değil)
    if ($lnk.FullName.Substring($k.Yol.Length) -match $atla) { continue }
    $taranan++
    try { $s = $sh.CreateShortcut($lnk.FullName) } catch { continue }

    $nasil = $null
    if     (Eslesiyor $s.TargetPath)       { $nasil = 'Hedef' }
    elseif (Eslesiyor $s.Arguments)        { $nasil = 'Parametre' }
    elseif (Eslesiyor $s.WorkingDirectory) { $nasil = 'Calisma klasoru' }

    if ($nasil) {
      $sonuc += [pscustomobject]@{
        Profil  = $k.Profil
        Kisayol = $lnk.FullName
        Nasil   = $nasil
        Tarih   = $lnk.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
      }
    }
  }
}
Write-Progress -Activity 'Kisayollar taraniyor' -Completed

''
'Aranan : ' + $Hedef
'Exe var: ' + $(if (Test-Path -LiteralPath $Hedef) { 'EVET' } else { 'HAYIR - bu bilgisayarda bu yolda exe yok' })
'Taranan kisayol: ' + $taranan
''

if ($sonuc.Count -eq 0) {
  'SONUC: Bu exe''nin kisayolu hicbir profilde bulunamadi.'
} else {
  'SONUC: ' + $sonuc.Count + ' kisayol, ' + @($sonuc.Profil | Select-Object -Unique).Count + ' profilde'
  $sonuc | Sort-Object Profil | Format-Table -AutoSize | Out-String -Width 400
}
