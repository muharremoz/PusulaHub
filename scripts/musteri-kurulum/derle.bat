@echo off
title PusulaConnect derleme (WPF)

rem  ==================================================================
rem   KULLANIM
rem     derle.bat              : ayarlar.ini gomulur, PusulaConnect.exe
rem     derle.bat 2311.ini     : 2311.ini gomulur, PusulaConnect-2311.exe
rem
rem   Ayarlar exe'ye GOMULUYOR; musteriye tek dosya gidiyor. Yine de
rem   exe'nin yanina ayarlar.ini konursa gomuluyu ezer (sahada hizli
rem   degisiklik icin).
rem
rem   DIKKAT: bu dosya saf ASCII olmali. cmd .bat dosyalarini sistem
rem   kod sayfasiyla okuyor; UTF-8 kutu cizgisi gibi karakterler
rem   coklu bayta acilip icinde tirnak uretiyor ve arguman ayristirma
rem   sessizce bozuluyor. Turkce karakter de kullanma.
rem  ==================================================================

set "INI=%~1"
if not defined INI set "INI=ayarlar.ini"
if "%~1"=="" (set "OUT=PusulaConnect.exe") else (set "OUT=PusulaConnect-%~n1.exe")

if not exist "%INI%" (
    echo HATA: ayar dosyasi bulunamadi: %INI%
    pause & exit /b 1
)

rem  csc.exe bul (.NET Framework 4.x)
set "CSC="
if exist "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not defined CSC if exist "%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not defined CSC (
    echo HATA: csc.exe bulunamadi. .NET Framework 4.x gerekli.
    pause & exit /b 1
)

rem  WPF derlemeleri ayri klasorde duruyor
set "WPFDIR=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\WPF"
if not exist "%WPFDIR%\PresentationFramework.dll" set "WPFDIR=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\WPF"
if not exist "%WPFDIR%\PresentationFramework.dll" (
    echo HATA: WPF derlemeleri bulunamadi.
    pause & exit /b 1
)

rem  TEMA: kaynak PusulaFix. Varsa her derlemede tazeleniyor ki iki
rem  uygulamanin gorsel dili ayrisamasin. O proje bu makinede yoksa
rem  klasordeki kopya kullanilir, derleme yine calisir.
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

echo Ayarlar : %INI%
echo Cikti   : %OUT%
echo Derleniyor...

"%CSC%" /nologo /target:winexe /optimize+ /platform:anycpu ^
  /win32manifest:app.manifest ^
  /win32icon:app.ico ^
  /out:"%OUT%" ^
  /resource:LightTheme.xaml,Tema.xaml ^
  /resource:"%INI%",Ayarlar.ini ^
  /r:System.dll /r:System.Xml.dll /r:System.Xaml.dll ^
  /r:"%WPFDIR%\PresentationFramework.dll" ^
  /r:"%WPFDIR%\PresentationCore.dll" ^
  /r:"%WPFDIR%\WindowsBase.dll" ^
  PusulaConnect.cs

if %errorlevel% neq 0 ( echo DERLEME BASARISIZ & pause & exit /b 1 )
echo.
echo  %OUT% hazir. Musteriye sadece bu dosya gonderilir.
echo.
pause
