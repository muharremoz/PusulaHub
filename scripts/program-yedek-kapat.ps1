# Toptan/Üretim/StokCari parametresine [AKSAM YEDEKLEME YAPMA] 1, Perakende exe yanına boş yedeksorma.txt
# Atlananlar: C:\Demo, Aktarim klasörleri, *copy* klasörleri. Değişen dosyanın yanına .yd-yedek-20261030.
$kokler = @('C:\MUSTERI', 'C:\Pusula') | Where-Object { Test-Path $_ }
$paramAd = @('tptparametre.txt', 'urtparametre.txt', 'stokcariparametre.txt')
$enc = [Text.Encoding]::GetEncoding(28591)
$satir = '[AKSAM YEDEKLEME YAPMA] 1'
$say = @{ eklendi = 0; duzeltildi = 0; zatenVar = 0; yedekSorma = 0; yedekSormaVar = 0; atlandi = 0; hata = 0 }
$hatalar = @()
function Atla($yol) { $k = $yol.ToLowerInvariant(); return ($k.Contains('\aktarim\') -or $k.Contains('copy') -or $k.Contains('.yd-yedek') -or $k.Contains('.oo-yedek') -or $k.Contains('.dk-yedek')) }
foreach ($k in $kokler) {
  Get-ChildItem -LiteralPath $k -Recurse -File -Depth 4 -ErrorAction SilentlyContinue | ForEach-Object {
    $ad = $_.Name.ToLowerInvariant()
    if ($paramAd -contains $ad) {
      if (Atla $_.FullName) { $say.atlandi++; return }
      try {
        # ReadAllText BOM'u algılayıp atar → bayt-bayt oku
        $metin = $enc.GetString([IO.File]::ReadAllBytes($_.FullName))
        $nl = if ($metin.Contains("`r`n")) { "`r`n" } else { "`n" }
        $sonNl = $metin.EndsWith($nl)
        $satirlar = New-Object System.Collections.Generic.List[string]
        $satirlar.AddRange([string[]]($metin -split [regex]::Escape($nl)))
        if ($sonNl) { $satirlar.RemoveAt($satirlar.Count - 1) }
        $idx = -1
        for ($i = 0; $i -lt $satirlar.Count; $i++) { if ($satirlar[$i].TrimStart().ToUpperInvariant().StartsWith('[AKSAM YEDEKLEME YAPMA]')) { $idx = $i; break } }
        if ($idx -ge 0 -and $satirlar[$idx].Trim() -eq $satir) { $say.zatenVar++; return }
        Copy-Item -LiteralPath $_.FullName -Destination ($_.FullName + '.yd-yedek-20261030') -Force
        if ($idx -ge 0) { $satirlar[$idx] = $satir; $say.duzeltildi++ } else { $satirlar.Add($satir); $say.eklendi++ }
        [IO.File]::WriteAllBytes($_.FullName, $enc.GetBytes(($satirlar -join $nl) + $nl))
      } catch { $say.hata++; $hatalar += $_.FullName + ': ' + $_.Exception.Message }
    }
    elseif ($ad -eq 'aurum_sql.exe') {
      if (Atla $_.FullName) { $say.atlandi++; return }
      $hedef = Join-Path $_.DirectoryName 'yedeksorma.txt'
      if (Test-Path -LiteralPath $hedef) { $say.yedekSormaVar++; return }
      try { [IO.File]::WriteAllBytes($hedef, [byte[]]@()); $say.yedekSorma++ } catch { $say.hata++; $hatalar += $hedef + ': ' + $_.Exception.Message }
    }
  }
}
'param eklendi=' + $say.eklendi + ' duzeltildi=' + $say.duzeltildi + ' zaten=' + $say.zatenVar + ' | yedeksorma olusturuldu=' + $say.yedekSorma + ' zaten=' + $say.yedekSormaVar + ' | atlanan=' + $say.atlandi + ' hata=' + $say.hata
$hatalar | Select-Object -First 10
