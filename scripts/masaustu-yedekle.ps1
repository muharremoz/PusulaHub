<#
  Kullanıcı masaüstlerini yedekler — her profilin Desktop klasörü ayrı bir zip olur:
      C:\KullaniciYedekleri\<kullanıcı>.zip   (+ masaustu-yedek-<tarih>.log, ozet.csv)

  Eski sunucu taşımasında kullanılır. Yönetici olarak çalıştırın (diğer kullanıcıların
  profillerini okuyabilmek için). PowerShell 3+ ve .NET 4.5 yeterli (Compress-Archive gerekmez).

  Ekranda: disk alanı kontrolü, profil başına ilerleme çubuğu, sonda özet tablo.
  Kilitli / okunamayan / çok uzun yollu dosyalar ATLANIR, günlüğe yazılır; iş durmaz.
  Kaynak dosyalara dokunulmaz (yalnız okunur).

  Örnekler:
    .\masaustu-yedekle.ps1                              # tüm profiller
    .\masaustu-yedekle.ps1 -Kullanici ahmet1,mehmet2   # yalnız bunlar
    .\masaustu-yedekle.ps1 -Haric administrator        # bunlar hariç
    .\masaustu-yedekle.ps1 -Uzerine                    # var olan zip'leri yeniden oluştur
    .\masaustu-yedekle.ps1 -ProfilKoku D:\Users        # profiller başka sürücüdeyse
