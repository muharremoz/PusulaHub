# PusulaProd deploy script — Ofis sunucusu 10.10.10.5 icin
#
# Kullanim (ofis sunucusunda):
#   .\deploy.ps1           # Sadece Hub (en sik guncellenen)
#   .\deploy.ps1 hub       # Sadece Hub
#   .\deploy.ps1 switch    # Sadece Switch
#   .\deploy.ps1 spareflow # Sadece SpareFlow
#   .\deploy.ps1 all       # Ucunu de
#
# Not: Dev PC'nde CALISTIRILMAZ. Sadece ofis sunucusunda (10.10.10.5)
# C:\PusulaProd\PusulaHub\ altindan cagrilir.

param([string]$app = "hub")

$ErrorActionPreference = "Stop"
$ROOT = "C:\PusulaProd"

function Deploy-Switch {
  Write-Host ">>> Switch deploy basladi" -ForegroundColor Cyan
  Set-Location "$ROOT\PusulaSwitch"
  git pull
  pnpm install
  pnpm build
  pm2 restart switch
  Write-Host "<<< Switch OK" -ForegroundColor Green
}

function Deploy-Hub {
  Write-Host ">>> Hub deploy basladi" -ForegroundColor Cyan
  Set-Location "$ROOT\PusulaHub"
  git pull
  pnpm install
  pnpm -C apps/web build
  pm2 restart hub
  Write-Host "<<< Hub OK" -ForegroundColor Green
}

function Deploy-SpareFlow {
  Write-Host ">>> SpareFlow deploy basladi" -ForegroundColor Cyan
  Set-Location "$ROOT\SpareFlow\spare-flow-ui"
  git pull
  pnpm install
  pnpm build
  pm2 restart spareflow
  Write-Host "<<< SpareFlow OK" -ForegroundColor Green
}

switch ($app.ToLower()) {
  "hub"       { Deploy-Hub }
  "switch"    { Deploy-Switch }
  "spareflow" { Deploy-SpareFlow }
  "all"       { Deploy-Switch; Deploy-Hub; Deploy-SpareFlow }
  default     { Write-Host "Bilinmeyen: $app. Kullanim: hub | switch | spareflow | all" -ForegroundColor Yellow; exit 1 }
}

pm2 save | Out-Null
Write-Host ""
Write-Host "Deploy tamamlandi. pm2 list:" -ForegroundColor Green
pm2 list
