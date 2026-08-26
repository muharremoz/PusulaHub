<#
    Resim kucultme DENEMESI  ->  yan yana karsilastirma raporu

    Amac: kucultme ayarina KARAR VERMEK. Kuyumculuk fotografinda detay
    (kase, ayar damgasi, tas dokusu) kaybi kabul edilebilir olmayabilir;
    bu yuzden gercek islemden once gozle onaylanmali.

    ORIJINAL DOSYALARA DOKUNMAZ. Ornekleri ayri bir klasore kopyalar ve
    orada uc farkli ayarla kucultur. Rapor HTML olarak acilir, gorseller
    yan yana ve tam cozunurlukte incelenebilir.

    Kullanim:
        powershell -ExecutionPolicy Bypass -File resim-kucultme-denemesi.ps1 -Firma 651
        ... -Firma 651 -Ornek 20 -Ayarlar '1200:80,1600:82,2000:88'

    Karar verdikten sonra gercek kucultme icin ayri betik yazilacak.
#>

param(
    [string]   $Kok      = 'C:\Pusula\MUSTERI',
    [Parameter(Mandatory=$true)]
    [string]   $Firma,
    # Kac ornek dosya denensin (en buyukten secilir - kazanc orada)
    [int]      $Ornek    = 12,
    # "enUzunKenar:jpegKalitesi" listesi
    [string]   $Ayarlar  = '1200:80,1600:82,2000:88',
    [string]   $CiktiKok = "$env:USERPROFILE\Desktop\resim-deneme"
)

$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing | Out-Null

$kaynak = Join-Path (Join-Path $Kok $Firma) 'RESIM'
if (-not (Test-Path -LiteralPath $kaynak)) {
    Write-Host "HATA: bulunamadi -> $kaynak" -ForegroundColor Red; exit 1
}

$jpegEnc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
           Where-Object { $_.MimeType -eq 'image/jpeg' }

<# EXIF yonlendirmesi: telefonla cekilmis fotograflar dik gorunse de dosyada
   yatay durur, yonu 0x0112 etiketi soyler. GDI+ bunu KENDILIGINDEN uygulamaz;
   dikkate almazsak kucultulmus gorsel yan yatmis cikar. #>
