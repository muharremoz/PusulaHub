# Pusula Bağlantı Testi — uygulama ikonu üreteci (çok boyutlu .ico)
# Tasarım: Pusula Import ikonuyla aynı aile — mor gradyan altıgen (#6E55F0 → #1C147A),
# üstte yumuşak parlaklık; içinde beyaz sinyal çubukları, altta "TEST" yazısı.
# 48px altında yazı okunmaz → yalnızca büyütülmüş çubuklar çizilir.
# ICO girdileri klasik 32bpp DIB (System.Drawing.Icon ve csc /win32icon uyumlu).
#
# Kullanım: powershell -NoProfile -ExecutionPolicy Bypass -File ikon-uret.ps1

param(
    [string]$OutFile = (Join-Path $PSScriptRoot "app.ico"),
    [string]$PngFile = (Join-Path $PSScriptRoot "app-512.png")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$BrandTop    = [System.Drawing.Color]::FromArgb(255, 0x6E, 0x55, 0xF0)
$BrandBottom = [System.Drawing.Color]::FromArgb(255, 0x1C, 0x14, 0x7A)

function New-RoundedBar([float]$x, [float]$y, [float]$w, [float]$h) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r = [Math]::Min($w, $h) * 0.32
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function Render-Icon([int]$S) {
    $bmp = New-Object System.Drawing.Bitmap $S, $S, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    $cx = $S / 2.0; $cy = $S / 2.0
    $R  = $S * 0.475

    # --- Altıgen (sivri üst) ---
    $pts = foreach ($i in 0..5) {
        $a = [Math]::PI / 180 * (60 * $i - 90)
        New-Object System.Drawing.PointF ([float]($cx + $R * [Math]::Cos($a))), ([float]($cy + $R * [Math]::Sin($a)))
    }
    $hex = New-Object System.Drawing.Drawing2D.GraphicsPath
    $hex.AddPolygon([System.Drawing.PointF[]]$pts)
    $bounds = $hex.GetBounds()
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bounds, $BrandTop, $BrandBottom, 90
    $g.FillPath($brush, $hex); $brush.Dispose()

    # Üst parlaklık
    $g.SetClip($hex)
    $hl = New-Object System.Drawing.RectangleF 0, 0, $S, ($S * 0.55)
    $hlb = New-Object System.Drawing.Drawing2D.LinearGradientBrush $hl, ([System.Drawing.Color]::FromArgb(55, 255, 255, 255)), ([System.Drawing.Color]::FromArgb(0, 255, 255, 255)), 90
    $g.FillRectangle($hlb, $hl); $hlb.Dispose()
    $g.ResetClip()

    $yazili = $S -ge 48

    # --- Sinyal çubukları (4 adet, yükselen) ---
    if ($yazili) { $alanW = $S * 0.40; $alanH = $S * 0.30; $tabanY = $cy + $S * 0.07 }
    else         { $alanW = $S * 0.52; $alanH = $S * 0.44; $tabanY = $cy + $S * 0.22 }
    $n = 4
    $bosluk = $alanW * 0.10
    $cubukW = ($alanW - $bosluk * ($n - 1)) / $n
    $x0 = $cx - $alanW / 2
    $golge = [Math]::Max(1.0, $S * 0.008)
    $golgeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(50, 0, 0, 0))
    for ($i = 0; $i -lt $n; $i++) {
        $h = $alanH * (0.34 + 0.22 * $i)
        $x = $x0 + $i * ($cubukW + $bosluk)
        $y = $tabanY - $h
        $gp = New-RoundedBar ([float]($x + $golge)) ([float]($y + $golge)) ([float]$cubukW) ([float]$h)
        $g.FillPath($golgeBrush, $gp); $gp.Dispose()
        $bp = New-RoundedBar ([float]$x) ([float]$y) ([float]$cubukW) ([float]$h)
        $g.FillPath([System.Drawing.Brushes]::White, $bp); $bp.Dispose()
    }
    $golgeBrush.Dispose()

    # --- TEST yazısı ---
    if ($yazili) {
        $font = New-Object System.Drawing.Font "Segoe UI", ([float]($S * 0.135)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
        $sf = New-Object System.Drawing.StringFormat
        $sf.Alignment = [System.Drawing.StringAlignment]::Center
        $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
        $ty = $cy + $S * 0.24
        $rect = New-Object System.Drawing.RectangleF 0, ([float]($ty - $S * 0.10)), $S, ([float]($S * 0.20))
        $gr = New-Object System.Drawing.RectangleF ([float]($rect.X + $golge * 0.6)), ([float]($rect.Y + $golge * 0.6)), $rect.Width, $rect.Height
        $tsb = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(60, 0, 0, 0))
        $g.DrawString("TEST", $font, $tsb, $gr, $sf); $tsb.Dispose()
        $g.DrawString("TEST", $font, [System.Drawing.Brushes]::White, $rect, $sf)
        $font.Dispose(); $sf.Dispose()
    }

    $hex.Dispose(); $g.Dispose()
    return $bmp
}

# 512px tanıtım görseli
$big = Render-Icon 512
$big.Save($PngFile, [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose()

# ICO — klasik 32bpp DIB girdileri
$sizes = 16, 20, 24, 32, 48, 64, 128, 256
$frames = foreach ($s in $sizes) {
    $bmp  = Render-Icon $s
    $rect = New-Object System.Drawing.Rectangle(0, 0, $s, $s)
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $stride = $data.Stride
    $buf = New-Object byte[] ($stride * $s)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buf, 0, $buf.Length)
    $bmp.UnlockBits($data); $bmp.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)
    $bw.Write([uint32]40); $bw.Write([int32]$s); $bw.Write([int32]($s * 2))
    $bw.Write([uint16]1);  $bw.Write([uint16]32); $bw.Write([uint32]0)
    $bw.Write([uint32]0);  $bw.Write([int32]0);   $bw.Write([int32]0)
    $bw.Write([uint32]0);  $bw.Write([uint32]0)
    for ($y = $s - 1; $y -ge 0; $y--) { $bw.Write($buf, $y * $stride, $s * 4) }
    $andRow = [math]::Floor(($s + 31) / 32) * 4
    $bw.Write((New-Object byte[] ($andRow * $s)), 0, $andRow * $s)
    $bw.Flush()
    $bytes = $ms.ToArray()
    $bw.Dispose(); $ms.Dispose()
    , @{ Size = $s; Bytes = $bytes }
}

$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($out)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$frames.Count)
$offset = 6 + 16 * $frames.Count
foreach ($f in $frames) {
    $dim = if ($f.Size -ge 256) { 0 } else { $f.Size }
    $bw.Write([byte]$dim); $bw.Write([byte]$dim); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$f.Bytes.Length); $bw.Write([uint32]$offset)
    $offset += $f.Bytes.Length
}
foreach ($f in $frames) { $bw.Write($f.Bytes) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($OutFile, $out.ToArray())

$ic = New-Object System.Drawing.Icon($OutFile); $ic.Dispose()
Write-Host "Ikon uretildi: $OutFile ($([Math]::Round($out.Length / 1KB, 1)) KB)"
