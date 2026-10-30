# Kısayol bulucu — verilen exe'nin kısayolu hangi kullanıcı profilinde?
#
# Kullanım (yönetici PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\kisayol-bul.ps1 -Hedef 'C:\Pusula\ALM_KARASU\ALMANYA\TOPTAN2_SQL.exe'
#   powershell -ExecutionPolicy Bypass -File .\kisayol-bul.ps1      (-Hedef yoksa: art arda soru sorar, tarama bir kez yapılır)
#
# Yalnız HEDEF EXE'YLE İLGİLİ kısayolları listeler. Bir kısayol şu durumlarda sayılır:
#   - hedefi bu exe (büyük/küçük harf, %ortam değişkeni% ve 8.3 kısa yol farkı gözetmeden)
#   - ya da exe'yi parametre / çalışma klasörü üzerinden çağırıyor (ör. cmd, başlatıcı)
#
# Profilin TAMAMI taranır (masaüstü, belgeler, OneDrive, Başlat menüsü, görev çubuğu...).
# Atlananlar: AppData\Local (önbellekler, çok büyük) ve Son Kullanılanlar (Recent —
# oradaki .lnk'ler Windows'un tuttuğu geçmiştir, kullanıcının koyduğu kısayol değil).
#
# Hız (30.10.2026):
#   - Atlanan klasörlere hiç İNİLMEZ (eskiden -Recurse önce içini geziyor, sonra eliyordu).
#     Bağlantı (junction/symlink) klasörleri de izlenmez — profillerdeki eski
#     "Application Data" gibi bağlantılar aynı yeri iki kez taratıyordu.
#   - .lnk önce ham bayt olarak okunur; içinde exe'nin DOSYA ADI geçmiyorsa
#     WScript.Shell ile çözülmez (yavaş olan buydu). Eşleşen her kısayolun
#     hedefinde/parametresinde/çalışma klasöründe exe adı zaten yazılıdır.
#   - Etkileşimli modda kısayollar BİR KEZ okunup bellekte tutulur; sonraki
#     aramalar diske gitmez.
#
# Hiçbir şeyi değiştirmez; yalnız okur.

param(
  [string]$Hedef,
  # Test için değiştirilebilir; normalde C:\Users
  [string]$Kok = 'C:\Users'
)

$sh  = New-Object -ComObject WScript.Shell
$fso = New-Object -ComObject Scripting.FileSystemObject

# Kökün altında İNİLMEYECEK klasörler (köke göre yol, klasörün kendisi)
$atla = '\\AppData\\Local$|\\AppData\\LocalLow$|\\Microsoft\\Windows\\Recent$'

# ── 1) Kısayolları topla (bir kez) ─────────────────────────────────────
function Kisayollari-Topla {
  $kokler = @()
  foreach ($p in Get-ChildItem -LiteralPath $Kok -Directory -Force -ErrorAction SilentlyContinue) {
    if ($p.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }   # "All Users", "Default User" bağlantıları
    $kokler += [pscustomobject]@{ Profil = $p.Name; Yol = $p.FullName }
  }
  if ($Kok -eq 'C:\Users') {
    $kokler += [pscustomobject]@{ Profil = '(TUM KULLANICILAR)'; Yol = 'C:\ProgramData\Microsoft\Windows\Start Menu' }
  }

  $liste = New-Object System.Collections.Generic.List[object]
  $i = 0
  foreach ($k in $kokler) {
    $i++
    Write-Progress -Activity 'Kisayollar okunuyor' -Status ("{0}  ({1}/{2})" -f $k.Profil, $i, $kokler.Count) -PercentComplete ($i * 100 / $kokler.Count)
    $yigin = New-Object System.Collections.Generic.Stack[string]
    $yigin.Push($k.Yol)
    while ($yigin.Count -gt 0) {
      $d = $yigin.Pop()
      try {
        foreach ($f in [IO.Directory]::EnumerateFiles($d, '*.lnk')) {
          if (-not $f.EndsWith('.lnk', [StringComparison]::OrdinalIgnoreCase)) { continue }
          try { $b = [IO.File]::ReadAllBytes($f) } catch { continue }
          # Exe adı UTF-16 (çift ya da tek hizalı) veya ANSI olarak geçebilir — üçü de metne çevrilir
          $metin = [Text.Encoding]::Unicode.GetString($b) + "`n" +
                   $(if ($b.Length -gt 1) { [Text.Encoding]::Unicode.GetString($b, 1, $b.Length - 1) } else { '' }) + "`n" +
                   [Text.Encoding]::Default.GetString($b)
          $liste.Add([pscustomobject]@{ Profil = $k.Profil; Yol = $f; Metin = $metin })
        }
      } catch {}
      try {
        foreach ($alt in [IO.Directory]::EnumerateDirectories($d)) {
          if ($alt.Substring($k.Yol.Length) -match $atla) { continue }
          $oz = [IO.File]::GetAttributes($alt)
          if ($oz -band [IO.FileAttributes]::ReparsePoint) {
            # Junction/symlink izlenmez; OneDrive bulut klasörleri de reparse point ama LinkType boş — onlara inilir
            $lt = (Get-Item -LiteralPath $alt -Force -ErrorAction SilentlyContinue).LinkType
            if ($lt) { continue }
          }
          $yigin.Push($alt)
        }
      } catch {}
    }
  }
  Write-Progress -Activity 'Kisayollar okunuyor' -Completed
  return $liste
}

