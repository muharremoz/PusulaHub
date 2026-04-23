# ═══════════════════════════════════════════════════════════════════════
#  PusulaProd — Tek tik kurulum scripti
#  Ofis sunucusu: 10.10.10.5 (Windows Server 2019)
# ═══════════════════════════════════════════════════════════════════════
#
# ON KOSUL: SQL Server Express + SSMS kurulu ve su DB'ler olusturulmus:
#    - PusulaHub
#    - SpareFlow
#   (Dev PC'nden scriptleri/snapshot'i su DB'lere aktar.)
#
# CALISTIRMA:
#   1) Bu dosyayi C:\setup-prod.ps1 olarak kaydet
#   2) PowerShell'i Yonetici olarak ac
#   3) Set-ExecutionPolicy -Scope Process Bypass
#   4) C:\setup-prod.ps1
#
# Script sana bir kere SA parolasini soracak; gerisini otomatik yapacak.
# Rastgele secret'lar script tarafindan uretilir, 3 uygulamada senkron yazilir.

$ErrorActionPreference = "Stop"

# Admin kontrol
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "HATA: PowerShell'i Yonetici olarak calistir." -ForegroundColor Red
  exit 1
}

$ROOT       = "C:\PusulaProd"
$LOGS       = "$ROOT\logs"
$GITHUB_ORG = "https://github.com/muharremoz"

function Section($t) { Write-Host "`n==== $t ====" -ForegroundColor Cyan }
function OK($t)      { Write-Host "  [OK] $t" -ForegroundColor Green }
function Warn($t)    { Write-Host "  [!!] $t" -ForegroundColor Yellow }
function Die($t)     { Write-Host "  [XX] $t" -ForegroundColor Red; exit 1 }

function Has-Cmd($c) { $null -ne (Get-Command $c -ErrorAction SilentlyContinue) }
function Rand-B64($bytes = 32) {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $buf = New-Object byte[] $bytes
  $rng.GetBytes($buf)
  [Convert]::ToBase64String($buf)
}
function Rand-Hex($bytes = 32) {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $buf = New-Object byte[] $bytes
  $rng.GetBytes($buf)
  ($buf | ForEach-Object { $_.ToString("x2") }) -join ""
}

# ─── Kullanici girdileri ───────────────────────────────────────────────
Section "Girdiler"
$sqlSa = Read-Host "SQL Server SA parolasi" -AsSecureString
$sqlSaPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sqlSa)
)
if ([string]::IsNullOrWhiteSpace($sqlSaPlain)) { Die "SA parolasi bos olamaz" }

# ─── 1) Araclar: Node + Git + pnpm + pm2 ───────────────────────────────
Section "1) Node + Git kurulum"
if (-not (Has-Cmd "node")) {
  Write-Host "  Node bulunamadi, winget ile kuruyorum..." -ForegroundColor Yellow
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
  # PATH'i yenile
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  if (-not (Has-Cmd "node")) { Die "Node kurulamadi. Manuel kur: https://nodejs.org/" }
}
OK ("Node " + (& node -v))

if (-not (Has-Cmd "git")) {
  Write-Host "  Git bulunamadi, winget ile kuruyorum..." -ForegroundColor Yellow
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements --silent
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  if (-not (Has-Cmd "git")) { Die "Git kurulamadi. Manuel kur: https://git-scm.com/" }
}
OK ("Git " + ((& git --version) -replace "git version ",""))

Section "2) pnpm + pm2"
if (-not (Has-Cmd "pnpm")) { npm install -g pnpm | Out-Null }
OK ("pnpm " + (& pnpm -v))
if (-not (Has-Cmd "pm2"))  { npm install -g pm2 pm2-windows-startup | Out-Null }
OK ("pm2 " + (& pm2 -v))

# pm2 startup — boot'ta otomatik baslatma
Section "3) PM2 boot entegrasyonu"
try { pm2-startup install | Out-Null; OK "pm2-startup install" }
catch { Warn "pm2-startup install bas.bas.altinda basarisiz (zaten kuruluysa normaldir)" }

# ─── 2) Klasor + repo clone ────────────────────────────────────────────
Section "4) Klasor yapisi + repo clone"
if (-not (Test-Path $ROOT)) { New-Item -ItemType Directory -Path $ROOT | Out-Null }
if (-not (Test-Path $LOGS)) { New-Item -ItemType Directory -Path $LOGS | Out-Null }
OK "Klasorler hazir: $ROOT, $LOGS"

$repos = @(
  @{ Name = "PusulaSwitch"; Url = "$GITHUB_ORG/PusulaSwitch.git" },
  @{ Name = "PusulaHub";    Url = "$GITHUB_ORG/PusulaHub.git" },
  @{ Name = "SpareFlow";    Url = "$GITHUB_ORG/SpareFlow.git" }
)
foreach ($r in $repos) {
  $path = "$ROOT\$($r.Name)"
  if (Test-Path $path) {
    Write-Host "  $($r.Name) zaten var, git pull yapiyorum..." -ForegroundColor Yellow
    Push-Location $path
    git pull
    Pop-Location
  } else {
    Push-Location $ROOT
    git clone $r.Url
    Pop-Location
  }
  OK "$($r.Name)"
}

# ─── 3) Secret'lar ──────────────────────────────────────────────────────
Section "5) Secret uretimi"
$pusulaSessionSecret = Rand-B64 32
$authSecret          = Rand-B64 32
$encryptionKey       = Rand-B64 32
$internalAppKey      = Rand-Hex 32
$spareflowSessionSecret = Rand-B64 48
OK "Secret'lar uretildi (3 uygulamada senkron yazilacak)"

# ─── 4) .env.production dosyalari ──────────────────────────────────────
Section "6) .env.production olusturma"

