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

REM Kisayollar bir kez okunur; birden cok exe ayni pencerede art arda aranir
REM (bos Enter: cikis). Tekrar taramak gerekmez, aramalar aninda cevaplanir.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%BETIK%"

echo.
pause
