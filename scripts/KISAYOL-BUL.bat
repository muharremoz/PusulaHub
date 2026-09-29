@echo off
REM Kisayol bulucu - verilen exe'nin kisayolu hangi kullanici profillerinde?
REM Cift tiklayin; yonetici izni ister, exe yolunu sorar.
REM kisayol-bul.ps1 bu dosyayla ayni klasorde ya da C:\ altinda olmali.
REM SAF ASCII olmak zorunda: Turkce karakter konursa cmd bu dosyayi
REM CP1254 okur ve komut satirini bozar.

net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

title Kisayol Bulucu

set "BETIK=%~dp0kisayol-bul.ps1"
if not exist "%BETIK%" set "BETIK=C:\kisayol-bul.ps1"
if not exist "%BETIK%" (
  echo kisayol-bul.ps1 bulunamadi. Bu .bat ile ayni klasore ya da C:\ altina koyun.
  pause
  exit /b 1
)

:sor
echo.
echo Aranacak exe'nin tam yolu (ornek: C:\Pusula\FIRMA\KLASOR\PROGRAM.exe)
set "HEDEF="
set /p HEDEF=Exe yolu:
if not defined HEDEF goto sor
REM Yapistirilan yolun basindaki/sonundaki tirnaklari at
set HEDEF=%HEDEF:"=%

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%BETIK%" -Hedef "%HEDEF%"

echo.
set "TEKRAR="
set /p TEKRAR=Baska bir exe aransin mi? (E/H):
if /i "%TEKRAR%"=="E" goto sor