function Duzelt-Yon {
    param($Img)
    try {
        if ($Img.PropertyIdList -contains 0x0112) {
            $y = $Img.GetPropertyItem(0x0112).Value[0]
            switch ($y) {
                3 { $Img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
                6 { $Img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
                8 { $Img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
            }
        }
    } catch { }
}

function Kucult {
    param([string] $Girdi, [string] $Cikti, [int] $EnUzun, [int] $Kalite)
    $src = $null; $bmp = $null; $g = $null
    try {
        $src = [System.Drawing.Image]::FromFile($Girdi)
        Duzelt-Yon -Img $src

        $oran = [Math]::Min($EnUzun / $src.Width, $EnUzun / $src.Height)
        # Zaten kucukse BUYUTME - sadece yeniden sikistir.
        if ($oran -gt 1) { $oran = 1 }
        $yw = [int][Math]::Max(1, [Math]::Round($src.Width  * $oran))
        $yh = [int][Math]::Max(1, [Math]::Round($src.Height * $oran))

        $bmp = New-Object System.Drawing.Bitmap($yw, $yh)
        $g   = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.DrawImage($src, 0, 0, $yw, $yh)

        $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
                          [System.Drawing.Imaging.Encoder]::Quality, [int64]$Kalite)
        $bmp.Save($Cikti, $jpegEnc, $ep)
        $ep.Dispose()
        return @{ G = $yw; Y = $yh; Ok = $true }
    } catch {
        return @{ G = 0; Y = 0; Ok = $false; Hata = $_.Exception.Message }
    } finally {
        if ($g)   { $g.Dispose() }
        if ($bmp) { $bmp.Dispose() }
        if ($src) { $src.Dispose() }
    }
}

# ── Ornekleri sec: en buyuk N dosya ────────────────────────────────────
$dosyalar = Get-ChildItem -LiteralPath $kaynak -File -Recurse -EA SilentlyContinue |
            Where-Object { $_.Extension -match '(?i)\.(jpg|jpeg|png)$' } |
            Sort-Object Length -Descending | Select-Object -First $Ornek
if (-not $dosyalar) { Write-Host "Gorsel bulunamadi." -ForegroundColor Yellow; exit 0 }

$cikti = Join-Path $CiktiKok $Firma
New-Item -ItemType Directory -Path $cikti -Force | Out-Null

$ayarListe = @()
foreach ($a in $Ayarlar.Split(',')) {
    $p = $a.Trim().Split(':')
    $ayarListe += [pscustomobject]@{ Px = [int]$p[0]; Kalite = [int]$p[1]; Etiket = "$($p[0])px / q$($p[1])" }
}

Write-Host "Firma $Firma - $($dosyalar.Count) ornek, $($ayarListe.Count) ayar" -ForegroundColor Cyan

$sonuc = @()
$i = 0
foreach ($d in $dosyalar) {
    $i++
    Write-Progress -Activity 'Kucultuluyor' -Status $d.Name -PercentComplete (100*$i/$dosyalar.Count)

    # Orijinali kopyala (raporda yan yana gosterebilmek icin)
    $orjAd = "{0:d2}_orijinal{1}" -f $i, $d.Extension
    Copy-Item -LiteralPath $d.FullName -Destination (Join-Path $cikti $orjAd) -Force

    $olcu = $null
    try { $tmp = [System.Drawing.Image]::FromFile($d.FullName)
          $olcu = "$($tmp.Width)x$($tmp.Height)"; $tmp.Dispose() } catch { $olcu = '-' }

    $satir = [ordered]@{
        Sira = $i; Ad = $d.Name; OrjDosya = $orjAd
        OrjKB = [Math]::Round($d.Length/1KB, 0); OrjOlcu = $olcu
        Varyant = @()
    }

    foreach ($ay in $ayarListe) {
        $vAd = "{0:d2}_{1}px_q{2}.jpg" -f $i, $ay.Px, $ay.Kalite
        $vYol = Join-Path $cikti $vAd
        $r = Kucult -Girdi $d.FullName -Cikti $vYol -EnUzun $ay.Px -Kalite $ay.Kalite
        if ($r.Ok) {
            $kb = [Math]::Round((Get-Item $vYol).Length/1KB, 0)
            $satir.Varyant += [pscustomobject]@{
                Etiket = $ay.Etiket; Dosya = $vAd; KB = $kb; Olcu = "$($r.G)x$($r.Y)"
                Oran = if ($d.Length -gt 0) { [Math]::Round(100 - ($kb*1KB*100/$d.Length), 0) } else { 0 }
            }
        } else {
            $satir.Varyant += [pscustomobject]@{ Etiket=$ay.Etiket; Dosya=$null; KB=0; Olcu='HATA'; Oran=0 }
        }
    }
    $sonuc += [pscustomobject]$satir
}
Write-Progress -Activity 'Kucultuluyor' -Completed

# ── Rapor ──────────────────────────────────────────────────────────────
$sb = New-Object System.Text.StringBuilder
[void]$sb.Append(@"
<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>Resim kucultme denemesi - $Firma</title>
<style>
 body{margin:0;padding:24px;background:#f7f7f8;color:#171717;
      font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif}
 h1{font-size:20px;margin:0 0 4px} .alt{color:#6b7280;font-size:12px;margin-bottom:20px}
 .ipucu{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;
        font-size:12.5px;margin-bottom:24px}
 .grup{background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:14px;margin-bottom:20px}
 .ad{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:#6b7280;margin-bottom:10px}
 .sira{display:flex;gap:14px;flex-wrap:wrap}
 .kutu{flex:1;min-width:220px}
 .kutu img{width:100%;height:220px;object-fit:contain;background:#fafafa;
           border:1px solid #e5e5e5;border-radius:5px;cursor:zoom-in}
 .bilgi{font-size:11.5px;margin-top:6px}
 .bilgi b{font-size:12px}
 .kaz{color:#047857;font-weight:600}
 dialog{border:0;padding:0;background:transparent;max-width:96vw;max-height:96vh}
 dialog img{max-width:96vw;max-height:92vh;display:block}
 dialog::backdrop{background:rgba(0,0,0,.85)}
 .dbaslik{color:#fff;font-size:12px;padding:6px 2px;font-family:ui-monospace,monospace}
</style></head><body>
<h1>Resim kucultme denemesi &mdash; firma $Firma</h1>
<div class="alt">$(Get-Date -Format 'dd.MM.yyyy HH:mm') &nbsp;|&nbsp; $($dosyalar.Count) ornek (en buyuk dosyalar) &nbsp;|&nbsp; kaynak: $kaynak</div>
<div class="ipucu">
  <b>Nasil karar verilir:</b> Kucuk onizlemede fark gorunmez &mdash; bu normaldir ve
  yaniltir. <b>Gorsele tiklayip tam boyutta acin</b> ve detaya bakin: kase/ayar
  damgasi okunuyor mu, tas dokusu daginik mi, kenarlarda bulanma var mi.
  Kabul edilebilir en <i>kucuk</i> ayari secin. Orijinal dosyalar degistirilmedi.
</div>
"@)

foreach ($s in $sonuc) {
    [void]$sb.Append("<div class=""grup""><div class=""ad"">$($s.Sira). $($s.Ad)</div><div class=""sira"">")
    [void]$sb.Append("<div class=""kutu""><img src=""$($s.OrjDosya)"" onclick=""ac(this,'ORIJINAL')""><div class=""bilgi"">" +
                     "<b>Orijinal</b><br>$($s.OrjOlcu) &middot; $($s.OrjKB) KB</div></div>")
    foreach ($v in $s.Varyant) {
        if ($v.Dosya) {
            [void]$sb.Append("<div class=""kutu""><img src=""$($v.Dosya)"" onclick=""ac(this,'$($v.Etiket)')""><div class=""bilgi"">" +
                             "<b>$($v.Etiket)</b><br>$($v.Olcu) &middot; $($v.KB) KB &middot; " +
                             "<span class=""kaz"">%$($v.Oran) kucuk</span></div></div>")
        } else {
            [void]$sb.Append("<div class=""kutu""><div class=""bilgi""><b>$($v.Etiket)</b><br>HATA</div></div>")
        }
    }
    [void]$sb.Append("</div></div>")
}

[void]$sb.Append(@"
<dialog id="d"><div class="dbaslik" id="db"></div><img id="di"></dialog>
<script>
/* Tam boyutta acma: karar ancak 1:1 bakilarak verilebilir. */
function ac(el, etiket){
  document.getElementById('di').src = el.src;
  document.getElementById('db').textContent = etiket;
  document.getElementById('d').showModal();
}
document.getElementById('d').addEventListener('click', function(){ this.close(); });
</script>
</body></html>
"@)

$rapor = Join-Path $cikti 'karsilastirma.html'
[System.IO.File]::WriteAllText($rapor, $sb.ToString(), [System.Text.Encoding]::UTF8)

$orjTop = ($dosyalar | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ""
Write-Host "Rapor: $rapor" -ForegroundColor Green
Write-Host ("  ornek toplami: {0:N1} MB" -f $orjTop)
foreach ($ay in $ayarListe) {
    $t = 0
    foreach ($s in $sonuc) { $v = $s.Varyant | Where-Object { $_.Etiket -eq $ay.Etiket }; if ($v) { $t += $v.KB } }
    $yuzde = if ($orjTop -gt 0) { [Math]::Round(100 - ($t/1024*100/$orjTop), 0) } else { 0 }
    Write-Host ("  {0,-16} -> {1,8:N1} MB  (%{2} kucuk)" -f $ay.Etiket, ($t/1024), $yuzde)
}
Write-Host ""
Write-Host "Raporu acip gorselleri TAM BOYUTTA inceleyin, sonra ayara karar verin." -ForegroundColor Yellow