# HUB
$hubEnv = @"
DB_SERVER=localhost
DB_NAME=PusulaHub
DB_USER=SA
DB_PASSWORD=$sqlSaPlain
DB_PORT=1433

FIRMA_API_URL=http://pars.pusulanet.net:50003/api
FIRMA_API_USERNAME=PusulaLisans
FIRMA_API_PASSWORD=14PuSuLaYaZ53**
FIRMA_API_TIMEOUT=10

AGENT_SECRET=psl-agent-2026-secret

ENCRYPTION_KEY=$encryptionKey

AUTH_SECRET=$authSecret
AUTH_TRUST_HOST=true
PUSULA_SESSION_SECRET=$pusulaSessionSecret

INTERNAL_APP_KEY=$internalAppKey

UPTIME_KUMA_URL=http://10.15.2.6:3001
UPTIME_KUMA_METRICS_TOKEN=uk1_l-jozwsUDnKTqtTttP8POfK89thi2a9hxsSaj2XC
KUMA_ADMIN_USER=muharrem.oz@pusulanet.net
KUMA_ADMIN_PASSWORD=4Dr616R4wwqA
KUMA_SSH_HOST=10.15.2.6
KUMA_SSH_USER=root
KUMA_SSH_PASSWORD=4Dr616R4wwqA
KUMA_DB_PATH=/opt/uptime-kuma/data/kuma.db
KUMA_PLINK_PATH=C:/Program Files/PuTTY/plink.exe

NEXT_PUBLIC_BASE_URL=http://10.10.10.5:4000
NODE_ENV=production
"@
$hubEnv | Out-File -FilePath "$ROOT\PusulaHub\apps\web\.env.production" -Encoding utf8 -Force
OK "Hub .env.production"

# SWITCH
$switchEnv = @"
DB_SERVER=localhost
DB_NAME=PusulaHub
DB_USER=SA
DB_PASSWORD=$sqlSaPlain
DB_PORT=1433

PUSULA_SESSION_SECRET=$pusulaSessionSecret
SESSION_TTL_HOURS=12

NODE_ENV=production
"@
$switchEnv | Out-File -FilePath "$ROOT\PusulaSwitch\.env.production" -Encoding utf8 -Force
OK "Switch .env.production"

# SPAREFLOW
$spareflowEnv = @"
SESSION_SECRET=$spareflowSessionSecret
PUSULA_SESSION_SECRET=$pusulaSessionSecret

DB_SERVER=127.0.0.1
DB_NAME=SpareFlow
DB_PORT=1433
DB_AUTH_TYPE=sql
DB_USER=sa
DB_PASSWORD=$sqlSaPlain
DB_ENCRYPT=false
DB_TRUST_CERT=true

SFTP_HOST_LAN=192.168.169.203
SFTP_HOST_WAN=185.130.59.123
SFTP_PORT=6598
SFTP_USER=root
SFTP_PASS=pT1TDwNVjWH6

FASTIFY_LAN_URL=http://10.15.2.6:3000
FASTIFY_WAN_URL=http://api.pusulanet.net
FASTIFY_ADMIN_KEY=69432a3c21bcb005cb0cfd2df2b22c266efeab5a4096e0500ace5a77bdd24f1a

SPARE_API_URL=http://pars.pusulanet.net:50003/api/spare/List
SPARE_API_USER=PusulaLisans
SPARE_API_PASS=14PuSuLaYaZ53**

HUB_INTERNAL_URL=http://localhost:4242/apps/hub
INTERNAL_APP_KEY=$internalAppKey

NODE_ENV=production
"@
$spareflowEnv | Out-File -FilePath "$ROOT\SpareFlow\spare-flow-ui\.env.production" -Encoding utf8 -Force
OK "SpareFlow .env.production"

# ─── 5) pnpm install + build ──────────────────────────────────────────
Section "7) Switch build"
Push-Location "$ROOT\PusulaSwitch"
pnpm install
pnpm build
Pop-Location
OK "Switch build"

Section "8) Hub build"
Push-Location "$ROOT\PusulaHub"
pnpm install
pnpm -C apps/web build
Pop-Location
OK "Hub build"

Section "9) SpareFlow build"
Push-Location "$ROOT\SpareFlow\spare-flow-ui"
pnpm install
pnpm build
Pop-Location
OK "SpareFlow build"

# ─── 6) PM2 baslat ────────────────────────────────────────────────────
Section "10) PM2 start"
pm2 delete all 2>$null | Out-Null
pm2 start "$ROOT\PusulaHub\ecosystem.prod.config.js"
pm2 save
OK "PM2 calisiyor"

# ─── Bitti ─────────────────────────────────────────────────────────────
Section "BITTI"
Write-Host ""
Write-Host "Panel: http://10.10.10.5:4000" -ForegroundColor Green
Write-Host ""
Write-Host "Faydali komutlar:" -ForegroundColor Cyan
Write-Host "  pm2 list"
Write-Host "  pm2 logs hub"
Write-Host "  pm2 restart all"
Write-Host ""
Write-Host "Gunluk deploy:" -ForegroundColor Cyan
Write-Host "  cd C:\PusulaProd\PusulaHub"
Write-Host "  .\deploy.ps1 hub       # sadece Hub guncelle"
Write-Host "  .\deploy.ps1 all       # ucunu de"
Write-Host ""
Write-Host "Secret'larin dosyasi (yedek al):" -ForegroundColor Yellow
Write-Host "  $ROOT\PusulaHub\apps\web\.env.production"
Write-Host "  $ROOT\PusulaSwitch\.env.production"
Write-Host "  $ROOT\SpareFlow\spare-flow-ui\.env.production"
