@echo off
chcp 1254 >nul
title PusulaKurulum derleme (WPF)

rem  csc.exe bul (.NET Framework 4.x)
set "CSC="
if exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not defined CSC if exist "%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not defined CSC (
    echo HATA: csc.exe bulunamadi. .NET Framework 4.x gerekli.
    pause & exit /b 1
)

rem  WPF derleme derlemeleri (PresentationFramework vs.) ayri klasorde
set "WPFDIR=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\WPF"
if not exist "%WPFDIR%\PresentationFramework.dll" set "WPFDIR=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\WPF"
if not exist "%WPFDIR%\PresentationFramework.dll" (
    echo HATA: WPF derlemeleri bulunamadi.
    pause & exit /b 1
)

rem  ── TEMA ──────────────────────────────────────────────────────────
rem  Tasarim kaynagi PusulaFix. Varsa her derlemede tazeleniyor ki iki
rem  uygulamanin gorsel dili ayrisamasin. PusulaFix bu makinede yoksa
rem  klasordeki kopya kullanilir (derleme yine calisir).
set "TEMAKAYNAK=C:\Projeler\PusulaFix\PusulaFix\Themes\LightTheme.xaml"
if exist "%TEMAKAYNAK%" (
    copy /y "%TEMAKAYNAK%" "LightTheme.xaml" >nul
    echo Tema PusulaFix'ten tazelendi.
) else (
    echo UYARI: PusulaFix bulunamadi, klasordeki tema kopyasi kullanilacak.
)
if not exist "LightTheme.xaml" (
    echo HATA: LightTheme.xaml yok, derlenemez.
    pause & exit /b 1
)

echo Derleniyor...
"%CSC%" /nologo /target:winexe /optimize+ /platform:anycpu ^
  /win32manifest:app.manifest ^
  /out:PusulaKurulum.exe ^
  /resource:LightTheme.xaml,Tema.xaml ^
  /r:System.dll /r:System.Xml.dll /r:System.Xaml.dll ^
  /r:"%WPFDIR%\PresentationFramework.dll" ^
  /r:"%WPFDIR%\PresentationCore.dll" ^
  /r:"%WPFDIR%\WindowsBase.dll" ^
  PusulaKurulum.cs

if %errorlevel% neq 0 ( echo DERLEME BASARISIZ & pause & exit /b 1 )
echo.
echo  PusulaKurulum.exe hazir.
echo.
pause
