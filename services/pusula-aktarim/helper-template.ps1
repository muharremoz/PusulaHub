<#
.SYNOPSIS
  Pusula Backup Helper — SQL yedek alıp Pusula Aktarım'a yükler

.DESCRIPTION
  Müşteri PC'sinde çalışır. Lokal SQL Server'a Windows Auth ile bağlanır
  (yetersizse SA user/pass sorar), seçilen veritabanını yedekler ve
  aktarim.pusulanet.net'e yükler.

  Token script içine gömülüdür — Hub admin tarafından üretilen kişisel
  link ile indirilir.
#>

# ─────────────────────────────────────────────────────────────
# Token ve aktarım sunucusu — server-side render ile doldurulur
# ─────────────────────────────────────────────────────────────
$TOKEN       = '__TOKEN_PLACEHOLDER__'
$BASE_URL    = '__BASE_URL_PLACEHOLDER__'   # örn. http://aktarim.pusulanet.net
$FIRMA_NAME  = '__FIRMA_PLACEHOLDER__'

# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

function Write-Header($t) {
  Write-Host ''
  Write-Host ('━' * 60) -ForegroundColor DarkGray
  Write-Host "  $t" -ForegroundColor Cyan
  Write-Host ('━' * 60) -ForegroundColor DarkGray
}
function Write-Ok($t)   { Write-Host "✓ $t" -ForegroundColor Green }
function Write-Err($t)  { Write-Host "✗ $t" -ForegroundColor Red }
function Write-Info($t) { Write-Host "  $t" -ForegroundColor Gray }

# ── Karşılama ───────────────────────────────────────
Clear-Host
Write-Header "Pusula Backup Helper"
Write-Host "Firma: " -NoNewline; Write-Host $FIRMA_NAME -ForegroundColor Yellow
Write-Host "Aktarım kodu: " -NoNewline; Write-Host $TOKEN -ForegroundColor DarkGray
Write-Host ""

# ── 1) Aktarım token'ı doğrula ──────────────────────
Write-Header "Adım 1 / 5 — Aktarım kontrolü"
try {
  $info = Invoke-RestMethod "$BASE_URL/api/info/$TOKEN" -TimeoutSec 10
  if (-not $info.ok) {
    Write-Err "Aktarım geçerli değil: $($info.reason)"
    Read-Host "Çıkmak için Enter'a basın"
    exit 1
  }
  Write-Ok "Aktarım aktif — firma: $($info.firmaName)"
} catch {
  Write-Err "Aktarım servisine bağlanılamadı: $_"
  Write-Info "İnternet bağlantınızı kontrol edin."
  Read-Host "Çıkmak için Enter'a basın"; exit 1
}

# ── 2) SQL Server adresini sor ──────────────────────
Write-Header "Adım 2 / 5 — SQL Server bağlantısı"
$sqlServer = Read-Host "SQL Server adresi (boş bırakırsanız: localhost)"
if ([string]::IsNullOrWhiteSpace($sqlServer)) { $sqlServer = "localhost" }

# Windows Auth dene
$useWinAuth = $true
$sqlUser = $null; $sqlPass = $null

Write-Info "Windows kimlik doğrulaması ile bağlanmayı deniyorum..."
$testQuery = "SELECT 1 AS ok"

function Invoke-Sql($cs, $query) {
  $conn = New-Object System.Data.SqlClient.SqlConnection $cs
  try {
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $query
    $cmd.CommandTimeout = 600
    $r = $cmd.ExecuteReader()
    $rows = @()
    while ($r.Read()) {
      $obj = New-Object PSObject
      for ($i = 0; $i -lt $r.FieldCount; $i++) {
        $col = $r.GetName($i)
        if ([string]::IsNullOrWhiteSpace($col)) { $col = "col$i" }
        # Aynı isim varsa override etmemek için kontrol
        if (-not ($obj.PSObject.Properties.Name -contains $col)) {
          $obj | Add-Member -MemberType NoteProperty -Name $col -Value $r.GetValue($i)
        }
      }
      $rows += $obj
    }
    $r.Close()
    return $rows
  } finally { $conn.Close() }
}

function Build-CS($srv, $usr, $pwd, $db) {
  if (-not $db) { $db = 'master' }
  if ($usr) {
    "Server=$srv;Database=$db;User Id=$usr;Password=$pwd;TrustServerCertificate=True;Connect Timeout=8"
  } else {
    "Server=$srv;Database=$db;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=8"
  }
}

try {
  $null = Invoke-Sql (Build-CS $sqlServer $null $null $null) $testQuery
  Write-Ok "Windows Auth ile bağlandı"
} catch {
  Write-Info "Windows Auth çalışmadı, SQL kullanıcısı gerekli."
  $sqlUser = Read-Host "SQL kullanıcı adı (örn. sa)"
  $sqlPassSec = Read-Host "Şifre" -AsSecureString
  $sqlPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sqlPassSec))
  $useWinAuth = $false
  try {
    $null = Invoke-Sql (Build-CS $sqlServer $sqlUser $sqlPass $null) $testQuery
    Write-Ok "SQL kullanıcısı ile bağlandı"
  } catch {
    Write-Err "Bağlantı kurulamadı: $_"
    Read-Host "Çıkmak için Enter'a basın"; exit 1
  }
}

