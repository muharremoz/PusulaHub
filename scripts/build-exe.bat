@echo off
setlocal
title PusulaHub - EXE Derleyici

REM ============================================================
REM  PusulaHub.cs'yi csc.exe ile derler, Masaustu'ne PusulaHub.exe
REM  olarak kopyalar.
REM ============================================================

set "SCRIPT_DIR=%~dp0"
set "SRC=%SCRIPT_DIR%PusulaHub.cs"
set "ICO=%SCRIPT_DIR%pusulahub.ico"
set "OUT=%TEMP%\PusulaHub.exe"

REM --- csc.exe'yi bul ---
set "CSC="
for %%V in (v4.0.30319 v3.5 v2.0.50727) do (
  if exist "%WINDIR%\Microsoft.NET\Framework64\%%V\csc.exe" set "CSC=%WINDIR%\Microsoft.NET\Framework64\%%V\csc.exe"
)
if "%CSC%"=="" (
  for %%V in (v4.0.30319 v3.5 v2.0.50727) do (
    if exist "%WINDIR%\Microsoft.NET\Framework\%%V\csc.exe" set "CSC=%WINDIR%\Microsoft.NET\Framework\%%V\csc.exe"
  )
)

if "%CSC%"=="" (
  echo [HATA] csc.exe bulunamadi. .NET Framework kurulu olmali.
  pause
  exit /b 1
)

echo.
echo   PusulaHub.exe derleniyor...
echo   csc: %CSC%
echo.

if exist "%ICO%" (
  "%CSC%" /nologo /target:exe /win32icon:"%ICO%" /out:"%OUT%" "%SRC%"
) else (
  "%CSC%" /nologo /target:exe /out:"%OUT%" "%SRC%"
)
if errorlevel 1 (
  echo [HATA] Derleme basarisiz.
  pause
  exit /b 1
)

REM --- Masaustu'ne kopyala ---
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP=%%D"

copy /Y "%OUT%" "%DESKTOP%\PusulaHub.exe" >nul
if errorlevel 1 (
  echo [HATA] Masaustu'ne kopyalanamadi.
  pause
  exit /b 1
)

del "%OUT%" 2>nul

echo.
echo   [TAMAM] PusulaHub.exe olusturuldu:
echo     %DESKTOP%\PusulaHub.exe
echo.
echo   Cift tiklayarak uygulamayi baslatabilirsiniz.
echo.
pause
