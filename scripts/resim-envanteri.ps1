<#
    Musteri resim klasoru envanteri  ->  HTML rapor

    Amac: C:\Pusula\MUSTERI\<firmaKodu>\RESIM altindaki gorsellerin nerede
    sistigini gormek. Kucultme yapmadan ONCE nereye dokunulacagina karar vermek
    icin; bu betik HICBIR DOSYAYI DEGISTIRMEZ, yalnizca okur ve raporlar.

    Neden sadece dosya boyutu yetmez: asil israf COZUNURLUKTE. 4000x3000 bir
    fotograf ekranda 200 pikselde gosteriliyorsa dosyayi sikistirmak degil
    KUCULTMEK gerekir. Bu yuzden rapor boyutun yaninda genislik/yukseklik de
    verir ve "gereginden buyuk" olanlari ayrica sayar.

    Kullanim:
        powershell -ExecutionPolicy Bypass -File resim-envanteri.ps1
        powershell -ExecutionPolicy Bypass -File resim-envanteri.ps1 -Kok 'D:\Pusula\MUSTERI' -Cikti 'C:\rapor.html'

    Notlar:
      - Olculer ondalik degil ikilik (1 MB = 1024 KB).
      - Boyutlar yalnizca dosya basligindan okunur (goruntu belleğe
        acilmaz), boylece on binlerce dosyada da makul surede biter.
#>

param(
    [string] $Kok        = 'C:\Pusula\MUSTERI',
    [string] $Cikti      = "$env:USERPROFILE\Desktop\resim-envanteri.html",
    # Bu boyutun ustundeki dosyalar "buyuk" sayilir (KB)
    [int]    $BuyukKB    = 1024,
    # Bu kenar uzunlugunun ustu "gereginden buyuk cozunurluk" sayilir (piksel)
    [int]    $BuyukPiksel = 1600,
    # Kucultme sonrasi ortalama hedef boyut (KB) - tasarruf TAHMINI icin
    [int]    $HedefKB    = 150
)

$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing | Out-Null

$UZANTILAR = @('.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tif', '.tiff', '.webp')

if (-not (Test-Path -LiteralPath $Kok)) {
    Write-Host "HATA: kok klasor bulunamadi -> $Kok" -ForegroundColor Red
    exit 1
}

Write-Host "Taraniyor: $Kok" -ForegroundColor Cyan

<# Dosya basligindan genislik/yukseklik. validateImageData=$false sayesinde
   goruntunun tamami cozulmez; sadece basligi okunur. Bozuk/desteklenmeyen
   dosyada sessizce 0 doner - rapor yine de dosyayi boyutuyla gosterir. #>
function Get-Olcu {
    param([string] $Yol)
    $fs = $null; $img = $null
    try {
        $fs  = [System.IO.File]::Open($Yol, 'Open', 'Read', 'Read')
        $img = [System.Drawing.Image]::FromStream($fs, $false, $false)
        return @{ G = $img.Width; Y = $img.Height }
    } catch {
        return @{ G = 0; Y = 0 }
    } finally {
        if ($img) { $img.Dispose() }
        if ($fs)  { $fs.Dispose() }
    }
}

$firmalar = @()
$enBuyukler = New-Object System.Collections.ArrayList

$klasorler = Get-ChildItem -LiteralPath $Kok -Directory -ErrorAction SilentlyContinue
$toplamKlasor = @($klasorler).Count
$sayac = 0

