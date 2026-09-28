@echo off
REM Kullanici masaustlerini tek tek ZIP'leyip bir klasore toplar.
REM Cift tiklayin; yonetici izni ister. Hedef klasor sorulur (bos = varsayilan).
REM SAF ASCII olmak zorunda: Turkce karakter konursa cmd bu dosyayi
REM CP1254 okur ve komut satirini bozar.

net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title Masaustu Toplama
cd /d "%~dp0"

echo.
echo ZIP'lerin toplanacagi klasor (bos birakirsaniz D:\MasaustuYedek\tarih-saat):
set /p HEDEF=Hedef:

if "%HEDEF%"=="" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0masaustu-topla.ps1"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0masaustu-topla.ps1" -Hedef "%HEDEF%"
)

echo.
echo Kapatmak icin bir tusa basin...
pause >nul
