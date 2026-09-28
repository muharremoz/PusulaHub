# Kullanici masaustlerini tek tek ZIP'leyip bir klasore toplar.
#
# Her kullanici icin  <Hedef>\<kullanici>.zip  olusur. Masaustundeki hicbir
# sey silinmez / tasinmaz - yalniz OKUNUR.
#
# Calistirma:  MASAUSTU-TOPLA.bat  (cift tiklama, yonetici olarak ister)
# veya:        powershell -NoProfile -ExecutionPolicy Bypass -File masaustu-topla.ps1 [-Hedef D:\Yedek] [-Kullanici ali,veli]
#
# Neden Compress-Archive degil: acik (kilitli) tek bir dosyada tum isi
# durduruyor ve PowerShell 5.1'de 2 GB dosya siniri var. Burada .NET
# ZipArchive ile dosya dosya yaziliyor: dosya paylasimli modda okunur
# (kullanici oturumdayken acik Excel bile cogu zaman alinir), okunamayan
# dosya atlanip gunluge yazilir, is devam eder.
#
# Kisayol klasorleri (junction / sembolik baglanti) TAKIP EDILMEZ - yoksa
# ayni veri iki kez alinir ya da sonsuz donguye girilir.
#
# SAF ASCII. Turkce karakter kullanilmiyor: dosya BOM'suz gittiginde
# PowerShell 5.1 onu ANSI okuyup ayristirmayi bozuyor.

param(
    # ZIP'lerin toplanacagi klasor. Bos: D:\MasaustuYedek\<tarih-saat> (D: yoksa C:)
    [string]$Hedef = "",
    # Yalniz bu kullanicilar (klasor adi). Bos: hepsi.
    [string[]]$Kullanici = @(),
    # Profil kok klasoru
    [string]$ProfilKok = "C:\Users"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# ---------------------------------------------------------------- hazirlik

$yonetici = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $yonetici) {
    Write-Host "Bu betik YONETICI olarak calistirilmali (baska kullanicilarin masaustlerini okuyabilmek icin)." -ForegroundColor Red
    exit 1
}