foreach ($f in $klasorler) {
    $sayac++
    Write-Progress -Activity 'Resim klasorleri taraniyor' -Status "$($f.Name)  ($sayac/$toplamKlasor)" `
                   -PercentComplete (100 * $sayac / [Math]::Max(1, $toplamKlasor))

    $resimYolu = Join-Path $f.FullName 'RESIM'
    if (-not (Test-Path -LiteralPath $resimYolu)) { continue }

    $dosyalar = Get-ChildItem -LiteralPath $resimYolu -File -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $UZANTILAR -contains $_.Extension.ToLower() }

    if (-not $dosyalar) { continue }

    # [long]: gercek veride tek firma 3+ GB tutabiliyor, Int32 tasiyor.
    $toplamBayt = [long]0; $buyukAdet = 0; $buyukBayt = [long]0; $cozunurlukAdet = 0
    $enBuyukAd = ''; $enBuyukBayt = [long]0

    foreach ($d in $dosyalar) {
        $toplamBayt += $d.Length
        if ($d.Length -gt $enBuyukBayt) { $enBuyukBayt = $d.Length; $enBuyukAd = $d.Name }

        if ($d.Length -gt ($BuyukKB * 1KB)) {
            $buyukAdet++
            $buyukBayt += $d.Length

            # Olcuyu YALNIZCA buyuk dosyalar icin oku: kazanc oradan gelecek,
            # kucuk dosyalari da olcmek tarama suresini bosuna katliyor.
            $olcu = Get-Olcu -Yol $d.FullName
            if ($olcu.G -gt $BuyukPiksel -or $olcu.Y -gt $BuyukPiksel) { $cozunurlukAdet++ }

            [void] $enBuyukler.Add([pscustomobject]@{
                Firma  = $f.Name
                Dosya  = $d.Name
                MB     = [Math]::Round($d.Length / 1MB, 2)
                Olcu   = if ($olcu.G -gt 0) { "$($olcu.G)x$($olcu.Y)" } else { '-' }
                Yol    = $d.FullName
            })
        }
    }

    # Tasarruf TAHMINI: yalnizca buyuk dosyalarin hedef boyuta inecegi varsayimi.
    # Sabit 0 yazilirsa PowerShell Int32 asiri yuklemesini secip tasiyor.
    $tahminiKazancBayt = [Math]::Max([long]0, $buyukBayt - ([long]$buyukAdet * $HedefKB * 1KB))

    $firmalar += [pscustomobject]@{
        Firma           = $f.Name
        Adet            = $dosyalar.Count
        ToplamMB        = [Math]::Round($toplamBayt / 1MB, 1)
        OrtalamaKB      = if ($dosyalar.Count -gt 0) { [Math]::Round($toplamBayt / $dosyalar.Count / 1KB, 0) } else { 0 }
        BuyukAdet       = $buyukAdet
        BuyukMB         = [Math]::Round($buyukBayt / 1MB, 1)
        CozunurlukAdet  = $cozunurlukAdet
        EnBuyukDosya    = $enBuyukAd
        EnBuyukMB       = [Math]::Round($enBuyukBayt / 1MB, 2)
        KazancMB        = [Math]::Round($tahminiKazancBayt / 1MB, 1)
        _bayt           = $toplamBayt
    }
}
Write-Progress -Activity 'Resim klasorleri taraniyor' -Completed

if ($firmalar.Count -eq 0) {
    Write-Host "RESIM klasoru olan firma bulunamadi." -ForegroundColor Yellow
    exit 0
}

$firmalar   = $firmalar | Sort-Object -Property _bayt -Descending
$enBuyukler = $enBuyukler | Sort-Object -Property MB -Descending | Select-Object -First 100

$gToplamMB  = [Math]::Round(($firmalar | Measure-Object -Property ToplamMB -Sum).Sum, 1)
$gAdet      = ($firmalar | Measure-Object -Property Adet -Sum).Sum
$gBuyukAdet = ($firmalar | Measure-Object -Property BuyukAdet -Sum).Sum
$gBuyukMB   = [Math]::Round(($firmalar | Measure-Object -Property BuyukMB -Sum).Sum, 1)
$gKazancMB  = [Math]::Round(($firmalar | Measure-Object -Property KazancMB -Sum).Sum, 1)
$gCozunurluk= ($firmalar | Measure-Object -Property CozunurlukAdet -Sum).Sum

function E([string] $s) {
    if ($null -eq $s) { return '' }
    $s.Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;').Replace('"','&quot;')
}

$sb = New-Object System.Text.StringBuilder
[void]$sb.Append(@"
<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>Musteri Resim Envanteri</title>
<style>
 :root { --bg:#f7f7f8; --card:#fff; --bd:#e5e5e5; --mut:#6b7280; --uyari:#b45309; --kritik:#b91c1c; }
 * { box-sizing:border-box }
 body { margin:0; padding:24px; background:var(--bg); color:#171717;
        font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif }
 h1 { font-size:20px; margin:0 0 4px }
 .alt { color:var(--mut); font-size:12px; margin-bottom:20px }
 .kpi { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:24px }
 .kart { background:var(--card); border:1px solid var(--bd); border-radius:8px; padding:14px 16px }
 .kart .b { font-size:22px; font-weight:700; font-variant-numeric:tabular-nums }
 .kart .e { font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:var(--mut); margin-bottom:6px }
 .kart .n { font-size:11px; color:var(--mut); margin-top:4px }
 table { width:100%; border-collapse:collapse; background:var(--card);
         border:1px solid var(--bd); border-radius:8px; overflow:hidden; margin-bottom:28px }
 th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.06em;
      color:var(--mut); padding:8px 12px; background:#fafafa; border-bottom:1px solid var(--bd);
      cursor:pointer; user-select:none; white-space:nowrap }
 th:hover { color:#171717 }
 td { padding:7px 12px; border-bottom:1px solid #f0f0f0; white-space:nowrap }
 tr:last-child td { border-bottom:0 }
 tr:nth-child(even) td { background:#fcfcfc }
 .sag { text-align:right; font-variant-numeric:tabular-nums }
 .mono { font-family:ui-monospace,Consolas,monospace; font-size:12px }
 .uyari { color:var(--uyari); font-weight:600 }
 .kritik { color:var(--kritik); font-weight:600 }
 h2 { font-size:14px; margin:0 0 10px }
 .ipucu { background:#fffbeb; border:1px solid #fde68a; border-radius:8px;
          padding:12px 14px; font-size:12.5px; margin-bottom:24px }
</style></head><body>
<h1>Musteri Resim Envanteri</h1>
<div class="alt">$(E $Kok) &nbsp;|&nbsp; $(Get-Date -Format 'dd.MM.yyyy HH:mm') &nbsp;|&nbsp;
  &quot;Buyuk&quot; = $BuyukKB KB ustu &nbsp;|&nbsp; &quot;Yuksek cozunurluk&quot; = kenari $BuyukPiksel px ustu</div>

<div class="kpi">
  <div class="kart"><div class="e">Toplam Boyut</div><div class="b">$gToplamMB MB</div><div class="n">$($firmalar.Count) firma</div></div>
  <div class="kart"><div class="e">Dosya</div><div class="b">$gAdet</div><div class="n">tum gorseller</div></div>
  <div class="kart"><div class="e">Buyuk Dosya</div><div class="b">$gBuyukAdet</div><div class="n">$gBuyukMB MB tutuyor</div></div>
  <div class="kart"><div class="e">Yuksek Cozunurluk</div><div class="b">$gCozunurluk</div><div class="n">kenari $BuyukPiksel px ustu</div></div>
  <div class="kart"><div class="e">Tahmini Kazanc</div><div class="b">$gKazancMB MB</div><div class="n">buyukler ~$HedefKB KB'a inerse</div></div>
</div>

<div class="ipucu">
  <b>Nasil okunmali:</b> Toplam boyut tek basina yaniltici olabilir &mdash; onemli olan
  <b>buyuk dosyalarin</b> ve <b>yuksek cozunurluklu</b> gorsellerin nerede toplandigi.
  Kazanc oradan gelir. &quot;Tahmini Kazanc&quot; bir <i>ust sinir tahminidir</i>:
  buyuk dosyalarin ortalama $HedefKB KB'a indigi varsayilmistir, gercek sonuc
  gorsellerin icerigine gore degisir. Bu rapor hicbir dosyayi degistirmez.
</div>

<h2>Firma bazinda</h2>
<table id="t1"><thead><tr>
<th onclick="sirala('t1',0,'m')">Firma</th>
<th class="sag" onclick="sirala('t1',1,'s')">Dosya</th>
<th class="sag" onclick="sirala('t1',2,'s')">Toplam MB</th>
<th class="sag" onclick="sirala('t1',3,'s')">Ortalama KB</th>
<th class="sag" onclick="sirala('t1',4,'s')">Buyuk Dosya</th>
<th class="sag" onclick="sirala('t1',5,'s')">Buyuk MB</th>
<th class="sag" onclick="sirala('t1',6,'s')">Yuksek Coz.</th>
<th class="sag" onclick="sirala('t1',7,'s')">Tahmini Kazanc</th>
<th onclick="sirala('t1',8,'m')">En Buyuk Dosya</th>
</tr></thead><tbody>
"@)

foreach ($f in $firmalar) {
    $sinif = if ($f.OrtalamaKB -gt 1500) { 'kritik' } elseif ($f.OrtalamaKB -gt 600) { 'uyari' } else { '' }
    [void]$sb.Append("<tr><td class=""mono"">$(E $f.Firma)</td>" +
        "<td class=""sag"">$($f.Adet)</td>" +
        "<td class=""sag"">$($f.ToplamMB)</td>" +
        "<td class=""sag $sinif"">$($f.OrtalamaKB)</td>" +
        "<td class=""sag"">$($f.BuyukAdet)</td>" +
        "<td class=""sag"">$($f.BuyukMB)</td>" +
        "<td class=""sag"">$($f.CozunurlukAdet)</td>" +
        "<td class=""sag"">$($f.KazancMB)</td>" +
        "<td class=""mono"">$(E $f.EnBuyukDosya) <span style=""color:#6b7280"">($($f.EnBuyukMB) MB)</span></td></tr>")
}

[void]$sb.Append(@"
</tbody></table>

<h2>En buyuk 100 dosya</h2>
<table id="t2"><thead><tr>
<th onclick="sirala('t2',0,'m')">Firma</th>
<th onclick="sirala('t2',1,'m')">Dosya</th>
<th class="sag" onclick="sirala('t2',2,'s')">MB</th>
<th onclick="sirala('t2',3,'m')">Olcu</th>
<th onclick="sirala('t2',4,'m')">Yol</th>
</tr></thead><tbody>
"@)

foreach ($d in $enBuyukler) {
    [void]$sb.Append("<tr><td class=""mono"">$(E $d.Firma)</td>" +
        "<td class=""mono"">$(E $d.Dosya)</td>" +
        "<td class=""sag"">$($d.MB)</td>" +
        "<td class=""mono"">$(E $d.Olcu)</td>" +
        "<td class=""mono"" style=""color:#6b7280"">$(E $d.Yol)</td></tr>")
}

[void]$sb.Append(@"
</tbody></table>
<script>
/* Basit tablo siralama: 's' sayisal, 'm' metin. Ayni basliga tekrar
   tiklaninca yon degisir. */
function sirala(tid, sutun, tip) {
  var t = document.getElementById(tid), tb = t.tBodies[0];
  var sat = Array.prototype.slice.call(tb.rows);
  t._yon = (t._sut === sutun) ? -(t._yon || 1) : 1;  t._sut = sutun;
  sat.sort(function (a, b) {
    var x = a.cells[sutun].innerText.trim(), y = b.cells[sutun].innerText.trim();
    if (tip === 's') { return (parseFloat(x.replace(',', '.')) - parseFloat(y.replace(',', '.'))) * t._yon; }
    return x.localeCompare(y, 'tr') * t._yon;
  });
  sat.forEach(function (r) { tb.appendChild(r); });
}
</script>
</body></html>
"@)

$dizin = Split-Path -Parent $Cikti
if ($dizin -and -not (Test-Path -LiteralPath $dizin)) {
    New-Item -ItemType Directory -Path $dizin -Force | Out-Null
}
[System.IO.File]::WriteAllText($Cikti, $sb.ToString(), [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Host "Rapor hazir: $Cikti" -ForegroundColor Green
Write-Host ("  {0} firma | {1} dosya | {2} MB | buyuk: {3} dosya / {4} MB | tahmini kazanc: {5} MB" -f `
    $firmalar.Count, $gAdet, $gToplamMB, $gBuyukAdet, $gBuyukMB, $gKazancMB)
