@echo off
chcp 1254 >nul
title Pusula Musteri Kurulumu

rem ============================================================
rem  Musteriye giden tek dosya. Cift tiklanir, gerisi otomatik.
rem
rem  ASAGIDAKI 4 SATIRI HER MUSTERI ICIN DUZENLEYIN.
rem  (Hub'dan uretilen pakette bunlar zaten dolu gelir.)
rem ============================================================

set "TUNEL=Pusula"
set "VPN=vpn.pusulanet.net:17443"
set "RDP=10.15.2.5"
set "KULLANICI=2311.iremtoptan1"

rem ── Yonetici degilse kendini yeniden baslat ────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Yonetici izni isteniyor...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo   Pusula kurulumu basliyor...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0musteri-kurulum.ps1" ^
  -TunelAdi "%TUNEL%" -VpnSunucu "%VPN%" -RdpSunucu "%RDP%" -KullaniciAdi "%KULLANICI%"

echo.
pause
