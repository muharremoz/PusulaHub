@echo off
REM SonicWall VPN baglanti kontrolu - cift tiklayarak calistirin.
REM SAF ASCII olmak zorunda: Turkce karakter konursa cmd bu dosyayi
REM CP1254 okur ve komut satirini bozar.

title SonicWall VPN Baglanti Kontrolu
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0vpn-kontrol.ps1" %*

echo.
echo Kapatmak icin bir tusa basin...
pause >nul
