# Eski sunucularda C:\Pusula altındaki firma klasörlerini ve parametre dosyalarındaki data kodlarını listeler.
#
#   powershell -ExecutionPolicy Bypass -File eski-sunucu-firma-listesi.ps1
#   powershell -ExecutionPolicy Bypass -File eski-sunucu-firma-listesi.ps1 -Kok 'D:\Pusula' -Derinlik 4
#
# Her firma klasöründe (C:\Pusula\<firma adı>) alt klasörler dahil .txt dosyaları taranır. Data kodu iki biçimde olur:
#   [DATA KODU] 4515                       (çoğu program)
#   <DATAKODU> 4515 </DATAKODU>            (Perakende — satırlara bölünmüş olabilir)
# Yalnız OKUR, hiçbir dosyayı değiştirmez.
#
# Çıktı: ekrana tablo + masaüstüne CSV (Excel'de açılır, ; ayraçlı, UTF-8 BOM):
#   Sunucu;Firma klasoru;Data kodlari;Parametre dosyasi;Program klasoru;Son degisiklik
# Data kodu bulunamayan firma klasörü de "—" ile listelenir.
# PowerShell 2.0 (Windows Server 2008) ile de çalışır.

param(
    [string]$Kok = 'C:\Pusula',
    [int]$Derinlik = 3,
    [string]$Cikti = ''
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Kok)) { throw "Klasör yok: $Kok" }
$sunucu = $env:COMPUTERNAME
if (-not $Cikti) {
    $masaustu = [Environment]::GetFolderPath('Desktop')
    $Cikti = Join-Path $masaustu ("pusula-firmalar-" + $sunucu + "-" + (Get-Date -Format 'yyyyMMdd-HHmm') + ".csv")
}

function Data-Kodlari([string]$metin) {
    $kodlar = New-Object System.Collections.ArrayList
    foreach ($m in [regex]::Matches($metin, '(?im)^\s*\[DATA KODU\]\s*([^\r\n]*)')) {
        $v = $m.Groups[1].Value.Trim()
        if ($v) { [void]$kodlar.Add($v) }
    }
    foreach ($m in [regex]::Matches($metin, '(?is)<DATAKODU>\s*(.*?)\s*</DATAKODU>')) {
        $v = ($m.Groups[1].Value -replace '\s+', ' ').Trim()
        if ($v) { [void]$kodlar.Add($v) }
    }
    return $kodlar
}

function Dosya-Oku([string]$yol) {
    # Eski dosyalar ANSI (Türkçe 1254) ya da UTF-8 olabilir; BOM yoksa önce UTF-8 dene, bozuksa 1254
    $bayt = [IO.File]::ReadAllBytes($yol)
    if ($bayt.Length -ge 3 -and $bayt[0] -eq 0xEF -and $bayt[1] -eq 0xBB -and $bayt[2] -eq 0xBF) { return [Text.Encoding]::UTF8.GetString($bayt, 3, $bayt.Length - 3) }
    if ($bayt.Length -ge 2 -and $bayt[0] -eq 0xFF -and $bayt[1] -eq 0xFE) { return [Text.Encoding]::Unicode.GetString($bayt, 2, $bayt.Length - 2) }
    $utf8 = New-Object Text.UTF8Encoding($false, $true)
    try { return $utf8.GetString($bayt) } catch { return [Text.Encoding]::GetEncoding(1254).GetString($bayt) }
}

# PowerShell 2.0'da Get-ChildItem -Depth yok: alt klasörler elle, sınırlı derinlikte gezilir
function Txt-Dosyalari([string]$klasor, [int]$kalan) {
    $sonuc = @()
    $sonuc += @(Get-ChildItem -LiteralPath $klasor -Filter *.txt -ErrorAction SilentlyContinue |
        Where-Object { -not $_.PSIsContainer -and $_.Length -lt 1MB })
    if ($kalan -gt 0) {
        foreach ($alt in @(Get-ChildItem -LiteralPath $klasor -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer })) {
            $sonuc += @(Txt-Dosyalari $alt.FullName ($kalan - 1))
        }
    }
    return $sonuc
}

function Satir($firma, $kodlar, $dosya, $program, $tarih) {
    $o = New-Object PSObject
    $o | Add-Member NoteProperty 'Sunucu' $sunucu
    $o | Add-Member NoteProperty 'Firma klasoru' $firma
    $o | Add-Member NoteProperty 'Data kodlari' $kodlar
    $o | Add-Member NoteProperty 'Parametre dosyasi' $dosya
    $o | Add-Member NoteProperty 'Program klasoru' $program
    $o | Add-Member NoteProperty 'Son degisiklik' $tarih
    return $o
}

$satirlar = New-Object System.Collections.ArrayList
$firmaKlasorleri = @(Get-ChildItem -LiteralPath $Kok -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer } | Sort-Object Name)

foreach ($firma in $firmaKlasorleri) {
    $bulundu = $false
    $dosyalar = @(Txt-Dosyalari $firma.FullName $Derinlik)
    foreach ($d in $dosyalar) {
        try { $metin = Dosya-Oku $d.FullName } catch { continue }
        if ($metin -notmatch '(?i)\[DATA KODU\]|<DATAKODU>') { continue }
        $kodlar = Data-Kodlari $metin
        if ($kodlar.Count -eq 0) { continue }
        $bulundu = $true
        $programKlasoru = Split-Path -Parent $d.FullName
        [void]$satirlar.Add((Satir $firma.Name (($kodlar | Select-Object -Unique) -join ', ') $d.Name ($programKlasoru.Substring($firma.FullName.Length).TrimStart('\')) $d.LastWriteTime.ToString('yyyy-MM-dd')))
    }
    if (-not $bulundu) {
        [void]$satirlar.Add((Satir $firma.Name '—' '' '' $firma.LastWriteTime.ToString('yyyy-MM-dd')))
    }
}

$satirlar | Format-Table -AutoSize | Out-String -Width 300 | Write-Host
$satirlar | Export-Csv -LiteralPath $Cikti -NoTypeInformation -Delimiter ';' -Encoding UTF8

$firmaSayisi = $firmaKlasorleri.Count
$kodsuz = @($satirlar | Where-Object { $_.'Data kodlari' -eq '—' }).Count
Write-Host ("{0} firma klasoru, {1} parametre dosyasi, {2} klasorde data kodu bulunamadi." -f $firmaSayisi, ($satirlar.Count - $kodsuz), $kodsuz) -ForegroundColor Green
Write-Host "CSV: $Cikti" -ForegroundColor Green