# ── 3) Veritabanı listesi ───────────────────────────
Write-Header "Adım 3 / 5 — Yedeklenecek veritabanı"
$dbs = Invoke-Sql (Build-CS $sqlServer $sqlUser $sqlPass $null) `
  "SELECT name FROM sys.databases WHERE database_id > 4 AND state_desc='ONLINE' ORDER BY name"

if ($dbs.Count -eq 0) {
  Write-Err "Yedeklenecek veritabanı bulunamadı."
  Read-Host "Çıkmak için Enter'a basın"; exit 1
}

Write-Host ""
for ($i = 0; $i -lt $dbs.Count; $i++) {
  Write-Host ("  [{0,2}] {1}" -f ($i + 1), $dbs[$i].name)
}
Write-Host ""

$selectedDbs = @()
$choice = Read-Host "Yedeklenecek DB numarası (virgülle çoklu seçim, 'all' = hepsi)"
if ($choice -eq 'all') {
  $selectedDbs = $dbs | ForEach-Object { $_.name }
} else {
  foreach ($n in $choice -split ',') {
    $idx = [int]$n.Trim() - 1
    if ($idx -ge 0 -and $idx -lt $dbs.Count) { $selectedDbs += $dbs[$idx].name }
  }
}
if ($selectedDbs.Count -eq 0) {
  Write-Err "Geçerli DB seçilmedi."
  Read-Host "Çıkmak için Enter'a basın"; exit 1
}
Write-Ok "Seçilen: $($selectedDbs -join ', ')"

# ── 4) Backup al ────────────────────────────────────
Write-Header "Adım 4 / 5 — Yedek alınıyor"
$tempDir = Join-Path $env:TEMP "pusula-backup-$([guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
$bakFiles = @()

foreach ($db in $selectedDbs) {
  $bakPath = Join-Path $tempDir "$db.bak"
  Write-Host "  $db → $bakPath"
  # PS string interpolation issue — sql query'i ayrı build et
  $bakQuery = "BACKUP DATABASE [$db] TO DISK = N'$bakPath' WITH INIT, FORMAT, COMPRESSION, STATS = 10"
  try {
    $null = Invoke-Sql (Build-CS $sqlServer $sqlUser $sqlPass 'master') $bakQuery
    $size = (Get-Item $bakPath).Length
    $sizeMB = [math]::Round($size / 1MB, 1)
    Write-Ok "$db yedeklendi ($sizeMB MB)"
    $bakFiles += $bakPath
  } catch {
    Write-Err "$db yedeklenemedi: $_"
  }
}

if ($bakFiles.Count -eq 0) {
  Write-Err "Hiç yedek alınamadı."
  Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  Read-Host "Çıkmak için Enter'a basın"; exit 1
}

# ── 5) Yükle ────────────────────────────────────────
Write-Header "Adım 5 / 5 — Aktarım sunucusuna yükleniyor"
$uploadedCount = 0
$totalBytes = ($bakFiles | ForEach-Object { (Get-Item $_).Length } | Measure-Object -Sum).Sum

# Önce toplam boyutu bildir
try {
  Invoke-RestMethod "$BASE_URL/api/upload/$TOKEN/data-progress" `
    -Method Post -ContentType 'application/json' `
    -Body (@{ totalBytes = $totalBytes; uploadedBytes = 0 } | ConvertTo-Json) | Out-Null
} catch {}

$uploadedBytes = 0
foreach ($bak in $bakFiles) {
  $fname = Split-Path $bak -Leaf
  $size  = (Get-Item $bak).Length
  Write-Host "  $fname yükleniyor..."
  try {
    # PS 5.1+ Invoke-WebRequest multipart
    $form = @{ file = Get-Item $bak }
    $r = Invoke-WebRequest -Uri "$BASE_URL/api/upload/$TOKEN/data" -Method Post -Form $form -TimeoutSec 7200
    if ($r.StatusCode -eq 200) {
      Write-Ok "$fname yüklendi"
      $uploadedCount++
      $uploadedBytes += $size
      try {
        Invoke-RestMethod "$BASE_URL/api/upload/$TOKEN/data-progress" `
          -Method Post -ContentType 'application/json' `
          -Body (@{ totalBytes = $totalBytes; uploadedBytes = $uploadedBytes } | ConvertTo-Json) | Out-Null
      } catch {}
    } else {
      Write-Err "$fname yükleme başarısız (HTTP $($r.StatusCode))"
    }
  } catch {
    Write-Err "$fname yükleme hatası: $_"
  }
}

# ── Bitir ───────────────────────────────────────────
if ($uploadedCount -gt 0) {
  try { Invoke-RestMethod "$BASE_URL/api/upload/$TOKEN/complete" -Method Post -TimeoutSec 10 | Out-Null } catch {}
  Write-Header "✓ Tamamlandı"
  Write-Host "  $uploadedCount / $($bakFiles.Count) yedek başarıyla yüklendi" -ForegroundColor Green
  Write-Host "  Pusula ekibi devamını sağlayacak." -ForegroundColor Gray
} else {
  Write-Header "✗ Aktarım başarısız"
}

# Temizlik
try { Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}

Write-Host ""
Read-Host "Çıkmak için Enter'a basın"
