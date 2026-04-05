@echo off
chcp 65001 >nul 2>&1
title PusulaAgent Kurulum

echo.
echo  ========================================
echo    PusulaAgent - Kurulum
echo  ========================================
echo.

:: ---- Admin yetkisi kontrolu ----
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  Yonetici olarak yeniden baslatiliyor...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

:: ---- csc.exe bul ----
set "CSC="
if exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
    set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
) else if exist "%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe" (
    set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if "%CSC%"=="" (
    echo  HATA: csc.exe bulunamadi. .NET Framework 4.x kurulu olmalidir.
    pause
    exit /b 1
)

echo  [1/5] PusulaAgent.exe derleniyor...
"%CSC%" /nologo /target:winexe /optimize+ /platform:anycpu /out:PusulaAgent.exe ^
  /r:System.Core.dll ^
  /r:System.Windows.Forms.dll ^
  /r:System.Drawing.dll ^
  /r:System.Management.dll ^
  /r:System.ServiceProcess.dll ^
  /r:System.DirectoryServices.dll ^
  PusulaAgent.cs

if %errorlevel% neq 0 (
    echo  HATA: PusulaAgent.exe derlenemedi.
    pause
    exit /b 1
)
echo  PusulaAgent.exe derlendi.

echo.
echo  [2/5] PusulaNotify.exe derleniyor...
"%CSC%" /nologo /target:winexe /optimize+ /platform:anycpu /out:PusulaNotify.exe ^
  /r:System.Windows.Forms.dll ^
  /r:System.Drawing.dll ^
  /r:System.Net.dll ^
  PusulaNotify.cs

if %errorlevel% neq 0 (
    echo  HATA: PusulaNotify.exe derlenemedi.
    pause
    exit /b 1
)
echo  PusulaNotify.exe derlendi.

echo.
echo  [3/5] Eski servis kaldiriliyor...
sc stop PusulaAgent >nul 2>&1
timeout /t 2 /nobreak >nul
sc delete PusulaAgent >nul 2>&1
taskkill /f /im PusulaAgent.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: Eski registry autostart temizle
reg delete "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v PusulaAgent /f >nul 2>&1
reg delete "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v PusulaAgent /f >nul 2>&1

echo.
echo  [4/5] Firewall ve URL ACL ayarlaniyor...
:: Portu config.json'dan oku, yoksa 8585 kullan
set "PORT=8585"
for /f "tokens=2 delims=:, " %%A in ('findstr /i "port" "%~dp0config.json" 2^>nul') do set "PORT=%%A"

netsh advfirewall firewall delete rule name=PusulaAgent >nul 2>&1
netsh advfirewall firewall add rule name=PusulaAgent dir=in action=allow protocol=TCP localport=%PORT% profile=any >nul 2>&1
netsh http delete urlacl url=http://+:%PORT%/ >nul 2>&1
netsh http add urlacl url=http://+:%PORT%/ user=Everyone >nul 2>&1
echo  Port %PORT% icin firewall ve URL ACL ayarlandi.

echo.
echo  [5/5] Windows Service olarak kuruluyor...
sc create PusulaAgent binPath= "\"%~dp0PusulaAgent.exe\" --service" start= auto DisplayName= "PusulaAgent"
sc description PusulaAgent "PusulaHub Windows Agent - sunucu metriklerini toplar ve bildirimleri iletir"
sc failure PusulaAgent reset= 86400 actions= restart/5000/restart/5000/restart/5000

echo.
echo  [5/5] Servis baslatiliyor...
sc start PusulaAgent
timeout /t 3 /nobreak >nul
sc query PusulaAgent | findstr STATE

echo.
echo  [+] Tray uygulamasi kullanici girisi icin ayarlaniyor...
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v PusulaAgentTray /t REG_SZ /d "\"%~dp0PusulaAgent.exe\" --tray" /f >nul 2>&1
:: Simdi de baslat (oturum aciksa)
start "" "%~dp0PusulaAgent.exe" --tray

echo.
echo  ========================================
echo    Kurulum tamamlandi!
echo  ========================================
echo.
echo  Servis durumu: sc query PusulaAgent
echo  Loglari gormek icin: Event Viewer
echo.
timeout /t 5
