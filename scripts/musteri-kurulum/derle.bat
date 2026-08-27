@echo off
chcp 1254 >nul
title PusulaKurulum derleme

rem  csc.exe bul (.NET Framework 4.x)
set "CSC="
if exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not defined CSC if exist "%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not defined CSC (
    echo HATA: csc.exe bulunamadi. .NET Framework 4.x gerekli.
    pause & exit /b 1
)

echo Derleniyor...
"%CSC%" /nologo /target:winexe /optimize+ /platform:anycpu ^
  /win32manifest:app.manifest ^
  /out:PusulaKurulum.exe ^
  /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll ^
  PusulaKurulum.cs

if %errorlevel% neq 0 ( echo DERLEME BASARISIZ & pause & exit /b 1 )
echo.
echo  PusulaKurulum.exe hazir.
echo.
pause