#>
param(
    [string]  $Hedef     = 'C:\KullaniciYedekleri',
    [string]  $ProfilKoku = 'C:\Users',
    [string[]]$Kullanici = @(),
    [string[]]$Haric     = @(),
    [switch]  $Uzerine
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Boyut([double]$b) {
    if ($b -ge 1GB) { return ('{0:N2} GB' -f ($b / 1GB)) }
    if ($b -ge 1MB) { return ('{0:N1} MB' -f ($b / 1MB)) }
    if ($b -ge 1KB) { return ('{0:N0} KB' -f ($b / 1KB)) }
    return ('{0} B' -f $b)
}

# --- yönetici mi
$kimlik = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
# Yalnız gerçek profil kökünde zorunlu: yöneticisiz diğer profiller okunamaz ve boş görünür
if ($ProfilKoku -eq 'C:\Users' -and -not $kimlik.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Bu betik YONETICI olarak calistirilmali (sag tik > Yonetici olarak calistir).' -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Path $Hedef -Force | Out-Null
$baslangic = Get-Date
$log = Join-Path $Hedef ('masaustu-yedek-' + $baslangic.ToString('yyyyMMdd-HHmm') + '.log')
function Log([string]$m) { Add-Content -Path $log -Value ((Get-Date).ToString('HH:mm:ss') + '  ' + $m) -Encoding UTF8 }

# --- profiller (sistem profilleri hariç)
$sistem = @('Default', 'Default User', 'Public', 'All Users', 'defaultuser0')
$profiller = Get-ChildItem -LiteralPath $ProfilKoku -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $sistem -notcontains $_.Name -and -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } |
    Where-Object { $Kullanici.Count -eq 0 -or $Kullanici -contains $_.Name } |
    Where-Object { $Haric -notcontains $_.Name } |
    Sort-Object Name

Write-Host ''
Write-Host '=== Masaustu yedegi ===' -ForegroundColor Cyan
Write-Host ('Hedef  : ' + $Hedef)
Write-Host ('Gunluk : ' + $log)
Write-Host ('Profil : ' + @($profiller).Count)
Write-Host ''

# --- ön tarama: boyut + disk alanı
Write-Host 'Masaustleri taraniyor...' -ForegroundColor Gray
$plan = @()
$i = 0
foreach ($p in $profiller) {
    $i++
    Write-Progress -Activity 'On tarama' -Status $p.Name -PercentComplete ([int](100 * $i / [Math]::Max(1, @($profiller).Count)))
    $masaustu = Join-Path $p.FullName 'Desktop'
    if (-not (Test-Path -LiteralPath $masaustu)) { continue }
    $dosyalar = @(Get-ChildItem -LiteralPath $masaustu -Recurse -File -Force -ErrorAction SilentlyContinue)
    $toplam = ($dosyalar | Measure-Object Length -Sum).Sum
    if ($null -eq $toplam) { $toplam = 0 }
    $plan += [pscustomobject]@{ Ad = $p.Name; Yol = $masaustu; Dosyalar = $dosyalar; Boyut = [double]$toplam }
}
Write-Progress -Activity 'On tarama' -Completed

$gerekli = ($plan | Measure-Object Boyut -Sum).Sum
if ($null -eq $gerekli) { $gerekli = 0 }
$surucu = Get-PSDrive -Name ($Hedef.Substring(0, 1))
Write-Host ('Masaustu olan profil: ' + $plan.Count + '   toplam: ' + (Boyut $gerekli) + '   ' + $surucu.Name + ': bos alan: ' + (Boyut $surucu.Free))
if ($surucu.Free -lt $gerekli * 1.05) {
    Write-Host 'UYARI: Bos alan, sikistirilmamis toplamdan az. Zip genelde kucuk olur ama dolabilir.' -ForegroundColor Yellow
    $cevap = Read-Host 'Devam edilsin mi? (E/H)'
    if ($cevap -notmatch '^[eE]') { Write-Host 'Iptal edildi.'; exit 2 }
}
Write-Host ''
Log ('Basladi. Profil: ' + $plan.Count + ', toplam ' + (Boyut $gerekli))

# --- sıkıştırma
$ozet = @()
$sira = 0
foreach ($k in $plan) {
    $sira++
    $zip = Join-Path $Hedef ($k.Ad + '.zip')
    $etiket = '[' + $sira + '/' + $plan.Count + '] ' + $k.Ad

    if ((Test-Path -LiteralPath $zip) -and -not $Uzerine) {
        Write-Host ($etiket + '  zip zaten var, atlandi (-Uzerine ile yeniden olusturulur)') -ForegroundColor DarkGray
        $ozet += [pscustomobject]@{ Kullanici = $k.Ad; Durum = 'Atlandi (var)'; Dosya = $k.Dosyalar.Count; Kaynak = Boyut $k.Boyut; Zip = Boyut (Get-Item -LiteralPath $zip).Length; Atlanan = 0; Sure = '' }
        continue
    }
    if ($k.Dosyalar.Count -eq 0) {
        Write-Host ($etiket + '  masaustu bos') -ForegroundColor DarkGray
        $ozet += [pscustomobject]@{ Kullanici = $k.Ad; Durum = 'Bos'; Dosya = 0; Kaynak = '0 B'; Zip = ''; Atlanan = 0; Sure = '' }
        continue
    }

    Write-Host ($etiket + '  ' + $k.Dosyalar.Count + ' dosya, ' + (Boyut $k.Boyut)) -ForegroundColor White
    $t0 = Get-Date
    $gecici = $zip + '.yaziliyor'
    if (Test-Path -LiteralPath $gecici) { Remove-Item -LiteralPath $gecici -Force }
    $atlanan = 0
    $islenen = 0
    $islenenBayt = 0.0
    $kok = (Resolve-Path -LiteralPath $k.Yol).ProviderPath.TrimEnd('\') + '\'

    $akis = [IO.File]::Open($gecici, [IO.FileMode]::CreateNew)
    $arsiv = New-Object IO.Compression.ZipArchive($akis, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($d in $k.Dosyalar) {
            $islenen++
            if ($islenen % 25 -eq 0 -or $islenen -eq $k.Dosyalar.Count) {
                $yuzde = if ($k.Boyut -gt 0) { [int](100 * $islenenBayt / $k.Boyut) } else { [int](100 * $islenen / $k.Dosyalar.Count) }
                Write-Progress -Id 1 -Activity $etiket -Status ($islenen.ToString() + ' / ' + $k.Dosyalar.Count + ' dosya  ' + (Boyut $islenenBayt) + ' / ' + (Boyut $k.Boyut)) -PercentComplete ([Math]::Min(100, $yuzde)) -CurrentOperation $d.Name
            }
            $goreli = $d.FullName.Substring($kok.Length)
            try {
                # Önce kaynak açılır: kilitliyse zip'e boş (0 bayt) kayıt düşmesin
                $kaynak = [IO.File]::Open($d.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
                try {
                    $giris = $arsiv.CreateEntry($goreli.Replace('\', '/'), [IO.Compression.CompressionLevel]::Optimal)
                    $giris.LastWriteTime = $d.LastWriteTime
                    $yaz = $giris.Open()
                    try { $kaynak.CopyTo($yaz) } finally { $yaz.Dispose() }
                } finally { $kaynak.Dispose() }
            } catch {
                $atlanan++
                Log ('ATLANDI ' + $k.Ad + ' : ' + $goreli + ' -> ' + $_.Exception.Message)
            }
            $islenenBayt += $d.Length
        }
    } finally {
        $arsiv.Dispose()
        $akis.Dispose()
        Write-Progress -Id 1 -Activity $etiket -Completed
    }

    if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
    Move-Item -LiteralPath $gecici -Destination $zip
    $zipBoyut = (Get-Item -LiteralPath $zip).Length
    $sure = (Get-Date) - $t0
    $renk = if ($atlanan -gt 0) { 'Yellow' } else { 'Green' }
    Write-Host ('      -> ' + (Boyut $zipBoyut) + ', ' + ('{0:mm\:ss}' -f $sure) + $(if ($atlanan -gt 0) { ', ' + $atlanan + ' dosya ATLANDI (gunluge bakin)' } else { '' })) -ForegroundColor $renk
    Log ($k.Ad + ': ' + $k.Dosyalar.Count + ' dosya, ' + (Boyut $k.Boyut) + ' -> ' + (Boyut $zipBoyut) + ', atlanan ' + $atlanan)
    $ozet += [pscustomobject]@{ Kullanici = $k.Ad; Durum = $(if ($atlanan -gt 0) { 'Eksik' } else { 'Tamam' }); Dosya = $k.Dosyalar.Count; Kaynak = Boyut $k.Boyut; Zip = Boyut $zipBoyut; Atlanan = $atlanan; Sure = ('{0:mm\:ss}' -f $sure) }
}

# --- özet
$ozetDosya = Join-Path $Hedef ('ozet-' + $baslangic.ToString('yyyyMMdd-HHmm') + '.csv')
$ozet | Export-Csv -Path $ozetDosya -NoTypeInformation -Encoding UTF8 -Delimiter ';'
Write-Host ''
Write-Host '=== Ozet ===' -ForegroundColor Cyan
$ozet | Format-Table -AutoSize | Out-String -Width 200 | Write-Host
$gecen = (Get-Date) - $baslangic
Write-Host ('Toplam sure: ' + ('{0:hh\:mm\:ss}' -f $gecen) + '   Tamam: ' + @($ozet | Where-Object Durum -eq 'Tamam').Count + '   Eksik: ' + @($ozet | Where-Object Durum -eq 'Eksik').Count)
Write-Host ('Ozet  : ' + $ozetDosya)
Write-Host ('Gunluk: ' + $log)
Log ('Bitti. Sure ' + ('{0:hh\:mm\:ss}' -f $gecen))