if (-not $Hedef) {
    $kok = if (Test-Path "D:\") { "D:\MasaustuYedek" } else { "C:\MasaustuYedek" }
    $Hedef = Join-Path $kok (Get-Date -Format "yyyyMMdd-HHmm")
}
New-Item -ItemType Directory -Force -Path $Hedef | Out-Null
$Hedef = (Resolve-Path $Hedef).Path
$gunluk = Join-Path $Hedef "_gunluk.txt"
"Masaustu toplama - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $env:COMPUTERNAME" | Out-File $gunluk -Encoding UTF8

# Sistem profilleri - masaustleri alinmaz
$HARIC = @("Public", "Default", "Default User", "All Users", "defaultuser0", "WDAGUtilityAccount")

function Boyut([double]$b) {
    if ($b -ge 1GB) { return "{0:N2} GB" -f ($b / 1GB) }
    if ($b -ge 1MB) { return "{0:N1} MB" -f ($b / 1MB) }
    if ($b -ge 1KB) { return "{0:N0} KB" -f ($b / 1KB) }
    return "$b B"
}

# Klasoru elle dolas: EnumerateFiles erisim hatasinda tum listeyi keser,
# burada her klasor ayri denenir; junction/sembolik baglantilara girilmez.
function Dosyalar([string]$kokKlasor) {
    $liste = New-Object System.Collections.Generic.List[System.IO.FileInfo]
    $hatalar = New-Object System.Collections.Generic.List[string]
    $yigin = New-Object System.Collections.Generic.Stack[string]
    $yigin.Push($kokKlasor)
    while ($yigin.Count -gt 0) {
        $k = $yigin.Pop()
        try {
            $di = New-Object System.IO.DirectoryInfo($k)
            foreach ($f in $di.GetFiles()) { $liste.Add($f) }
            foreach ($d in $di.GetDirectories()) {
                if (($d.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) { $yigin.Push($d.FullName) }
            }
        } catch {
            $hatalar.Add("KLASOR OKUNAMADI: $k - $($_.Exception.Message)")
        }
    }
    return @{ Dosyalar = $liste; Hatalar = $hatalar }
}

# ---------------------------------------------------------------- tarama

Write-Host ""
Write-Host "Masaustleri taraniyor ($ProfilKok) ..." -ForegroundColor Cyan

$profiller = Get-ChildItem $ProfilKok -Directory -Force |
    Where-Object { $HARIC -notcontains $_.Name -and ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 }
if ($Kullanici.Count -gt 0) { $profiller = $profiller | Where-Object { $Kullanici -contains $_.Name } }

$isler = @()
$i = 0
foreach ($p in $profiller) {
    $i++
    Write-Progress -Id 1 -Activity "Masaustleri taraniyor" -Status $p.Name -PercentComplete ([int](100 * $i / [Math]::Max(1, @($profiller).Count)))
    $masaustu = Join-Path $p.FullName "Desktop"
    if (-not (Test-Path -LiteralPath $masaustu)) { continue }
    $t = Dosyalar $masaustu
    $bayt = 0L; foreach ($f in $t.Dosyalar) { $bayt += $f.Length }
    $isler += [pscustomobject]@{ Ad = $p.Name; Yol = $masaustu; Dosyalar = $t.Dosyalar; Bayt = $bayt; TaramaHatasi = $t.Hatalar }
}
Write-Progress -Id 1 -Activity "Masaustleri taraniyor" -Completed

$toplamBayt = 0L; $toplamDosya = 0
foreach ($is in $isler) { $toplamBayt += $is.Bayt; $toplamDosya += $is.Dosyalar.Count }

Write-Host ""
Write-Host ("{0} kullanici, {1:N0} dosya, {2}" -f $isler.Count, $toplamDosya, (Boyut $toplamBayt)) -ForegroundColor Cyan
Write-Host "Hedef: $Hedef"

# Yer kontrolu - sikistirilmis boyut bilinmiyor, en kotu durum = ham boyut
$surucu = New-Object System.IO.DriveInfo([IO.Path]::GetPathRoot($Hedef))
if ($surucu.AvailableFreeSpace -lt $toplamBayt) {
    Write-Host ("UYARI: Hedef diskte {0} bos, masaustleri toplam {1}. Sikistirma yeterince kucultmezse yer yetmeyebilir." -f (Boyut $surucu.AvailableFreeSpace), (Boyut $toplamBayt)) -ForegroundColor Yellow
    $c = Read-Host "Devam edilsin mi? (E/H)"
    if ($c -notmatch '^[eEyY]') { exit 1 }
}
if ($isler.Count -eq 0) { Write-Host "Alinacak masaustu yok."; exit 0 }
Write-Host ""

# ---------------------------------------------------------------- sikistirma

$baslangic = Get-Date
$islenenBayt = 0L
$sonuc = @()
$no = 0

foreach ($is in $isler) {
    $no++
    $zipYol = Join-Path $Hedef (($is.Ad -replace '[\\/:*?"<>|]', '_') + ".zip")
    $alinan = 0; $atlanan = 0; $kullaniciBayt = 0L
    foreach ($h in $is.TaramaHatasi) { "[$($is.Ad)] $h" | Out-File $gunluk -Append -Encoding UTF8; $atlanan++ }

    if ($is.Dosyalar.Count -eq 0) {
        Write-Host ("[{0}/{1}] {2,-24} bos masaustu - atlandi" -f $no, $isler.Count, $is.Ad) -ForegroundColor DarkGray
        $sonuc += [pscustomobject]@{ Kullanici = $is.Ad; Dosya = 0; Atlanan = $atlanan; Ham = "0 B"; Zip = "-" }
        continue
    }

    if (Test-Path -LiteralPath $zipYol) { Remove-Item -LiteralPath $zipYol -Force }
    $zip = [System.IO.Compression.ZipFile]::Open($zipYol, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        $j = 0
        foreach ($f in $is.Dosyalar) {
            $j++
            $gecen = ((Get-Date) - $baslangic).TotalSeconds
            $yuzde = if ($toplamBayt -gt 0) { [Math]::Min(100, [int](100 * $islenenBayt / $toplamBayt)) } else { 100 }
            $kalan = if ($islenenBayt -gt 0 -and $gecen -gt 3) { [int]($gecen * ($toplamBayt - $islenenBayt) / $islenenBayt) } else { -1 }
            Write-Progress -Id 1 -Activity ("Toplam: {0} / {1} kullanici  ({2} / {3})" -f $no, $isler.Count, (Boyut $islenenBayt), (Boyut $toplamBayt)) `
                -Status ("%{0}" -f $yuzde) -PercentComplete $yuzde -SecondsRemaining $kalan
            Write-Progress -Id 2 -ParentId 1 -Activity ("{0}: {1:N0} / {2:N0} dosya" -f $is.Ad, $j, $is.Dosyalar.Count) `
                -Status $f.Name -PercentComplete ([int](100 * $j / $is.Dosyalar.Count))

            $goreli = $f.FullName.Substring($is.Yol.Length).TrimStart('\').Replace('\', '/')
            try {
                $okuma = New-Object System.IO.FileStream($f.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read,
                    ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
                try {
                    $giris = $zip.CreateEntry($goreli, [System.IO.Compression.CompressionLevel]::Optimal)
                    try { $giris.LastWriteTime = $f.LastWriteTime } catch { }
                    $yaz = $giris.Open()
                    try { $okuma.CopyTo($yaz) } finally { $yaz.Dispose() }
                } finally { $okuma.Dispose() }
                $alinan++
            } catch {
                $atlanan++
                "[$($is.Ad)] ATLANDI: $($f.FullName) - $($_.Exception.Message)" | Out-File $gunluk -Append -Encoding UTF8
            }
            $islenenBayt += $f.Length
            $kullaniciBayt += $f.Length
        }
    } finally {
        $zip.Dispose()
    }
    Write-Progress -Id 2 -Activity $is.Ad -Completed

    $zipBoyut = (Get-Item -LiteralPath $zipYol).Length
    $renk = if ($atlanan -gt 0) { "Yellow" } else { "Green" }
    Write-Host ("[{0}/{1}] {2,-24} {3,7:N0} dosya  {4,10} -> {5,10}{6}" -f $no, $isler.Count, $is.Ad, $alinan,
        (Boyut $kullaniciBayt), (Boyut $zipBoyut), $(if ($atlanan) { "  ($atlanan atlandi, gunluge bakin)" } else { "" })) -ForegroundColor $renk
    "[$($is.Ad)] $alinan dosya alindi, $atlanan atlandi, $(Boyut $kullaniciBayt) -> $(Boyut $zipBoyut)" | Out-File $gunluk -Append -Encoding UTF8
    $sonuc += [pscustomobject]@{ Kullanici = $is.Ad; Dosya = $alinan; Atlanan = $atlanan; Ham = (Boyut $kullaniciBayt); Zip = (Boyut $zipBoyut) }
}
Write-Progress -Id 1 -Activity "Tamam" -Completed

# ---------------------------------------------------------------- ozet

$sure = (Get-Date) - $baslangic
$zipToplam = 0L; Get-ChildItem $Hedef -Filter *.zip | ForEach-Object { $zipToplam += $_.Length }
$atlananToplam = 0; foreach ($s in $sonuc) { $atlananToplam += $s.Atlanan }

Write-Host ""
$sonuc | Format-Table -AutoSize | Out-String | Write-Host
Write-Host ("Bitti: {0} kullanici, {1} -> {2}, sure {3:hh\:mm\:ss}" -f $isler.Count, (Boyut $toplamBayt), (Boyut $zipToplam), $sure) -ForegroundColor Green
if ($atlananToplam -gt 0) {
    Write-Host "$atlananToplam dosya/klasor alinamadi - ayrinti: $gunluk" -ForegroundColor Yellow
}
Write-Host "Klasor: $Hedef"