# ── 2) Bir exe için ara ────────────────────────────────────────────────
function Ara([string]$hedef, $liste) {
  # Hedefin karşılaştırılacak biçimleri: uzun yol + (varsa) 8.3 kısa yol
  $bicimler = @($hedef)
  if (Test-Path -LiteralPath $hedef) {
    try { $bicimler += $fso.GetFile($hedef).ShortPath } catch {}
  }
  $bicimler = @($bicimler | Where-Object { $_ } | Select-Object -Unique)
  $adlar    = @($bicimler | ForEach-Object { [IO.Path]::GetFileName($_) } | Where-Object { $_ } | Select-Object -Unique)

  $eslesiyor = {
    param([string]$m)
    if (-not $m) { return $false }
    $m = [Environment]::ExpandEnvironmentVariables($m)
    foreach ($b in $bicimler) { if ($m.IndexOf($b, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true } }
    return $false
  }

  $sonuc = @()
  $cozulen = 0
  foreach ($l in $liste) {
    # Ön eleme: exe adı ham baytlarda yoksa bu kısayol bu exe'yi çağıramaz
    $aday = $false
    foreach ($a in $adlar) { if ($l.Metin.IndexOf($a, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $aday = $true; break } }
    if (-not $aday) { continue }

    $cozulen++
    try { $s = $sh.CreateShortcut($l.Yol) } catch { continue }
    $nasil = $null
    if     (& $eslesiyor $s.TargetPath)       { $nasil = 'Hedef' }
    elseif (& $eslesiyor $s.Arguments)        { $nasil = 'Parametre' }
    elseif (& $eslesiyor $s.WorkingDirectory) { $nasil = 'Calisma klasoru' }

    if ($nasil) {
      $sonuc += [pscustomobject]@{
        Profil  = $l.Profil
        Kisayol = $l.Yol
        Nasil   = $nasil
        Tarih   = ([IO.File]::GetLastWriteTime($l.Yol)).ToString('yyyy-MM-dd HH:mm')
      }
    }
  }

  ''
  'Aranan : ' + $hedef
  'Exe var: ' + $(if (Test-Path -LiteralPath $hedef) { 'EVET' } else { 'HAYIR - bu bilgisayarda bu yolda exe yok' })
  'Taranan kisayol: ' + $liste.Count + '  (adi gecen, ayrintili bakilan: ' + $cozulen + ')'
  ''
  if ($sonuc.Count -eq 0) {
    'SONUC: Bu exe''nin kisayolu hicbir profilde bulunamadi.'
  } else {
    'SONUC: ' + $sonuc.Count + ' kisayol, ' + @($sonuc.Profil | Select-Object -Unique).Count + ' profilde'
    $sonuc | Sort-Object Profil | Format-Table -AutoSize | Out-String -Width 400
  }
}

# ── 3) Çalıştır ────────────────────────────────────────────────────────
$sure = [Diagnostics.Stopwatch]::StartNew()
$liste = Kisayollari-Topla
'Kisayollar okundu: ' + $liste.Count + ' dosya, ' + [math]::Round($sure.Elapsed.TotalSeconds, 1) + ' sn'

if ($Hedef) {
  Ara $Hedef $liste
  return
}

# Etkileşimli: tarama bir kez yapıldı, her soru bellekteki listeden cevaplanır
while ($true) {
  ''
  'Aranacak exe''nin tam yolu (ornek: C:\Pusula\FIRMA\KLASOR\PROGRAM.exe) - bos birakip Enter: cikis'
  $h = (Read-Host 'Exe yolu').Trim().Trim('"')
  if (-not $h) { break }
  Ara $h $liste | Out-Host
  ''
  'Not: kisayol listesi betik acilirken okundu; sonradan eklenen kisayol icin betigi yeniden acin.'
}
