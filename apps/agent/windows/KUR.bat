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
    echo  HATA: csc.exe bulunamadi.
    echo  .NET Framework 4.x kurulu olmalidir.
    pause
    exit /b 1
)

echo  [1/3] Derleniyor...
"%CSC%" /nologo /target:winexe /optimize+ /platform:anycpu /out:PusulaAgent.exe ^
  /r:System.Core.dll ^
  /r:System.Windows.Forms.dll ^
  /r:System.Drawing.dll ^
  /r:System.Management.dll ^
  /r:System.ServiceProcess.dll ^
  PusulaAgent.cs

if %errorlevel% neq 0 (
    echo.
    echo  HATA: Derleme basarisiz.
    pause
    exit /b 1
)
echo  Derleme basarili.

echo.
echo  [2/3] Eski islem kapatiliyor...
taskkill /f /im PusulaAgent.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo.
echo  [3/3] PusulaAgent baslatiliyor...
start "" "%~dp0PusulaAgent.exe" --install

echo.
echo  ========================================
echo    Kurulum tamamlandi!
echo  ========================================
echo.
echo  Agent tray'da calisiyor.
echo  API anahtarini PusulaHub'a eklemeyi
echo  unutmayin.
echo.
timeout /t 5
